-- Datos iniciales para la demo (fase 1). El umbral de alerta es provisional:
-- falta definir el número real de cajas y el límite de cada una.

insert into empresas (codigo, nombre_corto, razon_social, color_primario, color_acento) values
  ('SL',   'San Lorenzo', 'Compañía San Lorenzo S.A.C.', '#2E75B6', '#D3453A'),
  ('SIPE', 'SIPE',        'SIPE',                        '#1FA2C9', '#2FAE60');

insert into cajas (empresa_id, codigo, nombre, umbral_alerta)
select e.id, v.codigo, v.nombre, v.umbral
  from (values
    ('SL',   'MANT', 'Mantenimiento', 200.00),
    ('SL',   'OPER', 'Operaciones',   200.00),
    ('SIPE', 'GEN',  'General',       200.00)
  ) as v(empresa, codigo, nombre, umbral)
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

-- Proveedores de ejemplo tomados del prototipo (diseno/).
insert into proveedores (tipo_doc, num_doc, razon_social, nombre_comercial, creado_por) values
  ('RUC', '20522547957', 'COVISOL - Peaje Chicama', null, null),
  ('RUC', '20522598102', 'COVISOL Ventas Corporativas', null, null);

-- Centros de costo: lista fija por empresa. PENDIENTE: cargar la lista real.
-- insert into centros_costo (empresa_id, codigo, nombre, orden)
-- select e.id, v.codigo, v.nombre, v.orden
--   from (values ('SL', 'CC01', 'Nombre del centro', 10)) as v(empresa, codigo, nombre, orden)
--   join empresas e on e.codigo = v.empresa;
