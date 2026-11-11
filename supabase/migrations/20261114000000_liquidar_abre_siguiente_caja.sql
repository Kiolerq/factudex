-- Una caja, una liquidación: al generar la liquidación de la SL-CAJA-GE-06, la caja se cierra y se
-- abre sola la SL-CAJA-GE-07 (siguiente número de la empresa, misma área y nombre) con el saldo que
-- quedó, los gastos que no entraron (pendientes, por autorizar, fuera del rango) y los accesos.
-- Su primera liquidación sale SL-LIQ-GE-007.
--
-- Si tesorería observa la 006, se corrige en la 006 (la caja 6 cerrada sigue accesible para eso):
-- si se anula o cambia un gasto, la diferencia pasa como ajuste a la caja abierta que sigue; al
-- reenviarla, lo que no entra pasa también a esa caja. Tesorería repone la 006 depositando en la 7.

alter table cajas add column if not exists siguiente_id uuid references cajas(id);
comment on column cajas.siguiente_id is 'Caja que la reemplazó al cerrarse (recibió su saldo y sus gastos sin liquidar)';

-- Traspasos ya hechos: la anterior apunta a la nueva.
update cajas a set siguiente_id = r.traspaso_caja_id
  from recargas r
 where r.caja_id = a.id and r.traspaso_caja_id is not null and r.descripcion like 'Saldo pasado a %'
   and a.siguiente_id is null;

create or replace function fx_traspasar_caja(p_anterior uuid, p_nueva uuid, p_cerrar boolean) returns numeric
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
  select * into a from cajas where id = p_anterior for update;
  select * into n from cajas where id = p_nueva for update;
  if a.id is null or n.id is null or a.id = n.id then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if a.empresa_id <> n.empresa_id or a.area <> n.area then
    raise exception 'El saldo solo pasa entre cajas de la misma empresa y área' using errcode = '22023';
  end if;
  if p_cerrar and not a.activa then
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
    values (a.id, 'ajuste', -v_saldo, v_hoy,
            case when p_cerrar then 'Saldo pasado a ' else 'Corrección pasada a ' end || v_codigo_n || v_detalle, 'otros', n.id),
           (n.id, 'ajuste',  v_saldo, v_hoy,
            case when p_cerrar then 'Saldo de ' else 'Corrección de liquidación observada de ' end || v_codigo_a || v_detalle, 'otros', a.id);
  end if;

  if not p_cerrar then
    return v_saldo; -- solo concilia una caja ya cerrada (corrección de una observada)
  end if;

  -- Quien manejaba la anterior sigue con la nueva.
  insert into accesos_caja (usuario_id, caja_id, rol)
  select usuario_id, n.id, rol from accesos_caja where caja_id = a.id
  on conflict do nothing;

  update cajas set activa = false, siguiente_id = n.id where id = a.id;
  return v_saldo;
end $$;

create or replace function traspasar_caja(p_anterior uuid, p_nueva uuid) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede pasar el saldo de una caja' using errcode = '42501';
  end if;
  return fx_traspasar_caja(p_anterior, p_nueva, true);
end $$;

