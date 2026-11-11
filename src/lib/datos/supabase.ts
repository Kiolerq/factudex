import { crearClienteAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesInsert, TablesUpdate } from "@/types/database";
import { ErrorDeNegocio, type Repositorio } from "./repositorio";
import { MODULOS, esSoloConsulta, type DatosUsuario, type Modulo, type RolCaja, type UsuarioAdmin } from "./tipos";
import { AREAS_BASE, claveCentro, codigoCaja, separarLiquidadoAntes, type TipoDevolucion, claveTrabajador, type FilaPlanilla, type GastoPlanillaDia, type Planilla } from "./tipos";
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

/** RPC de negocio: sus reglas, permisos y una migración sin correr se muestran en palabras. */
function falloRpc(error: { code?: string; message: string } | null, contexto: string, migracion: string): asserts error is null {
  if (error?.code === "42501") throw new ErrorDeNegocio(error.message.startsWith("permission denied") ? "No tienes permiso para esto" : error.message);
  if (error?.code === "PGRST202" || error?.code === "42883")
    throw new ErrorDeNegocio(`Falta correr la migración ${migracion} en Supabase. Avisa al administrador.`);
  falloNegocio(error, contexto);
}

// Columnas de un movimiento para listas (historial, pendientes, liquidación).
const COLUMNAS_MOVIMIENTO =
  "id, caja_id, liquidacion_id, fecha, detalle, monto, solicitante, tipo_documento, serie_numero, medio_pago, " +
  "operacion_pago, estado, anulado, requiere_autorizacion, autorizado_por, " +
  "proveedores(razon_social, num_doc), categorias(nombre), centros_costo(nombre), adjuntos(tipo)";

interface FilaMovimiento {
  id: string;
  observaciones?: string | null; // migración 20261115000000
  corrige_id?: string | null; // migración 20261117000000
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
  pago_id?: string | null; // solo con la migración 20261102000000
}

/** Lo que importa de un pago con varias salidas al mostrar cada una. */
type InfoPago = { falta: number; tieneConstancia: boolean };

