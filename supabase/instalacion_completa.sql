-- =============================================================================
-- Factudex — instalación completa en un proyecto Supabase NUEVO (vacío).
-- ARCHIVO GENERADO por scripts/sql-instalacion.sh (npm run sql:instalacion):
-- migraciones de supabase/migrations/ + supabase/seed.sql, en orden. No editar a mano.
-- Uso: SQL Editor → New query → pega TODO este archivo → Run (una sola vez).
-- Después crea tu usuario y corre supabase/primer_admin.sql.
-- =============================================================================

-- ===== supabase/migrations/20260925000000_esquema_inicial.sql =====

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
create type medio_pago         as enum ('efectivo', 'yape', 'plin', 'transferencia', 'otro');
-- documento = sustento (factura, boleta, planilla de movilidad, comprobante de egreso…)
-- pago      = constancia del pago (captura de Yape/Plin, voucher de transferencia…)
create type tipo_adjunto       as enum ('documento', 'pago', 'otro');
create type origen_movimiento  as enum ('manual', 'compartido', 'ocr');
create type estado_liquidacion as enum ('abierta', 'en_revision', 'observada', 'aprobada', 'repuesta');
create type tipo_recarga       as enum ('apertura', 'reposicion', 'extraordinaria', 'ajuste');
create type forma_ingreso      as enum ('banco', 'efectivo', 'otros');  -- columnas BANCO / EFECTIVO / OTROS del Excel

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
  codigo         text not null unique check (codigo ~ '^[A-Z0-9]{2,6}$'),  -- 'SL', 'SIPE' (tema de la app)
  sigla          char(2) not null unique check (sigla ~ '^[A-Z]{2}$'),     -- 'SL', 'SP' (va en el folio)
  nombre_corto   text not null,                                            -- 'San Lorenzo'
  razon_social   text not null,                                            -- 'Compañía San Lorenzo S.A.C.'
  ruc            char(11) unique check (ruc ~ '^\d{11}$'),
  color_primario text not null check (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  color_acento   text not null check (color_acento   ~ '^#[0-9A-Fa-f]{6}$'),
  ciudad         text not null default 'TRUJILLO',                          -- pie de la liquidación: "TRUJILLO 24.09.2026"
  activa         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Cajas chicas (varias por empresa)
-- -----------------------------------------------------------------------------
create table cajas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id),
  numero         smallint not null check (numero between 1 and 99),        -- N° de caja en la empresa (01, 02…)
  area           text not null check (area ~ '^[A-Z]{2,4}$'),               -- 'MT' Mantenimiento, 'OP' Operaciones…
  nombre         text not null,                                            -- 'Mantenimiento'
  umbral_alerta  numeric(12,2) not null default 200 check (umbral_alerta >= 0),
  responsable_id uuid,                                                     -- FK a perfiles (más abajo)
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (empresa_id, numero)
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
-- Vehículos: lista fija de placas por empresa (la administra admin)
-- -----------------------------------------------------------------------------
create table vehiculos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  placa       text not null unique check (placa ~ '^[A-Z0-9-]{5,8}$'),  -- ej. T1Y-461 (mayúsculas)
  descripcion text,                                                          -- ej. 'Tracto Volvo FH'
  activo      boolean not null default true
);

-- -----------------------------------------------------------------------------
-- Liquidaciones (folio por caja: NNLQXX-AREA-0001, ej. SLLQ01-MT-0001)
-- -----------------------------------------------------------------------------
create table liquidaciones (
  id              uuid primary key default gen_random_uuid(),
  caja_id         uuid not null references cajas(id),
  correlativo     int  not null,
  folio           text not null unique,
  estado          estado_liquidacion not null default 'abierta',
  fecha_inicio    date not null default (now() at time zone 'America/Lima')::date,
  fecha_cierre    date,
  -- Formato de la liquidación (Excel): INGRESOS = saldo anterior + depósitos; EGRESOS = gastos completos;
  -- POR REEMBOLSAR (saldo final) = ingresos − egresos, que pasa como saldo inicial a la siguiente.
  saldo_inicial   numeric(12,2) not null default 0,  -- saldo final de la liquidación anterior
  total_ingresos  numeric(12,2),              -- snapshot al cerrar: depósitos del periodo (sin saldo inicial)
  total_gastado   numeric(12,2),              -- snapshot al cerrar (solo movimientos completos)
  saldo_final     numeric(12,2),              -- snapshot al cerrar: "POR REEMBOLSAR"
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

-- Asigna correlativo y folio: <sigla empresa>LQ<n° caja>-<área>-<correlativo>, ej. SLLQ01-MT-0001
create or replace function tg_liquidacion_folio() returns trigger
language plpgsql as $$
declare
  v_prefijo text;
begin
  select e.sigla || 'LQ' || lpad(c.numero::text, 2, '0') || '-' || c.area into v_prefijo
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
  vehiculo_id     uuid references vehiculos(id),                -- placa, de la lista fija (opcional)
  detalle         text not null,
  monto           numeric(12,2) not null check (monto > 0),
  tipo_documento  tipo_documento,                               -- null = aún no se sabe
  serie_numero    text,                                         -- ej. F001-00012345
  medio_pago      medio_pago,                                   -- independiente del tipo de documento; null = sin indicar
  operacion_pago  text,                                         -- N° de operación Yape/Plin/transferencia (opcional)
  estado          estado_movimiento not null default 'pendiente', -- ver fx_estado_movimiento()
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

-- Liquidación abierta de una caja; la crea si no existe (la primera de la caja o tras un cierre).
create or replace function fx_liquidacion_abierta(p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from liquidaciones where caja_id = p_caja and estado = 'abierta';
  if v_id is null then
    insert into liquidaciones (caja_id) values (p_caja) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Al insertar: asigna la liquidación abierta de la caja.
create or replace function tg_movimiento_liquidacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.liquidacion_id := fx_liquidacion_abierta(new.caja_id);
  new.estado := 'pendiente';  -- se vuelve 'completo' al adjuntar documento + pago
  return new;
end $$;

create trigger movimientos_asignar_liquidacion before insert on movimientos
  for each row execute function tg_movimiento_liquidacion();

-- Centro de costo y vehículo deben pertenecer a la misma empresa que la caja y estar activos.
create or replace function tg_movimiento_listas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.centro_costo_id is not null and not exists (
       select 1 from centros_costo cc join cajas c on c.empresa_id = cc.empresa_id
        where cc.id = new.centro_costo_id and c.id = new.caja_id and cc.activo)
  then
    raise exception 'El centro de costo no pertenece a la empresa de la caja o está inactivo';
  end if;
  if new.vehiculo_id is not null and not exists (
       select 1 from vehiculos v join cajas c on c.empresa_id = v.empresa_id
        where v.id = new.vehiculo_id and c.id = new.caja_id and v.activo)
  then
    raise exception 'La placa no pertenece a la empresa de la caja o está inactiva';
  end if;
  return new;
end $$;

create trigger movimientos_listas before insert or update of centro_costo_id, vehiculo_id, caja_id on movimientos
  for each row execute function tg_movimiento_listas();

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
       new.monto, new.fecha, new.liquidacion_id, new.detalle, new.anulado, new.medio_pago)
       is distinct from
      (old.monto, old.fecha, old.liquidacion_id, old.detalle, old.anulado, old.medio_pago)
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

-- Estado del movimiento. Completo cuando tiene:
--   · un adjunto 'documento' (factura, boleta, planilla de movilidad, comprobante de egreso…), Y
--   · un adjunto 'pago' (constancia del pago) — salvo que se pagó en EFECTIVO, donde basta el documento.
-- Solo los movimientos completos pueden liquidarse.
create or replace function fx_estado_movimiento(p_mov uuid, p_medio medio_pago) returns estado_movimiento
language sql stable security definer set search_path = public as $$
  select case
           when exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'documento')
            and (p_medio = 'efectivo'
                 or exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'pago'))
           then 'completo'::estado_movimiento
           else 'pendiente'::estado_movimiento
         end;
