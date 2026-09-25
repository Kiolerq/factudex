-- =============================================================================
-- Factudex — esquema inicial (PROPUESTA, pendiente de aprobación)
-- Ver docs/modelo-datos.md para la explicación de cada tabla y regla.
-- Montos en soles (S/), numeric(12,2). Zona horaria de negocio: America/Lima.
-- =============================================================================

create extension if not exists pg_trgm;   -- búsqueda difusa de proveedores

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type rol_usuario        as enum ('admin', 'aprobador', 'registrador', 'lector');
create type tipo_doc_identidad as enum ('RUC', 'DNI', 'CE', 'OTRO');
create type tipo_documento     as enum ('factura', 'boleta', 'rxh', 'planilla_movilidad', 'comprobante_egreso', 'otro');
create type estado_movimiento  as enum ('pendiente', 'completo');
-- documento = sustento (factura, boleta, planilla de movilidad, comprobante de egreso…)
-- pago      = constancia del pago (captura de Yape/Plin, voucher de transferencia…)
create type tipo_adjunto       as enum ('documento', 'pago', 'otro');
create type origen_movimiento  as enum ('manual', 'compartido', 'ocr');
create type estado_liquidacion as enum ('abierta', 'en_revision', 'observada', 'aprobada', 'repuesta');
create type tipo_recarga       as enum ('apertura', 'reposicion', 'extraordinaria', 'ajuste');

-- -----------------------------------------------------------------------------
-- Utilidad: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------
create table empresas (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique check (codigo ~ '^[A-Z0-9]{2,6}$'),  -- 'SL', 'SIPE'
  nombre_corto   text not null,                                            -- 'San Lorenzo'
  razon_social   text not null,                                            -- 'Compañía San Lorenzo S.A.C.'
  ruc            char(11) unique check (ruc ~ '^\d{11}$'),
  color_primario text not null check (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  color_acento   text not null check (color_acento   ~ '^#[0-9A-Fa-f]{6}$'),
  activa         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Cajas chicas (varias por empresa)
-- -----------------------------------------------------------------------------
create table cajas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id),
  codigo         text not null check (codigo ~ '^[A-Z0-9]{2,6}$'),         -- 'MANT', 'OPER', 'GEN'
  nombre         text not null,                                            -- 'Mantenimiento'
  umbral_alerta  numeric(12,2) not null default 200 check (umbral_alerta >= 0),
  responsable_id uuid,                                                     -- FK a perfiles (más abajo)
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (empresa_id, codigo)
);

-- -----------------------------------------------------------------------------
-- Usuarios y roles
--   perfiles: 1-1 con auth.users. rol = rol global.
--   accesos_caja: qué cajas ve/opera cada usuario (admin ve todo sin filas aquí).
-- -----------------------------------------------------------------------------
create table perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  email      text,
  rol        rol_usuario not null default 'registrador',
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table cajas
  add constraint cajas_responsable_fk foreign key (responsable_id) references perfiles(id);

create table accesos_caja (
  usuario_id uuid not null references perfiles(id) on delete cascade,
  caja_id    uuid not null references cajas(id) on delete cascade,
  rol        rol_usuario not null,          -- registrador / aprobador / lector en ESTA caja
  primary key (usuario_id, caja_id),
  check (rol <> 'admin')
);

-- Crea el perfil automáticamente al registrarse un usuario en Supabase Auth.
create or replace function tg_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)), new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function tg_nuevo_usuario();

-- -----------------------------------------------------------------------------
-- Maestro de proveedores (compartido entre empresas)
-- -----------------------------------------------------------------------------
create table proveedores (
  id               uuid primary key default gen_random_uuid(),
  tipo_doc         tipo_doc_identidad not null,
  num_doc          text not null,
  razon_social     text not null,
  nombre_comercial text,                     -- ej. 'COVISOL - Peaje Chicama'
  activo           boolean not null default true,
  creado_por       uuid references perfiles(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tipo_doc, num_doc),
  check (
    (tipo_doc = 'RUC' and num_doc ~ '^(10|15|17|20)\d{9}$') or
    (tipo_doc = 'DNI' and num_doc ~ '^\d{8}$') or
    (tipo_doc in ('CE', 'OTRO'))
  )
);

