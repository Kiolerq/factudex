-- Al abrir una caja nueva, la anterior de la misma empresa y área le pasa su saldo (a favor o en
-- contra) y los gastos que no entraron a ninguna liquidación (pendientes, por autorizar o sin
-- liquidar). La anterior queda en S/ 0.00 y se cierra.
--
--   anterior: ajuste  -S/ 300  "Saldo pasado a SL-CAJA-MT-03"
--   nueva:    ajuste  +S/ 300  "Saldo de SL-CAJA-MT-02"   (+ su apertura)
--
-- El saldo que pasa = saldo de la caja + lo que suman los gastos que se mueven (esos gastos ahora
-- se descuentan en la nueva). Así la nueva muestra exactamente el efectivo que quedó + el abono.

alter table recargas add column traspaso_caja_id uuid references cajas(id);  -- la otra caja del traspaso

-- Mover un gasto de caja solo lo hace traspasar_caja().
create or replace function tg_movimiento_bloqueo() returns trigger
language plpgsql as $$
declare
  v_estado estado_liquidacion;
begin
  if new.caja_id <> old.caja_id and current_setting('factudex.traspasando_caja', true) is distinct from 'on' then
    raise exception 'No se puede mover un movimiento a otra caja; anúlalo y regístralo de nuevo';
  end if;
  -- cerrar_liquidacion() y traspasar_caja() trasladan los pendientes a otra liquidación.
  if current_setting('factudex.trasladando_pendientes', true) = 'on'
     or current_setting('factudex.traspasando_caja', true) = 'on' then
    return new;
  end if;
  select estado into v_estado from liquidaciones where id = old.liquidacion_id;
  if v_estado <> 'abierta' and v_estado <> 'observada' and (
       new.monto, new.fecha, new.liquidacion_id, new.detalle, new.anulado, new.medio_pago)
       is distinct from
      (old.monto, old.fecha, old.liquidacion_id, old.detalle, old.anulado, old.medio_pago)
  then
    raise exception 'La liquidación está % y el movimiento ya no puede modificarse', v_estado;
  end if;
  return new;
end $$;

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