-- La caja abierta que hoy reemplaza a una cerrada (sigue la cadena 6 → 7 → 8…).
create or replace function fx_caja_siguiente_activa(p_caja uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := p_caja;
  v_activa boolean;
  i int := 0;
begin
  loop
    select siguiente_id into v from cajas where id = v;
    if v is null then return null; end if;
    select activa into v_activa from cajas where id = v;
    if v_activa then return v; end if;
    i := i + 1;
    if i > 50 then return null; end if;
  end loop;
end $$;

-- Pasa a la caja que sigue lo que cambió en una caja cerrada (anulaciones, pendientes de un reenvío).
create or replace function fx_conciliar_caja_cerrada(p_caja uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n uuid;
begin
  if (select activa from cajas where id = p_caja) then return; end if;
  v_n := fx_caja_siguiente_activa(p_caja);
  if v_n is null then return; end if;
  perform fx_traspasar_caja(p_caja, v_n, false);
end $$;

-- Abre la caja siguiente de la empresa (misma área y nombre) y le traspasa todo.
create or replace function fx_abrir_siguiente_caja(p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a cajas;
  v_num int;
  v_n uuid;
begin
  select * into a from cajas where id = p_caja for update;
  if not a.activa then return null; end if;
  perform pg_advisory_xact_lock(hashtext('caja-numero:' || a.empresa_id::text));
  select coalesce(max(numero), 0) + 1 into v_num from cajas where empresa_id = a.empresa_id;
  if v_num > 99 then
    raise exception 'La empresa ya tiene 99 cajas: pide a tesorería que reutilice un número' using errcode = 'P0001';
  end if;
  insert into cajas (empresa_id, numero, area, nombre, umbral_alerta, responsable_id)
  values (a.empresa_id, v_num, a.area, a.nombre, a.umbral_alerta, a.responsable_id)
  returning id into v_n;
  perform fx_traspasar_caja(a.id, v_n, true);
  return v_n;
end $$;

-- Corregir una observada de una caja cerrada: la diferencia viaja a la caja que sigue.
create or replace function tg_movimiento_caja_cerrada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('factudex.traspasando_caja', true) = 'on' then return null; end if;
  if (old.anulado, old.monto) is distinct from (new.anulado, new.monto)
     and not (select activa from cajas where id = new.caja_id) then
    perform fx_conciliar_caja_cerrada(new.caja_id);
  end if;
  return null;
end $$;

drop trigger if exists movimientos_caja_cerrada on movimientos;
create trigger movimientos_caja_cerrada after update of anulado, monto on movimientos
  for each row execute function tg_movimiento_caja_cerrada();

create or replace function generar_liquidacion(p_caja uuid, p_desde date, p_hasta date, p_excluir uuid[] default '{}')
returns liquidaciones
language plpgsql security definer set search_path = public as $$
declare
  v liquidaciones;
  v_nueva uuid;
begin
  if not tiene_acceso_caja(p_caja, 'registrador') then
    raise exception 'Sin permiso sobre esta caja';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha "hasta" no puede ser anterior a "desde"';
  end if;
  if p_hasta > (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha "hasta" no puede ser futura';
  end if;

  select * into v from liquidaciones where caja_id = p_caja and estado = 'abierta' for update;
  if not found then
    raise exception 'La caja no tiene gastos por liquidar';
  end if;
  if not exists (select 1 from movimientos m
                  where m.liquidacion_id = v.id and fx_liquidable(m)
                    and m.fecha between p_desde and p_hasta and not (m.id = any (coalesce(p_excluir, '{}')))) then
    raise exception 'No hay gastos completos para liquidar entre el % y el %', to_char(p_desde, 'DD/MM/YYYY'), to_char(p_hasta, 'DD/MM/YYYY');
  end if;

  update liquidaciones
     set estado = 'en_revision', fecha_inicio = p_desde, fecha_cierre = p_hasta,
         cerrada_por = auth.uid(), cerrada_en = now()
   where id = v.id
   returning * into v;

  insert into liquidaciones (caja_id, fecha_inicio) values (p_caja, p_hasta) returning id into v_nueva;

  perform set_config('factudex.trasladando_pendientes', 'on', true);
  update movimientos m set liquidacion_id = v_nueva
   where m.liquidacion_id = v.id
     and not (fx_liquidable(m) and m.fecha between p_desde and p_hasta and not (m.id = any (coalesce(p_excluir, '{}'))));
  perform set_config('factudex.trasladando_pendientes', 'off', true);

  update liquidaciones l
     set total_ingresos = t.ingresos,
         total_gastado  = t.egresos,
         saldo_final    = l.saldo_inicial + t.ingresos - t.egresos
    from (select coalesce((select sum(monto) from recargas where liquidacion_ingreso_id = v.id), 0) as ingresos,
                 coalesce((select sum(monto) from movimientos where liquidacion_id = v.id and not anulado), 0) as egresos) t
   where l.id = v.id
   returning l.* into v;

  update liquidaciones set saldo_inicial = v.saldo_final where id = v_nueva;

  -- Una caja, una liquidación: se cierra y se abre la siguiente con el saldo y lo que quedó.
  perform fx_abrir_siguiente_caja(p_caja);
  return v;
end $$;

create or replace function cerrar_liquidacion(p_liquidacion uuid, p_fecha_cierre date default null)
returns liquidaciones
language plpgsql security definer set search_path = public as $$
declare
  v liquidaciones;
begin
  select * into v from liquidaciones where id = p_liquidacion for update;
  if not found or not tiene_acceso_caja(v.caja_id, 'registrador') then
    raise exception 'Sin permiso sobre esta caja';
  end if;
  if v.estado not in ('abierta', 'observada') then
    raise exception 'La liquidación % está %', v.folio, v.estado;
  end if;
  if not exists (select 1 from movimientos m where m.liquidacion_id = v.id and fx_liquidable(m)) then
    raise exception 'La liquidación % no tiene movimientos completos para liquidar', v.folio;
  end if;

  update liquidaciones
     set estado       = 'en_revision',
         fecha_cierre = greatest(v.fecha_inicio, coalesce(v.fecha_cierre, p_fecha_cierre, (now() at time zone 'America/Lima')::date)),
         cerrada_por  = auth.uid(),
         cerrada_en   = now()
   where id = v.id
   returning * into v;

  insert into liquidaciones (caja_id, fecha_inicio)
  select v.caja_id, v.fecha_cierre
   where not exists (select 1 from liquidaciones where caja_id = v.caja_id and estado = 'abierta');

  perform set_config('factudex.trasladando_pendientes', 'on', true);
  update movimientos m
     set liquidacion_id = (select id from liquidaciones where caja_id = v.caja_id and estado = 'abierta')
   where m.liquidacion_id = v.id and not m.anulado and not fx_liquidable(m);
  perform set_config('factudex.trasladando_pendientes', 'off', true);

  update liquidaciones l
     set total_ingresos = t.ingresos,
         total_gastado  = t.egresos,
         saldo_final    = l.saldo_inicial + t.ingresos - t.egresos
    from (select coalesce((select sum(monto) from recargas where liquidacion_ingreso_id = v.id), 0) as ingresos,
                 coalesce((select sum(monto) from movimientos where liquidacion_id = v.id and not anulado), 0) as egresos) t
   where l.id = v.id
   returning l.* into v;

  update liquidaciones set saldo_inicial = v.saldo_final
   where caja_id = v.caja_id and correlativo = v.correlativo + 1;

  -- Reenvío de una observada de una caja ya cerrada: lo que no entró pasa a la caja que sigue.
  if not (select activa from cajas where id = v.caja_id) then
    perform fx_conciliar_caja_cerrada(v.caja_id);
  end if;
  return v;
end $$;

create or replace function tg_recarga_repone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.liquidacion_repuesta_id is not null then
    update liquidaciones set estado = 'repuesta'
     where id = new.liquidacion_repuesta_id and estado = 'aprobada'
       and caja_id in (select c.id from cajas c join cajas d on d.empresa_id = c.empresa_id and d.area = c.area
                        where d.id = new.caja_id);
    if not found then
      raise exception 'Solo se puede reponer una liquidación aprobada de esta caja o de una anterior de la misma empresa y área';
    end if;
  end if;
  return new;
end $$;

revoke all on function fx_traspasar_caja(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function fx_abrir_siguiente_caja(uuid) from public, anon, authenticated;
revoke all on function fx_conciliar_caja_cerrada(uuid) from public, anon, authenticated;
revoke all on function fx_caja_siguiente_activa(uuid) from public, anon;
grant execute on function fx_caja_siguiente_activa(uuid) to authenticated;

notify pgrst, 'reload schema';
