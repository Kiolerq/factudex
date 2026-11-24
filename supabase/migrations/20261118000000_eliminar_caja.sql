-- =============================================================================
-- Eliminar una caja abierta por error (solo tesorería o admin).
--
-- Solo se puede si la caja nunca tuvo un gasto ni una salida de pago (ni siquiera anulados),
-- sigue activa, no repuso ninguna liquidación y su única liquidación es la abierta vacía.
--
-- Si al abrirla se le pasó el saldo de la caja anterior (misma empresa y área), se deshace:
-- se borran los dos ajustes del traspaso y la anterior vuelve a quedar abierta.
-- Una caja que se abrió sola al liquidar la anterior no se elimina (es la que sigue).
-- Se borran también sus ingresos (apertura o recargas) y sus accesos.
-- Devuelve el código de la caja que se reabrió, o null.
-- =============================================================================

create or replace function eliminar_caja(p_caja uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c cajas;
  a cajas;
  v_codigo text;
begin
  if not es_tesoreria() then
    raise exception 'Solo tesorería puede eliminar una caja' using errcode = '42501';
  end if;

  select * into c from cajas where id = p_caja for update;
  if c.id is null then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  select e.codigo || '-CAJA-' || c.area || '-' || lpad(c.numero::text, 2, '0') into v_codigo
    from empresas e where e.id = c.empresa_id;

  if not c.activa then
    raise exception '% ya está cerrada: solo se eliminan cajas abiertas por error', v_codigo using errcode = '22023';
  end if;
  if exists (select 1 from movimientos where caja_id = c.id) then
    raise exception '% tiene gastos registrados (aunque estén anulados): no se puede eliminar', v_codigo using errcode = '22023';
  end if;
  if exists (select 1 from pagos where caja_id = c.id) then
    raise exception '% tiene pagos registrados: no se puede eliminar', v_codigo using errcode = '22023';
  end if;
  if exists (select 1 from recargas where caja_id = c.id and liquidacion_repuesta_id is not null) then
    raise exception '% ya repuso una liquidación: no se puede eliminar', v_codigo using errcode = '22023';
  end if;
  if exists (select 1 from liquidaciones where caja_id = c.id and estado <> 'abierta') then
    raise exception '% ya tiene liquidaciones generadas: no se puede eliminar', v_codigo using errcode = '22023';
  end if;
  if exists (select 1 from cajas where siguiente_id = c.id and activa) then
    raise exception 'Otra caja abierta apunta a %: no se puede eliminar', v_codigo using errcode = '22023';
  end if;

  -- La caja anterior que le pasó su saldo (si la hay).
  select * into a from cajas where siguiente_id = c.id for update;
  if a.id is null then
    select x.* into a from cajas x
      join recargas r on r.caja_id = c.id and r.traspaso_caja_id = x.id
     where not x.activa
     limit 1;
  end if;

  if a.id is not null then
    -- Se abrió sola al liquidar la anterior (mismo instante): es la caja que sigue, no un error.
    if exists (select 1 from liquidaciones l where l.caja_id = a.id and l.cerrada_en = c.created_at) then
      raise exception '% se abrió sola al liquidar la caja anterior: no se puede eliminar', v_codigo using errcode = '22023';
    end if;
    -- Ya hay otra caja abierta de la misma empresa y área: no se puede reabrir la anterior.
    if exists (select 1 from cajas x where x.empresa_id = a.empresa_id and x.area = a.area
                                     and x.activa and x.id <> c.id) then
      raise exception 'Ya hay otra caja abierta de esa área: no se puede devolver el saldo a la anterior' using errcode = '22023';
    end if;
  end if;

  -- Deshacer el traspaso: la anterior recupera su saldo y vuelve a quedar abierta.
  if a.id is not null then
    delete from recargas
     where (caja_id = a.id and traspaso_caja_id = c.id)
        or (caja_id = c.id and traspaso_caja_id = a.id);
    update cajas set activa = true, siguiente_id = null where id = a.id;
  end if;

  update cajas set siguiente_id = null where siguiente_id = c.id;
  update recargas set traspaso_caja_id = null where traspaso_caja_id = c.id;
  delete from recargas      where caja_id = c.id;
  delete from liquidaciones where caja_id = c.id;
  delete from accesos_caja  where caja_id = c.id;
  delete from cajas         where id = c.id;

  if a.id is null then return null; end if;
  return (select e.codigo || '-CAJA-' || a.area || '-' || lpad(a.numero::text, 2, '0')
            from empresas e where e.id = a.empresa_id);
end $$;

revoke all on function eliminar_caja(uuid) from public, anon;
grant execute on function eliminar_caja(uuid) to authenticated;
