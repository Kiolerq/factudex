-- =============================================================================
-- Tesorería
--  · Rol global "tesorería" (perfiles.es_tesoreria): ve y opera todas las cajas, aprueba u observa
--    liquidaciones, registra ingresos, crea y numera cajas, autoriza gastos sobre el tope.
--  · Tope por gasto (empresas.tope_gasto, S/ 300 por defecto): un gasto mayor queda "por autorizar"
--    y no entra a ninguna liquidación hasta que tesorería lo autorice.
--  · Numeración: caja SL-CAJA-MT-01 (en la app) y liquidación SL-LIQ-MT-001 (correlativo por
--    empresa y área). Las liquidaciones ya cerradas conservan su folio.
--  · Liquidación por rango: generar_liquidacion(caja, desde, hasta, excluidos) liquida solo los
--    gastos completos del rango; el resto queda para la siguiente.
-- =============================================================================

-- 1) Rol de tesorería ---------------------------------------------------------
alter table perfiles add column es_tesoreria boolean not null default false;

create or replace function es_tesoreria() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo and (es_tesoreria or rol = 'admin'));
$$;

-- Tesorería opera todas las cajas (como admin en lo que es dinero y cajas).
create or replace function tiene_acceso_caja(p_caja uuid, p_min rol_usuario default 'lector') returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or es_tesoreria() or exists (
    select 1
      from accesos_caja ac join perfiles p on p.id = ac.usuario_id and p.activo
     where ac.usuario_id = auth.uid()
       and ac.caja_id = p_caja
       and case p_min
             when 'lector'      then true
             when 'registrador' then ac.rol in ('registrador', 'aprobador')
             when 'aprobador'   then ac.rol = 'aprobador'
             else false
           end
  );
$$;

create or replace function tiene_acceso_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or es_tesoreria() or exists (
    select 1 from accesos_caja ac join cajas c on c.id = ac.caja_id
     where ac.usuario_id = auth.uid() and c.empresa_id = p_empresa
  );
$$;

-- Tesorería crea y edita cajas, y el tope de cada empresa (además del admin).
create policy cajas_tesoreria on cajas for all to authenticated using (es_tesoreria()) with check (es_tesoreria());
create policy empresas_tesoreria on empresas for update to authenticated using (es_tesoreria()) with check (es_tesoreria());

-- El rol de tesorería solo lo cambia un admin (perfiles ya es solo-admin por RLS).

-- 2) Tope por gasto y autorización --------------------------------------------
alter table empresas add column tope_gasto numeric(12,2) not null default 300 check (tope_gasto > 0);

alter table movimientos
  add column requiere_autorizacion boolean not null default false,  -- monto > tope de la empresa al registrarlo
  add column autorizado_por uuid references perfiles(id),
  add column autorizado_en timestamptz;

create or replace function tg_movimiento_tope() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.autorizado_por := null;
    new.autorizado_en := null;
  elsif (new.autorizado_por, new.autorizado_en) is distinct from (old.autorizado_por, old.autorizado_en)
        and current_setting('factudex.autorizando', true) is distinct from 'on' then
    raise exception 'Solo tesorería autoriza gastos (usa autorizar_movimiento)';
  end if;
  -- Se evalúa al registrar (o si cambia el monto): cambiar el tope después no altera gastos viejos.
  if tg_op = 'INSERT' or new.monto is distinct from old.monto then
    new.requiere_autorizacion := new.monto > (
      select e.tope_gasto from cajas c join empresas e on e.id = c.empresa_id where c.id = new.caja_id);
  end if;
  return new;
end $$;

create trigger movimientos_tope before insert or update on movimientos
  for each row execute function tg_movimiento_tope();

-- ¿Puede liquidarse? completo, no anulado y, si pasa el tope, autorizado.
create or replace function fx_liquidable(m movimientos) returns boolean
language sql immutable as $$
  select not m.anulado and m.estado = 'completo' and (not m.requiere_autorizacion or m.autorizado_por is not null);
$$;