create index proveedores_busqueda_idx on proveedores
  using gin ((razon_social || ' ' || coalesce(nombre_comercial, '') || ' ' || num_doc) gin_trgm_ops);

create trigger proveedores_updated_at before update on proveedores
  for each row execute function tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Categorías de gasto (empresa_id null = aplica a todas)
-- -----------------------------------------------------------------------------
create table categorias (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id),
  nombre     text not null,
  activa     boolean not null default true,
  orden      int not null default 0
);
create unique index categorias_nombre_uq on categorias (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nombre));

-- -----------------------------------------------------------------------------
-- Centros de costo: lista fija por empresa (la administra admin)
-- -----------------------------------------------------------------------------
create table centros_costo (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  codigo     text not null,
  nombre     text not null,
  activo     boolean not null default true,
  orden      int not null default 0,
  unique (empresa_id, codigo)
);

-- -----------------------------------------------------------------------------
-- Liquidaciones (folio numerado por caja: SL-MANT-0001)
-- -----------------------------------------------------------------------------
create table liquidaciones (
  id              uuid primary key default gen_random_uuid(),
  caja_id         uuid not null references cajas(id),
  correlativo     int  not null,
  folio           text not null unique,
  estado          estado_liquidacion not null default 'abierta',
  fecha_inicio    date not null default (now() at time zone 'America/Lima')::date,
  fecha_cierre    date,
  total_gastado   numeric(12,2),              -- snapshot al cerrar (solo movimientos completos)
  cerrada_por     uuid references perfiles(id),
  cerrada_en      timestamptz,
  aprobada_por    uuid references perfiles(id),
  aprobada_en     timestamptz,
  observaciones   text,
  created_at      timestamptz not null default now(),
  unique (caja_id, correlativo),
  check (fecha_cierre is null or fecha_cierre >= fecha_inicio),
  check (estado = 'abierta' or fecha_cierre is not null)
);

-- Solo una liquidación abierta por caja a la vez.
create unique index liquidaciones_una_abierta_uq on liquidaciones (caja_id) where estado = 'abierta';

-- Asigna correlativo y folio: <EMPRESA>-<CAJA>-0001
create or replace function tg_liquidacion_folio() returns trigger
language plpgsql as $$
declare
  v_prefijo text;
begin
  select e.codigo || '-' || c.codigo into v_prefijo
    from cajas c join empresas e on e.id = c.empresa_id
   where c.id = new.caja_id;

  perform pg_advisory_xact_lock(hashtext('liq:' || new.caja_id::text));
  select coalesce(max(correlativo), 0) + 1 into new.correlativo
    from liquidaciones where caja_id = new.caja_id;

  new.folio := v_prefijo || '-' || lpad(new.correlativo::text, 4, '0');
  return new;
end $$;

create trigger liquidaciones_folio before insert on liquidaciones
  for each row execute function tg_liquidacion_folio();

-- -----------------------------------------------------------------------------
-- Movimientos (gastos). Descuentan saldo al instante (ver vista v_saldo_cajas).
-- -----------------------------------------------------------------------------
create table movimientos (
  id              uuid primary key default gen_random_uuid(),
  caja_id         uuid not null references cajas(id),
  liquidacion_id  uuid not null references liquidaciones(id),   -- la abierta al momento de registrar
  fecha           date not null,                                -- fecha del gasto
  solicitante     text,                                         -- quién pidió el gasto
  proveedor_id    uuid references proveedores(id),              -- null = "Por definir"
  categoria_id    uuid references categorias(id),               -- null = "Sin categorizar"
  centro_costo_id uuid references centros_costo(id),            -- lista fija de la empresa
  placa           text,                                         -- opcional (ej. T1Y-461)
  detalle         text not null,
  monto           numeric(12,2) not null check (monto > 0),
  tipo_documento  tipo_documento,                               -- null = aún no se sabe
  serie_numero    text,                                         -- ej. F001-00012345
  pagado_yape     boolean not null default false,               -- independiente del tipo de documento
  estado          estado_movimiento not null default 'pendiente', -- trigger: completo = documento + pago adjuntos
  origen          origen_movimiento not null default 'manual',
  anulado         boolean not null default false,
  motivo_anulacion text,
  creado_por      uuid not null references perfiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (not anulado or motivo_anulacion is not null)
);

