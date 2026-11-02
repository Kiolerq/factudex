-- Un pago con varias salidas: un solo Yape (o transferencia, o efectivo entregado) de S/ 90 se
-- sustenta con varios documentos: peaje S/ 40 + peaje S/ 40 + planilla S/ 10. Cada documento es un
-- movimiento (una línea propia en la liquidación) enganchado al mismo pago. La constancia del pago
-- se sube una sola vez. Si sobró dinero y volvió a la caja, se registra una devolución (monto,
-- motivo y foto).
--
-- Regla: una salida está completa cuando tiene su documento, el pago tiene constancia (o es en
-- efectivo) y el pago está CUADRADO: salidas + devoluciones = monto del pago. Mientras no cuadre,
-- todas sus salidas quedan pendientes y no entran a ninguna liquidación.

create table pagos (
  id          uuid primary key default gen_random_uuid(),
  caja_id     uuid not null references cajas(id),
  monto       numeric(12,2) not null check (monto > 0),
  medio_pago  medio_pago,
  operacion   text,
  fecha       date not null,
  creado_por  uuid not null references perfiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index pagos_caja_idx on pagos (caja_id);
alter table pagos enable row level security;
create policy pagos_select on pagos for select to authenticated using (tiene_acceso_caja(caja_id));
create policy pagos_insert on pagos for insert to authenticated with check (tiene_acceso_caja(caja_id, 'registrador'));

alter table movimientos add column pago_id uuid references pagos(id);
create index movimientos_pago_idx on movimientos (pago_id);

create table devoluciones (
  id                uuid primary key default gen_random_uuid(),
  pago_id           uuid not null references pagos(id),
  monto             numeric(12,2) not null check (monto > 0),
  motivo            text not null check (length(trim(motivo)) between 3 and 200),
  fecha             date not null default (now() at time zone 'America/Lima')::date,
  comprobante_path  text,     -- foto: 'drive:<fileId>' o '<caja_id>/devoluciones/<uuid>.<ext>'
  comprobante_mime  text,
  creado_por        uuid not null references perfiles(id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index devoluciones_pago_idx on devoluciones (pago_id);
alter table devoluciones enable row level security;
create policy devoluciones_select on devoluciones for select to authenticated
  using (exists (select 1 from pagos p where p.id = pago_id and tiene_acceso_caja(p.caja_id)));
create policy devoluciones_insert on devoluciones for insert to authenticated
  with check (exists (select 1 from pagos p where p.id = pago_id and tiene_acceso_caja(p.caja_id, 'registrador')));

-- Resumen de cada pago: lo sustentado con documentos, lo devuelto y lo que falta.
create view v_pagos with (security_invoker = true) as
select p.id, p.caja_id, p.monto, p.medio_pago, p.operacion, p.fecha,
       coalesce(s.sustentado, 0)                                     as sustentado,
       coalesce(s.salidas, 0)                                        as salidas,
       coalesce(d.devuelto, 0)                                       as devuelto,
       p.monto - coalesce(s.sustentado, 0) - coalesce(d.devuelto, 0) as falta,
       exists (select 1 from movimientos m join adjuntos a on a.movimiento_id = m.id
                where m.pago_id = p.id and a.tipo = 'pago')          as tiene_constancia
  from pagos p
  left join (select pago_id, sum(monto) sustentado, count(*) salidas
               from movimientos where not anulado and pago_id is not null group by pago_id) s on s.pago_id = p.id
  left join (select pago_id, sum(monto) devuelto from devoluciones group by pago_id) d on d.pago_id = p.id;

-- ¿Cuadra el pago? (null = el gasto no es parte de un pago con varias salidas)
create or replace function fx_pago_cuadrado(p_pago uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_pago is null or (
    select p.monto = coalesce((select sum(m.monto) from movimientos m where m.pago_id = p.id and not m.anulado), 0)
                   + coalesce((select sum(d.monto) from devoluciones d where d.pago_id = p.id), 0)
      from pagos p where p.id = p_pago);
$$;

-- Estado de un gasto: documento + constancia de pago (la suya o la del pago compartido) + cuadre.
create or replace function fx_estado_movimiento(p_mov uuid, p_medio medio_pago) returns estado_movimiento
language sql stable security definer set search_path = public as $$
  with m as (select id, pago_id from movimientos where id = p_mov)
  select case
           when exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'documento')
            and (p_medio = 'efectivo'
                 or exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'pago')
                 or exists (select 1 from m join movimientos h on h.pago_id = m.pago_id
                              join adjuntos a on a.movimiento_id = h.id and a.tipo = 'pago'))
            and fx_pago_cuadrado((select pago_id from m))
           then 'completo'::estado_movimiento
           else 'pendiente'::estado_movimiento
         end;
$$;

-- Recalcula el estado de todas las salidas de un pago.
create or replace function fx_recalcular_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pago is null then return; end if;
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago)
   where m.pago_id = p_pago and m.estado is distinct from fx_estado_movimiento(m.id, m.medio_pago);
end $$;

-- Adjuntos: recalcula el gasto y, si es parte de un pago, todas sus salidas.
create or replace function tg_recalcular_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mov uuid := coalesce(new.movimiento_id, old.movimiento_id);
begin
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago) where m.id = v_mov;
  perform fx_recalcular_pago((select pago_id from movimientos where id = v_mov));
  return null;
end $$;

