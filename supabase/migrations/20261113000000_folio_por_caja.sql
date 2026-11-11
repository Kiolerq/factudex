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