create index movimientos_caja_fecha_idx   on movimientos (caja_id, fecha desc);
create index movimientos_liquidacion_idx  on movimientos (liquidacion_id);
create index movimientos_pendientes_idx   on movimientos (caja_id, fecha) where estado = 'pendiente' and not anulado;
create index movimientos_texto_idx on movimientos
  using gin ((detalle || ' ' || coalesce(serie_numero, '') || ' ' || coalesce(solicitante, '')) gin_trgm_ops);

create trigger movimientos_updated_at before update on movimientos
  for each row execute function tg_set_updated_at();

-- Al insertar: asigna la liquidación abierta de la caja (la crea si no existe).
create or replace function tg_movimiento_liquidacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select id into new.liquidacion_id
    from liquidaciones where caja_id = new.caja_id and estado = 'abierta';

  if new.liquidacion_id is null then
    insert into liquidaciones (caja_id) values (new.caja_id)
    returning id into new.liquidacion_id;
  end if;

  new.estado := 'pendiente';  -- se vuelve 'completo' al adjuntar documento + pago
  return new;
end $$;

create trigger movimientos_asignar_liquidacion before insert on movimientos
  for each row execute function tg_movimiento_liquidacion();

-- El centro de costo debe pertenecer a la misma empresa que la caja.
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

-- Movimientos de una liquidación ya cerrada no se editan (solo se pueden adjuntar documentos).
create or replace function tg_movimiento_bloqueo() returns trigger
language plpgsql as $$
declare
  v_estado estado_liquidacion;
begin
  if new.caja_id <> old.caja_id then
    raise exception 'No se puede mover un movimiento a otra caja; anúlalo y regístralo de nuevo';
  end if;
  -- cerrar_liquidacion() traslada los pendientes a la siguiente liquidación.
  if current_setting('factudex.trasladando_pendientes', true) = 'on' then
    return new;
  end if;
  select estado into v_estado from liquidaciones where id = old.liquidacion_id;
  if v_estado <> 'abierta' and v_estado <> 'observada' and (
       new.monto, new.fecha, new.liquidacion_id, new.detalle, new.anulado)
       is distinct from
      (old.monto, old.fecha, old.liquidacion_id, old.detalle, old.anulado)
  then
    raise exception 'La liquidación está % y el movimiento ya no puede modificarse', v_estado;
  end if;
  return new;
end $$;

create trigger movimientos_bloqueo before update on movimientos
  for each row execute function tg_movimiento_bloqueo();

