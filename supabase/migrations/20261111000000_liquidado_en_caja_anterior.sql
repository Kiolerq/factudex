-- "Lo que falta ya se liquidó en una caja anterior": un Yape de S/ 60 incluye S/ 29.30 de una
-- planilla que ya se rindió antes (en la caja anterior, como gasto aparte o fuera de la app).
--
-- 1. vincular_a_pago(): junta al pago un gasto ya registrado (aunque esté liquidado) de la misma
--    empresa. El gasto no cambia de liquidación ni de estado; el pago cuadra.
-- 2. devoluciones.tipo = 'liquidado_antes': lo que se rindió fuera de la app (en Excel o papel),
--    con la referencia en el motivo. Cuenta para el cuadre como una devolución y no mueve el saldo.

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