create or replace function autorizar_movimiento(p_mov uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede autorizar gastos sobre el tope';
  end if;
  perform set_config('factudex.autorizando', 'on', true);
  update movimientos set autorizado_por = auth.uid(), autorizado_en = now()
   where id = p_mov and requiere_autorizacion and autorizado_por is null and not anulado;
  perform set_config('factudex.autorizando', 'off', true);
  if not found then
    raise exception 'El gasto no requiere autorización o ya fue autorizado';
  end if;
end $$;

-- 3) Folio nuevo: SL-LIQ-MT-001 (correlativo por empresa y área) ----------------
create or replace function fx_siguiente_folio(p_caja uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_prefijo text;
  v_n int;
begin
  select e.codigo || '-LIQ-' || c.area || '-' into v_prefijo
    from cajas c join empresas e on e.id = c.empresa_id where c.id = p_caja;
  perform pg_advisory_xact_lock(hashtext('folio:' || v_prefijo));
  select coalesce(max((regexp_match(folio, '-(\d+)$'))[1]::int), 0) + 1 into v_n
    from liquidaciones where folio like v_prefijo || '%';
  return v_prefijo || lpad(v_n::text, greatest(3, length(v_n::text)), '0');
end $$;

create or replace function tg_liquidacion_folio() returns trigger
language plpgsql as $$
begin
  -- correlativo por caja: encadena el saldo (saldo final de una = saldo inicial de la siguiente)
  perform pg_advisory_xact_lock(hashtext('liq:' || new.caja_id::text));
  select coalesce(max(correlativo), 0) + 1 into new.correlativo from liquidaciones where caja_id = new.caja_id;
  new.folio := fx_siguiente_folio(new.caja_id);
  return new;
end $$;

-- Las abiertas (aún sin cerrar) pasan al formato nuevo; las cerradas conservan el suyo.
do $$
declare
  r record;
begin
  for r in select id, caja_id from liquidaciones where estado = 'abierta' order by created_at loop
    update liquidaciones set folio = fx_siguiente_folio(r.caja_id) where id = r.id;
  end loop;
end $$;

-- 4) Totales: lo liquidable excluye lo que espera autorización ---------------------
create or replace view v_liquidaciones with (security_invoker = true) as
select l.*,
       coalesce(m.total, 0)       as total_actual,
       coalesce(m.liquidable, 0)  as total_liquidable,
       coalesce(m.num, 0)         as num_movimientos,
       coalesce(m.incompletos, 0) as num_incompletos,
       coalesce(r.total, 0)       as ingresos_actual,
       l.saldo_inicial + coalesce(r.total, 0) - coalesce(m.liquidable, 0) as saldo_final_actual
  from liquidaciones l
  left join (select liquidacion_id,
                    sum(monto) filter (where not anulado)                          as total,
                    sum(monto) filter (where fx_liquidable(movimientos))           as liquidable,
                    count(*)   filter (where not anulado)                          as num,
                    count(*)   filter (where not anulado and not fx_liquidable(movimientos)) as incompletos
               from movimientos group by liquidacion_id) m on m.liquidacion_id = l.id
  left join (select liquidacion_ingreso_id, sum(monto) total
               from recargas group by liquidacion_ingreso_id) r on r.liquidacion_ingreso_id = l.id;

-- 5) Cierre (para volver a enviar una observada): también traslada lo no autorizado --
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
  return v;
end $$;

-- 6) Liquidar una caja por rango de fechas ---------------------------------------
-- Entran los gastos liquidables de la liquidación abierta con fecha en [desde, hasta], menos los
-- excluidos a mano. Todo lo demás pasa a la nueva liquidación abierta de la caja.
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
  return v;
end $$;

-- Aprobar exige que todo esté sustentado y autorizado (además de ser aprobador o tesorería).
create or replace function revisar_liquidacion(p_liquidacion uuid, p_aprobar boolean, p_observaciones text default null)
returns liquidaciones
language plpgsql security definer set search_path = public as $$
declare
  v liquidaciones;
begin
  select * into v from liquidaciones where id = p_liquidacion for update;
  if not found or not tiene_acceso_caja(v.caja_id, 'aprobador') then
    raise exception 'Solo tesorería o un aprobador de la caja puede revisar';
  end if;
  if v.estado <> 'en_revision' then
    raise exception 'La liquidación % no está en revisión', v.folio;
  end if;
  if p_aprobar and exists (select 1 from movimientos m where m.liquidacion_id = v.id and not m.anulado and not fx_liquidable(m)) then
    raise exception 'La liquidación % tiene gastos sin sustento completo o sin autorizar', v.folio;
  end if;

  update liquidaciones
     set estado        = case when p_aprobar then 'aprobada' else 'observada' end::estado_liquidacion,
         aprobada_por  = case when p_aprobar then auth.uid() end,
         aprobada_en   = case when p_aprobar then now() end,
         observaciones = p_observaciones
   where id = v.id
   returning * into v;
  return v;
end $$;

revoke execute on function generar_liquidacion(uuid, date, date, uuid[]) from public, anon;
revoke execute on function autorizar_movimiento(uuid) from public, anon;
grant  execute on function generar_liquidacion(uuid, date, date, uuid[]) to authenticated;
grant  execute on function autorizar_movimiento(uuid) to authenticated;
