import { crearClienteAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert, TablesUpdate } from "@/types/database";
import { ErrorDeNegocio, type Repositorio } from "./repositorio";
import { MODULOS, type DatosUsuario, type Modulo, type RolCaja, type UsuarioAdmin } from "./tipos";
import { AREAS_BASE, claveCentro } from "./tipos";
import type {
  AdjuntoGuardado,
  CajaSaldo,
  CodigoEmpresa,
  Empresa,
  EstadoLiquidacion,
  LiquidacionResumen,
  MedioPago,
  MovimientoResumen,
  Opcion,
  Proveedor,
  Recarga,
  TipoAdjunto,
} from "./tipos";

// Implementación real. Todas las consultas pasan por RLS con la sesión del usuario.

function fallo(error: { message: string } | null, contexto: string): asserts error is null {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

/** perfiles.modulos: null (o sin la migración 20261022) = todos los módulos. */
function aModulos(m: string[] | null | undefined): Modulo[] | null {
  return m ? MODULOS.filter((x) => m.includes(x)) : null;
}

/** Errores de Supabase Auth al crear un usuario o cambiar su contraseña, en palabras. */
function falloAuth(error: { code?: string; message: string } | null, contexto: string): asserts error is null {
  if (!error) return;
  if (error.code === "email_exists" || /already been registered/i.test(error.message))
    throw new ErrorDeNegocio("Ya existe un usuario con ese correo");
  if (error.code === "weak_password") throw new ErrorDeNegocio("La contraseña es muy débil: usa al menos 8 caracteres");
  if (error.code === "email_address_invalid") throw new ErrorDeNegocio("El correo no es válido");
  throw new Error(`${contexto}: ${error.message}`);
}

/** Los `raise exception` de triggers y RPC (P0001) son reglas de negocio: se muestran tal cual. */
function falloNegocio(error: { code?: string; message: string } | null, contexto: string): asserts error is null {
  if (error?.code === "P0001") throw new ErrorDeNegocio(error.message);
  fallo(error, contexto);
}

// Columnas de un movimiento para listas (historial, pendientes, liquidación).
const COLUMNAS_MOVIMIENTO =
  "id, caja_id, liquidacion_id, fecha, detalle, monto, solicitante, tipo_documento, serie_numero, medio_pago, " +
  "operacion_pago, estado, anulado, requiere_autorizacion, autorizado_por, " +
  "proveedores(razon_social, num_doc), categorias(nombre), centros_costo(nombre), adjuntos(tipo)";

interface FilaMovimiento {
  id: string;
  caja_id: string;
  liquidacion_id: string;
  fecha: string;
  detalle: string;
  monto: number;
  solicitante: string | null;
  tipo_documento: MovimientoResumen["tipoDocumento"];
  serie_numero: string | null;
  medio_pago: MedioPago | null;
  operacion_pago: string | null;
  estado: MovimientoResumen["estado"];
  anulado: boolean;
  requiere_autorizacion: boolean;
  autorizado_por: string | null;
  proveedores: { razon_social: string; num_doc: string } | null;
  categorias: { nombre: string } | null;
  centros_costo: { nombre: string } | null;
  adjuntos: { tipo: TipoAdjunto }[];
}

function aMovimiento(m: FilaMovimiento): MovimientoResumen {
  const tiene = (t: TipoAdjunto) => m.adjuntos.some((a) => a.tipo === t);
  return {
    id: m.id,
    cajaId: m.caja_id,
    liquidacionId: m.liquidacion_id,
    fecha: m.fecha,
    detalle: m.detalle,
    monto: Number(m.monto),
    solicitante: m.solicitante,
    proveedor: m.proveedores?.razon_social ?? null,
    proveedorDoc: m.proveedores?.num_doc ?? null,
    categoria: m.categorias?.nombre ?? null,
    centroCosto: m.centros_costo?.nombre ?? null,
    tipoDocumento: m.tipo_documento,
    serieNumero: m.serie_numero,
    medioPago: m.medio_pago,
    operacionPago: m.operacion_pago,
    estado: m.estado,
    anulado: m.anulado,
    faltaDocumento: !tiene("documento"),
    faltaPago: m.medio_pago !== "efectivo" && !tiene("pago"),
    porAutorizar: m.requiere_autorizacion && !m.autorizado_por && !m.anulado,
  };
}

interface FilaLiquidacion {
  id: string | null;
  caja_id: string | null;
  folio: string | null;
  correlativo: number | null;
  estado: EstadoLiquidacion | null;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  saldo_inicial: number | null;
  total_ingresos: number | null;
  total_gastado: number | null;
  saldo_final: number | null;
  ingresos_actual: number | null;
  total_actual: number | null;
  total_liquidable: number | null;
  saldo_final_actual: number | null;
  num_movimientos: number | null;
  num_incompletos: number | null;
  observaciones: string | null;
}

function aLiquidacion(l: FilaLiquidacion): LiquidacionResumen {
  // Abierta u observada: totales en vivo. Cerrada: el snapshot que guardó cerrar_liquidacion().
  const vivo = l.estado === "abierta" || l.estado === "observada";
  const n = (x: number | null) => Number(x ?? 0);
  return {
    id: l.id!,
    cajaId: l.caja_id!,
    folio: l.folio!,
    correlativo: l.correlativo!,
    estado: l.estado!,
    fechaInicio: l.fecha_inicio!,
    fechaCierre: l.fecha_cierre,
    saldoInicial: n(l.saldo_inicial),
    ingresos: vivo || l.total_ingresos === null ? n(l.ingresos_actual) : n(l.total_ingresos),
    egresos: vivo || l.total_gastado === null ? n(l.total_liquidable) : n(l.total_gastado),
    porReembolsar: vivo || l.saldo_final === null ? n(l.saldo_final_actual) : n(l.saldo_final),
    numMovimientos: n(l.num_movimientos),
    numIncompletos: n(l.num_incompletos),
    montoIncompletos: Math.round((n(l.total_actual) - n(l.total_liquidable)) * 100) / 100,
    observaciones: l.observaciones,
  };
}

interface FilaRecarga {
  id: string;
  caja_id: string;
  tipo: Recarga["tipo"];
  monto: number;
  fecha: string;
  descripcion: string | null;
  forma: Recarga["forma"];
  banco: string | null;
  operacion: string | null;
  recibo: string | null;
  nota: string | null;
  repuesta: { folio: string } | null;
}

const COLUMNAS_RECARGA =
  "id, caja_id, tipo, monto, fecha, descripcion, forma, banco, operacion, recibo, nota, " +
  "repuesta:liquidaciones!recargas_liquidacion_repuesta_id_fkey(folio)";

function aRecarga(r: FilaRecarga): Recarga {
  return {
    id: r.id,
    cajaId: r.caja_id,
    tipo: r.tipo,
    monto: Number(r.monto),
    fecha: r.fecha,
    descripcion: r.descripcion,
    forma: r.forma,
    banco: r.banco,
    operacion: r.operacion,
    recibo: r.recibo,
    nota: r.nota,
    folioRepuesto: r.repuesta?.folio ?? null,
    conFoto: false,
  };
}

/** Guarda el resultado de la primera llamada (el repositorio vive solo durante una petición). */
function memo<T>(f: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= f().catch((e) => {
    p = undefined;
    throw e;
  }));
}