-- Un gasto nuevo, anulado, con otro monto o que cambia de pago: el cuadre cambia.
create or replace function tg_movimiento_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.pago_id is distinct from new.pago_id then
    perform fx_recalcular_pago(old.pago_id);
  end if;
  perform fx_recalcular_pago(new.pago_id);
  return null;
end $$;

create trigger movimientos_pago after insert or update of monto, anulado, pago_id on movimientos
  for each row execute function tg_movimiento_pago();

create or replace function tg_devolucion_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fx_recalcular_pago(coalesce(new.pago_id, old.pago_id));
  return null;
end $$;

create trigger devoluciones_pago after insert or delete on devoluciones
  for each row execute function tg_devolucion_pago();

-- Un gasto solo se engancha a un pago de su misma caja.
create or replace function tg_movimiento_pago_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_id is not null
     and current_setting('factudex.traspasando_caja', true) is distinct from 'on'
     and not exists (select 1 from pagos p where p.id = new.pago_id and p.caja_id = new.caja_id) then
    raise exception 'El pago es de otra caja';
  end if;
  return new;
end $$;

create trigger movimientos_pago_caja before insert or update of pago_id, caja_id on movimientos
  for each row execute function tg_movimiento_pago_caja();

-- v_pendientes usa m.*: se recrea para incluir pago_id y lo que falta cuadrar.
drop view v_pendientes;
create view v_pendientes with (security_invoker = true) as
select m.*,
       ((now() at time zone 'America/Lima')::date - m.fecha) as dias_antiguedad,
       not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'documento') as falta_documento,
       (m.medio_pago is distinct from 'efectivo'
        and not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'pago')
        and not exists (select 1 from movimientos h join adjuntos a on a.movimiento_id = h.id and a.tipo = 'pago'
                         where m.pago_id is not null and h.pago_id = m.pago_id)) as falta_pago
  from movimientos m
 where m.estado = 'pendiente' and not m.anulado;

-- Al pasar el saldo a la caja nueva, los pagos de los gastos que se mueven van con ellos.
create or replace function traspasar_caja(p_anterior uuid, p_nueva uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  a cajas;
  n cajas;
  v_codigo_a text;
  v_codigo_n text;
  v_liq_a uuid;
  v_liq_n uuid;
  v_saldo numeric(12,2);
  v_efectivo numeric(12,2);
  v_n int;
  v_detalle text;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede pasar el saldo de una caja' using errcode = '42501';
  end if;
  select * into a from cajas where id = p_anterior for update;
  select * into n from cajas where id = p_nueva for update;
  if a.id is null or n.id is null or a.id = n.id then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if a.empresa_id <> n.empresa_id or a.area <> n.area then
    raise exception 'El saldo solo pasa entre cajas de la misma empresa y área' using errcode = '22023';
  end if;
  if not a.activa then
    raise exception 'La caja anterior ya está cerrada' using errcode = '22023';
  end if;

  select e.codigo || '-CAJA-' || a.area || '-' || lpad(a.numero::text, 2, '0') into v_codigo_a
    from empresas e where e.id = a.empresa_id;
  select e.codigo || '-CAJA-' || n.area || '-' || lpad(n.numero::text, 2, '0') into v_codigo_n
    from empresas e where e.id = n.empresa_id;
  v_liq_a := fx_liquidacion_abierta(a.id);
  v_liq_n := fx_liquidacion_abierta(n.id);

  -- Efectivo que quedó en la anterior (ingresos − gastos, incluidos los pendientes).
  select coalesce((select sum(monto) from recargas where caja_id = a.id), 0)
       - coalesce((select sum(monto) from movimientos where caja_id = a.id and not anulado), 0)
    into v_saldo;

  -- Lo que no entró a ninguna liquidación pasa a la nueva, y su monto viaja con el saldo.
  v_efectivo := v_saldo;
  select count(*), coalesce(sum(monto), 0) into v_n, v_saldo from movimientos where liquidacion_id = v_liq_a and not anulado;
  v_saldo := v_efectivo + v_saldo;
  v_detalle := case when v_n > 0
    then ' (efectivo S/ ' || to_char(v_efectivo, 'FM999G999G990D00') || ' + ' || v_n || ' gasto' || case when v_n = 1 then '' else 's' end || ' sin liquidar)'
    else '' end;
  perform set_config('factudex.traspasando_caja', 'on', true);
  update movimientos set caja_id = n.id, liquidacion_id = v_liq_n
   where liquidacion_id = v_liq_a and not anulado;
  update pagos set caja_id = n.id
   where id in (select pago_id from movimientos where liquidacion_id = v_liq_n and pago_id is not null);
  perform set_config('factudex.traspasando_caja', 'off', true);

  if v_saldo <> 0 then
    insert into recargas (caja_id, tipo, monto, fecha, descripcion, forma, traspaso_caja_id)
    values (a.id, 'ajuste', -v_saldo, v_hoy, 'Saldo pasado a ' || v_codigo_n || v_detalle, 'otros', n.id),
           (n.id, 'ajuste',  v_saldo, v_hoy, 'Saldo de ' || v_codigo_a || v_detalle,       'otros', a.id);
  end if;

  -- Quien manejaba la anterior sigue con la nueva.
  insert into accesos_caja (usuario_id, caja_id, rol)
  select usuario_id, n.id, rol from accesos_caja where caja_id = a.id
  on conflict do nothing;

  update cajas set activa = false where id = a.id;
  return v_saldo;
end $$;
revoke all on function traspasar_caja(uuid, uuid) from public;
grant execute on function traspasar_caja(uuid, uuid) to authenticated;
