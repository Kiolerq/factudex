-- Arreglo de "completar pagos anteriores". Se puede correr aunque ya se hayan corrido
-- 20261110000000 y 20261111000000 (todo es create or replace / if not exists).
--
-- 1. Repite 20261110000000 (convertir_en_pago, salidas en otra caja de la misma empresa, no tocar lo
--    liquidado) y 20261111000000 (vincular_a_pago, devoluciones.tipo).
-- 2. v_pagos suma TODAS las salidas del pago aunque el registrador no vea la caja anterior (antes,
--    con security_invoker, el gasto de la caja anterior no se sumaba y el pago seguía "faltando").
--    Solo devuelve los pagos de cajas a las que el usuario tiene acceso.
-- 3. fx_salidas_pago(): las salidas de pagos con su liquidación y caja, para mostrar "ya liquidado en…".
-- 4. Las funciones nuevas no se pueden llamar sin sesión (anon).

create or replace function fx_recalcular_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pago is null then return; end if;
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago)
   where m.pago_id = p_pago
     and m.estado is distinct from fx_estado_movimiento(m.id, m.medio_pago)
     and exists (select 1 from liquidaciones l where l.id = m.liquidacion_id and l.estado in ('abierta', 'observada'));
end $$;

-- La salida y el pago deben ser de la misma empresa (antes: de la misma caja).
create or replace function tg_movimiento_pago_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_id is not null
     and current_setting('factudex.traspasando_caja', true) is distinct from 'on'
     and not exists (select 1 from pagos p join cajas cp on cp.id = p.caja_id join cajas cm on cm.id = new.caja_id
                      where p.id = new.pago_id and cp.empresa_id = cm.empresa_id) then
    raise exception 'El pago es de otra empresa';
  end if;
  return new;
end $$;

