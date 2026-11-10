-- Completar un pago anterior: un Yape de S/ 60 pagó un peaje de S/ 40 (ya registrado, quizá ya
-- liquidado) y S/ 20 de comida que se sustenta después con una planilla, quizá en otra caja.
--
-- 1. Un gasto ya registrado se puede volver "pago con varias salidas" (convertir_en_pago), aunque
--    su liquidación ya esté cerrada: el gasto liquidado no cambia de estado; las salidas nuevas
--    quedan pendientes hasta que el pago cuadre.
-- 2. Una salida puede engancharse a un pago de otra caja de la MISMA empresa (la caja anterior).

-- Solo se recalculan las salidas que siguen en una liquidación abierta u observada: las que ya
-- se liquidaron no se tocan.
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
