-- =============================================================================
-- Factudex — primer administrador y saldo de ejemplo.
-- Antes: Authentication → Users → Add user → Create new user (correo + contraseña,
-- marca "Auto Confirm User"). Luego cambia el correo y el nombre de abajo y dale Run.
-- =============================================================================

do $$
declare
  v_correo constant text := 'vargasjd.12@gmail.com';   -- ← el correo del usuario que creaste
  v_nombre constant text := 'Administrador';            -- ← el nombre que se verá en la app
  v_saldo  constant numeric := 2000;                    -- saldo de ejemplo por caja (0 = ninguno)
  v_admin  uuid;
begin
  update perfiles set rol = 'admin', nombre = v_nombre
   where lower(email) = lower(v_correo)
  returning id into v_admin;

  if v_admin is null then
    raise exception 'No existe el usuario %. Créalo primero en Authentication → Users.', v_correo;
  end if;

  -- Una recarga de apertura por caja que aún no tenga ninguna.
  if v_saldo > 0 then
    insert into recargas (caja_id, tipo, monto, descripcion, forma, registrado_por)
    select c.id, 'apertura', v_saldo, 'Saldo inicial de ejemplo', 'efectivo', v_admin
      from cajas c
     where not exists (select 1 from recargas r where r.caja_id = c.id);
  end if;
end $$;

-- Comprobación: debe listar las cajas con su saldo.
select empresa_codigo, caja_numero, nombre, saldo from v_saldo_cajas order by 1, 2;