export async function crearRepositorioSupabase(): Promise<Repositorio> {
  const sb = await createClient();

  // La sesión se verifica con la clave pública del proyecto (ES256), sin ir a Supabase Auth.
  const usuarioActual = memo(async () => {
    const { data } = await sb.auth.getClaims();
    const c = data?.claims;
    if (!c?.sub) return null;
    // select("*"): funciona también antes de correr las migraciones de módulos y tesorería.
    const { data: perfil } = await sb.from("perfiles").select("*").eq("id", c.sub).maybeSingle();
    const esAdmin = perfil?.rol === "admin";
    return {
      id: c.sub,
      nombre: perfil?.nombre ?? c.email ?? "Usuario",
      email: perfil?.email ?? c.email ?? null,
      esAdmin,
      esTesoreria: esAdmin || !!perfil?.es_tesoreria,
      activo: perfil?.activo ?? true,
      modulos: esAdmin ? [...MODULOS] : (aModulos(perfil?.modulos) ?? [...MODULOS]),
    };
  });

  // Roles por caja del usuario, en una sola consulta (en vez de 2 RPC por caja).
  const misAccesos = memo(async () => {
    const yo = await usuarioActual();
    if (!yo) return new Map<string, RolCaja>();
    const { data, error } = await sb.from("accesos_caja").select("caja_id, rol").eq("usuario_id", yo.id);
    fallo(error, "Accesos");
    return new Map(data.map((a) => [a.caja_id, a.rol as RolCaja]));
  });

  /** Perfil (nombre, rol global, módulos, activo) y accesos por caja, con la sesión del admin (RLS). */
  async function guardarDatosUsuario(id: string, d: DatosUsuario, activo?: boolean) {
    const { data: actual } = await sb.from("perfiles").select("*").eq("id", id).maybeSingle();
    if (!actual) throw new ErrorDeNegocio("El usuario no existe");
    const cambios: TablesUpdate<"perfiles"> = { nombre: d.nombre, rol: d.esAdmin ? "admin" : "registrador" };
    if (activo !== undefined) cambios.activo = activo;
    // Sin la migración de tesorería la columna no existe.
    if ("es_tesoreria" in actual) cambios.es_tesoreria = d.esTesoreria;
    else if (d.esTesoreria) throw new ErrorDeNegocio("Falta correr en Supabase la migración de tesorería (20261024000000)");
    // Sin la migración de módulos la columna no existe: solo se puede dejar "todos".
    if ("modulos" in actual) cambios.modulos = d.modulos;
    else if (d.modulos) throw new ErrorDeNegocio("Falta correr en Supabase la migración de módulos (20261022000000)");
    const { error } = await sb.from("perfiles").update(cambios).eq("id", id);
    fallo(error, "Guardar usuario");

    const { error: errBorrar } = await sb.from("accesos_caja").delete().eq("usuario_id", id);
    fallo(errBorrar, "Accesos");
    if (!d.esAdmin && d.accesos.length) {
      const { error: errAccesos } = await sb
        .from("accesos_caja")
        .insert(d.accesos.map((a) => ({ usuario_id: id, caja_id: a.cajaId, rol: a.rol })));
      fallo(errAccesos, "Accesos");
    }
  }

  return {
    usuarioActual,

    listarEmpresas: memo(async (): Promise<Empresa[]> => {
      const { data, error } = await sb
        .from("empresas")
        .select("id, codigo, sigla, nombre_corto, razon_social, ciudad, tope_gasto")
        .eq("activa", true)
        .order("codigo", { ascending: false }); // SL antes que SIPE
      fallo(error, "Empresas");
      return data.map((e) => ({
        id: e.id,
        codigo: e.codigo as CodigoEmpresa,
        sigla: e.sigla,
        nombreCorto: e.nombre_corto,
        razonSocial: e.razon_social,
        ciudad: e.ciudad,
        topeGasto: Number(e.tope_gasto),
      }));
    }),

    listarCajas: memo(async (): Promise<CajaSaldo[]> => {
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
    }),

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

    async crearCentroCosto(empresaId, nombre) {
      // Si ya existe igual (aunque escrito distinto: T1Y-461 = t1y 461), se usa ese.
      const { data: existentes, error: errLista } = await sb
        .from("centros_costo")
        .select("id, codigo, nombre, activo")
        .eq("empresa_id", empresaId);
      fallo(errLista, "Centros de costo");
      const igual = existentes.find((c) => claveCentro(c.nombre) === claveCentro(nombre) || claveCentro(c.codigo) === claveCentro(nombre));
      if (igual && !igual.activo)
        throw new ErrorDeNegocio(`"${igual.nombre}" existe pero está desactivado: pide al administrador que lo reactive`);
      if (igual) return { id: igual.id, codigo: igual.codigo, nombre: igual.nombre };
      const codigo = nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30);
      const { data, error } = await sb
        .from("centros_costo")
        .insert({ empresa_id: empresaId, codigo, nombre, orden: 200 })
        .select("id, codigo, nombre")
        .single();
      if (error?.code === "23505") throw new ErrorDeNegocio(`Ya existe un centro de costo con el código ${codigo}`);
      if (error?.code === "42501") throw new ErrorDeNegocio("No tienes permiso para agregar centros de costo en esta empresa");
      fallo(error, "Crear centro de costo");
      return data;
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
            almacen: a.storagePath.startsWith("drive:") ? "drive" : "supabase",
            nombre_archivo: a.nombreArchivo ?? null,
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

    // Misma regla que tiene_acceso_caja(): admin y tesorería pueden todo; si no, el rol en la caja.
    async permisosCaja(cajaId) {
      const yo = await usuarioActual();
      if (!yo?.activo) return { registrar: false, aprobar: false };
      if (yo.esAdmin) return { registrar: true, aprobar: true };
      if (yo.esTesoreria) return { registrar: false, aprobar: true }; // revisa, no registra ni liquida
      const rol = (await misAccesos()).get(cajaId);
      return { registrar: rol === "registrador" || rol === "aprobador", aprobar: rol === "aprobador" };
    },

    async listarMovimientos(f) {
      if (!f.cajaIds.length) return { movimientos: [], total: 0 };
      let q = sb
        .from("movimientos")
        .select(COLUMNAS_MOVIMIENTO, { count: "exact" })
        .in("caja_id", f.cajaIds)
        .eq("anulado", f.estado === "anulado");
      if (f.estado === "pendiente" || f.estado === "completo") q = q.eq("estado", f.estado);
      if (f.estado === "por_autorizar") q = q.eq("requiere_autorizacion", true).is("autorizado_por", null);
      if (f.desde) q = q.gte("fecha", f.desde);
      if (f.hasta) q = q.lte("fecha", f.hasta);

      // Quita caracteres con significado en la sintaxis de filtros de PostgREST.
      const texto = f.texto.replace(/[%,().*\\]/g, " ").trim();
      if (texto) {
        const { data: provs } = await sb
          .from("proveedores")
          .select("id")
          .or(`razon_social.ilike.%${texto}%,nombre_comercial.ilike.%${texto}%,num_doc.ilike.${texto}%`)
          .limit(50);
        const filtros = [`detalle.ilike.%${texto}%`, `serie_numero.ilike.%${texto}%`, `solicitante.ilike.%${texto}%`];
        if (provs?.length) filtros.push(`proveedor_id.in.(${provs.map((p) => p.id).join(",")})`);
        q = q.or(filtros.join(","));
      }

      const { data, error, count } = await q
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(f.limite)
        .overrideTypes<FilaMovimiento[], { merge: false }>();
      fallo(error, "Movimientos");
      return { movimientos: data.map(aMovimiento), total: count ?? data.length };
    },

    async obtenerMovimiento(id) {
      const { data, error } = await sb
        .from("movimientos")
        .select(
          `${COLUMNAS_MOVIMIENTO}, proveedor_id, motivo_anulacion, liquidaciones(id, folio, estado), ` +
            "archivos:adjuntos(id, tipo, mime_type, nombre_archivo, created_at)",
        )
        .eq("id", id)
        .maybeSingle()
        .overrideTypes<
          FilaMovimiento & {
            proveedor_id: string | null;
            motivo_anulacion: string | null;
            liquidaciones: { id: string; folio: string; estado: EstadoLiquidacion };
            archivos: { id: string; tipo: TipoAdjunto; mime_type: string; nombre_archivo: string | null; created_at: string }[];
          },
          { merge: false }
        >();
      fallo(error, "Movimiento");
      if (!data) return null;
      const adjuntos: AdjuntoGuardado[] = [...data.archivos]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((a) => ({ id: a.id, tipo: a.tipo, mimeType: a.mime_type, nombreArchivo: a.nombre_archivo, url: `/api/archivos/${a.id}` }));
      return {
        ...aMovimiento(data),
        proveedorId: data.proveedor_id,
        motivoAnulacion: data.motivo_anulacion,
        liquidacion: data.liquidaciones,
        adjuntos,
      };
    },

    async completarMovimiento(c) {
      const { data: filas, error } = await sb
        .from("movimientos")
        .update({
          proveedor_id: c.proveedorId,
          tipo_documento: c.tipoDocumento,
          serie_numero: c.serieNumero,
          medio_pago: c.medioPago,
          operacion_pago: c.operacionPago,
        })
        .eq("id", c.id)
        .select("id");
      falloNegocio(error, "Completar movimiento");
      if (!filas.length) throw new ErrorDeNegocio("No tienes permiso para modificar este movimiento");

      if (c.adjuntos.length) {
        const { error: errAdj } = await sb.from("adjuntos").insert(
          c.adjuntos.map((a) => ({
            movimiento_id: c.id,
            tipo: a.tipo,
            storage_path: a.storagePath,
            mime_type: a.mimeType,
            tamano_bytes: a.tamanoBytes,
            almacen: a.storagePath.startsWith("drive:") ? "drive" : "supabase",
            nombre_archivo: a.nombreArchivo ?? null,
          })),
        );
        falloNegocio(errAdj, "Registrar adjuntos");
      }

      const { data, error: errEstado } = await sb.from("movimientos").select("estado").eq("id", c.id).single();
      fallo(errEstado, "Leer estado");
      return data.estado;
    },

    async anularMovimiento(id, motivo) {
      const { data, error } = await sb
        .from("movimientos")
        .update({ anulado: true, motivo_anulacion: motivo })
        .eq("id", id)
        .eq("anulado", false)
        .select("id");
      falloNegocio(error, "Anular movimiento");
      if (!data.length) throw new ErrorDeNegocio("No se pudo anular: ya está anulado o no tienes permiso");
    },

    async listarLiquidaciones(cajaIds) {
      if (!cajaIds.length) return [];
      const { data, error } = await sb
        .from("v_liquidaciones")
        .select("*")
        .in("caja_id", cajaIds)
        .order("correlativo", { ascending: false });
      fallo(error, "Liquidaciones");
      return data.map(aLiquidacion);
    },

    async obtenerLiquidacion(id) {
      const { data: l, error } = await sb.from("v_liquidaciones").select("*").eq("id", id).maybeSingle();
      fallo(error, "Liquidación");
      if (!l) return null;
      const liq = aLiquidacion(l);
      const [movs, recs, anterior] = await Promise.all([
        sb
          .from("movimientos")
          .select(COLUMNAS_MOVIMIENTO)
          .eq("liquidacion_id", id)
          .eq("anulado", false)
          .order("fecha")
          .order("created_at")
          .overrideTypes<FilaMovimiento[], { merge: false }>(),
        sb
          .from("recargas")
          .select(COLUMNAS_RECARGA)
          .eq("liquidacion_ingreso_id", id)
          .order("fecha")
          .overrideTypes<FilaRecarga[], { merge: false }>(),
        sb
          .from("liquidaciones")
          .select("folio")
          .eq("caja_id", liq.cajaId)
          .eq("correlativo", liq.correlativo - 1)
          .maybeSingle(),
      ]);
      fallo(movs.error, "Movimientos de la liquidación");
      fallo(recs.error, "Ingresos de la liquidación");
      return {
        ...liq,
        folioAnterior: anterior.data?.folio ?? null,
        movimientos: movs.data.map(aMovimiento),
        recargas: recs.data.map(aRecarga),
      };
    },

    async generarLiquidacion(cajaId, desde, hasta, excluir) {
      const { data, error } = await sb.rpc("generar_liquidacion", {
        p_caja: cajaId,
        p_desde: desde,
        p_hasta: hasta,
        p_excluir: excluir,
      });
      falloNegocio(error, "Generar liquidación");
      return data.folio;
    },

    async autorizarMovimiento(id) {
      const { error } = await sb.rpc("autorizar_movimiento", { p_mov: id });
      falloNegocio(error, "Autorizar gasto");
    },

    async listarCajasAdmin() {
      const { data, error } = await sb
        .from("cajas")
        .select("id, empresa_id, numero, area, nombre, umbral_alerta, activa, empresas(codigo)")
        .order("numero")
        .overrideTypes<
          {
            id: string;
            empresa_id: string;
            numero: number;
            area: string;
            nombre: string;
            umbral_alerta: number;
            activa: boolean;
            empresas: { codigo: string };
          }[],
          { merge: false }
        >();
      fallo(error, "Cajas");
      return data.map((c) => ({
        id: c.id,
        empresaId: c.empresa_id,
        empresaCodigo: c.empresas.codigo as CodigoEmpresa,
        numero: c.numero,
        area: c.area,
        nombre: c.nombre,
        umbralAlerta: Number(c.umbral_alerta),
        activa: c.activa,
      }));
    },

    async guardarCaja(c) {
      const fila = {
        empresa_id: c.empresaId,
        numero: c.numero,
        area: c.area,
        nombre: c.nombre,
        umbral_alerta: c.umbralAlerta,
        activa: c.activa,
      };
      const { data, error } = c.id
        ? await sb.from("cajas").update(fila).eq("id", c.id).select("id")
        : await sb.from("cajas").insert(fila).select("id");
      if (error?.code === "23505") throw new ErrorDeNegocio(`Ya existe la caja N° ${String(c.numero).padStart(2, "0")} en esa empresa`);
      if (error?.code === "23514") throw new ErrorDeNegocio("Revisa los datos: el área va con 2 a 4 letras y el número entre 1 y 99");
      if (error?.code === "42501") throw new ErrorDeNegocio("Solo tesorería o un administrador puede crear o editar cajas");
      fallo(error, "Guardar caja");
      if (!data.length) throw new ErrorDeNegocio("Solo tesorería o un administrador puede editar cajas");
      return data[0]!.id;
    },

    async actualizarTope(empresaId, tope) {
      const { data, error } = await sb.from("empresas").update({ tope_gasto: tope }).eq("id", empresaId).select("id");
      fallo(error, "Tope por gasto");
      if (!data.length) throw new ErrorDeNegocio("Solo tesorería o un administrador puede cambiar el tope");
    },

    async cerrarLiquidacion(id) {
      const { error } = await sb.rpc("cerrar_liquidacion", { p_liquidacion: id });
      falloNegocio(error, "Cerrar liquidación");
    },

    async revisarLiquidacion(id, aprobar, observaciones) {
      const { error } = await sb.rpc("revisar_liquidacion", {
        p_liquidacion: id,
        p_aprobar: aprobar,
        p_observaciones: observaciones ?? undefined,
      });
      falloNegocio(error, "Revisar liquidación");
    },

    async listarRecargas(cajaIds, desde) {
      if (!cajaIds.length) return [];
      let q = sb.from("recargas").select(COLUMNAS_RECARGA).in("caja_id", cajaIds);
      if (desde) q = q.gte("fecha", desde);
      const { data, error } = await q
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500)
        .overrideTypes<FilaRecarga[], { merge: false }>();
      fallo(error, "Recargas");
      // La foto del depósito va aparte: si aún no se corrió la migración 20261026, no hay fotos.
      const fotos = await sb
        .from("recargas")
        .select("id, comprobante_path")
        .in("id", data.map((r) => r.id))
        .not("comprobante_path", "is", null);
      const conFoto = new Set((fotos.data ?? []).map((f) => f.id));
      return data.map((r) => ({ ...aRecarga(r), conFoto: conFoto.has(r.id) }));
    },

    async adjuntarComprobanteRecarga(id, path, mime) {
      const { error } = await sb.rpc("adjuntar_comprobante_recarga", { p_recarga: id, p_path: path, p_mime: mime });
      if (error?.code === "PGRST202") throw new ErrorDeNegocio("Falta correr en Supabase la migración 20261026000000 (foto del ingreso)");
      if (error?.code === "42501") throw new ErrorDeNegocio("Solo tesorería puede adjuntar la foto de un ingreso");
      falloNegocio(error, "Foto del ingreso");
    },

    async listarAreas() {
      const { data, error } = await sb.from("areas").select("codigo, nombre, descripcion").order("codigo");
      if (error) return AREAS_BASE; // sin la migración 20261026: las tres de siempre
      return data;
    },

    async crearArea(a) {
      const { error } = await sb.from("areas").insert({ codigo: a.codigo, nombre: a.nombre, descripcion: a.descripcion });
      if (error?.code === "23505") throw new ErrorDeNegocio(`Ya existe el área ${a.codigo}`);
      if (error?.code === "42P01" || error?.code === "PGRST205")
        throw new ErrorDeNegocio("Falta correr en Supabase la migración 20261026000000 (áreas)");
      if (error?.code === "42501") throw new ErrorDeNegocio("Solo tesorería puede agregar áreas");
      falloNegocio(error, "Agregar área");
    },

    async registrarRecarga(r) {
      const { data, error } = await sb.from("recargas").insert({
        caja_id: r.cajaId,
        tipo: r.tipo,
        liquidacion_repuesta_id: r.liquidacionRepuestaId,
        monto: r.monto,
        fecha: r.fecha,
        descripcion: r.descripcion,
        forma: r.forma,
        banco: r.banco,
        operacion: r.operacion,
        recibo: r.recibo,
        nota: r.nota,
      } as TablesInsert<"recargas">).select("id").single();
      if (error?.code === "42501") throw new ErrorDeNegocio("Solo tesorería puede registrar ingresos");
      if (error?.code === "23505") throw new ErrorDeNegocio("Esa liquidación ya tiene su reposición registrada");
      falloNegocio(error, "Registrar recarga");
      return data!.id;
    },

    async listarUsuarios(): Promise<UsuarioAdmin[]> {
      const [perfiles, accesos] = await Promise.all([
        sb.from("perfiles").select("*").order("nombre"),
        sb.from("accesos_caja").select("usuario_id, caja_id, rol"),
      ]);
      fallo(perfiles.error, "Usuarios");
      fallo(accesos.error, "Accesos");
      return perfiles.data.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        email: p.email,
        esAdmin: p.rol === "admin",
        esTesoreria: !!p.es_tesoreria,
        activo: p.activo,
        modulos: aModulos(p.modulos),
        accesos: accesos.data
          .filter((a) => a.usuario_id === p.id)
          .map((a) => ({ cajaId: a.caja_id, rol: a.rol as RolCaja })),
        creado: p.created_at,
      }));
    },

    async crearUsuario(u) {
      const { data, error } = await crearClienteAdmin().auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true, // lo crea el admin: no hace falta confirmar el correo
        user_metadata: { nombre: u.nombre },
      });
      falloAuth(error, "Crear usuario");
      await guardarDatosUsuario(data.user.id, u); // el perfil lo creó el trigger on_auth_user_created
      return data.user.id;
    },

    async actualizarUsuario(u) {
      await guardarDatosUsuario(u.id, u, u.activo);
      // Desactivado: además se bloquea el ingreso en Supabase Auth (y se puede reactivar).
      const { error } = await crearClienteAdmin().auth.admin.updateUserById(u.id, {
        ban_duration: u.activo ? "none" : "876000h",
      });
      falloAuth(error, "Activar/desactivar usuario");
    },

    async cambiarContrasena(id, password) {
      const { error } = await crearClienteAdmin().auth.admin.updateUserById(id, { password });
      falloAuth(error, "Cambiar contraseña");
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
