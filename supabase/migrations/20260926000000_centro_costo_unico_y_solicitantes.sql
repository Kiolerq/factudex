-- =============================================================================
-- Centro de costo único + lista de solicitantes
--  · La placa deja de ser un campo aparte: placas, áreas o cualquier otro destino
--    del gasto son CENTROS DE COSTO (una sola lista fija por empresa).
--  · Solicitantes: lista por empresa para sugerir el nombre al registrar
--    (el movimiento guarda el nombre como texto, igual que sale en la liquidación).
-- =============================================================================

-- 1) Las placas existentes pasan a ser centros de costo.
insert into centros_costo (empresa_id, codigo, nombre, orden)
select v.empresa_id, v.placa, v.placa, 100
  from vehiculos v
on conflict (empresa_id, codigo) do nothing;

update movimientos m
   set centro_costo_id = cc.id
  from vehiculos v
  join centros_costo cc on cc.empresa_id = v.empresa_id and cc.codigo = v.placa
 where m.vehiculo_id = v.id and m.centro_costo_id is null;

-- 2) La validación ya no mira vehículos.
drop trigger if exists movimientos_listas on movimientos;
drop function if exists tg_movimiento_listas();

create or replace function tg_movimiento_centro_costo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.centro_costo_id is not null and not exists (
       select 1 from centros_costo cc join cajas c on c.empresa_id = cc.empresa_id
        where cc.id = new.centro_costo_id and c.id = new.caja_id and cc.activo)
  then
    raise exception 'El centro de costo no pertenece a la empresa de la caja o está inactivo';
  end if;
  return new;
end $$;

create trigger movimientos_centro_costo before insert or update of centro_costo_id, caja_id on movimientos
  for each row execute function tg_movimiento_centro_costo();

-- v_pendientes usa m.*: se recrea sin la columna.
drop view v_pendientes;
alter table movimientos drop column vehiculo_id;
drop table vehiculos;

create view v_pendientes with (security_invoker = true) as
select m.*,
       ((now() at time zone 'America/Lima')::date - m.fecha) as dias_antiguedad,
       not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'documento') as falta_documento,
       (m.medio_pago is distinct from 'efectivo'
        and not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'pago')) as falta_pago
  from movimientos m
 where m.estado = 'pendiente' and not m.anulado;

-- 3) Solicitantes por empresa.
create table solicitantes (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nombre     text not null,
  area       text,                          -- opcional: área o cargo
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index solicitantes_nombre_uq on solicitantes (empresa_id, lower(nombre));

alter table solicitantes enable row level security;
create policy solicitantes_select on solicitantes for select to authenticated using (tiene_acceso_empresa(empresa_id));
create policy solicitantes_admin  on solicitantes for all    to authenticated using (es_admin()) with check (es_admin());