$$;

create or replace function tg_recalcular_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mov uuid := coalesce(new.movimiento_id, old.movimiento_id);
begin
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago) where m.id = v_mov;
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

-- Cambiar el medio de pago (ej. a efectivo) también recalcula el estado.
create or replace function tg_movimiento_medio_pago() returns trigger
language plpgsql as $$
begin
  new.estado := fx_estado_movimiento(new.id, new.medio_pago);
  return new;
end $$;

create trigger movimientos_medio_pago before update of medio_pago on movimientos
  for each row execute function tg_movimiento_medio_pago();

-- -----------------------------------------------------------------------------
-- Recargas / entradas (registro MANUAL, sin integración bancaria)
-- -----------------------------------------------------------------------------
-- Cada recarga es un INGRESO de la liquidación abierta al momento del depósito
-- (liquidacion_ingreso_id). Si es una reposición, además cierra el ciclo de la
-- liquidación aprobada que repone (liquidacion_repuesta_id).
create table recargas (
  id                      uuid primary key default gen_random_uuid(),
  caja_id                 uuid not null references cajas(id),
  liquidacion_ingreso_id  uuid not null references liquidaciones(id),  -- automático: la abierta
  liquidacion_repuesta_id uuid unique references liquidaciones(id),    -- solo en reposición
  tipo                    tipo_recarga not null default 'reposicion',
  monto                   numeric(12,2) not null check (monto <> 0),   -- libre (hoy S/ 1,000 o 2,000); ajuste puede ser negativo
  fecha                   date not null default (now() at time zone 'America/Lima')::date,  -- FECHA DEPOSITO
  descripcion             text,                                        -- DESCRIPCION BANCO (ej. "Reposición caja")
  forma                   forma_ingreso not null default 'banco',      -- BANCO / EFECTIVO / OTROS
  banco                   text,                                        -- BANCO (ej. BCP)
  operacion               text,                                        -- OPERACIÓN (N° de operación)
  recibo                  text,                                        -- RECIBO
  nota                    text,
  registrado_por          uuid not null references perfiles(id) default auth.uid(),
  created_at              timestamptz not null default now(),
  check ((tipo = 'reposicion') = (liquidacion_repuesta_id is not null)),
  check (tipo = 'ajuste' or monto > 0)
);
create index recargas_caja_idx on recargas (caja_id, fecha desc);
create index recargas_liquidacion_idx on recargas (liquidacion_ingreso_id);

create or replace function tg_recarga_asignar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.liquidacion_ingreso_id := fx_liquidacion_abierta(new.caja_id);
  return new;
end $$;

create trigger recargas_asignar before insert on recargas
  for each row execute function tg_recarga_asignar();

-- Al registrar la reposición, la liquidación repuesta pasa a 'repuesta'.
create or replace function tg_recarga_repone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.liquidacion_repuesta_id is not null then
    update liquidaciones set estado = 'repuesta'
     where id = new.liquidacion_repuesta_id and caja_id = new.caja_id and estado = 'aprobada';
    if not found then
      raise exception 'Solo se puede reponer una liquidación aprobada de la misma caja';
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

  -- Totales del formato de liquidación.
  update liquidaciones l
     set total_ingresos = t.ingresos,
         total_gastado  = t.egresos,
         saldo_final    = l.saldo_inicial + t.ingresos - t.egresos
    from (select coalesce((select sum(monto) from recargas where liquidacion_ingreso_id = v.id), 0) as ingresos,
                 coalesce((select sum(monto) from movimientos where liquidacion_id = v.id and not anulado), 0) as egresos) t
   where l.id = v.id
   returning l.* into v;

  -- El saldo final pasa como saldo inicial de la siguiente (también si se re-cierra tras una observación).
  update liquidaciones set saldo_inicial = v.saldo_final
   where caja_id = v.caja_id and correlativo = v.correlativo + 1;
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
       c.numero as caja_numero,
       c.area   as caja_area,
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
       (m.medio_pago is distinct from 'efectivo'
        and not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'pago')) as falta_pago
  from movimientos m
 where m.estado = 'pendiente' and not m.anulado;

-- Resumen por liquidación. En la abierta, los incompletos se marcan en rojo:
-- no se liquidarán y pasarán a la siguiente al cerrar.
create view v_liquidaciones with (security_invoker = true) as
select l.*,
       coalesce(m.total, 0)       as total_actual,
       coalesce(m.liquidable, 0)  as total_liquidable,
       coalesce(m.num, 0)         as num_movimientos,
       coalesce(m.incompletos, 0) as num_incompletos,
       coalesce(r.total, 0)       as ingresos_actual,
       -- "POR REEMBOLSAR" en vivo (para la abierta): saldo anterior + depósitos − gastos completos
       l.saldo_inicial + coalesce(r.total, 0) - coalesce(m.liquidable, 0) as saldo_final_actual
  from liquidaciones l
  left join (select liquidacion_id,
                    sum(monto) filter (where not anulado)                          as total,
                    sum(monto) filter (where not anulado and estado = 'completo')  as liquidable,
                    count(*)   filter (where not anulado)                          as num,
                    count(*)   filter (where not anulado and estado = 'pendiente') as incompletos
               from movimientos group by liquidacion_id) m on m.liquidacion_id = l.id
  left join (select liquidacion_ingreso_id, sum(monto) total
               from recargas group by liquidacion_ingreso_id) r on r.liquidacion_ingreso_id = l.id;

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
alter table vehiculos        enable row level security;
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

create policy vehiculos_select on vehiculos for select to authenticated using (tiene_acceso_empresa(empresa_id));
create policy vehiculos_admin  on vehiculos for all    to authenticated using (es_admin()) with check (es_admin());

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

-- ===== supabase/migrations/20260926000000_centro_costo_unico_y_solicitantes.sql =====

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

-- ===== supabase/migrations/20260927000000_google_drive.sql =====

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

-- ===== supabase/migrations/20260928000000_drive_carpeta_elegida.sql =====

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

-- ===== supabase/migrations/20261022000000_modulos_por_usuario.sql =====

-- =============================================================================
-- Módulos visibles por usuario (panel de administración → Usuarios)
--  · null = todos los módulos (como hasta ahora).
--  · Es una preferencia de pantalla: qué datos ve y qué puede hacer cada persona lo siguen
--    decidiendo su rol global (perfiles.rol) y sus accesos por caja (accesos_caja) con RLS.
-- =============================================================================
alter table perfiles
  add column modulos text[]
  check (modulos is null or modulos <@ array['registro', 'pendientes', 'historial', 'liquidaciones', 'recargas']::text[]);

comment on column perfiles.modulos is 'Módulos de la app que ve el usuario; null = todos';

-- ===== supabase/migrations/20261023000000_centros_costo_desde_registro.sql =====

-- =============================================================================
-- Centro de costo escrito en el registro
--  · Si lo que se escribe no está en la lista, se agrega a la lista de esa empresa (la ven todos).
--    Sigue siendo una lista por empresa: no hay texto libre suelto en los movimientos.
--  · Lo puede agregar quien es registrador (o aprobador) en alguna caja de esa empresa; editar o
--    desactivar centros sigue siendo solo del admin (centros_costo_admin).
-- =============================================================================
create policy centros_costo_insert_registro on centros_costo for insert to authenticated
  with check (
    activo
    and exists (
      select 1 from cajas c
       where c.empresa_id = centros_costo.empresa_id
         and tiene_acceso_caja(c.id, 'registrador')
    )
  );

-- ===== supabase/migrations/20261024000000_tesoreria.sql =====

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

-- ===== supabase/migrations/20261025000000_tesoreria_gestiona_registradores.sql =====

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

-- ===== supabase/migrations/20261026000000_areas_y_foto_ingreso.sql =====

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

-- ===== supabase/migrations/20261027000000_traspaso_de_saldo.sql =====