-- -----------------------------------------------------------------------------
-- Adjuntos (fotos/PDF en Storage, bucket privado 'comprobantes')
--   ruta: <caja_id>/<movimiento_id>/<uuid>.<ext>
-- -----------------------------------------------------------------------------
create table adjuntos (
  id             uuid primary key default gen_random_uuid(),
  movimiento_id  uuid not null references movimientos(id) on delete cascade,
  tipo           tipo_adjunto not null,
  storage_path   text not null unique,
  mime_type      text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  tamano_bytes   int  not null check (tamano_bytes between 1 and 10485760),  -- máx 10 MB
  subido_por     uuid not null references perfiles(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index adjuntos_movimiento_idx on adjuntos (movimiento_id);

-- Estado del movimiento = completo si tiene AMBOS: un adjunto 'documento' (factura, boleta,
-- planilla de movilidad, comprobante de egreso…) y un adjunto 'pago' (constancia del pago).
-- Solo los movimientos completos pueden liquidarse.
create or replace function tg_recalcular_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mov uuid := coalesce(new.movimiento_id, old.movimiento_id);
begin
  update movimientos m
     set estado = case
           when exists (select 1 from adjuntos a where a.movimiento_id = v_mov and a.tipo = 'documento')
            and exists (select 1 from adjuntos a where a.movimiento_id = v_mov and a.tipo = 'pago')
           then 'completo'::estado_movimiento
           else 'pendiente'::estado_movimiento
         end
   where m.id = v_mov;
  return null;
end $$;

-- Un movimiento ya liquidado no puede perder sus adjuntos (dejaría de estar sustentado).
create or replace function tg_adjunto_bloqueo() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from movimientos m join liquidaciones l on l.id = m.liquidacion_id
              where m.id = old.movimiento_id and l.estado not in ('abierta', 'observada')) then
    raise exception 'El movimiento ya está en una liquidación cerrada; sus adjuntos no se pueden quitar ni cambiar';
  end if;
  return coalesce(new, old);
end $$;

create trigger adjuntos_bloqueo before update or delete on adjuntos
  for each row execute function tg_adjunto_bloqueo();

create trigger adjuntos_estado after insert or update or delete on adjuntos
  for each row execute function tg_recalcular_estado();

-- -----------------------------------------------------------------------------
-- Recargas / entradas (registro MANUAL, sin integración bancaria)
-- -----------------------------------------------------------------------------
create table recargas (
  id              uuid primary key default gen_random_uuid(),
  caja_id         uuid not null references cajas(id),
  liquidacion_id  uuid unique references liquidaciones(id),     -- solo en reposición
  tipo            tipo_recarga not null default 'reposicion',
  monto           numeric(12,2) not null check (monto <> 0),     -- monto libre (hoy S/ 1,000 o 2,000); ajuste puede ser negativo
  fecha           date not null default (now() at time zone 'America/Lima')::date,
  medio           text,                                          -- transferencia BCP, efectivo, Yape…
  referencia      text,                                          -- N° de operación
  nota            text,
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  check ((tipo = 'reposicion') = (liquidacion_id is not null)),
  check (tipo = 'ajuste' or monto > 0)
);
create index recargas_caja_idx on recargas (caja_id, fecha desc);

-- Al registrar la reposición, la liquidación pasa a 'repuesta'.
create or replace function tg_recarga_repone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.liquidacion_id is not null then
    update liquidaciones set estado = 'repuesta'
     where id = new.liquidacion_id and estado = 'aprobada';
    if not found then
      raise exception 'Solo se puede reponer una liquidación aprobada';
    end if;
  end if;
  return new;
end $$;

create trigger recargas_repone after insert on recargas
  for each row execute function tg_recarga_repone();

-- -----------------------------------------------------------------------------
-- Fase 2: lecturas de comprobantes con IA (estructura preparada, sin uso aún)
-- -----------------------------------------------------------------------------
create table extracciones_ocr (
  id            uuid primary key default gen_random_uuid(),
  adjunto_id    uuid references adjuntos(id) on delete set null,
  storage_path  text not null,                 -- imagen analizada (puede ser previa al movimiento)
  modelo        text not null,                 -- modelo de IA usado
  respuesta     jsonb,                         -- JSON validado (src/lib/ocr/esquema.ts)
  error         text,
  aceptada      boolean,                       -- el usuario confirmó (true) o descartó (false)
  solicitado_por uuid not null references perfiles(id) default auth.uid(),
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- Funciones de permisos (security definer para evitar recursión en RLS)
-- =============================================================================
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

-- nivel mínimo: 'lector' < 'registrador' < 'aprobador'
create or replace function tiene_acceso_caja(p_caja uuid, p_min rol_usuario default 'lector') returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
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
  select es_admin() or exists (
    select 1 from accesos_caja ac join cajas c on c.id = ac.caja_id
     where ac.usuario_id = auth.uid() and c.empresa_id = p_empresa
  );
$$;

-- =============================================================================
-- Flujo de liquidación (RPC). Las transiciones de estado solo ocurren por aquí.
-- =============================================================================

-- Registrador/aprobador cierra la liquidación abierta → queda en revisión (= solicitud de recarga).
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
  if not exists (select 1 from movimientos
                  where liquidacion_id = v.id and not anulado and estado = 'completo') then
    raise exception 'La liquidación % no tiene movimientos completos para liquidar', v.folio;
  end if;

  update liquidaciones
     set estado        = 'en_revision',
         fecha_cierre  = coalesce(p_fecha_cierre, (now() at time zone 'America/Lima')::date),
         cerrada_por   = auth.uid(),
         cerrada_en    = now()
   where id = v.id
   returning * into v;

  -- Abre la siguiente liquidación para seguir registrando gastos sin esperar la aprobación.
  -- (Si se re-cierra una liquidación observada, la siguiente ya existe.)
  insert into liquidaciones (caja_id, fecha_inicio)
  select v.caja_id, v.fecha_cierre
   where not exists (select 1 from liquidaciones where caja_id = v.caja_id and estado = 'abierta');

  -- Solo se liquidan movimientos completos: los pendientes pasan a la liquidación abierta.
  perform set_config('factudex.trasladando_pendientes', 'on', true);
  update movimientos
     set liquidacion_id = (select id from liquidaciones where caja_id = v.caja_id and estado = 'abierta')
   where liquidacion_id = v.id and estado = 'pendiente' and not anulado;
  perform set_config('factudex.trasladando_pendientes', 'off', true);

  update liquidaciones
     set total_gastado = (select sum(monto) from movimientos where liquidacion_id = v.id and not anulado)
   where id = v.id
   returning * into v;
  return v;
end $$;

-- Aprobador da visto bueno u observa (devuelve para corrección).
create or replace function revisar_liquidacion(p_liquidacion uuid, p_aprobar boolean, p_observaciones text default null)
returns liquidaciones
language plpgsql security definer set search_path = public as $$
declare
  v liquidaciones;
begin
  select * into v from liquidaciones where id = p_liquidacion for update;
  if not found or not tiene_acceso_caja(v.caja_id, 'aprobador') then
    raise exception 'Solo un aprobador de la caja puede revisar';
  end if;
  if v.estado <> 'en_revision' then
    raise exception 'La liquidación % no está en revisión', v.folio;
  end if;
  if p_aprobar and exists (select 1 from movimientos
                            where liquidacion_id = v.id and not anulado and estado <> 'completo') then
    raise exception 'La liquidación % tiene movimientos sin documento y pago adjuntos', v.folio;
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

-- =============================================================================
-- Vistas (security_invoker: respetan el RLS de quien consulta)
-- =============================================================================

-- Saldo actual por caja = recargas − gastos no anulados. Alerta si baja del umbral.
create view v_saldo_cajas with (security_invoker = true) as
select c.id as caja_id,
       c.empresa_id,
       e.codigo as empresa_codigo,
       c.codigo as caja_codigo,
       c.nombre,
       c.umbral_alerta,
       coalesce(r.total, 0) - coalesce(m.total, 0) as saldo,
       (coalesce(r.total, 0) - coalesce(m.total, 0)) < c.umbral_alerta as bajo_umbral,
       coalesce(m.pendientes, 0) as movimientos_pendientes
  from cajas c
  join empresas e on e.id = c.empresa_id
  left join (select caja_id, sum(monto) total from recargas group by caja_id) r on r.caja_id = c.id
  left join (select caja_id, sum(monto) total,
                    count(*) filter (where estado = 'pendiente') pendientes
               from movimientos where not anulado group by caja_id) m on m.caja_id = c.id
 where c.activa;

-- Pendientes: sin plazo máximo. Se muestran los días (informativo) y qué adjunto falta.
-- No entran a la liquidación mientras sigan pendientes; se trasladan a la siguiente.
create view v_pendientes with (security_invoker = true) as
select m.*,
       ((now() at time zone 'America/Lima')::date - m.fecha) as dias_antiguedad,
       not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'documento') as falta_documento,
       not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'pago')      as falta_pago
  from movimientos m
 where m.estado = 'pendiente' and not m.anulado;

