import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";
import { ErrorDeNegocio, type Repositorio } from "./repositorio";
import type { CajaSaldo, CodigoEmpresa, Empresa, Opcion, Proveedor } from "./tipos";

// Implementación real. Todas las consultas pasan por RLS con la sesión del usuario.

function fallo(error: { message: string } | null, contexto: string): asserts error is null {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

export async function crearRepositorioSupabase(): Promise<Repositorio> {
  const sb = await createClient();

  return {
    async usuarioActual() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      const { data: perfil } = await sb
        .from("perfiles")
        .select("nombre, email")
        .eq("id", data.user.id)
        .maybeSingle();
      return {
        id: data.user.id,
        nombre: perfil?.nombre ?? data.user.email ?? "Usuario",
        email: perfil?.email ?? data.user.email ?? null,
      };
    },

    async listarEmpresas(): Promise<Empresa[]> {
      const { data, error } = await sb
        .from("empresas")
        .select("id, codigo, sigla, nombre_corto, razon_social")
        .eq("activa", true)
        .order("codigo", { ascending: false }); // SL antes que SIPE
      fallo(error, "Empresas");
      return data.map((e) => ({
        id: e.id,
        codigo: e.codigo as CodigoEmpresa,
        sigla: e.sigla,
        nombreCorto: e.nombre_corto,
        razonSocial: e.razon_social,
      }));
    },

    async listarCajas(): Promise<CajaSaldo[]> {
      const { data, error } = await sb
        .from("v_saldo_cajas")
        .select("*")
        .order("empresa_codigo", { ascending: false })
        .order("caja_numero");
      fallo(error, "Cajas");
      // Postgres marca como anulables todas las columnas de una vista; aquí nunca lo son.
      return data.map((c) => ({
        id: c.caja_id!,
        empresaId: c.empresa_id!,
        empresaCodigo: c.empresa_codigo as CodigoEmpresa,
        numero: c.caja_numero!,
        area: c.caja_area!,
        nombre: c.nombre!,
        umbralAlerta: Number(c.umbral_alerta),
        saldo: Number(c.saldo),
        bajoUmbral: !!c.bajo_umbral,
        pendientes: Number(c.movimientos_pendientes),
      }));
    },

    async listarCategorias(empresaId): Promise<Opcion[]> {
      const { data, error } = await sb
        .from("categorias")
        .select("id, nombre")
        .eq("activa", true)
        .or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
        .order("orden");
      fallo(error, "Categorías");
      return data;
    },

    async listarCentrosCosto(empresaId): Promise<Opcion[]> {
      const { data, error } = await sb
        .from("centros_costo")
        .select("id, codigo, nombre")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("orden");
      fallo(error, "Centros de costo");
      return data;
    },

    async listarSolicitantes(empresaId): Promise<string[]> {
      const { data, error } = await sb
        .from("solicitantes")
        .select("nombre")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre");
      fallo(error, "Solicitantes");
      return data.map((s) => s.nombre);
    },

    async buscarProveedores(texto): Promise<Proveedor[]> {
      // Quita caracteres con significado en la sintaxis de filtros de PostgREST.
      const q = texto.replace(/[%,().*\\]/g, " ").trim();
      if (!q) return [];
      const { data, error } = await sb
        .from("proveedores")
        .select("id, tipo_doc, num_doc, razon_social, nombre_comercial")
        .eq("activo", true)
        .or(`razon_social.ilike.%${q}%,nombre_comercial.ilike.%${q}%,num_doc.ilike.${q}%`)
        .order("razon_social")
        .limit(8);
      fallo(error, "Proveedores");
      return data.map(aProveedor);
    },

    async crearProveedor(p): Promise<Proveedor> {
      const { data, error } = await sb
        .from("proveedores")
        .insert({ tipo_doc: p.tipoDoc, num_doc: p.numDoc, razon_social: p.razonSocial })
        .select("id, tipo_doc, num_doc, razon_social, nombre_comercial")
        .single();
      if (error?.code === "23505") throw new ErrorDeNegocio(`Ya existe un proveedor con ${p.tipoDoc} ${p.numDoc}`);
      fallo(error, "Crear proveedor");
      return aProveedor(data);
    },

    async registrarMovimiento(m) {
      // liquidacion_id y estado los asigna el trigger movimientos_asignar_liquidacion.
      const fila = {
        id: m.id,
        caja_id: m.cajaId,
        fecha: m.fecha,
        solicitante: m.solicitante,
        proveedor_id: m.proveedorId,
        categoria_id: m.categoriaId,
        centro_costo_id: m.centroCostoId,
        detalle: m.detalle,
        monto: m.monto,
        tipo_documento: m.tipoDocumento,
        serie_numero: m.serieNumero,
        medio_pago: m.medioPago,
        operacion_pago: m.operacionPago,
      } as TablesInsert<"movimientos">;
      const { error } = await sb.from("movimientos").insert(fila);
      if (error?.code === "P0001") throw new ErrorDeNegocio(error.message); // raise exception de triggers
      fallo(error, "Registrar movimiento");

      if (m.adjuntos.length) {
        const { error: errAdj } = await sb.from("adjuntos").insert(
          m.adjuntos.map((a) => ({
            movimiento_id: m.id,
            tipo: a.tipo,
            storage_path: a.storagePath,
            mime_type: a.mimeType,
            tamano_bytes: a.tamanoBytes,
          })),
        );
        fallo(errAdj, "Registrar adjuntos");
      }

      const { data, error: errEstado } = await sb
        .from("movimientos")
        .select("estado")
        .eq("id", m.id)
        .single();
      fallo(errEstado, "Leer estado");
      return { id: m.id, estado: data.estado };
    },
  };
}

function aProveedor(p: {
  id: string;
  tipo_doc: Proveedor["tipoDoc"];
  num_doc: string;
  razon_social: string;
  nombre_comercial: string | null;
}): Proveedor {
  return {
    id: p.id,
    tipoDoc: p.tipo_doc,
    numDoc: p.num_doc,
    razonSocial: p.razon_social,
    nombreComercial: p.nombre_comercial,
  };
}