-- Al abrir una caja nueva, la anterior de la misma empresa y área le pasa su saldo (a favor o en
-- contra) y los gastos que no entraron a ninguna liquidación (pendientes, por autorizar o sin
-- liquidar). La anterior queda en S/ 0.00 y se cierra.
--
--   anterior: ajuste  -S/ 300  "Saldo pasado a SL-CAJA-MT-03"
--   nueva:    ajuste  +S/ 300  "Saldo de SL-CAJA-MT-02"   (+ su apertura)
--
-- El saldo que pasa = saldo de la caja + lo que suman los gastos que se mueven (esos gastos ahora
-- se descuentan en la nueva). Así la nueva muestra exactamente el efectivo que quedó + el abono.

alter table recargas add column traspaso_caja_id uuid references cajas(id);  -- la otra caja del traspaso

-- Mover un gasto de caja solo lo hace traspasar_caja().
create or replace function tg_movimiento_bloqueo() returns trigger
language plpgsql as $$
declare
  v_estado estado_liquidacion;
begin
  if new.caja_id <> old.caja_id and current_setting('factudex.traspasando_caja', true) is distinct from 'on' then
    raise exception 'No se puede mover un movimiento a otra caja; anúlalo y regístralo de nuevo';
  end if;
  -- cerrar_liquidacion() y traspasar_caja() trasladan los pendientes a otra liquidación.
  if current_setting('factudex.trasladando_pendientes', true) = 'on'
     or current_setting('factudex.traspasando_caja', true) = 'on' then
    return new;
  end if;
  select estado into v_estado from liquidaciones where id = old.liquidacion_id;
  if v_estado <> 'abierta' and v_estado <> 'observada' and (
       new.monto, new.fecha, new.liquidacion_id, new.detalle, new.anulado, new.medio_pago)
       is distinct from
      (old.monto, old.fecha, old.liquidacion_id, old.detalle, old.anulado, old.medio_pago)
  then
    raise exception 'La liquidación está % y el movimiento ya no puede modificarse', v_estado;
  end if;
  return new;
end $$;