-- Resumen por liquidación. En la abierta, los incompletos se marcan en rojo:
-- no se liquidarán y pasarán a la siguiente al cerrar.
create view v_liquidaciones with (security_invoker = true) as
select l.*,
       coalesce(sum(m.monto) filter (where not m.anulado), 0)                          as total_actual,
       coalesce(sum(m.monto) filter (where not m.anulado and m.estado = 'completo'), 0) as total_liquidable,
       count(m.id) filter (where not m.anulado)                                        as num_movimientos,
       count(m.id) filter (where not m.anulado and m.estado = 'pendiente')             as num_incompletos
  from liquidaciones l
  left join movimientos m on m.liquidacion_id = l.id
 group by l.id;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table empresas         enable row level security;
alter table cajas            enable row level security;
alter table perfiles         enable row level security;
alter table accesos_caja     enable row level security;
alter table proveedores      enable row level security;
alter table categorias       enable row level security;
alter table centros_costo    enable row level security;
alter table liquidaciones    enable row level security;
alter table movimientos      enable row level security;
alter table adjuntos         enable row level security;
alter table recargas         enable row level security;
alter table extracciones_ocr enable row level security;

-- Empresas y cajas: se ven las que el usuario tiene asignadas; solo admin las administra.
create policy empresas_select on empresas for select to authenticated using (tiene_acceso_empresa(id));
create policy empresas_admin  on empresas for all    to authenticated using (es_admin()) with check (es_admin());

