-- =============================================================================
-- Comprobantes en Google Drive
--  · integraciones: token de la cuenta de Google conectada por el administrador.
--  · drive_carpetas: caché de las carpetas creadas (Factudex/<Empresa>/<Caja>/<Mes>).
--  Ambas SIN políticas RLS: nadie las lee desde el navegador; solo el servidor de la app
--  con la clave service_role.
--  · adjuntos.almacen: 'supabase' (Storage) o 'drive'. En Drive, storage_path = 'drive:<fileId>'.
-- =============================================================================

create table integraciones (
  proveedor      text primary key check (proveedor in ('google_drive')),
  refresh_token  text not null,
  carpeta_raiz_id text not null,
  cuenta_email   text,
  conectado_por  uuid references perfiles(id),
  conectado_en   timestamptz not null default now()
);
alter table integraciones enable row level security;

create table drive_carpetas (
  ruta       text primary key,           -- ej. 'San Lorenzo/Caja 01 - Mantenimiento/2026-09'
  folder_id  text not null,
  created_at timestamptz not null default now()
);
alter table drive_carpetas enable row level security;

alter table adjuntos
  add column almacen text not null default 'supabase' check (almacen in ('supabase', 'drive')),
  add column nombre_archivo text;

-- Estado de la conexión, sin exponer el token: cualquier usuario puede saber si hay Drive.
create or replace function drive_conectado() returns table (conectado boolean, cuenta_email text)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from integraciones where proveedor = 'google_drive'),
         (select cuenta_email from integraciones where proveedor = 'google_drive');
$$;
revoke execute on function drive_conectado() from public, anon;
grant execute on function drive_conectado() to authenticated;
