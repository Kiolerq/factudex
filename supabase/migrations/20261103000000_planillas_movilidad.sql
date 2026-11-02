-- Planilla de movilidad (también para alimentación: así lo maneja la empresa). Se hace en la app,
-- se imprime para que firmen, pero vale para la liquidación aun sin firma. Cada planilla es un
-- gasto (tipo_documento = planilla_movilidad, serie_numero = "10-157") con su PDF adjunto.
-- Tope: S/ 40 por trabajador y por día (sumando todas sus planillas de esa empresa).

-- RUC de San Lorenzo (sale en el encabezado de la planilla).
update empresas set ruc = '20606424087' where codigo = 'SL' and ruc is null;

alter table empresas add column tope_planilla_dia numeric(12,2) not null default 40 check (tope_planilla_dia > 0);

-- Trabajadores que aparecen en las planillas (para elegirlos rápido con su DNI).
create table trabajadores (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  nombre      text not null check (length(trim(nombre)) between 3 and 120),
  dni         text check (dni ~ '^\d{8}$'),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index trabajadores_dni_idx on trabajadores (empresa_id, dni) where dni is not null;
alter table trabajadores enable row level security;
create policy trabajadores_select on trabajadores for select to authenticated using (tiene_acceso_empresa(empresa_id));
create policy trabajadores_insert on trabajadores for insert to authenticated with check (tiene_acceso_empresa(empresa_id));

create table planillas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id),
  movimiento_id  uuid not null unique references movimientos(id),
  serie          text not null check (serie ~ '^[A-Za-z0-9-]{1,10}$'),
  numero         int  not null check (numero > 0),
  fecha_emision  date not null,
  creado_por     uuid not null references perfiles(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (empresa_id, serie, numero)
);
alter table planillas enable row level security;
create policy planillas_select on planillas for select to authenticated
  using (exists (select 1 from movimientos m where m.id = movimiento_id and tiene_acceso_caja(m.caja_id)));
create policy planillas_insert on planillas for insert to authenticated
  with check (exists (select 1 from movimientos m where m.id = movimiento_id and tiene_acceso_caja(m.caja_id, 'registrador')));

create table planilla_filas (
  id           uuid primary key default gen_random_uuid(),
  planilla_id  uuid not null references planillas(id) on delete cascade,
  orden        int  not null,
  fecha        date not null,
  trabajador   text not null check (length(trim(trabajador)) between 3 and 120),
  dni          text check (dni ~ '^\d{8}$'),
  motivo       text not null check (motivo in ('MOVILIDAD', 'ALIMENTACION')),
  origen       text not null check (length(trim(origen)) between 2 and 80),
  destino      text not null check (length(trim(destino)) between 2 and 80),
  importe      numeric(12,2) not null check (importe > 0),
  tipo         text check (tipo in ('T', 'B', 'C', 'COMBI'))
);
create index planilla_filas_planilla_idx on planilla_filas (planilla_id);
alter table planilla_filas enable row level security;
create policy planilla_filas_select on planilla_filas for select to authenticated
  using (exists (select 1 from planillas p join movimientos m on m.id = p.movimiento_id
                  where p.id = planilla_id and tiene_acceso_caja(m.caja_id)));
create policy planilla_filas_insert on planilla_filas for insert to authenticated
  with check (exists (select 1 from planillas p join movimientos m on m.id = p.movimiento_id
                       where p.id = planilla_id and tiene_acceso_caja(m.caja_id, 'registrador')));

-- Tope por trabajador y día: se identifica por DNI o, si no hay, por el nombre.
create or replace function fx_clave_trabajador(p_nombre text, p_dni text) returns text
language sql immutable as $$
  select coalesce(nullif(p_dni, ''), upper(regexp_replace(trim(p_nombre), '\s+', ' ', 'g')));
$$;

create or replace function tg_planilla_tope() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
  v_tope numeric;
  v_total numeric;
begin
  select p.empresa_id, e.tope_planilla_dia into v_empresa, v_tope
    from planillas p join empresas e on e.id = p.empresa_id where p.id = new.planilla_id;
  select coalesce(sum(f.importe), 0) + new.importe into v_total
    from planilla_filas f
    join planillas p on p.id = f.planilla_id
    join movimientos m on m.id = p.movimiento_id and not m.anulado
   where p.empresa_id = v_empresa and f.fecha = new.fecha and f.id <> new.id
     and fx_clave_trabajador(f.trabajador, f.dni) = fx_clave_trabajador(new.trabajador, new.dni);
  if v_total > v_tope then
    raise exception '% ya suma S/ % el %: el tope es S/ % por trabajador y día',
      new.trabajador, to_char(v_total - new.importe, 'FM99990.00'), to_char(new.fecha, 'DD/MM/YYYY'), to_char(v_tope, 'FM99990.00')
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger planilla_filas_tope before insert or update on planilla_filas
  for each row execute function tg_planilla_tope();

-- Crea la planilla completa en una sola operación: el gasto, la planilla y sus filas. Si una fila
-- pasa el tope o la serie y número ya existen, no se guarda nada.
create or replace function crear_planilla(
  p_movimiento uuid, p_caja uuid, p_categoria uuid, p_centro_costo uuid, p_solicitante text,
  p_serie text, p_numero int, p_fecha_emision date, p_pago uuid, p_filas jsonb
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
  if p_pago is not null then
    select medio_pago, operacion into v_medio, v_operacion from pagos where id = p_pago;
  end if;
  v_detalle := 'Planilla de movilidad ' || p_serie || '-' || p_numero || ' · '
               || case when array_length(v_nombres, 1) = 1 then v_nombres[1] else 'Varios' end;

  insert into movimientos (id, caja_id, fecha, solicitante, categoria_id, centro_costo_id, detalle, monto,
                           tipo_documento, serie_numero, medio_pago, operacion_pago, pago_id)
  values (p_movimiento, p_caja, p_fecha_emision, p_solicitante, p_categoria, p_centro_costo, left(v_detalle, 300),
          v_total, 'planilla_movilidad', p_serie || '-' || p_numero, v_medio, v_operacion, p_pago);

  insert into planillas (empresa_id, movimiento_id, serie, numero, fecha_emision)
  values (v_empresa, p_movimiento, p_serie, p_numero, p_fecha_emision) returning id into v_planilla;

  insert into planilla_filas (planilla_id, orden, fecha, trabajador, dni, motivo, origen, destino, importe, tipo)
  select v_planilla, f.ord, (f.x->>'fecha')::date, trim(f.x->>'trabajador'), nullif(f.x->>'dni', ''),
         f.x->>'motivo', trim(f.x->>'origen'), trim(f.x->>'destino'), (f.x->>'importe')::numeric, nullif(f.x->>'tipo', '')
    from jsonb_array_elements(p_filas) with ordinality as f(x, ord);

  -- Recuerda a los trabajadores nuevos (con DNI) para la próxima vez.
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
    raise;
end $$;
grant execute on function crear_planilla(uuid, uuid, uuid, uuid, text, text, int, date, uuid, jsonb) to authenticated;
