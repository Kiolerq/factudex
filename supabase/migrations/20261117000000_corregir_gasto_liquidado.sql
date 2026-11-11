-- Corregir un gasto ya liquidado (solo tesorería). Ej.: la factura FB82-00020410 de S/ 9.80, ya
-- rendida en la SL-LIQ-GE-006, se anuló y el proveedor emitió la FB82-00020411 por S/ 6.55. El gasto
-- original no se toca (su liquidación ya la tiene contabilidad): en la caja abierta entra una línea
-- de corrección por la diferencia (–S/ 3.25) con la factura nueva, que va en la próxima liquidación.
-- Si el monto correcto es mayor, la línea es positiva.

alter table movimientos add column if not exists corrige_id uuid references movimientos(id);
comment on column movimientos.corrige_id is 'Corrección de un gasto ya liquidado: el gasto original (la línea lleva la diferencia)';
-- Por si no se corrió 20261115000000.
alter table movimientos add column if not exists observaciones text
  check (observaciones is null or length(observaciones) <= 300);

-- Solo una corrección puede ser negativa.
alter table movimientos drop constraint if exists movimientos_monto_check;
alter table movimientos add constraint movimientos_monto_check
  check (monto > 0 or (corrige_id is not null and monto <> 0));

create or replace function corregir_movimiento(
  p_id uuid,              -- id de la línea de corrección (lo genera la app: el archivo ya se subió con él)
  p_original uuid,
  p_caja uuid,            -- caja abierta donde entra la corrección
  p_monto_correcto numeric,
  p_serie_numero text,    -- N° del documento nuevo (null = el mismo)
  p_motivo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o movimientos;
  v_liq liquidaciones;
  c cajas;
  co cajas;
  v_vigente numeric;
  v_dif numeric;
  v_doc text;
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede corregir un gasto ya liquidado' using errcode = '42501';
  end if;
  select * into o from movimientos where id = p_original for update;
  if o.id is null then raise exception 'El gasto no existe' using errcode = 'P0001'; end if;
  if o.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if o.corrige_id is not null then raise exception 'Esa línea ya es una corrección: corrige el gasto original' using errcode = 'P0001'; end if;
  select * into v_liq from liquidaciones where id = o.liquidacion_id;
  if v_liq.estado in ('abierta', 'observada') then
    raise exception 'El gasto sigue en la liquidación % (%): corrígelo ahí, anulándolo y registrándolo de nuevo', v_liq.folio, v_liq.estado
      using errcode = 'P0001';
  end if;
  select * into c from cajas where id = p_caja;
  select * into co from cajas where id = o.caja_id;
  if c.id is null or not c.activa or c.empresa_id <> co.empresa_id then
    raise exception 'La corrección va en una caja abierta de la misma empresa' using errcode = 'P0001';
  end if;
  if p_monto_correcto is null or p_monto_correcto < 0 then
    raise exception 'Escribe el monto correcto' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe el motivo de la corrección' using errcode = 'P0001';
  end if;

  -- Lo vigente = el original + correcciones anteriores.
  select o.monto + coalesce(sum(monto), 0) into v_vigente from movimientos where corrige_id = o.id and not anulado;
  v_dif := round(p_monto_correcto - v_vigente, 2);
  if v_dif = 0 then raise exception 'El gasto ya está en S/ %', to_char(v_vigente, 'FM999990.00') using errcode = 'P0001'; end if;

  v_doc := coalesce(o.serie_numero, 'gasto');
  insert into movimientos (id, caja_id, fecha, solicitante, proveedor_id, categoria_id, centro_costo_id, detalle, monto,
                           tipo_documento, serie_numero, medio_pago, corrige_id, observaciones, creado_por)
  values (p_id, p_caja, (now() at time zone 'America/Lima')::date, o.solicitante, o.proveedor_id, o.categoria_id,
          o.centro_costo_id,
          left('Corrección de ' || v_doc || ' (' || v_liq.folio || '): ahora S/ ' || to_char(p_monto_correcto, 'FM999990.00')
               || case when nullif(trim(p_serie_numero), '') is distinct from o.serie_numero and nullif(trim(p_serie_numero), '') is not null then ' con ' || p_serie_numero else '' end, 300),
          v_dif, o.tipo_documento, coalesce(nullif(trim(p_serie_numero), ''), o.serie_numero), 'efectivo', o.id,
          left(trim(p_motivo), 300), auth.uid());
  return p_id;
end $$;
revoke all on function corregir_movimiento(uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function corregir_movimiento(uuid, uuid, uuid, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
