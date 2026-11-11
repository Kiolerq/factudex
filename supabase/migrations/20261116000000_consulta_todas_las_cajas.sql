-- Usuario de solo consulta: ve TODAS las cajas (abiertas, cerradas y las que se abran después) sin
-- asignárselas una por una. Solo lectura: tiene_acceso_caja() le da el nivel 'lector' y nada más,
-- así que el RLS no le deja registrar, anular, aprobar ni cambiar nada.

alter table perfiles add column if not exists es_consulta boolean not null default false;
comment on column perfiles.es_consulta is 'Solo consulta: lee todas las cajas (nivel lector), no escribe nada';

-- Los usuarios de consulta ya creados (sin el módulo Registro) pasan a ver todas las cajas.
update perfiles set es_consulta = true
 where rol <> 'admin' and not es_tesoreria and modulos is not null and not ('registro' = any (modulos));

create or replace function es_consulta() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo and es_consulta);
$$;

create or replace function tiene_acceso_caja(p_caja uuid, p_min rol_usuario default 'lector') returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or es_tesoreria()
      or (p_min = 'lector' and es_consulta())
      or exists (
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

-- Solo consulta tampoco agrega proveedores.
drop policy if exists proveedores_insert on proveedores;
create policy proveedores_insert on proveedores for insert to authenticated with check (not es_consulta());

notify pgrst, 'reload schema';