function aMovimiento(m: FilaMovimiento, pagos?: Map<string, InfoPago>): MovimientoResumen {
  const tiene = (t: TipoAdjunto) => m.adjuntos.some((a) => a.tipo === t);
  const pago = m.pago_id ? pagos?.get(m.pago_id) : undefined;
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
    faltaPago: m.medio_pago !== "efectivo" && !tiene("pago") && !pago?.tieneConstancia,
    porAutorizar: m.requiere_autorizacion && !m.autorizado_por && !m.anulado,
    pagoId: m.pago_id ?? null,
    pagoFalta: pago ? Math.round(pago.falta * 100) / 100 : 0,
    observaciones: m.observaciones ?? null,
    corrigeId: m.corrige_id ?? null,
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

  // Pagos con varias salidas (migración 20261102000000). Sin la migración, todo sigue como antes.
  const hayPagos = memo(async () => !(await sb.from("pagos").select("id").limit(1)).error);
  const hayObservaciones = memo(async () => !(await sb.from("movimientos").select("observaciones").limit(1)).error);
  const hayCorrecciones = memo(async () => !(await sb.from("movimientos").select("corrige_id").limit(1)).error);
  const columnasMovimiento = async () => {
    const [pagos, obs, corr] = await Promise.all([hayPagos(), hayObservaciones(), hayCorrecciones()]);
    return `${COLUMNAS_MOVIMIENTO}${pagos ? ", pago_id" : ""}${obs ? ", observaciones" : ""}${corr ? ", corrige_id" : ""}`;
  };
  /** Observaciones del gasto (si ya se corrió la migración que las agrega). */
  async function guardarObservaciones(id: string, texto: string | null | undefined) {
    if (texto === undefined) return;
    if (!(await hayObservaciones())) {
      if (texto) throw new ErrorDeNegocio("Falta correr en Supabase la migración 20261115000000 (observaciones)");
      return;
    }
    const { error } = await sb.from("movimientos").update({ observaciones: texto } as TablesUpdate<"movimientos">).eq("id", id);
    falloNegocio(error, "Guardar observaciones");
  }
  async function infoPagos(filas: { pago_id?: string | null }[]): Promise<Map<string, InfoPago>> {
    const ids = [...new Set(filas.flatMap((f) => (f.pago_id ? [f.pago_id] : [])))];
    if (!ids.length) return new Map();
    const { data, error } = await sb.from("v_pagos").select("id, falta, tiene_constancia").in("id", ids);
    fallo(error, "Pagos");
    return new Map(data.map((p) => [p.id!, { falta: Number(p.falta), tieneConstancia: !!p.tiene_constancia }]));
  }

  /** Salidas de pagos con su liquidación y su caja (para saber qué ya se rindió y dónde). */
  async function salidasConLiquidacion(pagoIds: string[]): Promise<
    { pagoId: string; detalle: string; monto: number; folio: string | null; liquidado: boolean; cajaCodigo: string }[]
  > {
    if (!pagoIds.length) return [];
    // fx_salidas_pago (migración 20261112000000) ve también las salidas de la caja anterior,
    // aunque el registrador ya no tenga acceso a ella.
    const rpc = await sb.rpc("fx_salidas_pago", { p_pagos: pagoIds });
    if (!rpc.error) {
      return rpc.data.map((m) => ({
        pagoId: m.pago_id,
        detalle: m.detalle,
        monto: Number(m.monto),
        folio: m.folio,
        liquidado: !!m.estado_liquidacion && m.estado_liquidacion !== "abierta" && m.estado_liquidacion !== "observada",
        cajaCodigo: codigoCaja({ empresaCodigo: m.empresa_codigo as CodigoEmpresa, area: m.area, numero: m.numero }),
      }));
    }
    const { data, error } = await sb
      .from("movimientos")
      .select("pago_id, detalle, monto, anulado, liquidaciones(folio, estado), cajas(numero, area, empresas(codigo))")
      .in("pago_id", pagoIds)
      .eq("anulado", false)
      .order("created_at")
      .overrideTypes<
        {
          pago_id: string;
          detalle: string;
          monto: number;
          anulado: boolean;
          liquidaciones: { folio: string; estado: EstadoLiquidacion } | null;
          cajas: { numero: number; area: string; empresas: { codigo: string } } | null;
        }[],
        { merge: false }
      >();
    fallo(error, "Salidas del pago");
    return data.map((m) => ({
      pagoId: m.pago_id,
      detalle: m.detalle,
      monto: Number(m.monto),
      folio: m.liquidaciones?.folio ?? null,
      liquidado: !!m.liquidaciones && m.liquidaciones.estado !== "abierta" && m.liquidaciones.estado !== "observada",
      cajaCodigo: m.cajas ? codigoCaja({ empresaCodigo: m.cajas.empresas.codigo as CodigoEmpresa, area: m.cajas.area, numero: m.cajas.numero }) : "",
    }));
  }

  /** Lo ya rendido de un pago, agrupado por liquidación. */
  const agruparLiquidado = (salidas: Awaited<ReturnType<typeof salidasConLiquidacion>>) =>
    Object.values(
      salidas
        .filter((x) => x.liquidado && x.folio)
        .reduce<Record<string, { folio: string; cajaCodigo: string; monto: number }>>((acc, x) => {
          const g = (acc[x.folio!] ??= { folio: x.folio!, cajaCodigo: x.cajaCodigo, monto: 0 });
          g.monto = Math.round((g.monto + x.monto) * 100) / 100;
          return acc;
        }, {}),
    );

  async function leerPlanilla(campo: "id" | "movimiento_id", valor: string): Promise<Planilla | null> {
    const { data, error } = await sb
      .from("planillas")
      .select("id, empresa_id, movimiento_id, serie, numero, fecha_emision, movimientos(caja_id), planilla_filas(*)")
      .eq(campo, valor)
      .maybeSingle();
    if (error || !data) return null;
    const filas = [...data.planilla_filas]
      .sort((a, b) => a.orden - b.orden)
      .map((f) => ({
        fecha: f.fecha,
        trabajador: f.trabajador,
        dni: f.dni,
        motivo: f.motivo as FilaPlanilla["motivo"],
        origen: f.origen,
        destino: f.destino,
        importe: Number(f.importe),
        tipo: f.tipo as FilaPlanilla["tipo"],
      }));
    return {
      id: data.id,
      empresaId: data.empresa_id,
      movimientoId: data.movimiento_id,
      cajaId: (data.movimientos as unknown as { caja_id: string }).caja_id,
      serie: data.serie,
      numero: data.numero,
      fechaEmision: data.fecha_emision,
      filas,
      total: Math.round(filas.reduce((t, f) => t + f.importe, 0) * 100) / 100,
    };
  }

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
    // Solo consulta ve todas las cajas (migración 20261116000000); sin ella, solo las que se le marquen.
    if ("es_consulta" in actual) (cambios as Record<string, unknown>).es_consulta = esSoloConsulta(d);
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
        .select("*") // ruc y tope_planilla_dia solo existen con la migración 20261103000000
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
        ruc: e.ruc ?? null,
        topePlanillaDia: Number((e as { tope_planilla_dia?: number | null }).tope_planilla_dia ?? 40),
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
      if (m.pago) {
        if (!(await hayPagos())) throw new ErrorDeNegocio("Falta correr en Supabase la migración 20261102000000 (pagos con varias salidas)");
        if (m.pago.nuevo) {
          const { error: errPago } = await sb.from("pagos").insert({
            id: m.pago.id,
            caja_id: m.cajaId,
            monto: m.pago.monto,
            medio_pago: m.medioPago,
            operacion: m.operacionPago,
            fecha: m.fecha,
          });
          if (errPago?.code === "23505") throw new ErrorDeNegocio("Ese pago ya se registró");
          fallo(errPago, "Registrar pago");
        }
        fila.pago_id = m.pago.id;
      }
      if (m.observaciones) {
        if (!(await hayObservaciones())) throw new ErrorDeNegocio("Falta correr en Supabase la migración 20261115000000 (observaciones)");
        (fila as Record<string, unknown>).observaciones = m.observaciones;
      }
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
        .select(await columnasMovimiento(), { count: "exact" })
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
      const pagos = await infoPagos(data);
      return { movimientos: data.map((m) => aMovimiento(m, pagos)), total: count ?? data.length };
    },

    async obtenerMovimiento(id) {
      const { data, error } = await sb
        .from("movimientos")
        .select(
          `${await columnasMovimiento()}, proveedor_id, motivo_anulacion, liquidaciones(id, folio, estado), ` +
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
        ...aMovimiento(data, await infoPagos([data])),
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
      const columnas = await columnasMovimiento();
      const [movs, recs, anterior] = await Promise.all([
        sb
          .from("movimientos")
          .select(columnas)
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
      const pagosLiq = await infoPagos(movs.data);
      return {
        ...liq,
        folioAnterior: anterior.data?.folio ?? null,
        movimientos: movs.data.map((m) => aMovimiento(m, pagosLiq)),
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
      // La BD cerró la caja y abrió la siguiente (migración 20261114000000).
      const sig = await sb
        .from("cajas")
        .select("siguiente:siguiente_id(id, numero, area, empresas(codigo))")
        .eq("id", cajaId)
        .maybeSingle()
        .overrideTypes<{ siguiente: { id: string; numero: number; area: string; empresas: { codigo: string } } | null }, { merge: false }>();
      const n = sig.error ? null : sig.data?.siguiente;
      return {
        folio: data.folio,
        cajaNueva: n ? { id: n.id, codigo: codigoCaja({ empresaCodigo: n.empresas.codigo as CodigoEmpresa, area: n.area, numero: n.numero }) } : null,
      };
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

    async traspasarCaja(anteriorId, nuevaId) {
      const { data, error } = await sb.rpc("traspasar_caja", { p_anterior: anteriorId, p_nueva: nuevaId });
      if (error?.code === "PGRST202") throw new ErrorDeNegocio("Falta correr en Supabase la migración 20261027000000 (saldo de caja anterior)");
      if (error?.code === "42501") throw new ErrorDeNegocio("Solo tesorería puede pasar el saldo de una caja");
      if (error?.code === "22023" || error?.code === "P0002") throw new ErrorDeNegocio(error.message);
      falloNegocio(error, "Pasar saldo de la caja anterior");
      return Number(data);
    },

    async obtenerPago(id) {
      if (!(await hayPagos())) return null;
      const [pago, salidas, devs, conLiq, caja] = await Promise.all([
        sb.from("v_pagos").select("*").eq("id", id).maybeSingle(),
        sb
          .from("movimientos")
          .select(await columnasMovimiento())
          .eq("pago_id", id)
          .order("created_at")
          .overrideTypes<FilaMovimiento[], { merge: false }>(),
        // "*": `tipo` llegó con la migración 20261111000000.
        sb.from("devoluciones").select("*").eq("pago_id", id).order("created_at"),
        salidasConLiquidacion([id]),
        sb
          .from("pagos")
          .select("cajas(empresa_id, numero, area, empresas(codigo))")
          .eq("id", id)
          .maybeSingle()
          .overrideTypes<{ cajas: { empresa_id: string; numero: number; area: string; empresas: { codigo: string } } }, { merge: false }>(),
      ]);
      fallo(caja.error, "Caja del pago");
      fallo(pago.error, "Pago");
      fallo(salidas.error, "Salidas del pago");
      fallo(devs.error, "Devoluciones");
      const p = pago.data;
      if (!p) return null;
      const info = new Map([[id, { falta: Number(p.falta), tieneConstancia: !!p.tiene_constancia }]]);
      const c = caja.data?.cajas;
      return separarLiquidadoAntes({
        id,
        cajaId: p.caja_id!,
        cajaCodigo: c ? codigoCaja({ empresaCodigo: c.empresas.codigo as CodigoEmpresa, area: c.area, numero: c.numero }) : "",
        empresaId: c?.empresa_id ?? "",
        monto: Number(p.monto),
        medioPago: p.medio_pago,
        operacion: p.operacion,
        fecha: p.fecha!,
        sustentado: Number(p.sustentado),
        devuelto: Number(p.devuelto),
        falta: Number(p.falta),
        tieneConstancia: !!p.tiene_constancia,
        salidas: salidas.data.map((m) => aMovimiento(m, info)),
        devoluciones: devs.data.map((d) => ({
          id: d.id,
          pagoId: d.pago_id,
          tipo: ((d as { tipo?: string }).tipo === "liquidado_antes" ? "liquidado_antes" : "devolucion") as TipoDevolucion,
          monto: Number(d.monto),
          motivo: d.motivo,
          fecha: d.fecha,
          conFoto: !!d.comprobante_path,
        })),
        yaLiquidado: agruparLiquidado(conLiq),
      });
    },

    async vincularAPago(pagoId, movimientoId) {
      const { error } = await sb.rpc("vincular_a_pago", { p_pago: pagoId, p_movimiento: movimientoId });
      falloRpc(error, "Juntar al pago", "20261112000000_arreglo_pagos_anteriores");
    },

    async convertirEnPago(movimientoId, monto) {
      const { data, error } = await sb.rpc("convertir_en_pago", { p_movimiento: movimientoId, p_monto: monto });
      falloRpc(error, "Convertir en pago", "20261112000000_arreglo_pagos_anteriores");
      return data as string;
    },

    async listarAnteriores(empresaId, desde) {
      if (!(await hayPagos())) return { pagos: [], gastos: [] };
      const cajas = await sb
        .from("cajas")
        .select("id, numero, area, empresas(codigo)")
        .eq("empresa_id", empresaId)
        .overrideTypes<{ id: string; numero: number; area: string; empresas: { codigo: string } }[], { merge: false }>();
      fallo(cajas.error, "Cajas");
      const codigo = new Map(
        cajas.data.map((c) => [c.id, codigoCaja({ empresaCodigo: c.empresas.codigo as CodigoEmpresa, area: c.area, numero: c.numero })]),
      );
      const ids = [...codigo.keys()];
      if (!ids.length) return { pagos: [], gastos: [] };
      const [pagos, gastos] = await Promise.all([
        sb.from("v_pagos").select("*").in("caja_id", ids).gt("falta", 0).order("fecha", { ascending: false }).limit(40),
        sb
          .from("movimientos")
          .select("id, caja_id, fecha, detalle, monto, medio_pago, proveedores(razon_social), liquidaciones(folio, estado)")
          .in("caja_id", ids)
          .is("pago_id", null)
          .eq("anulado", false)
          .gte("fecha", desde)
          .order("fecha", { ascending: false })
          .limit(60)
          .overrideTypes<
            {
              id: string;
              caja_id: string;
              fecha: string;
              detalle: string;
              monto: number;
              medio_pago: MedioPago | null;
              proveedores: { razon_social: string } | null;
              liquidaciones: { folio: string; estado: EstadoLiquidacion } | null;
            }[],
            { merge: false }
          >(),
      ]);
      fallo(pagos.error, "Pagos");
      fallo(gastos.error, "Gastos");
      const [salidas, deEmpresa] = await Promise.all([
        salidasConLiquidacion(pagos.data.map((p) => p.id!)),
        // También los gastos de cajas anteriores que el registrador ya no ve (migración 20261112000000).
        sb.rpc("fx_gastos_sin_pago", { p_empresa: empresaId, p_desde: desde }),
      ]);
      const empresaCodigo = cajas.data[0]?.empresas.codigo as CodigoEmpresa;
      const listaGastos = deEmpresa.error
        ? gastos.data.map((m) => ({
            id: m.id,
            cajaId: m.caja_id,
            cajaCodigo: codigo.get(m.caja_id) ?? "",
            fecha: m.fecha,
            detalle: m.detalle,
            proveedor: m.proveedores?.razon_social ?? null,
            monto: Number(m.monto),
            medioPago: m.medio_pago,
            folio: m.liquidaciones?.folio ?? null,
            liquidado: !!m.liquidaciones && m.liquidaciones.estado !== "abierta" && m.liquidaciones.estado !== "observada",
          }))
        : deEmpresa.data.map((m) => ({
            id: m.id,
            cajaId: m.caja_id,
            cajaCodigo: codigoCaja({ empresaCodigo, area: m.area, numero: m.numero }),
            fecha: m.fecha,
            detalle: m.detalle,
            proveedor: m.proveedor,
            monto: Number(m.monto),
            medioPago: m.medio_pago,
            folio: m.folio,
            liquidado: !!m.estado_liquidacion && m.estado_liquidacion !== "abierta" && m.estado_liquidacion !== "observada",
          }));
      return {
        pagos: pagos.data.map((p) => ({
          id: p.id!,
          cajaId: p.caja_id!,
          cajaCodigo: codigo.get(p.caja_id!) ?? "",
          fecha: p.fecha!,
          monto: Number(p.monto),
          medioPago: p.medio_pago,
          operacion: p.operacion,
          sustentado: Number(p.sustentado),
          falta: Number(p.falta),
          salidas: salidas.filter((x) => x.pagoId === p.id).map(({ detalle, monto, folio, liquidado }) => ({ detalle, monto, folio, liquidado })),
        })),
        gastos: listaGastos,
      };
    },

    async registrarDevolucion(d) {
      const { error } = await sb.from("devoluciones").insert({
        pago_id: d.pagoId,
        monto: d.monto,
        motivo: d.motivo,
        ...(d.tipo === "liquidado_antes" ? { tipo: d.tipo } : {}),
        comprobante_path: d.comprobantePath,
        comprobante_mime: d.comprobanteMime,
      });
      if (error?.code === "42501") throw new ErrorDeNegocio("No tienes permiso para registrar devoluciones en esta caja");
      falloNegocio(error, "Registrar devolución");
    },

    async listarTrabajadores(empresaId) {
      const { data, error } = await sb
        .from("trabajadores")
        .select("nombre, dni")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre");
      if (error) return []; // sin la migración 20261103000000
      return data;
    },

    async siguientePlanilla(empresaId) {
      const { data, error } = await sb
        .from("planillas")
        .select("serie, numero")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error || !data.length) return null;
      const { serie } = data[0]!;
      const { data: max } = await sb
        .from("planillas")
        .select("numero")
        .eq("empresa_id", empresaId)
        .eq("serie", serie)
        .order("numero", { ascending: false })
        .limit(1);
      return { serie, numero: (max?.[0]?.numero ?? 0) + 1 };
    },

    async gastosPlanillaDia(empresaId, desde) {
      const { data, error } = await sb
        .from("planilla_filas")
        .select("fecha, trabajador, dni, importe, planillas!inner(empresa_id, movimientos!inner(anulado))")
        .eq("planillas.empresa_id", empresaId)
        .eq("planillas.movimientos.anulado", false)
        .gte("fecha", desde);
      if (error) return [];
      const sumas = new Map<string, GastoPlanillaDia>();
      for (const f of data) {
        const clave = claveTrabajador(f.trabajador, f.dni);
        const k = `${clave}|${f.fecha}`;
        const s = sumas.get(k) ?? { clave, fecha: f.fecha, total: 0 };
        s.total = Math.round((s.total + Number(f.importe)) * 100) / 100;
        sumas.set(k, s);
      }
      return [...sumas.values()];
    },

    async crearPlanilla(p) {
      const { data, error } = await sb.rpc("crear_planilla", {
        p_movimiento: p.movimientoId,
        p_caja: p.cajaId,
        p_categoria: p.categoriaId as string,
        p_centro_costo: p.centroCostoId as string,
        p_solicitante: p.solicitante as string,
        p_serie: p.serie,
        p_numero: p.numero,
        p_fecha_emision: p.fechaEmision,
        p_pago: p.pagoId as string,
        p_filas: p.filas as unknown as Json,
      });
      if (error?.code === "PGRST202") throw new ErrorDeNegocio("Falta correr en Supabase la migración 20261103000000 (planillas de movilidad)");
      if (error?.code === "P0001") throw new ErrorDeNegocio(error.message);
      if (error?.code === "42501") throw new ErrorDeNegocio("No tienes permiso para registrar en esta caja");
      falloNegocio(error, "Crear planilla");
      // Planilla suelta pagada con Yape, transferencia…: el medio y la operación (crear_planilla la deja en efectivo).
      if (!p.pagoId && p.medioPago && p.medioPago !== "efectivo") {
        const { error: errMedio } = await sb
          .from("movimientos")
          .update({ medio_pago: p.medioPago, operacion_pago: p.operacionPago ?? null })
          .eq("id", p.movimientoId);
        falloNegocio(errMedio, "Medio de pago de la planilla");
      }
      await guardarObservaciones(p.movimientoId, p.observaciones || undefined);
      return data as string;
    },

    async corregirMovimiento(c) {
      const { error } = await sb.rpc("corregir_movimiento", {
        p_id: c.id,
        p_original: c.originalId,
        p_caja: c.cajaId,
        p_monto_correcto: c.montoCorrecto,
        p_serie_numero: c.serieNumero as string,
        p_motivo: c.motivo,
      });
      falloRpc(error, "Corregir gasto", "20261117000000_corregir_gasto_liquidado");
    },

    async listarCorrecciones(originalIds) {
      if (!originalIds.length || !(await hayCorrecciones())) return [];
      const { data, error } = await sb
        .from("movimientos")
        .select("id, corrige_id, monto, detalle, serie_numero, observaciones, anulado, liquidaciones(folio)")
        .in("corrige_id" as "id", originalIds)
        .order("created_at")
        .overrideTypes<
          {
            id: string;
            corrige_id: string;
            monto: number;
            detalle: string;
            serie_numero: string | null;
            observaciones: string | null;
            anulado: boolean;
            liquidaciones: { folio: string };
          }[],
          { merge: false }
        >();
      fallo(error, "Correcciones");
      return data.map((m) => ({
        id: m.id,
        originalId: m.corrige_id,
        serieNumero: m.serie_numero,
        motivo: m.observaciones,
        monto: Number(m.monto),
        detalle: m.detalle,
        folio: m.liquidaciones.folio,
        anulado: m.anulado,
      }));
    },

    async actualizarObservaciones(id, texto) {
      await guardarObservaciones(id, texto);
    },

    async obtenerPlanilla(id) {
      return leerPlanilla("id", id);
    },

    async obtenerPlanillaDeMovimiento(movimientoId) {
      return leerPlanilla("movimiento_id", movimientoId);
    },

    async agregarAdjuntos(movimientoId, adjuntos) {
      const { error } = await sb.from("adjuntos").insert(
        adjuntos.map((a) => ({
          movimiento_id: movimientoId,
          tipo: a.tipo,
          storage_path: a.storagePath,
          mime_type: a.mimeType,
          tamano_bytes: a.tamanoBytes,
          almacen: a.storagePath.startsWith("drive:") ? "drive" : "supabase",
          nombre_archivo: a.nombreArchivo ?? null,
        })),
      );
      falloNegocio(error, "Adjuntar archivo");
    },

    async archivosParaExcel(movimientoIds, recargaIds) {
      if (!movimientoIds.length && !recargaIds.length) return { adjuntos: [], recargas: [] };
      const conPagos = await hayPagos();
      const [propios, recs] = await Promise.all([
        movimientoIds.length
          ? sb
              .from("adjuntos")
              .select(conPagos ? "id, movimiento_id, tipo, storage_path, movimientos(pago_id)" : "id, movimiento_id, tipo, storage_path")
              .in("movimiento_id", movimientoIds)
              .overrideTypes<{ id: string; movimiento_id: string; tipo: TipoAdjunto; storage_path: string; movimientos?: { pago_id: string | null } }[], { merge: false }>()
          : { data: [], error: null },
        recargaIds.length
          ? sb.from("recargas").select("id, comprobante_path").in("id", recargaIds).not("comprobante_path", "is", null)
          : { data: [], error: null },
      ]);
      fallo(propios.error, "Archivos");
      const adjuntos = (propios.data ?? []).map((a) => ({
        id: a.id,
        movimientoId: a.movimiento_id,
        pagoId: a.movimientos?.pago_id ?? null,
        tipo: a.tipo,
        storagePath: a.storage_path,
      }));
      // La constancia de un pago con varias salidas puede estar en otra salida.
      if (conPagos) {
        const { data: movs } = await sb.from("movimientos").select("pago_id").in("id", movimientoIds).not("pago_id", "is", null);
        const pagoIds = [...new Set((movs ?? []).map((m) => m.pago_id!))];
        if (pagoIds.length) {
          const { data: hermanos } = await sb
            .from("adjuntos")
            .select("id, movimiento_id, tipo, storage_path, movimientos!inner(pago_id)")
            .eq("tipo", "pago")
            .in("movimientos.pago_id", pagoIds)
            .overrideTypes<{ id: string; movimiento_id: string; tipo: TipoAdjunto; storage_path: string; movimientos: { pago_id: string } }[], { merge: false }>();
          for (const a of hermanos ?? [])
            if (!adjuntos.some((x) => x.id === a.id))
              adjuntos.push({ id: a.id, movimientoId: a.movimiento_id, pagoId: a.movimientos.pago_id, tipo: a.tipo, storagePath: a.storage_path });
        }
      }
      return {
        adjuntos,
        recargas: ((recs.data ?? []) as { id: string; comprobante_path: string | null }[]).map((r) => ({ id: r.id, storagePath: r.comprobante_path! })),
      };
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