create policy cajas_select on cajas for select to authenticated using (tiene_acceso_caja(id));
create policy cajas_admin  on cajas for all    to authenticated using (es_admin()) with check (es_admin());

-- Perfiles: todos ven nombres (equipo interno, para "registrado/aprobado por"); solo admin edita.
-- (El rol nunca se autoasigna.)
create policy perfiles_select on perfiles for select to authenticated using (true);
create policy perfiles_admin  on perfiles for all    to authenticated using (es_admin()) with check (es_admin());

create policy accesos_select on accesos_caja for select to authenticated using (usuario_id = auth.uid() or es_admin());
create policy accesos_admin  on accesos_caja for all    to authenticated using (es_admin()) with check (es_admin());

-- Proveedores y categorías: maestro compartido; cualquier usuario activo lee y agrega proveedores.
create policy proveedores_select on proveedores for select to authenticated using (true);
create policy proveedores_insert on proveedores for insert to authenticated with check (true);
create policy proveedores_update on proveedores for update to authenticated using (es_admin()) with check (es_admin());

create policy categorias_select on categorias for select to authenticated
  using (empresa_id is null or tiene_acceso_empresa(empresa_id));
create policy categorias_admin on categorias for all to authenticated using (es_admin()) with check (es_admin());

create policy centros_costo_select on centros_costo for select to authenticated using (tiene_acceso_empresa(empresa_id));
create policy centros_costo_admin  on centros_costo for all    to authenticated using (es_admin()) with check (es_admin());

-- Liquidaciones: lectura por acceso a caja. Cambios de estado solo vía RPC (security definer).
create policy liquidaciones_select on liquidaciones for select to authenticated using (tiene_acceso_caja(caja_id));

-- Movimientos: registrador+ crea y edita en sus cajas; nunca se borran (se anulan).
create policy movimientos_select on movimientos for select to authenticated using (tiene_acceso_caja(caja_id));
create policy movimientos_insert on movimientos for insert to authenticated
  with check (tiene_acceso_caja(caja_id, 'registrador') and creado_por = auth.uid());
create policy movimientos_update on movimientos for update to authenticated
  using (tiene_acceso_caja(caja_id, 'registrador'))
  with check (tiene_acceso_caja(caja_id, 'registrador'));

-- Adjuntos: se pueden subir en cualquier momento (los pendientes siempre están en una liquidación abierta).
create policy adjuntos_select on adjuntos for select to authenticated
  using (exists (select 1 from movimientos m where m.id = movimiento_id and tiene_acceso_caja(m.caja_id)));
create policy adjuntos_insert on adjuntos for insert to authenticated
  with check (subido_por = auth.uid() and exists (
    select 1 from movimientos m where m.id = movimiento_id and tiene_acceso_caja(m.caja_id, 'registrador')));
create policy adjuntos_delete on adjuntos for delete to authenticated
  using (subido_por = auth.uid() or es_admin());

-- Recargas: las registra un aprobador de la caja.
create policy recargas_select on recargas for select to authenticated using (tiene_acceso_caja(caja_id));
create policy recargas_insert on recargas for insert to authenticated
  with check (tiene_acceso_caja(caja_id, 'aprobador') and registrado_por = auth.uid());

create policy ocr_propias on extracciones_ocr for all to authenticated
  using (solicitado_por = auth.uid() or es_admin())
  with check (solicitado_por = auth.uid());

-- RPCs: solo usuarios autenticados.
revoke execute on function cerrar_liquidacion(uuid, date)           from public, anon;
revoke execute on function revisar_liquidacion(uuid, boolean, text) from public, anon;
grant  execute on function cerrar_liquidacion(uuid, date)           to authenticated;
grant  execute on function revisar_liquidacion(uuid, boolean, text) to authenticated;

-- =============================================================================
-- Storage: bucket privado 'comprobantes'. Ruta: <caja_id>/<movimiento_id>/<archivo>
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy comprobantes_select on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
         and tiene_acceso_caja(((storage.foldername(name))[1])::uuid));

create policy comprobantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes'
              and tiene_acceso_caja(((storage.foldername(name))[1])::uuid, 'registrador'));

create policy comprobantes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes' and (owner_id = auth.uid()::text or es_admin()));
