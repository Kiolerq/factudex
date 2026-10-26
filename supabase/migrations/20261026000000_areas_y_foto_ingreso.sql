-- 1. Áreas: lista de las siglas que van en el código de caja (SL-CAJA-MT-01). Al abrir una caja
--    se elige de esta lista; tesorería puede agregar una nueva con su nombre y descripción.
create table areas (
  codigo      text primary key check (codigo ~ '^[A-Z]{2,4}$'),   -- MT, AD, OP
  nombre      text not null check (length(trim(nombre)) between 2 and 40),
  descripcion text check (length(descripcion) <= 200),
  created_at  timestamptz not null default now()
);
alter table areas enable row level security;
create policy areas_select on areas for select to authenticated using (true);
create policy areas_insert on areas for insert to authenticated with check (es_tesoreria());
create policy areas_update on areas for update to authenticated using (es_tesoreria()) with check (es_tesoreria());

insert into areas (codigo, nombre) values
  ('MT', 'Mantenimiento'),
  ('AD', 'Administración'),
  ('OP', 'Operaciones')
on conflict do nothing;
-- Las que ya usan las cajas existentes (si hubiera otras).
insert into areas (codigo, nombre) select distinct area, area from cajas on conflict do nothing;

-- 2. Foto del depósito de un ingreso (reemplaza a N° de operación y recibo en la pantalla).
--    Ruta como los adjuntos: 'drive:<fileId>' o '<caja_id>/ingresos/<recarga_id>.<ext>'.
alter table recargas
  add column comprobante_path text,
  add column comprobante_mime text;

-- Las recargas no se editan; solo se les pone (o cambia) la foto, y solo tesorería.
create or replace function adjuntar_comprobante_recarga(p_recarga uuid, p_path text, p_mime text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede adjuntar la foto de un ingreso' using errcode = '42501';
  end if;
  update recargas set comprobante_path = p_path, comprobante_mime = p_mime where id = p_recarga;
  if not found then
    raise exception 'Ingreso no encontrado' using errcode = 'P0002';
  end if;
end $$;
revoke all on function adjuntar_comprobante_recarga(uuid, text, text) from public;
grant execute on function adjuntar_comprobante_recarga(uuid, text, text) to authenticated;
