-- «Completar un registro anterior»: un gasto que ya se registró solo (peaje S/ 40) en realidad salió
-- de un pago más grande (Yape de S/ 60 que también pagó comida S/ 20). Se convierte en un pago con
-- varias salidas para registrar lo que faltó:
--  - Si el gasto sigue en una liquidación abierta u observada (caja activa), pasa a ser la primera
--    salida del pago, como si se hubiera registrado así desde el inicio.
--  - Si ya se liquidó (o su caja se cerró), NO se toca. El pago nuevo se crea en la caja donde se
--    registra lo que falta y apunta al gasto de origen (movimiento_origen_id): ese gasto cuenta como
--    ya sustentado y su constancia sirve para las salidas nuevas, que muestran de dónde vienen.
--
-- Además, la planilla de movilidad puede iniciar un pago (p_pago_nuevo): Yape, transferencia o un
-- pago que cubre varios comprobantes, no solo efectivo.

alter table pagos add column movimiento_origen_id uuid unique references movimientos(id);

-- Lo sustentado incluye el gasto de origen; la constancia puede estar en él.
create or replace view v_pagos with (security_invoker = true) as
select p.id, p.caja_id, p.monto, p.medio_pago, p.operacion, p.fecha,
       coalesce(s.sustentado, 0) + coalesce(o.monto, 0)              as sustentado,
       coalesce(s.salidas, 0)                                        as salidas,
       coalesce(d.devuelto, 0)                                       as devuelto,
       p.monto - coalesce(s.sustentado, 0) - coalesce(o.monto, 0) - coalesce(d.devuelto, 0) as falta,
       exists (select 1 from movimientos m join adjuntos a on a.movimiento_id = m.id
                where (m.pago_id = p.id or m.id = p.movimiento_origen_id) and a.tipo = 'pago')
                                                                     as tiene_constancia,
       p.movimiento_origen_id
  from pagos p
  left join (select pago_id, sum(monto) sustentado, count(*) salidas
               from movimientos where not anulado and pago_id is not null group by pago_id) s on s.pago_id = p.id
  left join (select pago_id, sum(monto) devuelto from devoluciones group by pago_id) d on d.pago_id = p.id
  left join movimientos o on o.id = p.movimiento_origen_id and not o.anulado;

create or replace function fx_pago_cuadrado(p_pago uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_pago is null or (
    select p.monto = coalesce((select sum(m.monto) from movimientos m where m.pago_id = p.id and not m.anulado), 0)
                   + coalesce((select o.monto from movimientos o where o.id = p.movimiento_origen_id and not o.anulado), 0)
                   + coalesce((select sum(d.monto) from devoluciones d where d.pago_id = p.id), 0)
      from pagos p where p.id = p_pago);
$$;

-- Constancia: la del gasto, la de otra salida del pago o la del gasto de origen.
create or replace function fx_estado_movimiento(p_mov uuid, p_medio medio_pago) returns estado_movimiento
language sql stable security definer set search_path = public as $$
  with m as (select id, pago_id from movimientos where id = p_mov)
  select case
           when exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'documento')
            and (p_medio = 'efectivo'
                 or exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'pago')
                 or exists (select 1 from m join movimientos h on h.pago_id = m.pago_id
                              join adjuntos a on a.movimiento_id = h.id and a.tipo = 'pago')
                 or exists (select 1 from m join pagos p on p.id = m.pago_id
                              join adjuntos a on a.movimiento_id = p.movimiento_origen_id and a.tipo = 'pago'))
            and fx_pago_cuadrado((select pago_id from m))
           then 'completo'::estado_movimiento
           else 'pendiente'::estado_movimiento
         end;
$$;

create or replace view v_pendientes with (security_invoker = true) as
select m.*,
       ((now() at time zone 'America/Lima')::date - m.fecha) as dias_antiguedad,
       not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'documento') as falta_documento,
       (m.medio_pago is distinct from 'efectivo'
        and not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'pago')
        and not exists (select 1 from movimientos h join adjuntos a on a.movimiento_id = h.id and a.tipo = 'pago'
                         where m.pago_id is not null and h.pago_id = m.pago_id)
        and not exists (select 1 from pagos p join adjuntos a on a.movimiento_id = p.movimiento_origen_id and a.tipo = 'pago'
                         where p.id = m.pago_id)) as falta_pago
  from movimientos m
 where m.estado = 'pendiente' and not m.anulado;

