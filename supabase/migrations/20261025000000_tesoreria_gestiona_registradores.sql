-- Tesorería también gestiona a los registradores: crea sus cuentas (eso lo hace el servidor con
-- Supabase Auth, después de verificar que quien llama es tesorería) y les asigna o quita cajas.
-- Solo a registradores: no puede tocar a un administrador ni a otra persona de tesorería, ni
-- convertir a nadie en admin o tesorería (lo impide el "with check").

create policy perfiles_tesoreria on perfiles for update to authenticated
  using (es_tesoreria() and rol <> 'admin' and not es_tesoreria)
  with check (es_tesoreria() and rol <> 'admin' and not es_tesoreria);

create policy accesos_tesoreria on accesos_caja for all to authenticated
  using (es_tesoreria() and exists (
    select 1 from perfiles p where p.id = usuario_id and p.rol <> 'admin' and not p.es_tesoreria
  ))
  with check (es_tesoreria() and exists (
    select 1 from perfiles p where p.id = usuario_id and p.rol <> 'admin' and not p.es_tesoreria
  ));
