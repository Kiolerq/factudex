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