-- Si anulan el gasto de origen, el pago deja de cuadrar: se recalculan sus salidas.
create or replace function tg_movimiento_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.pago_id is distinct from new.pago_id then
    perform fx_recalcular_pago(old.pago_id);
  end if;
  perform fx_recalcular_pago(new.pago_id);
  perform fx_recalcular_pago((select id from pagos where movimiento_origen_id = new.id));
  return null;
end $$;

-- Convierte un gasto anterior en un pago de p_monto (el total que realmente se pagó). Devuelve el
-- pago, al que luego se agregan las salidas que faltan (en p_caja si el gasto ya no se puede tocar).
create or replace function convertir_en_pago(p_mov uuid, p_monto numeric, p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m movimientos;
  v_liq estado_liquidacion;
  v_activa boolean;
  v_empresa_m uuid;
  v_empresa_c uuid;
  v_pago uuid := gen_random_uuid();
begin
  select * into m from movimientos where id = p_mov for update;
  if m.id is null or not tiene_acceso_caja(m.caja_id) then
    raise exception 'Gasto no encontrado' using errcode = 'P0002';
  end if;
  if m.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if m.pago_id is not null then raise exception 'Ese gasto ya es parte de un pago con varias salidas' using errcode = 'P0001'; end if;
  if exists (select 1 from pagos where movimiento_origen_id = p_mov) then
    raise exception 'Ese gasto ya se completó con otro pago' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto <= m.monto then
    raise exception 'El pago total debe ser mayor que el gasto (S/ %)', to_char(m.monto, 'FM999G990D00') using errcode = 'P0001';
  end if;

  select l.estado, c.activa, c.empresa_id into v_liq, v_activa, v_empresa_m
    from liquidaciones l join cajas c on c.id = m.caja_id where l.id = m.liquidacion_id;

  if v_liq in ('abierta', 'observada') and v_activa then
    -- Aún se puede tocar: pasa a ser la primera salida del pago, en su misma caja.
    if not tiene_acceso_caja(m.caja_id, 'registrador') then
      raise exception 'No puedes registrar en la caja de ese gasto' using errcode = '42501';
    end if;
    insert into pagos (id, caja_id, monto, medio_pago, operacion, fecha, creado_por)
    values (v_pago, m.caja_id, p_monto, m.medio_pago, m.operacion_pago, m.fecha, auth.uid());
    update movimientos set pago_id = v_pago where id = p_mov;
  else
    -- Ya liquidado o de una caja cerrada: no se toca; lo que falta va a p_caja y dice de dónde viene.
    select empresa_id into v_empresa_c from cajas where id = p_caja and activa;
    if v_empresa_c is null or not tiene_acceso_caja(p_caja, 'registrador') then
      raise exception 'Elige una caja activa donde puedas registrar' using errcode = '42501';
    end if;
    if v_empresa_c <> v_empresa_m then
      raise exception 'La caja debe ser de la misma empresa que el gasto' using errcode = 'P0001';
    end if;
    insert into pagos (id, caja_id, monto, medio_pago, operacion, fecha, creado_por, movimiento_origen_id)
    values (v_pago, p_caja, p_monto, m.medio_pago, m.operacion_pago, m.fecha, auth.uid(), p_mov);
  end if;
  return v_pago;
end $$;
revoke all on function convertir_en_pago(uuid, numeric, uuid) from public;
grant execute on function convertir_en_pago(uuid, numeric, uuid) to authenticated;

-- La planilla puede iniciar su propio pago (p_pago_nuevo = {id, monto, medio_pago, operacion}).
drop function crear_planilla(uuid, uuid, uuid, uuid, text, text, int, date, uuid, jsonb);
create function crear_planilla(
  p_movimiento uuid, p_caja uuid, p_categoria uuid, p_centro_costo uuid, p_solicitante text,
  p_serie text, p_numero int, p_fecha_emision date, p_pago uuid, p_filas jsonb, p_pago_nuevo jsonb default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_empresa uuid;
  v_planilla uuid;
  v_total numeric;
  v_medio medio_pago := 'efectivo';
  v_operacion text;
  v_detalle text;
  v_nombres text[];
begin
  select empresa_id into v_empresa from cajas where id = p_caja;
  select coalesce(sum((f->>'importe')::numeric), 0), array_agg(distinct f->>'trabajador')
    into v_total, v_nombres from jsonb_array_elements(p_filas) f;
  if v_total <= 0 then raise exception 'La planilla no tiene filas' using errcode = 'P0001'; end if;
  if p_pago_nuevo is not null then
    if p_pago is not null then raise exception 'La planilla va a un pago existente o a uno nuevo, no a ambos' using errcode = 'P0001'; end if;
    if (p_pago_nuevo->>'monto')::numeric + 0.001 < v_total then
      raise exception 'El pago total no puede ser menor que la planilla (S/ %)', to_char(v_total, 'FM999G990D00') using errcode = 'P0001';
    end if;
    p_pago := (p_pago_nuevo->>'id')::uuid;
    insert into pagos (id, caja_id, monto, medio_pago, operacion, fecha)
    values (p_pago, p_caja, (p_pago_nuevo->>'monto')::numeric, (p_pago_nuevo->>'medio_pago')::medio_pago,
            nullif(trim(p_pago_nuevo->>'operacion'), ''), p_fecha_emision);
  end if;
  if p_pago is not null then
    select medio_pago, operacion into v_medio, v_operacion from pagos where id = p_pago;
  end if;
  v_detalle := 'Planilla de movilidad ' || p_serie || '-' || p_numero || ' · '
               || case when array_length(v_nombres, 1) = 1 then v_nombres[1] else 'Varios' end;

  insert into movimientos (id, caja_id, fecha, solicitante, categoria_id, centro_costo_id, detalle, monto,
                           tipo_documento, serie_numero, medio_pago, operacion_pago, pago_id)
  values (p_movimiento, p_caja, p_fecha_emision, p_solicitante, p_categoria, p_centro_costo, left(v_detalle, 300),
          v_total, 'planilla_movilidad', p_serie || '-' || p_numero, coalesce(v_medio, 'efectivo'), v_operacion, p_pago);

  insert into planillas (empresa_id, movimiento_id, serie, numero, fecha_emision)
  values (v_empresa, p_movimiento, p_serie, p_numero, p_fecha_emision) returning id into v_planilla;

  insert into planilla_filas (planilla_id, orden, fecha, trabajador, dni, motivo, origen, destino, importe, tipo)
  select v_planilla, f.ord, (f.x->>'fecha')::date, trim(f.x->>'trabajador'), nullif(f.x->>'dni', ''),
         f.x->>'motivo', trim(f.x->>'origen'), trim(f.x->>'destino'), (f.x->>'importe')::numeric, nullif(f.x->>'tipo', '')
    from jsonb_array_elements(p_filas) with ordinality as f(x, ord);

  insert into trabajadores (empresa_id, nombre, dni)
  select distinct on (f->>'dni') v_empresa, trim(f->>'trabajador'), f->>'dni'
    from jsonb_array_elements(p_filas) f
   where coalesce(f->>'dni', '') <> ''
  on conflict do nothing;

  return v_planilla;
exception
  when unique_violation then
    if sqlerrm like '%planillas_empresa_id_serie_numero_key%' then
      raise exception 'Ya existe la planilla %-% en esta empresa', p_serie, p_numero using errcode = 'P0001';
    end if;
    if sqlerrm like '%pagos_pkey%' then
      raise exception 'Ese pago ya se registró' using errcode = 'P0001';
    end if;
    raise;
end $$;
grant execute on function crear_planilla(uuid, uuid, uuid, uuid, text, text, int, date, uuid, jsonb, jsonb) to authenticated;
