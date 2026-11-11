-- Observaciones de cada gasto: para quién fue en realidad y el motivo (ej. "Para el chofer Juan
-- Pérez, viaje a Chicama por repuesto"). Opcional; sale en la liquidación y como última columna del
-- Excel. Se corrige mientras la liquidación siga abierta u observada (lo controla la app).
alter table movimientos add column if not exists observaciones text
  check (observaciones is null or length(observaciones) <= 300);
comment on column movimientos.observaciones is 'Para quién fue el gasto y el motivo (va al Excel de la liquidación)';

notify pgrst, 'reload schema';
