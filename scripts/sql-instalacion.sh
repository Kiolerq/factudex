#!/usr/bin/env bash
# Junta las migraciones y el seed en supabase/instalacion_completa.sql, para instalar Factudex
# en un proyecto Supabase nuevo pegando un solo archivo en el SQL Editor.
set -euo pipefail
cd "$(dirname "$0")/.."
salida=supabase/instalacion_completa.sql

{
  cat <<'EOF'
-- =============================================================================
-- Factudex — instalación completa en un proyecto Supabase NUEVO (vacío).
-- ARCHIVO GENERADO por scripts/sql-instalacion.sh (npm run sql:instalacion):
-- migraciones de supabase/migrations/ + supabase/seed.sql, en orden. No editar a mano.
-- Uso: SQL Editor → New query → pega TODO este archivo → Run (una sola vez).
-- Después crea tu usuario y corre supabase/primer_admin.sql.
-- =============================================================================
EOF
  for f in supabase/migrations/*.sql supabase/seed.sql; do
    printf -- '\n-- ===== %s =====\n\n' "$f"
    cat "$f"
  done
  printf -- '\n-- ===== Registro de migraciones (la CLI de Supabase no las vuelve a aplicar) =====\n\n'
  echo "create schema if not exists supabase_migrations;"
  echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
  echo "insert into supabase_migrations.schema_migrations (version, name) values"
  ls supabase/migrations | sed -E "s/^([0-9]+)_(.*)\.sql$/  ('\1', '\2')/" | paste -sd, - | sed 's/),/),\n/g'
  echo "on conflict do nothing;"
} > "$salida"

echo "Generado $salida"