-- Un gasto ya registrado pasa a ser la primera salida de un pago mayor.
create or replace function convertir_en_pago(p_movimiento uuid, p_monto numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m movimientos;
  v_pago uuid;
begin
  select * into m from movimientos where id = p_movimiento for update;
  if m.id is null then raise exception 'El gasto no existe' using errcode = 'P0001'; end if;
  if not tiene_acceso_caja(m.caja_id, 'registrador') then
    raise exception 'No puedes registrar en esta caja' using errcode = '42501';
  end if;
  if m.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if m.pago_id is not null then raise exception 'Este gasto ya es parte de un pago con varias salidas' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= m.monto then
    raise exception 'El pago total debe ser mayor que este gasto (S/ %)', to_char(m.monto, 'FM999990.00') using errcode = 'P0001';
  end if;
  insert into pagos (caja_id, monto, medio_pago, operacion, fecha, creado_por)
  values (m.caja_id, round(p_monto, 2), m.medio_pago, m.operacion_pago, m.fecha, coalesce(auth.uid(), m.creado_por))
  returning id into v_pago;
  update movimientos set pago_id = v_pago where id = p_movimiento;
  return v_pago;
end $$;
revoke all on function convertir_en_pago(uuid, numeric) from public;
grant execute on function convertir_en_pago(uuid, numeric) to authenticated;

alter table devoluciones add column if not exists tipo text not null default 'devolucion'
  check (tipo in ('devolucion', 'liquidado_antes'));
comment on column devoluciones.tipo is
  'devolucion: el dinero volvió a la caja · liquidado_antes: esa parte ya se rindió fuera de la app (motivo = referencia)';

create or replace function vincular_a_pago(p_pago uuid, p_movimiento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p pagos;
  m movimientos;
  v_falta numeric;
begin
  select * into p from pagos where id = p_pago for update;
  if p.id is null then raise exception 'El pago no existe' using errcode = 'P0001'; end if;
  if not tiene_acceso_caja(p.caja_id, 'registrador') then
    raise exception 'No puedes registrar en esta caja' using errcode = '42501';
  end if;
  select * into m from movimientos where id = p_movimiento for update;
  if m.id is null then raise exception 'El gasto no existe' using errcode = 'P0001'; end if;
  if m.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if m.pago_id is not null then
    raise exception 'Ese gasto ya es parte de un pago' using errcode = 'P0001';
  end if;
  if (select empresa_id from cajas where id = m.caja_id) is distinct from (select empresa_id from cajas where id = p.caja_id) then
    raise exception 'El gasto es de otra empresa' using errcode = 'P0001';
  end if;
  select falta into v_falta from v_pagos where id = p_pago;
  if m.monto > v_falta + 0.005 then
    raise exception 'El gasto (S/ %) es mayor que lo que falta del pago (S/ %)',
      to_char(m.monto, 'FM999990.00'), to_char(v_falta, 'FM999990.00') using errcode = 'P0001';
  end if;
  update movimientos set pago_id = p_pago where id = p_movimiento;
end $$;
revoke all on function vincular_a_pago(uuid, uuid) from public;
grant execute on function vincular_a_pago(uuid, uuid) to authenticated;

create or replace view v_pagos as
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
  left join (select pago_id, sum(monto) devuelto from devoluciones group by pago_id) d on d.pago_id = p.id
 where tiene_acceso_caja(p.caja_id);
alter view v_pagos set (security_invoker = false);
grant select on v_pagos to authenticated;
revoke all on v_pagos from anon;

create or replace function fx_salidas_pago(p_pagos uuid[])
returns table (pago_id uuid, detalle text, monto numeric, folio text, estado_liquidacion estado_liquidacion,
               empresa_codigo text, area text, numero int)
language sql stable security definer set search_path = public as $$
  select m.pago_id, m.detalle, m.monto, l.folio, l.estado, e.codigo::text, c.area::text, c.numero::int
    from movimientos m
    join pagos p on p.id = m.pago_id
    join cajas c on c.id = m.caja_id
    join empresas e on e.id = c.empresa_id
    left join liquidaciones l on l.id = m.liquidacion_id
   where m.pago_id = any (p_pagos) and not m.anulado and tiene_acceso_caja(p.caja_id)
   order by m.created_at;
$$;

-- Gastos sin pago de TODA la empresa (también de cajas anteriores que el registrador ya no ve),
-- para juntar a un pago. Solo para quien registra en alguna caja de esa empresa.
create or replace function fx_gastos_sin_pago(p_empresa uuid, p_desde date)
returns table (id uuid, caja_id uuid, fecha date, detalle text, monto numeric, medio_pago medio_pago,
               proveedor text, folio text, estado_liquidacion estado_liquidacion, area text, numero int)
language sql stable security definer set search_path = public as $$
  select m.id, m.caja_id, m.fecha, m.detalle, m.monto, m.medio_pago, pr.razon_social, l.folio, l.estado,
         c.area::text, c.numero::int
    from movimientos m
    join cajas c on c.id = m.caja_id
    left join proveedores pr on pr.id = m.proveedor_id
    left join liquidaciones l on l.id = m.liquidacion_id
   where c.empresa_id = p_empresa and m.pago_id is null and not m.anulado and m.fecha >= p_desde
     and exists (select 1 from cajas c2 where c2.empresa_id = p_empresa and tiene_acceso_caja(c2.id, 'registrador'))
   order by m.fecha desc, m.created_at desc
   limit 80;
$$;

revoke all on function convertir_en_pago(uuid, numeric) from public, anon;
revoke all on function fx_gastos_sin_pago(uuid, date) from public, anon;
grant execute on function fx_gastos_sin_pago(uuid, date) to authenticated;
revoke all on function vincular_a_pago(uuid, uuid) from public, anon;
revoke all on function fx_salidas_pago(uuid[]) from public, anon;
grant execute on function convertir_en_pago(uuid, numeric) to authenticated;
grant execute on function vincular_a_pago(uuid, uuid) to authenticated;
grant execute on function fx_salidas_pago(uuid[]) to authenticated;

notify pgrst, 'reload schema';