create or replace function traspasar_caja(p_anterior uuid, p_nueva uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  a cajas;
  n cajas;
  v_codigo_a text;
  v_codigo_n text;
  v_liq_a uuid;
  v_liq_n uuid;
  v_saldo numeric(12,2);
  v_efectivo numeric(12,2);
  v_n int;
  v_detalle text;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede pasar el saldo de una caja' using errcode = '42501';
  end if;
  select * into a from cajas where id = p_anterior for update;
  select * into n from cajas where id = p_nueva for update;
  if a.id is null or n.id is null or a.id = n.id then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if a.empresa_id <> n.empresa_id or a.area <> n.area then
    raise exception 'El saldo solo pasa entre cajas de la misma empresa y área' using errcode = '22023';
  end if;
  if not a.activa then
    raise exception 'La caja anterior ya está cerrada' using errcode = '22023';
  end if;

  select e.codigo || '-CAJA-' || a.area || '-' || lpad(a.numero::text, 2, '0') into v_codigo_a
    from empresas e where e.id = a.empresa_id;
  select e.codigo || '-CAJA-' || n.area || '-' || lpad(n.numero::text, 2, '0') into v_codigo_n
    from empresas e where e.id = n.empresa_id;
  v_liq_a := fx_liquidacion_abierta(a.id);
  v_liq_n := fx_liquidacion_abierta(n.id);

  -- Efectivo que quedó en la anterior (ingresos − gastos, incluidos los pendientes).
  select coalesce((select sum(monto) from recargas where caja_id = a.id), 0)
       - coalesce((select sum(monto) from movimientos where caja_id = a.id and not anulado), 0)
    into v_saldo;

  -- Lo que no entró a ninguna liquidación pasa a la nueva, y su monto viaja con el saldo.
  v_efectivo := v_saldo;
  select count(*), coalesce(sum(monto), 0) into v_n, v_saldo from movimientos where liquidacion_id = v_liq_a and not anulado;
  v_saldo := v_efectivo + v_saldo;
  v_detalle := case when v_n > 0
    then ' (efectivo S/ ' || to_char(v_efectivo, 'FM999G999G990D00') || ' + ' || v_n || ' gasto' || case when v_n = 1 then '' else 's' end || ' sin liquidar)'
    else '' end;
  perform set_config('factudex.traspasando_caja', 'on', true);
  update movimientos set caja_id = n.id, liquidacion_id = v_liq_n
   where liquidacion_id = v_liq_a and not anulado;
  perform set_config('factudex.traspasando_caja', 'off', true);

  if v_saldo <> 0 then
    insert into recargas (caja_id, tipo, monto, fecha, descripcion, forma, traspaso_caja_id)
    values (a.id, 'ajuste', -v_saldo, v_hoy, 'Saldo pasado a ' || v_codigo_n || v_detalle, 'otros', n.id),
           (n.id, 'ajuste',  v_saldo, v_hoy, 'Saldo de ' || v_codigo_a || v_detalle,       'otros', a.id);
  end if;

  -- Quien manejaba la anterior sigue con la nueva.
  insert into accesos_caja (usuario_id, caja_id, rol)
  select usuario_id, n.id, rol from accesos_caja where caja_id = a.id
  on conflict do nothing;

  update cajas set activa = false where id = a.id;
  return v_saldo;
end $$;
revoke all on function traspasar_caja(uuid, uuid) from public;
grant execute on function traspasar_caja(uuid, uuid) to authenticated;

-- ===== supabase/migrations/20261102000000_pagos_con_varias_salidas.sql =====

-- Un pago con varias salidas: un solo Yape (o transferencia, o efectivo entregado) de S/ 90 se
-- sustenta con varios documentos: peaje S/ 40 + peaje S/ 40 + planilla S/ 10. Cada documento es un
-- movimiento (una línea propia en la liquidación) enganchado al mismo pago. La constancia del pago
-- se sube una sola vez. Si sobró dinero y volvió a la caja, se registra una devolución (monto,
-- motivo y foto).
--
-- Regla: una salida está completa cuando tiene su documento, el pago tiene constancia (o es en
-- efectivo) y el pago está CUADRADO: salidas + devoluciones = monto del pago. Mientras no cuadre,
-- todas sus salidas quedan pendientes y no entran a ninguna liquidación.

create table pagos (
  id          uuid primary key default gen_random_uuid(),
  caja_id     uuid not null references cajas(id),
  monto       numeric(12,2) not null check (monto > 0),
  medio_pago  medio_pago,
  operacion   text,
  fecha       date not null,
  creado_por  uuid not null references perfiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index pagos_caja_idx on pagos (caja_id);
alter table pagos enable row level security;
create policy pagos_select on pagos for select to authenticated using (tiene_acceso_caja(caja_id));
create policy pagos_insert on pagos for insert to authenticated with check (tiene_acceso_caja(caja_id, 'registrador'));

alter table movimientos add column pago_id uuid references pagos(id);
create index movimientos_pago_idx on movimientos (pago_id);

create table devoluciones (
  id                uuid primary key default gen_random_uuid(),
  pago_id           uuid not null references pagos(id),
  monto             numeric(12,2) not null check (monto > 0),
  motivo            text not null check (length(trim(motivo)) between 3 and 200),
  fecha             date not null default (now() at time zone 'America/Lima')::date,
  comprobante_path  text,     -- foto: 'drive:<fileId>' o '<caja_id>/devoluciones/<uuid>.<ext>'
  comprobante_mime  text,
  creado_por        uuid not null references perfiles(id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index devoluciones_pago_idx on devoluciones (pago_id);
alter table devoluciones enable row level security;
create policy devoluciones_select on devoluciones for select to authenticated
  using (exists (select 1 from pagos p where p.id = pago_id and tiene_acceso_caja(p.caja_id)));
create policy devoluciones_insert on devoluciones for insert to authenticated
  with check (exists (select 1 from pagos p where p.id = pago_id and tiene_acceso_caja(p.caja_id, 'registrador')));

-- Resumen de cada pago: lo sustentado con documentos, lo devuelto y lo que falta.
create view v_pagos with (security_invoker = true) as
select p.id, p.caja_id, p.monto, p.medio_pago, p.operacion, p.fecha,
       coalesce(s.sustentado, 0)                                     as sustentado,
       coalesce(s.salidas, 0)                                        as salidas,
       coalesce(d.devuelto, 0)                                       as devuelto,
       p.monto - coalesce(s.sustentado, 0) - coalesce(d.devuelto, 0) as falta,
       exists (select 1 from movimientos m join adjuntos a on a.movimiento_id = m.id
                where m.pago_id = p.id and a.tipo = 'pago')          as tiene_constancia
  from pagos p
  left join (select pago_id, sum(monto) sustentado, count(*) salidas
               from movimientos where not anulado and pago_id is not null group by pago_id) s on s.pago_id = p.id
  left join (select pago_id, sum(monto) devuelto from devoluciones group by pago_id) d on d.pago_id = p.id;

-- ¿Cuadra el pago? (null = el gasto no es parte de un pago con varias salidas)
create or replace function fx_pago_cuadrado(p_pago uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_pago is null or (
    select p.monto = coalesce((select sum(m.monto) from movimientos m where m.pago_id = p.id and not m.anulado), 0)
                   + coalesce((select sum(d.monto) from devoluciones d where d.pago_id = p.id), 0)
      from pagos p where p.id = p_pago);
$$;

-- Estado de un gasto: documento + constancia de pago (la suya o la del pago compartido) + cuadre.
create or replace function fx_estado_movimiento(p_mov uuid, p_medio medio_pago) returns estado_movimiento
language sql stable security definer set search_path = public as $$
  with m as (select id, pago_id from movimientos where id = p_mov)
  select case
           when exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'documento')
            and (p_medio = 'efectivo'
                 or exists (select 1 from adjuntos a where a.movimiento_id = p_mov and a.tipo = 'pago')
                 or exists (select 1 from m join movimientos h on h.pago_id = m.pago_id
                              join adjuntos a on a.movimiento_id = h.id and a.tipo = 'pago'))
            and fx_pago_cuadrado((select pago_id from m))
           then 'completo'::estado_movimiento
           else 'pendiente'::estado_movimiento
         end;
$$;

-- Recalcula el estado de todas las salidas de un pago.
create or replace function fx_recalcular_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pago is null then return; end if;
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago)
   where m.pago_id = p_pago and m.estado is distinct from fx_estado_movimiento(m.id, m.medio_pago);
end $$;

-- Adjuntos: recalcula el gasto y, si es parte de un pago, todas sus salidas.
create or replace function tg_recalcular_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mov uuid := coalesce(new.movimiento_id, old.movimiento_id);
begin
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago) where m.id = v_mov;
  perform fx_recalcular_pago((select pago_id from movimientos where id = v_mov));
  return null;
end $$;

-- Un gasto nuevo, anulado, con otro monto o que cambia de pago: el cuadre cambia.
create or replace function tg_movimiento_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.pago_id is distinct from new.pago_id then
    perform fx_recalcular_pago(old.pago_id);
  end if;
  perform fx_recalcular_pago(new.pago_id);
  return null;
end $$;

create trigger movimientos_pago after insert or update of monto, anulado, pago_id on movimientos
  for each row execute function tg_movimiento_pago();

create or replace function tg_devolucion_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fx_recalcular_pago(coalesce(new.pago_id, old.pago_id));
  return null;
end $$;

create trigger devoluciones_pago after insert or delete on devoluciones
  for each row execute function tg_devolucion_pago();

-- Un gasto solo se engancha a un pago de su misma caja.
create or replace function tg_movimiento_pago_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_id is not null
     and current_setting('factudex.traspasando_caja', true) is distinct from 'on'
     and not exists (select 1 from pagos p where p.id = new.pago_id and p.caja_id = new.caja_id) then
    raise exception 'El pago es de otra caja';
  end if;
  return new;
end $$;

create trigger movimientos_pago_caja before insert or update of pago_id, caja_id on movimientos
  for each row execute function tg_movimiento_pago_caja();

-- v_pendientes usa m.*: se recrea para incluir pago_id y lo que falta cuadrar.
drop view v_pendientes;
create view v_pendientes with (security_invoker = true) as
select m.*,
       ((now() at time zone 'America/Lima')::date - m.fecha) as dias_antiguedad,
       not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'documento') as falta_documento,
       (m.medio_pago is distinct from 'efectivo'
        and not exists (select 1 from adjuntos a where a.movimiento_id = m.id and a.tipo = 'pago')
        and not exists (select 1 from movimientos h join adjuntos a on a.movimiento_id = h.id and a.tipo = 'pago'
                         where m.pago_id is not null and h.pago_id = m.pago_id)) as falta_pago
  from movimientos m
 where m.estado = 'pendiente' and not m.anulado;

-- Al pasar el saldo a la caja nueva, los pagos de los gastos que se mueven van con ellos.
create or replace function traspasar_caja(p_anterior uuid, p_nueva uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  a cajas;
  n cajas;
  v_codigo_a text;
  v_codigo_n text;
  v_liq_a uuid;
  v_liq_n uuid;
  v_saldo numeric(12,2);
  v_efectivo numeric(12,2);
  v_n int;
  v_detalle text;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede pasar el saldo de una caja' using errcode = '42501';
  end if;
  select * into a from cajas where id = p_anterior for update;
  select * into n from cajas where id = p_nueva for update;
  if a.id is null or n.id is null or a.id = n.id then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if a.empresa_id <> n.empresa_id or a.area <> n.area then
    raise exception 'El saldo solo pasa entre cajas de la misma empresa y área' using errcode = '22023';
  end if;
  if not a.activa then
    raise exception 'La caja anterior ya está cerrada' using errcode = '22023';
  end if;

  select e.codigo || '-CAJA-' || a.area || '-' || lpad(a.numero::text, 2, '0') into v_codigo_a
    from empresas e where e.id = a.empresa_id;
  select e.codigo || '-CAJA-' || n.area || '-' || lpad(n.numero::text, 2, '0') into v_codigo_n
    from empresas e where e.id = n.empresa_id;
  v_liq_a := fx_liquidacion_abierta(a.id);
  v_liq_n := fx_liquidacion_abierta(n.id);

  -- Efectivo que quedó en la anterior (ingresos − gastos, incluidos los pendientes).
  select coalesce((select sum(monto) from recargas where caja_id = a.id), 0)
       - coalesce((select sum(monto) from movimientos where caja_id = a.id and not anulado), 0)
    into v_saldo;

  -- Lo que no entró a ninguna liquidación pasa a la nueva, y su monto viaja con el saldo.
  v_efectivo := v_saldo;
  select count(*), coalesce(sum(monto), 0) into v_n, v_saldo from movimientos where liquidacion_id = v_liq_a and not anulado;
  v_saldo := v_efectivo + v_saldo;
  v_detalle := case when v_n > 0
    then ' (efectivo S/ ' || to_char(v_efectivo, 'FM999G999G990D00') || ' + ' || v_n || ' gasto' || case when v_n = 1 then '' else 's' end || ' sin liquidar)'
    else '' end;
  perform set_config('factudex.traspasando_caja', 'on', true);
  update movimientos set caja_id = n.id, liquidacion_id = v_liq_n
   where liquidacion_id = v_liq_a and not anulado;
  update pagos set caja_id = n.id
   where id in (select pago_id from movimientos where liquidacion_id = v_liq_n and pago_id is not null);
  perform set_config('factudex.traspasando_caja', 'off', true);

  if v_saldo <> 0 then
    insert into recargas (caja_id, tipo, monto, fecha, descripcion, forma, traspaso_caja_id)
    values (a.id, 'ajuste', -v_saldo, v_hoy, 'Saldo pasado a ' || v_codigo_n || v_detalle, 'otros', n.id),
           (n.id, 'ajuste',  v_saldo, v_hoy, 'Saldo de ' || v_codigo_a || v_detalle,       'otros', a.id);
  end if;

  -- Quien manejaba la anterior sigue con la nueva.
  insert into accesos_caja (usuario_id, caja_id, rol)
  select usuario_id, n.id, rol from accesos_caja where caja_id = a.id
  on conflict do nothing;

  update cajas set activa = false where id = a.id;
  return v_saldo;
end $$;
revoke all on function traspasar_caja(uuid, uuid) from public;
grant execute on function traspasar_caja(uuid, uuid) to authenticated;

-- ===== supabase/migrations/20261103000000_planillas_movilidad.sql =====

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

-- ===== supabase/migrations/20261110000000_completar_pagos_anteriores.sql =====

-- Completar un pago anterior: un Yape de S/ 60 pagó un peaje de S/ 40 (ya registrado, quizá ya
-- liquidado) y S/ 20 de comida que se sustenta después con una planilla, quizá en otra caja.
--
-- 1. Un gasto ya registrado se puede volver "pago con varias salidas" (convertir_en_pago), aunque
--    su liquidación ya esté cerrada: el gasto liquidado no cambia de estado; las salidas nuevas
--    quedan pendientes hasta que el pago cuadre.
-- 2. Una salida puede engancharse a un pago de otra caja de la MISMA empresa (la caja anterior).

-- Solo se recalculan las salidas que siguen en una liquidación abierta u observada: las que ya
-- se liquidaron no se tocan.
create or replace function fx_recalcular_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pago is null then return; end if;
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago)
   where m.pago_id = p_pago
     and m.estado is distinct from fx_estado_movimiento(m.id, m.medio_pago)
     and exists (select 1 from liquidaciones l where l.id = m.liquidacion_id and l.estado in ('abierta', 'observada'));
end $$;

-- La salida y el pago deben ser de la misma empresa (antes: de la misma caja).
create or replace function tg_movimiento_pago_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_id is not null
     and current_setting('factudex.traspasando_caja', true) is distinct from 'on'
     and not exists (select 1 from pagos p join cajas cp on cp.id = p.caja_id join cajas cm on cm.id = new.caja_id
                      where p.id = new.pago_id and cp.empresa_id = cm.empresa_id) then
    raise exception 'El pago es de otra empresa';
  end if;
  return new;
end $$;

-- Un gasto ya registrado pasa a ser la primera salida de un pago mayor.
create or replace function convertir_en_pago(p_movimiento uuid, p_monto numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m movimientos;
  v_pago uuid;
begin
  select * into m from movimientos where id = p_movimiento for update;
  if m.id is null then raise exception 'El gasto no existe' using errcode = 'P0001'; end if;
  if not tiene_acceso_caja(m.caja_id, 'registrador') then
    raise exception 'No puedes registrar en esta caja' using errcode = '42501';
  end if;
  if m.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if m.pago_id is not null then raise exception 'Este gasto ya es parte de un pago con varias salidas' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= m.monto then
    raise exception 'El pago total debe ser mayor que este gasto (S/ %)', to_char(m.monto, 'FM999990.00') using errcode = 'P0001';
  end if;
  insert into pagos (caja_id, monto, medio_pago, operacion, fecha, creado_por)
  values (m.caja_id, round(p_monto, 2), m.medio_pago, m.operacion_pago, m.fecha, coalesce(auth.uid(), m.creado_por))
  returning id into v_pago;
  update movimientos set pago_id = v_pago where id = p_movimiento;
  return v_pago;
end $$;
revoke all on function convertir_en_pago(uuid, numeric) from public;
grant execute on function convertir_en_pago(uuid, numeric) to authenticated;

-- ===== supabase/migrations/20261111000000_liquidado_en_caja_anterior.sql =====

-- "Lo que falta ya se liquidó en una caja anterior": un Yape de S/ 60 incluye S/ 29.30 de una
-- planilla que ya se rindió antes (en la caja anterior, como gasto aparte o fuera de la app).
--
-- 1. vincular_a_pago(): junta al pago un gasto ya registrado (aunque esté liquidado) de la misma
--    empresa. El gasto no cambia de liquidación ni de estado; el pago cuadra.
-- 2. devoluciones.tipo = 'liquidado_antes': lo que se rindió fuera de la app (en Excel o papel),
--    con la referencia en el motivo. Cuenta para el cuadre como una devolución y no mueve el saldo.

alter table devoluciones add column if not exists tipo text not null default 'devolucion'
  check (tipo in ('devolucion', 'liquidado_antes'));
comment on column devoluciones.tipo is
  'devolucion: el dinero volvió a la caja · liquidado_antes: esa parte ya se rindió fuera de la app (motivo = referencia)';

create or replace function vincular_a_pago(p_pago uuid, p_movimiento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p pagos;
  m movimientos;
  v_falta numeric;
begin
  select * into p from pagos where id = p_pago for update;
  if p.id is null then raise exception 'El pago no existe' using errcode = 'P0001'; end if;
  if not tiene_acceso_caja(p.caja_id, 'registrador') then
    raise exception 'No puedes registrar en esta caja' using errcode = '42501';
  end if;
  select * into m from movimientos where id = p_movimiento for update;
  if m.id is null then raise exception 'El gasto no existe' using errcode = 'P0001'; end if;
  if m.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if m.pago_id is not null then
    raise exception 'Ese gasto ya es parte de un pago' using errcode = 'P0001';
  end if;
  if (select empresa_id from cajas where id = m.caja_id) is distinct from (select empresa_id from cajas where id = p.caja_id) then
    raise exception 'El gasto es de otra empresa' using errcode = 'P0001';
  end if;
  select falta into v_falta from v_pagos where id = p_pago;
  if m.monto > v_falta + 0.005 then
    raise exception 'El gasto (S/ %) es mayor que lo que falta del pago (S/ %)',
      to_char(m.monto, 'FM999990.00'), to_char(v_falta, 'FM999990.00') using errcode = 'P0001';
  end if;
  update movimientos set pago_id = p_pago where id = p_movimiento;
end $$;
revoke all on function vincular_a_pago(uuid, uuid) from public;
grant execute on function vincular_a_pago(uuid, uuid) to authenticated;

-- ===== supabase/migrations/20261112000000_arreglo_pagos_anteriores.sql =====

-- Arreglo de "completar pagos anteriores". Se puede correr aunque ya se hayan corrido
-- 20261110000000 y 20261111000000 (todo es create or replace / if not exists).
--
-- 1. Repite 20261110000000 (convertir_en_pago, salidas en otra caja de la misma empresa, no tocar lo
--    liquidado) y 20261111000000 (vincular_a_pago, devoluciones.tipo).
-- 2. v_pagos suma TODAS las salidas del pago aunque el registrador no vea la caja anterior (antes,
--    con security_invoker, el gasto de la caja anterior no se sumaba y el pago seguía "faltando").
--    Solo devuelve los pagos de cajas a las que el usuario tiene acceso.
-- 3. fx_salidas_pago(): las salidas de pagos con su liquidación y caja, para mostrar "ya liquidado en…".
-- 4. Las funciones nuevas no se pueden llamar sin sesión (anon).

create or replace function fx_recalcular_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pago is null then return; end if;
  update movimientos m set estado = fx_estado_movimiento(m.id, m.medio_pago)
   where m.pago_id = p_pago
     and m.estado is distinct from fx_estado_movimiento(m.id, m.medio_pago)
     and exists (select 1 from liquidaciones l where l.id = m.liquidacion_id and l.estado in ('abierta', 'observada'));
end $$;

-- La salida y el pago deben ser de la misma empresa (antes: de la misma caja).
create or replace function tg_movimiento_pago_caja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pago_id is not null
     and current_setting('factudex.traspasando_caja', true) is distinct from 'on'
     and not exists (select 1 from pagos p join cajas cp on cp.id = p.caja_id join cajas cm on cm.id = new.caja_id
                      where p.id = new.pago_id and cp.empresa_id = cm.empresa_id) then
    raise exception 'El pago es de otra empresa';
  end if;
  return new;
end $$;

-- Un gasto ya registrado pasa a ser la primera salida de un pago mayor.
create or replace function convertir_en_pago(p_movimiento uuid, p_monto numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m movimientos;
  v_pago uuid;
begin
  select * into m from movimientos where id = p_movimiento for update;
  if m.id is null then raise exception 'El gasto no existe' using errcode = 'P0001'; end if;
  if not tiene_acceso_caja(m.caja_id, 'registrador') then
    raise exception 'No puedes registrar en esta caja' using errcode = '42501';
  end if;
  if m.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if m.pago_id is not null then raise exception 'Este gasto ya es parte de un pago con varias salidas' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= m.monto then
    raise exception 'El pago total debe ser mayor que este gasto (S/ %)', to_char(m.monto, 'FM999990.00') using errcode = 'P0001';
  end if;
  insert into pagos (caja_id, monto, medio_pago, operacion, fecha, creado_por)
  values (m.caja_id, round(p_monto, 2), m.medio_pago, m.operacion_pago, m.fecha, coalesce(auth.uid(), m.creado_por))
  returning id into v_pago;
  update movimientos set pago_id = v_pago where id = p_movimiento;
  return v_pago;
end $$;
revoke all on function convertir_en_pago(uuid, numeric) from public;
grant execute on function convertir_en_pago(uuid, numeric) to authenticated;

alter table devoluciones add column if not exists tipo text not null default 'devolucion'
  check (tipo in ('devolucion', 'liquidado_antes'));
comment on column devoluciones.tipo is
  'devolucion: el dinero volvió a la caja · liquidado_antes: esa parte ya se rindió fuera de la app (motivo = referencia)';

create or replace function vincular_a_pago(p_pago uuid, p_movimiento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p pagos;
  m movimientos;
  v_falta numeric;
begin
  select * into p from pagos where id = p_pago for update;
  if p.id is null then raise exception 'El pago no existe' using errcode = 'P0001'; end if;
  if not tiene_acceso_caja(p.caja_id, 'registrador') then
    raise exception 'No puedes registrar en esta caja' using errcode = '42501';
  end if;
  select * into m from movimientos where id = p_movimiento for update;
  if m.id is null then raise exception 'El gasto no existe' using errcode = 'P0001'; end if;
  if m.anulado then raise exception 'El gasto está anulado' using errcode = 'P0001'; end if;
  if m.pago_id is not null then
    raise exception 'Ese gasto ya es parte de un pago' using errcode = 'P0001';
  end if;
  if (select empresa_id from cajas where id = m.caja_id) is distinct from (select empresa_id from cajas where id = p.caja_id) then
    raise exception 'El gasto es de otra empresa' using errcode = 'P0001';
  end if;
  select falta into v_falta from v_pagos where id = p_pago;
  if m.monto > v_falta + 0.005 then
    raise exception 'El gasto (S/ %) es mayor que lo que falta del pago (S/ %)',
      to_char(m.monto, 'FM999990.00'), to_char(v_falta, 'FM999990.00') using errcode = 'P0001';
  end if;
  update movimientos set pago_id = p_pago where id = p_movimiento;
end $$;
revoke all on function vincular_a_pago(uuid, uuid) from public;
grant execute on function vincular_a_pago(uuid, uuid) to authenticated;

create or replace view v_pagos as
select p.id, p.caja_id, p.monto, p.medio_pago, p.operacion, p.fecha,
       coalesce(s.sustentado, 0)                                     as sustentado,
       coalesce(s.salidas, 0)                                        as salidas,
       coalesce(d.devuelto, 0)                                       as devuelto,
       p.monto - coalesce(s.sustentado, 0) - coalesce(d.devuelto, 0) as falta,
       exists (select 1 from movimientos m join adjuntos a on a.movimiento_id = m.id
                where m.pago_id = p.id and a.tipo = 'pago')          as tiene_constancia
  from pagos p
  left join (select pago_id, sum(monto) sustentado, count(*) salidas
               from movimientos where not anulado and pago_id is not null group by pago_id) s on s.pago_id = p.id
  left join (select pago_id, sum(monto) devuelto from devoluciones group by pago_id) d on d.pago_id = p.id
 where tiene_acceso_caja(p.caja_id);
alter view v_pagos set (security_invoker = false);
grant select on v_pagos to authenticated;
revoke all on v_pagos from anon;

create or replace function fx_salidas_pago(p_pagos uuid[])
returns table (pago_id uuid, detalle text, monto numeric, folio text, estado_liquidacion estado_liquidacion,
               empresa_codigo text, area text, numero int)
language sql stable security definer set search_path = public as $$
  select m.pago_id, m.detalle, m.monto, l.folio, l.estado, e.codigo::text, c.area::text, c.numero::int
    from movimientos m
    join pagos p on p.id = m.pago_id
    join cajas c on c.id = m.caja_id
    join empresas e on e.id = c.empresa_id
    left join liquidaciones l on l.id = m.liquidacion_id
   where m.pago_id = any (p_pagos) and not m.anulado and tiene_acceso_caja(p.caja_id)
   order by m.created_at;
$$;

-- Gastos sin pago de TODA la empresa (también de cajas anteriores que el registrador ya no ve),
-- para juntar a un pago. Solo para quien registra en alguna caja de esa empresa.
create or replace function fx_gastos_sin_pago(p_empresa uuid, p_desde date)
returns table (id uuid, caja_id uuid, fecha date, detalle text, monto numeric, medio_pago medio_pago,
               proveedor text, folio text, estado_liquidacion estado_liquidacion, area text, numero int)
language sql stable security definer set search_path = public as $$
  select m.id, m.caja_id, m.fecha, m.detalle, m.monto, m.medio_pago, pr.razon_social, l.folio, l.estado,
         c.area::text, c.numero::int
    from movimientos m
    join cajas c on c.id = m.caja_id
    left join proveedores pr on pr.id = m.proveedor_id
    left join liquidaciones l on l.id = m.liquidacion_id
   where c.empresa_id = p_empresa and m.pago_id is null and not m.anulado and m.fecha >= p_desde
     and exists (select 1 from cajas c2 where c2.empresa_id = p_empresa and tiene_acceso_caja(c2.id, 'registrador'))
   order by m.fecha desc, m.created_at desc
   limit 80;
$$;

revoke all on function convertir_en_pago(uuid, numeric) from public, anon;
revoke all on function fx_gastos_sin_pago(uuid, date) from public, anon;
grant execute on function fx_gastos_sin_pago(uuid, date) to authenticated;
revoke all on function vincular_a_pago(uuid, uuid) from public, anon;
revoke all on function fx_salidas_pago(uuid[]) from public, anon;
grant execute on function convertir_en_pago(uuid, numeric) to authenticated;
grant execute on function vincular_a_pago(uuid, uuid) to authenticated;
grant execute on function fx_salidas_pago(uuid[]) to authenticated;

notify pgrst, 'reload schema';

-- ===== supabase/migrations/20261113000000_folio_por_caja.sql =====

-- El folio de la liquidación lleva el número de la caja que se liquida:
--   SL-CAJA-GE-06 → SL-LIQ-GE-006; si la misma caja se liquida otra vez: SL-LIQ-GE-006-2, -3…
-- Antes era un correlativo por empresa y área (la caja 6 podía salir SL-LIQ-GE-003).
--
-- El folio se pone al crear la liquidación abierta, que es la que luego se genera y se manda a
-- tesorería. Las liquidaciones aprobadas conservan su folio; las demás se renumeran aquí.
-- Se puede correr más de una vez.

create or replace function fx_siguiente_folio(p_caja uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_n int;
  v_folio text;
begin
  select e.codigo || '-LIQ-' || c.area || '-' || lpad(c.numero::text, 3, '0') into v_base
    from cajas c join empresas e on e.id = c.empresa_id where c.id = p_caja;
  perform pg_advisory_xact_lock(hashtext('folio:' || v_base));
  -- Cuántas liquidaciones de esta caja ya llevan su número.
  select count(*) into v_n from liquidaciones
   where caja_id = p_caja and (folio = v_base or folio like v_base || '-%');
  v_folio := case when v_n = 0 then v_base else v_base || '-' || (v_n + 1) end;
  -- Por si un folio viejo (de otra caja) ya ocupa ese texto.
  while exists (select 1 from liquidaciones where folio = v_folio) loop
    v_n := v_n + 1;
    v_folio := v_base || '-' || (v_n + 1);
  end loop;
  return v_folio;
end $$;

-- Renumera las liquidaciones no aprobadas que no siguen el formato de su caja, en orden.
do $$
declare
  r record;
begin
  update liquidaciones l set folio = 'renumerando-' || l.id
    from cajas c join empresas e on e.id = c.empresa_id
   where c.id = l.caja_id and l.estado <> 'aprobada'
     and l.folio !~ ('^' || e.codigo || '-LIQ-' || c.area || '-' || lpad(c.numero::text, 3, '0') || '(-\d+)?$');
  for r in select id, caja_id from liquidaciones where folio like 'renumerando-%' order by caja_id, correlativo loop
    update liquidaciones set folio = fx_siguiente_folio(r.caja_id) where id = r.id;
  end loop;
end $$;

-- Verificación: el folio de cada liquidación con su caja.
select e.codigo || '-CAJA-' || c.area || '-' || lpad(c.numero::text, 2, '0') as caja, l.folio, l.estado
  from liquidaciones l join cajas c on c.id = l.caja_id join empresas e on e.id = c.empresa_id
 order by c.numero, l.correlativo;

-- ===== supabase/migrations/20261114000000_liquidar_abre_siguiente_caja.sql =====

-- Una caja, una liquidación: al generar la liquidación de la SL-CAJA-GE-06, la caja se cierra y se
-- abre sola la SL-CAJA-GE-07 (siguiente número de la empresa, misma área y nombre) con el saldo que
-- quedó, los gastos que no entraron (pendientes, por autorizar, fuera del rango) y los accesos.
-- Su primera liquidación sale SL-LIQ-GE-007.
--
-- Si tesorería observa la 006, se corrige en la 006 (la caja 6 cerrada sigue accesible para eso):
-- si se anula o cambia un gasto, la diferencia pasa como ajuste a la caja abierta que sigue; al
-- reenviarla, lo que no entra pasa también a esa caja. Tesorería repone la 006 depositando en la 7.

alter table cajas add column if not exists siguiente_id uuid references cajas(id);
comment on column cajas.siguiente_id is 'Caja que la reemplazó al cerrarse (recibió su saldo y sus gastos sin liquidar)';

-- Traspasos ya hechos: la anterior apunta a la nueva.
update cajas a set siguiente_id = r.traspaso_caja_id
  from recargas r
 where r.caja_id = a.id and r.traspaso_caja_id is not null and r.descripcion like 'Saldo pasado a %'
   and a.siguiente_id is null;

create or replace function fx_traspasar_caja(p_anterior uuid, p_nueva uuid, p_cerrar boolean) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  a cajas;
  n cajas;
  v_codigo_a text;
  v_codigo_n text;
  v_liq_a uuid;
  v_liq_n uuid;
  v_saldo numeric(12,2);
  v_efectivo numeric(12,2);
  v_n int;
  v_detalle text;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  select * into a from cajas where id = p_anterior for update;
  select * into n from cajas where id = p_nueva for update;
  if a.id is null or n.id is null or a.id = n.id then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if a.empresa_id <> n.empresa_id or a.area <> n.area then
    raise exception 'El saldo solo pasa entre cajas de la misma empresa y área' using errcode = '22023';
  end if;
  if p_cerrar and not a.activa then
    raise exception 'La caja anterior ya está cerrada' using errcode = '22023';
  end if;

  select e.codigo || '-CAJA-' || a.area || '-' || lpad(a.numero::text, 2, '0') into v_codigo_a
    from empresas e where e.id = a.empresa_id;
  select e.codigo || '-CAJA-' || n.area || '-' || lpad(n.numero::text, 2, '0') into v_codigo_n
    from empresas e where e.id = n.empresa_id;
  v_liq_a := fx_liquidacion_abierta(a.id);
  v_liq_n := fx_liquidacion_abierta(n.id);

  -- Efectivo que quedó en la anterior (ingresos − gastos, incluidos los pendientes).
  select coalesce((select sum(monto) from recargas where caja_id = a.id), 0)
       - coalesce((select sum(monto) from movimientos where caja_id = a.id and not anulado), 0)
    into v_saldo;

  -- Lo que no entró a ninguna liquidación pasa a la nueva, y su monto viaja con el saldo.
  v_efectivo := v_saldo;
  select count(*), coalesce(sum(monto), 0) into v_n, v_saldo from movimientos where liquidacion_id = v_liq_a and not anulado;
  v_saldo := v_efectivo + v_saldo;
  v_detalle := case when v_n > 0
    then ' (efectivo S/ ' || to_char(v_efectivo, 'FM999G999G990D00') || ' + ' || v_n || ' gasto' || case when v_n = 1 then '' else 's' end || ' sin liquidar)'
    else '' end;
  perform set_config('factudex.traspasando_caja', 'on', true);
  update movimientos set caja_id = n.id, liquidacion_id = v_liq_n
   where liquidacion_id = v_liq_a and not anulado;
  update pagos set caja_id = n.id
   where id in (select pago_id from movimientos where liquidacion_id = v_liq_n and pago_id is not null);
  perform set_config('factudex.traspasando_caja', 'off', true);

  if v_saldo <> 0 then
    insert into recargas (caja_id, tipo, monto, fecha, descripcion, forma, traspaso_caja_id)
    values (a.id, 'ajuste', -v_saldo, v_hoy,
            case when p_cerrar then 'Saldo pasado a ' else 'Corrección pasada a ' end || v_codigo_n || v_detalle, 'otros', n.id),
           (n.id, 'ajuste',  v_saldo, v_hoy,
            case when p_cerrar then 'Saldo de ' else 'Corrección de liquidación observada de ' end || v_codigo_a || v_detalle, 'otros', a.id);
  end if;

  if not p_cerrar then
    return v_saldo; -- solo concilia una caja ya cerrada (corrección de una observada)
  end if;

  -- Quien manejaba la anterior sigue con la nueva.
  insert into accesos_caja (usuario_id, caja_id, rol)
  select usuario_id, n.id, rol from accesos_caja where caja_id = a.id
  on conflict do nothing;

  update cajas set activa = false, siguiente_id = n.id where id = a.id;
  return v_saldo;
end $$;

create or replace function traspasar_caja(p_anterior uuid, p_nueva uuid) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede pasar el saldo de una caja' using errcode = '42501';
  end if;
  return fx_traspasar_caja(p_anterior, p_nueva, true);
end $$;

-- La caja abierta que hoy reemplaza a una cerrada (sigue la cadena 6 → 7 → 8…).
create or replace function fx_caja_siguiente_activa(p_caja uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := p_caja;
  v_activa boolean;
  i int := 0;
begin
  loop
    select siguiente_id into v from cajas where id = v;
    if v is null then return null; end if;
    select activa into v_activa from cajas where id = v;
    if v_activa then return v; end if;
    i := i + 1;
    if i > 50 then return null; end if;
  end loop;
end $$;

-- Pasa a la caja que sigue lo que cambió en una caja cerrada (anulaciones, pendientes de un reenvío).
create or replace function fx_conciliar_caja_cerrada(p_caja uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n uuid;
begin
  if (select activa from cajas where id = p_caja) then return; end if;
  v_n := fx_caja_siguiente_activa(p_caja);
  if v_n is null then return; end if;
  perform fx_traspasar_caja(p_caja, v_n, false);
end $$;

-- Abre la caja siguiente de la empresa (misma área y nombre) y le traspasa todo.
create or replace function fx_abrir_siguiente_caja(p_caja uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a cajas;
  v_num int;
  v_n uuid;
begin
  select * into a from cajas where id = p_caja for update;
  if not a.activa then return null; end if;
  perform pg_advisory_xact_lock(hashtext('caja-numero:' || a.empresa_id::text));
  select coalesce(max(numero), 0) + 1 into v_num from cajas where empresa_id = a.empresa_id;
  if v_num > 99 then
    raise exception 'La empresa ya tiene 99 cajas: pide a tesorería que reutilice un número' using errcode = 'P0001';
  end if;
  insert into cajas (empresa_id, numero, area, nombre, umbral_alerta, responsable_id)
  values (a.empresa_id, v_num, a.area, a.nombre, a.umbral_alerta, a.responsable_id)
  returning id into v_n;
  perform fx_traspasar_caja(a.id, v_n, true);
  return v_n;
end $$;

-- Corregir una observada de una caja cerrada: la diferencia viaja a la caja que sigue.
create or replace function tg_movimiento_caja_cerrada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('factudex.traspasando_caja', true) = 'on' then return null; end if;
  if (old.anulado, old.monto) is distinct from (new.anulado, new.monto)
     and not (select activa from cajas where id = new.caja_id) then
    perform fx_conciliar_caja_cerrada(new.caja_id);
  end if;
  return null;
end $$;

drop trigger if exists movimientos_caja_cerrada on movimientos;
create trigger movimientos_caja_cerrada after update of anulado, monto on movimientos
  for each row execute function tg_movimiento_caja_cerrada();

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

  -- Una caja, una liquidación: se cierra y se abre la siguiente con el saldo y lo que quedó.
  perform fx_abrir_siguiente_caja(p_caja);
  return v;
end $$;

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

  -- Reenvío de una observada de una caja ya cerrada: lo que no entró pasa a la caja que sigue.
  if not (select activa from cajas where id = v.caja_id) then
    perform fx_conciliar_caja_cerrada(v.caja_id);
  end if;
  return v;
end $$;

create or replace function tg_recarga_repone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.liquidacion_repuesta_id is not null then
    update liquidaciones set estado = 'repuesta'
     where id = new.liquidacion_repuesta_id and estado = 'aprobada'
       and caja_id in (select c.id from cajas c join cajas d on d.empresa_id = c.empresa_id and d.area = c.area
                        where d.id = new.caja_id);
    if not found then
      raise exception 'Solo se puede reponer una liquidación aprobada de esta caja o de una anterior de la misma empresa y área';
    end if;
  end if;
  return new;
end $$;

revoke all on function fx_traspasar_caja(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function fx_abrir_siguiente_caja(uuid) from public, anon, authenticated;
revoke all on function fx_conciliar_caja_cerrada(uuid) from public, anon, authenticated;
revoke all on function fx_caja_siguiente_activa(uuid) from public, anon;
grant execute on function fx_caja_siguiente_activa(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ===== supabase/migrations/20261115000000_observaciones.sql =====

-- Observaciones de cada gasto: para quién fue en realidad y el motivo (ej. "Para el chofer Juan
-- Pérez, viaje a Chicama por repuesto"). Opcional; sale en la liquidación y como última columna del
-- Excel. Se corrige mientras la liquidación siga abierta u observada (lo controla la app).
alter table movimientos add column if not exists observaciones text
  check (observaciones is null or length(observaciones) <= 300);
comment on column movimientos.observaciones is 'Para quién fue el gasto y el motivo (va al Excel de la liquidación)';

notify pgrst, 'reload schema';

-- ===== supabase/migrations/20261116000000_consulta_todas_las_cajas.sql =====

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

notify pgrst, 'reload schema';

-- ===== supabase/seed.sql =====

-- Datos iniciales para la demo (fase 1).
-- Centros de costo, solicitantes y proveedores son EJEMPLOS: reemplazar por las listas reales.

insert into empresas (codigo, sigla, nombre_corto, razon_social, color_primario, color_acento) values
  ('SL',   'SL', 'San Lorenzo', 'Compañía San Lorenzo S.A.C.', '#2E75B6', '#D3453A'),
  ('SIPE', 'SP', 'SIPE',        'SIPE',                        '#1FA2C9', '#2FAE60');

-- Folio resultante: SLLQ01-MT-0001, SLLQ02-OP-0001, SPLQ01-GE-0001
insert into cajas (empresa_id, numero, area, nombre, umbral_alerta)
select e.id, v.numero, v.area, v.nombre, v.umbral
  from (values
    ('SL',   1, 'MT', 'Mantenimiento', 200.00),
    ('SL',   2, 'OP', 'Operaciones',   200.00),
    ('SIPE', 1, 'GE', 'General',       200.00)
  ) as v(empresa, numero, area, nombre, umbral)
  join empresas e on e.codigo = v.empresa;

insert into categorias (nombre, orden) values
  ('Peajes', 10),
  ('Combustible', 20),
  ('Repuestos y ferretería', 30),
  ('Llantas', 40),
  ('Alimentación', 50),
  ('Movilidad', 60),
  ('Útiles de oficina', 70),
  ('Servicios', 80),
  ('Otros', 90);

-- Centros de costo (EJEMPLO). "General" va primero: es el valor por defecto en el registro.
insert into centros_costo (empresa_id, codigo, nombre, orden)
select e.id, v.codigo, v.nombre, v.orden
  from (values
    ('SL',   'GEN',  'General',        0),
    ('SL',   'PLA',  'Planta',        10),
    ('SL',   'TRA',  'Transporte',    20),
    ('SL',   'ADM',  'Administración',30),
    ('SIPE', 'GEN',  'General',        0),
    ('SIPE', 'OPE',  'Operaciones',   10),
    ('SIPE', 'ADM',  'Administración',20)
  ) as v(empresa, codigo, nombre, orden)
  join empresas e on e.codigo = v.empresa;

-- Placas como centros de costo (EJEMPLO, tomadas del prototipo en diseno/).
insert into centros_costo (empresa_id, codigo, nombre, orden)
select e.id, v.placa, v.placa, 100
  from (values ('SL', 'T1Y-461'), ('SL', 'BZL-893'), ('SL', 'CAE-899'), ('SIPE', 'T1P-831')) as v(empresa, placa)
  join empresas e on e.codigo = v.empresa;

-- Solicitantes (EJEMPLO).
insert into solicitantes (empresa_id, nombre, area)
select e.id, v.nombre, v.area
  from (values
    ('SL',   'Carlos Ramírez', 'Mantenimiento'),
    ('SL',   'Johan Mesa',     'Operaciones'),
    ('SIPE', 'María Torres',   'General')
  ) as v(empresa, nombre, area)
  join empresas e on e.codigo = v.empresa;

-- Proveedores de ejemplo tomados del prototipo (diseno/).
insert into proveedores (tipo_doc, num_doc, razon_social, nombre_comercial, creado_por) values
  ('RUC', '20522547957', 'COVISOL - Peaje Chicama', null, null),
  ('RUC', '20522598102', 'COVISOL Ventas Corporativas', null, null);

-- ===== Registro de migraciones (la CLI de Supabase no las vuelve a aplicar) =====

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260925000000', 'esquema_inicial'),
  ('20260926000000', 'centro_costo_unico_y_solicitantes'),
  ('20260927000000', 'google_drive'),
  ('20260928000000', 'drive_carpeta_elegida'),
  ('20261022000000', 'modulos_por_usuario'),
  ('20261023000000', 'centros_costo_desde_registro'),
  ('20261024000000', 'tesoreria'),
  ('20261025000000', 'tesoreria_gestiona_registradores'),
  ('20261026000000', 'areas_y_foto_ingreso'),
  ('20261027000000', 'traspaso_de_saldo'),
  ('20261102000000', 'pagos_con_varias_salidas'),
  ('20261103000000', 'planillas_movilidad'),
  ('20261110000000', 'completar_pagos_anteriores'),
  ('20261111000000', 'liquidado_en_caja_anterior'),
  ('20261112000000', 'arreglo_pagos_anteriores'),
  ('20261113000000', 'folio_por_caja'),
  ('20261114000000', 'liquidar_abre_siguiente_caja'),
  ('20261115000000', 'observaciones'),
  ('20261116000000', 'consulta_todas_las_cajas')
on conflict do nothing;
