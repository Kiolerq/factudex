-- La carpeta raíz de Drive la elige el administrador (enlace pegado en Mi cuenta).
-- drive_conectado() ahora también devuelve el id de esa carpeta (no es secreto) para mostrarla.
drop function if exists drive_conectado();

create function drive_conectado() returns table (conectado boolean, cuenta_email text, carpeta_id text)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from integraciones where proveedor = 'google_drive'),
         (select cuenta_email from integraciones where proveedor = 'google_drive'),
         (select carpeta_raiz_id from integraciones where proveedor = 'google_drive');
$$;
revoke execute on function drive_conectado() from public, anon;
grant execute on function drive_conectado() to authenticated;
