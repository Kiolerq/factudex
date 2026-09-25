-- Datos iniciales para la demo (fase 1).
-- Centros de costo y placas son EJEMPLOS: reemplazar por las listas reales.

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

-- Placas (EJEMPLO, tomadas del prototipo en diseno/).
insert into vehiculos (empresa_id, placa, descripcion)
select e.id, v.placa, v.descripcion
  from (values
    ('SL',   'T1Y-461', 'Vehículo de ejemplo'),
    ('SL',   'BZL-893', 'Vehículo de ejemplo'),
    ('SL',   'CAE-899', 'Vehículo de ejemplo'),
    ('SIPE', 'T1P-831', 'Vehículo de ejemplo')
  ) as v(empresa, placa, descripcion)
  join empresas e on e.codigo = v.empresa;

-- Proveedores de ejemplo tomados del prototipo (diseno/).
insert into proveedores (tipo_doc, num_doc, razon_social, nombre_comercial, creado_por) values
  ('RUC', '20522547957', 'COVISOL - Peaje Chicama', null, null),
  ('RUC', '20522598102', 'COVISOL Ventas Corporativas', null, null);
