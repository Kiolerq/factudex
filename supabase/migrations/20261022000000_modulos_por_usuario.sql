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
