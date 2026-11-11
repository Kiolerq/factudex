"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  EsquemaAdjuntarCompartido,
  EsquemaAnular,
  EsquemaAbrirCaja,
  EsquemaDevolucion,
  EsquemaPlanilla,
  EsquemaArea,
  EsquemaFotoIngreso,
  EsquemaCaja,
  EsquemaCambiosUsuario,
  EsquemaGenerarLiquidacion,
  EsquemaCompletarMovimiento,
  EsquemaContrasena,
  EsquemaNuevoUsuario,
  EsquemaNuevaRecarga,
  EsquemaNuevoMovimiento,
  EsquemaNuevoProveedor,
  EsquemaRevision,
  erroresPorCampo,
  type EntradaAdjuntarCompartido,
  type EntradaAbrirCaja,
  type EntradaDevolucion,
  type EntradaPlanilla,
  type EntradaArea,
  type EntradaCaja,
  type EntradaCambiosUsuario,
  type EntradaNuevoUsuario,
  type EntradaCompletar,
  type EntradaMovimiento,
  type EntradaRecarga,
  EsquemaAdjunto,
} from "@/lib/datos/esquemas";
import { ErrorDeNegocio, modoDemo, obtenerRepositorio, type Repositorio } from "@/lib/datos/repositorio";
import { codigoCaja, esSoloTesoreria } from "@/lib/datos/tipos";
import type {
  AdjuntoSubido,
  EstadoMovimiento,
  MedioPago,
  MovimientoResumen,
  NuevoProveedor,
  Opcion,
  Proveedor,
  Pago,
  TipoDocumento,
  Usuario,
} from "@/lib/datos/tipos";
import { COOKIE_CAJA } from "@/lib/seleccion";
import { createClient } from "@/lib/supabase/server";
import { asegurarCarpeta, driveConfigurado, iniciarSubida, metadatos } from "@/lib/drive/google";
import { headers } from "next/headers";
import type { TipoAdjunto } from "@/lib/datos/tipos";
import { MIME_PERMITIDOS } from "@/lib/datos/tipos";
import { TAMANO_MAXIMO } from "@/lib/datos/esquemas";
import { z } from "zod";
import { almacenActivo } from "@/lib/drive/estado";
import { planillaPdf } from "@/lib/exportar/planillaPdf";
import { nuevoUuid } from "@/lib/uuid";

// Toda acción verifica sesión: las Server Actions son invocables por POST directo.
async function repoAutenticado() {
  const repo = await obtenerRepositorio();
  if (!(await repo.usuarioActual())) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  return repo;
}

/** Registrar, sustentar y liquidar gastos es del registrador (y del admin), no de tesorería. */
async function repoRegistrador() {
  const repo = await obtenerRepositorio();
  const yo = await repo.usuarioActual();
  if (!yo) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  if (esSoloTesoreria(yo)) throw new Error("Tesorería no registra gastos ni genera liquidaciones: lo hace el registrador de la caja.");
  return repo;
}

export async function seleccionarCaja(cajaId: string) {
  const repo = await repoAutenticado();
  const cajas = await repo.listarCajas();
  if (!cajas.some((c) => c.id === cajaId)) return;
  (await cookies()).set(COOKIE_CAJA, cajaId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export async function buscarProveedores(texto: string): Promise<Proveedor[]> {
  if (texto.trim().length < 2) return [];
  const repo = await repoAutenticado();
  return repo.buscarProveedores(texto.slice(0, 60));
}

export type ResultadoProveedor =
  | { ok: true; proveedor: Proveedor }
  | { ok: false; errores: Record<string, string> };

export async function crearProveedor(entrada: NuevoProveedor): Promise<ResultadoProveedor> {
  const datos = EsquemaNuevoProveedor.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoAutenticado();
  try {
    return { ok: true, proveedor: await repo.crearProveedor(datos.data) };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { numDoc: e.message } };
    throw e;
  }
}

/**
 * Los archivos solo pueden ser de este movimiento: en Storage, su carpeta; en Drive, un archivo
 * creado por la app con las marcas (appProperties) de este movimiento y caja. Devuelve el error o null.
 */
async function verificarAdjuntos(cajaId: string, movimientoId: string, adjuntos: AdjuntoSubido[]) {
  if (modoDemo()) return null;
  const prefijo = `${cajaId}/${movimientoId}/`;
  for (const a of adjuntos) {
    if (a.storagePath.startsWith("drive:")) {
      const meta = await metadatos(a.storagePath.slice(6)).catch(() => null);
      const p = meta?.appProperties;
      if (!meta || p?.movimientoId !== movimientoId || p?.cajaId !== cajaId || p?.tipo !== a.tipo) {
        return "No se pudo verificar el archivo en Google Drive";
      }
      a.tamanoBytes = Number(meta.size ?? a.tamanoBytes);
      a.nombreArchivo = meta.name;
    } else if (!a.storagePath.startsWith(prefijo)) {
      return "Ruta de archivo inválida";
    }
  }
  return null;
}

/** Centro de costo escrito en el registro que no estaba en la lista: se agrega a la de la empresa. */
export async function crearCentroCosto(entrada: {
  empresaId: string;
  nombre: string;
}): Promise<{ ok: true; centro: Opcion } | { ok: false; error: string }> {
  const datos = z
    .object({
      empresaId: z.uuid(),
      nombre: z
        .string()
        .trim()
        .transform((s) => s.replace(/\s+/g, " "))
        .pipe(z.string().min(2, "Escribe al menos 2 caracteres").max(60, "Máximo 60 caracteres")),
    })
    .safeParse(entrada);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]!.message };
  const repo = await repoAutenticado();
  try {
    const centro = await repo.crearCentroCosto(datos.data.empresaId, datos.data.nombre);
    revalidatePath("/registro");
    return { ok: true, centro };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

export type ResultadoMovimiento =
  | { ok: true; id: string; estado: EstadoMovimiento; pago: Pago | null }
  | { ok: false; errores: Record<string, string> };

export async function registrarMovimiento(entrada: EntradaMovimiento): Promise<ResultadoMovimiento> {
  const datos = EsquemaNuevoMovimiento.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const { sinDocumento: _, ...movimiento } = datos.data;

  const errorArchivos = await verificarAdjuntos(movimiento.cajaId, movimiento.id, movimiento.adjuntos);
  if (errorArchivos) return { ok: false, errores: { _: errorArchivos } };

  const repo = await repoRegistrador();
  try {
    const r = await repo.registrarMovimiento(movimiento);
    revalidatePath("/", "layout");
    // Parte de un pago con varias salidas: cuánto falta, para ofrecer la siguiente salida.
    const pago = movimiento.pago ? await repo.obtenerPago(movimiento.pago.id) : null;
    const estado = pago?.salidas.find((s) => s.id === r.id)?.estado ?? r.estado;
    return { ok: true, id: r.id, estado, pago };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
}

export type Resultado = { ok: true } | { ok: false; errores: Record<string, string> };

/** Ejecuta una operación del repositorio: los errores de negocio se muestran al usuario. */
async function ejecutar(operacion: () => Promise<unknown>): Promise<Resultado> {
  try {
    await operacion();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
}

/** Completa un pendiente: datos del documento y los archivos que faltaban (ya subidos por el navegador). */
export async function completarMovimiento(
  entrada: EntradaCompletar,
): Promise<{ ok: true; estado: EstadoMovimiento } | { ok: false; errores: Record<string, string> }> {
  const datos = EsquemaCompletarMovimiento.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoRegistrador();
  const actual = await repo.obtenerMovimiento(datos.data.id); // con RLS: si no lo ve, no existe
  if (!actual) return { ok: false, errores: { _: "El movimiento no existe" } };
  if (actual.anulado) return { ok: false, errores: { _: "El movimiento está anulado" } };

  const errorArchivos = await verificarAdjuntos(actual.cajaId, actual.id, datos.data.adjuntos);
  if (errorArchivos) return { ok: false, errores: { _: errorArchivos } };
  try {
    const estado = await repo.completarMovimiento(datos.data);
    revalidatePath("/", "layout");
    return { ok: true, estado };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
}

/** Pendientes de estas cajas (las del registro), para juntarles un archivo compartido. */
export async function pendientesParaAdjuntar(cajaIds: string[]): Promise<MovimientoResumen[]> {
  const ids = z.array(z.uuid()).max(100).safeParse(cajaIds);
  if (!ids.success) return [];
  const repo = await repoRegistrador();
  const { movimientos } = await repo.listarMovimientos({ cajaIds: ids.data, estado: "pendiente", texto: "", limite: 300 });
  return movimientos;
}

/**
 * Junta a un gasto pendiente el archivo compartido (ya subido por el navegador). Lo leído por la
 * IA solo llena lo que estaba vacío: tipo y N° de documento, proveedor, medio y N° de operación.
 */
export async function adjuntarCompartido(
  entrada: EntradaAdjuntarCompartido,
): Promise<{ ok: true; estado: EstadoMovimiento } | { ok: false; error: string }> {
  const datos = EsquemaAdjuntarCompartido.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Datos inválidos" };
  const { id, tipo, subtipo, adjunto, leido } = datos.data;
  const repo = await repoRegistrador();
  const m = await repo.obtenerMovimiento(id); // con RLS: si no lo ve, no existe
  if (!m || m.anulado) return { ok: false, error: "El gasto no existe o está anulado" };

  const errorArchivos = await verificarAdjuntos(m.cajaId, m.id, [adjunto]);
  if (errorArchivos) return { ok: false, error: errorArchivos };

  let proveedorId = m.proveedorId;
  if (!proveedorId && tipo === "documento" && leido?.numDoc) {
    proveedorId = (await repo.buscarProveedores(leido.numDoc)).find((p) => p.numDoc === leido.numDoc)?.id ?? null;
  }
  // El medio de pago solo cambia mientras la liquidación siga abierta u observada.
  const medioEditable = m.liquidacion.estado === "abierta" || m.liquidacion.estado === "observada";
  const medioPago = m.medioPago ?? (tipo === "pago" && medioEditable ? (subtipo as MedioPago) : null);

  try {
    const estado = await repo.completarMovimiento({
      id,
      proveedorId,
      tipoDocumento: m.tipoDocumento ?? (tipo === "documento" ? (subtipo as TipoDocumento) : null),
      serieNumero: m.serieNumero ?? (tipo === "documento" ? (leido?.serieNumero ?? null) : null),
      medioPago,
      operacionPago: m.operacionPago ?? (tipo === "pago" && medioPago !== "efectivo" ? (leido?.operacion ?? null) : null),
      adjuntos: [adjunto],
    });
    revalidatePath("/", "layout");
    return { ok: true, estado };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, error: e.message };
    throw e;
  }
}

export async function anularMovimiento(entrada: { id: string; motivo: string }): Promise<Resultado> {
  const datos = EsquemaAnular.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoAutenticado();
  return ejecutar(() => repo.anularMovimiento(datos.data.id, datos.data.motivo));
}

export async function cerrarLiquidacion(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, errores: { _: "Liquidación inválida" } };
  const repo = await repoRegistrador();
  return ejecutar(() => repo.cerrarLiquidacion(id));
}

/** Liquida una caja por rango de fechas: entran sus gastos completos del rango, menos los desmarcados. */
export async function generarLiquidacion(entrada: {
  cajaId: string;
  desde: string;
  hasta: string;
  excluir: string[];
}): Promise<
  { ok: true; folio: string; cajaNueva: { id: string; codigo: string } | null } | { ok: false; errores: Record<string, string> }
> {
  const datos = EsquemaGenerarLiquidacion.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoRegistrador();
  const { cajaId, desde, hasta, excluir } = datos.data;
  try {
    const { folio, cajaNueva } = await repo.generarLiquidacion(cajaId, desde, hasta, excluir);
    // La caja se cerró: el HUD pasa a la nueva.
    if (cajaNueva) (await cookies()).set(COOKIE_CAJA, cajaNueva.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return { ok: true, folio, cajaNueva };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
}

export async function revisarLiquidacion(entrada: {
  id: string;
  aprobar: boolean;
  observaciones: string | null;
}): Promise<Resultado> {
  const datos = EsquemaRevision.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoAutenticado();
  return ejecutar(() => repo.revisarLiquidacion(datos.data.id, datos.data.aprobar, datos.data.observaciones));
}

export async function registrarRecarga(
  entrada: EntradaRecarga,
): Promise<{ ok: true; id: string } | { ok: false; errores: Record<string, string> }> {
  const datos = EsquemaNuevaRecarga.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoTesoreria();
  try {
    const id = await repo.registrarRecarga(datos.data);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
}

/** Pago con varias salidas (para seguir agregando salidas desde Registro). */
export async function leerPago(id: string): Promise<Pago | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const repo = await repoAutenticado();
  return repo.obtenerPago(id);
}

/** Devolución de lo que sobró de un pago: la foto ya la subió el navegador. */
export async function registrarDevolucion(entrada: EntradaDevolucion): Promise<Resultado> {
  const datos = EsquemaDevolucion.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoRegistrador();
  const pago = await repo.obtenerPago(datos.data.pagoId);
  if (!pago) return { ok: false, errores: { _: "El pago no existe" } };
  if (datos.data.monto - pago.falta > 0.001)
    return { ok: false, errores: { monto: `Solo falta cuadrar S/ ${pago.falta.toFixed(2)}` } };
  return ejecutar(() => repo.registrarDevolucion(datos.data));
}

/**
 * "Este pago cubrió más gastos": un gasto ya registrado (aunque esté liquidado, ej. en la caja
 * anterior) pasa a ser la primera salida de un pago mayor, para sustentar el resto después.
 */
export async function convertirEnPago(
  movimientoId: string,
  monto: number,
): Promise<{ ok: true; pagoId: string } | { ok: false; errores: Record<string, string> }> {
  const datos = z
    .object({
      movimientoId: z.uuid(),
      monto: z
        .number("Ingresa el monto total del pago")
        .positive("El monto debe ser mayor a 0")
        .max(100000, "Monto demasiado alto")
        .refine((m) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-6, "Máximo 2 decimales"),
    })
    .safeParse({ movimientoId, monto });
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoRegistrador();
  try {
    const pagoId = await repo.convertirEnPago(datos.data.movimientoId, datos.data.monto);
    revalidatePath("/", "layout");
    return { ok: true, pagoId };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { monto: e.message } };
    throw e;
  }
}

/** "Lo que falta ya se liquidó en una caja anterior": junta al pago ese gasto ya registrado. */
export async function vincularAPago(pagoId: string, movimientoId: string): Promise<Resultado> {
  const datos = z.object({ pagoId: z.uuid(), movimientoId: z.uuid() }).safeParse({ pagoId, movimientoId });
  if (!datos.success) return { ok: false, errores: { _: "Datos inválidos" } };
  const repo = await repoRegistrador();
  return ejecutar(() => repo.vincularAPago(datos.data.pagoId, datos.data.movimientoId));
}

/** Observaciones de un gasto (para quién fue y el motivo), mientras su liquidación siga abierta u observada. */
export async function actualizarObservaciones(id: string, texto: string): Promise<Resultado> {
  const datos = z
    .object({ id: z.uuid(), texto: z.string().trim().max(300, "Máximo 300 caracteres") })
    .safeParse({ id, texto });
  if (!datos.success) return { ok: false, errores: { observaciones: datos.error.issues[0]!.message } };
  const repo = await repoRegistrador();
  const m = await repo.obtenerMovimiento(datos.data.id);
  if (!m) return { ok: false, errores: { _: "El gasto no existe" } };
  if (!(await repo.permisosCaja(m.cajaId)).registrar) return { ok: false, errores: { _: "No puedes editar este gasto" } };
  if (m.liquidacion.estado !== "abierta" && m.liquidacion.estado !== "observada")
    return { ok: false, errores: { _: `La liquidación ${m.liquidacion.folio} ya se envió: no se puede cambiar` } };
  return ejecutar(() => repo.actualizarObservaciones(datos.data.id, datos.data.texto || null));
}

// --- Planilla de movilidad ---

/**
 * Crea la planilla (gasto + planilla + filas, todo o nada) y le adjunta su PDF, generado en el
 * servidor. Si el PDF no se pudo subir, la planilla igual queda guardada (pendiente de documento).
 */
export async function crearPlanilla(
  entrada: EntradaPlanilla,
): Promise<
  | { ok: true; planillaId: string; movimientoId: string; estado: EstadoMovimiento; aviso: string | null; pago: Pago | null }
  | { ok: false; errores: Record<string, string> }
> {
  const datos = EsquemaPlanilla.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoRegistrador();
  const d = datos.data;
  if (d.pagoId) {
    const pago = await repo.obtenerPago(d.pagoId);
    if (!pago) return { ok: false, errores: { _: "El pago no existe" } };
  }
  // Planilla suelta pagada con Yape u otro: la constancia ya la subió el navegador.
  const adjuntoPago = !d.pagoId && d.medioPago && d.medioPago !== "efectivo" ? d.adjuntoPago : null;
  if (adjuntoPago) {
    const errorArchivo = await verificarAdjuntos(d.cajaId, d.movimientoId, [adjuntoPago]);
    if (errorArchivo) return { ok: false, errores: { adjuntoPago: errorArchivo } };
  }
  let planillaId: string;
  try {
    planillaId = await repo.crearPlanilla(d);
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
  if (adjuntoPago) await repo.agregarAdjuntos(d.movimientoId, [adjuntoPago]);
  const aviso = await adjuntarPdf(repo, planillaId);
  revalidatePath("/", "layout");
  const [mov, pago] = await Promise.all([
    repo.obtenerMovimiento(d.movimientoId),
    d.pagoId ? repo.obtenerPago(d.pagoId) : null,
  ]);
  return { ok: true, planillaId, movimientoId: d.movimientoId, estado: mov?.estado ?? "pendiente", aviso, pago };
}

/** Vuelve a generar y adjuntar el PDF de una planilla (si la primera vez falló la subida). */
export async function readjuntarPdfPlanilla(planillaId: string): Promise<Resultado> {
  if (!z.uuid().safeParse(planillaId).success) return { ok: false, errores: { _: "Planilla inválida" } };
  const repo = await repoRegistrador();
  const aviso = await adjuntarPdf(repo, planillaId);
  revalidatePath("/", "layout");
  return aviso ? { ok: false, errores: { _: aviso } } : { ok: true };
}

/** Genera el PDF de la planilla y lo sube (Drive o Storage) como documento del gasto. Devuelve el error, si hubo. */
async function adjuntarPdf(repo: Repositorio, planillaId: string): Promise<string | null> {
  try {
    const p = await repo.obtenerPlanilla(planillaId);
    if (!p) return "No se encontró la planilla";
    const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
    const empresa = empresas.find((e) => e.id === p.empresaId);
    const caja = cajas.find((c) => c.id === p.cajaId);
    if (!empresa || !caja) return "No se encontró la caja de la planilla";
    const bytes = await planillaPdf(p, empresa);
    const nombre = `${p.fechaEmision}_Planilla movilidad ${p.serie}-${p.numero}_S-${p.total.toFixed(2)}.pdf`;
    const almacen = await almacenActivo();
    let storagePath: string;
    if (almacen === "drive") {
      const carpetaId = await asegurarCarpeta([
        empresa.nombreCorto,
        `Caja ${String(caja.numero).padStart(2, "0")} - ${caja.nombre}`,
        p.fechaEmision.slice(0, 7),
      ]);
      const h = await headers();
      const url = await iniciarSubida({
        nombre,
        mime: "application/pdf",
        tamano: bytes.length,
        carpetaId,
        origen: h.get("origin") ?? `https://${h.get("host")}`,
        propiedades: { movimientoId: p.movimientoId, cajaId: p.cajaId, tipo: "documento" },
      });
      const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: Buffer.from(bytes) });
      if (!r.ok) return `No se pudo subir el PDF a Google Drive (${r.status})`;
      storagePath = `drive:${((await r.json()) as { id: string }).id}`;
    } else {
      storagePath = `${p.cajaId}/${p.movimientoId}/${nuevoUuid()}.pdf`;
      if (almacen === "supabase") {
        const sb = await createClient();
        const { error } = await sb.storage
          .from("comprobantes")
          .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
        if (error) return `No se pudo guardar el PDF: ${error.message}`;
      }
    }
    await repo.agregarAdjuntos(p.movimientoId, [
      { tipo: "documento", storagePath, mimeType: "application/pdf", tamanoBytes: bytes.length, nombreArchivo: nombre },
    ]);
    return null;
  } catch (e) {
    console.error("PDF de planilla:", e);
    return e instanceof ErrorDeNegocio ? e.message : "No se pudo adjuntar el PDF de la planilla";
  }
}

/** Foto del depósito de un ingreso (el navegador ya la subió a Drive o Storage). */
export async function adjuntarFotoIngreso(entrada: z.input<typeof EsquemaFotoIngreso>): Promise<Resultado> {
  const datos = EsquemaFotoIngreso.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: { _: "No se pudo registrar la foto" } };
  const repo = await repoTesoreria();
  const { recargaId, storagePath, mime } = datos.data;
  return ejecutar(() => repo.adjuntarComprobanteRecarga(recargaId, storagePath, mime));
}

/** Tesorería agrega un área a la lista (la sigla que va en el código de la caja). */
export async function crearArea(entrada: EntradaArea): Promise<Resultado> {
  const datos = EsquemaArea.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoTesoreria();
  return ejecutar(() => repo.crearArea(datos.data));
}

// --- Tesorería (tesorería o admin) ---

async function repoTesoreria() {
  const repo = await obtenerRepositorio();
  const yo = await repo.usuarioActual();
  if (!yo?.esTesoreria || !yo.activo) throw new Error("Solo tesorería puede hacer esto");
  return repo;
}

/**
 * Tesorería corrige un gasto ya liquidado (ej. la factura de S/ 9.80 se anuló y la nueva es de
 * S/ 6.55): en la caja abierta entra una línea por la diferencia con el documento nuevo, que el
 * navegador ya subió. El gasto original no cambia.
 */
export async function corregirGastoLiquidado(entrada: {
  id: string;
  originalId: string;
  cajaId: string;
  montoCorrecto: number;
  serieNumero: string | null;
  motivo: string;
  documento: AdjuntoSubido;
}): Promise<Resultado> {
  const datos = z
    .object({
      id: z.uuid(),
      originalId: z.uuid(),
      cajaId: z.uuid(),
      montoCorrecto: z
        .number("Escribe el monto correcto")
        .min(0, "El monto no puede ser negativo")
        .max(100000, "Monto demasiado alto")
        .refine((m) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-6, "Máximo 2 decimales"),
      serieNumero: z.string().trim().max(40).nullable(),
      motivo: z.string().trim().min(3, "Escribe el motivo").max(300),
      documento: EsquemaAdjunto,
    })
    .safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoTesoreria();
  const d = datos.data;
  if (d.documento.tipo !== "documento") return { ok: false, errores: { documento: "Sube el documento nuevo" } };
  const errorArchivo = await verificarAdjuntos(d.cajaId, d.id, [d.documento]);
  if (errorArchivo) return { ok: false, errores: { documento: errorArchivo } };
  return ejecutar(async () => {
    await repo.corregirMovimiento({
      id: d.id,
      originalId: d.originalId,
      cajaId: d.cajaId,
      montoCorrecto: d.montoCorrecto,
      serieNumero: d.serieNumero || null,
      motivo: d.motivo,
    });
    await repo.agregarAdjuntos(d.id, [d.documento]);
  });
}

/** Autoriza un gasto que supera el tope de la empresa (para que pueda liquidarse). */
export async function autorizarGasto(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, errores: { _: "Gasto inválido" } };
  const repo = await repoTesoreria();
  return ejecutar(() => repo.autorizarMovimiento(id));
}

export async function guardarCaja(entrada: EntradaCaja): Promise<Resultado> {
  const datos = EsquemaCaja.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoTesoreria();
  return ejecutar(() => repo.guardarCaja(datos.data));
}

/**
 * Tesorería abre una caja nueva: la crea con el siguiente número de la empresa (el código
 * SL-CAJA-MT-01 sale solo) y registra su dinero de apertura.
 */
export async function abrirCaja(
  entrada: EntradaAbrirCaja,
): Promise<
  { ok: true; codigo: string; cajaId: string; recargaId: string; saldoAnterior: number } | { ok: false; errores: Record<string, string> }
> {
  const datos = EsquemaAbrirCaja.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoTesoreria();
  const d = datos.data;
  const [cajas, empresas] = await Promise.all([repo.listarCajasAdmin(), repo.listarEmpresas()]);
  const empresa = empresas.find((e) => e.id === d.empresaId);
  if (!empresa) return { ok: false, errores: { empresaId: "Elige la empresa" } };
  const usados = cajas.filter((c) => c.empresaId === d.empresaId).map((c) => c.numero);
  const numero = d.numero ?? Math.max(0, ...usados) + 1;
  if (numero > 99) return { ok: false, errores: { numero: "La empresa ya tiene 99 cajas" } };
  if (usados.includes(numero))
    return { ok: false, errores: { numero: `${empresa.codigo} ya tiene la caja N° ${String(numero).padStart(2, "0")}` } };
  const codigo = codigoCaja({ empresaCodigo: empresa.codigo, area: d.area, numero });
  const anterior = d.cajaAnteriorId ? cajas.find((c) => c.id === d.cajaAnteriorId) : null;
  if (anterior && (!anterior.activa || anterior.empresaId !== d.empresaId || anterior.area !== d.area))
    return { ok: false, errores: { cajaAnteriorId: "La caja anterior debe ser de la misma empresa y área, y estar abierta" } };
  try {
    const cajaId = await repo.guardarCaja({
      id: null,
      empresaId: d.empresaId,
      numero,
      area: d.area,
      nombre: d.nombre,
      umbralAlerta: d.umbralAlerta,
      activa: true,
    });
    let recargaId: string;
    try {
      recargaId = await repo.registrarRecarga({
        cajaId,
        tipo: "apertura",
        liquidacionRepuestaId: null,
        monto: d.monto,
        fecha: d.fecha,
        descripcion: `Apertura ${codigo}`,
        forma: d.forma,
        banco: d.forma === "banco" ? d.banco : null,
        operacion: null,
        recibo: null,
        nota: null,
      });
    } catch (e) {
      if (e instanceof ErrorDeNegocio)
        return { ok: false, errores: { _: `Se creó ${codigo}, pero no se pudo registrar la apertura: ${e.message}. Regístrala en "Recargar caja".` } };
      throw e;
    }
    // Saldo que viene de antes: de la caja anterior en la app, o el que traían (primera vez).
    let saldoAnterior = 0;
    try {
      if (anterior) saldoAnterior = await repo.traspasarCaja(anterior.id, cajaId);
      else if (d.saldoAnterior) {
        await repo.registrarRecarga({
          cajaId,
          tipo: "ajuste",
          liquidacionRepuestaId: null,
          monto: d.saldoAnterior,
          fecha: d.fecha,
          descripcion: d.saldoAnteriorNota ? `Saldo anterior · ${d.saldoAnteriorNota}` : "Saldo anterior",
          forma: "otros",
          banco: null,
          operacion: null,
          recibo: null,
          nota: null,
        });
        saldoAnterior = d.saldoAnterior;
      }
    } catch (e) {
      if (e instanceof ErrorDeNegocio) {
        revalidatePath("/", "layout");
        return { ok: false, errores: { _: `Se abrió ${codigo}, pero no se pasó el saldo anterior: ${e.message}` } };
      }
      throw e;
    }
    revalidatePath("/", "layout");
    return { ok: true, codigo, cajaId, recargaId, saldoAnterior };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
}

export async function actualizarTope(entrada: { empresaId: string; tope: number }): Promise<Resultado> {
  const datos = z
    .object({ empresaId: z.uuid(), tope: z.number("Monto inválido").positive("Debe ser mayor a 0").max(100000) })
    .safeParse(entrada);
  if (!datos.success) return { ok: false, errores: { tope: datos.error.issues[0]!.message } };
  const repo = await repoTesoreria();
  return ejecutar(() => repo.actualizarTope(datos.data.empresaId, datos.data.tope));
}

// --- Usuarios: el admin gestiona a todos; tesorería, solo a los registradores ---

async function repoUsuarios() {
  const repo = await obtenerRepositorio();
  const yo = await repo.usuarioActual();
  if (!yo?.esTesoreria || !yo.activo) throw new Error("Solo tesorería o un administrador puede gestionar usuarios");
  return { repo, yo };
}

const SOLO_REGISTRADORES = "Tesorería solo puede crear y editar registradores";

/** Tesorería (sin ser admin) no puede dar roles globales ni tocar a admins o tesorería. */
async function puedeTocar(repo: Repositorio, yo: Usuario, id: string | null, d?: { esAdmin: boolean; esTesoreria: boolean }) {
  if (yo.esAdmin) return true;
  if (d && (d.esAdmin || d.esTesoreria)) return false;
  if (!id) return true;
  const u = (await repo.listarUsuarios()).find((x) => x.id === id);
  return !!u && !u.esAdmin && !u.esTesoreria;
}

export async function crearUsuario(
  entrada: EntradaNuevoUsuario,
): Promise<{ ok: true; id: string } | { ok: false; errores: Record<string, string> }> {
  const datos = EsquemaNuevoUsuario.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const { repo, yo } = await repoUsuarios();
  if (!(await puedeTocar(repo, yo, null, datos.data))) return { ok: false, errores: { _: SOLO_REGISTRADORES } };
  try {
    const id = await repo.crearUsuario(datos.data);
    revalidatePath("/admin");
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { ok: false, errores: { _: e.message } };
    throw e;
  }
}

export async function actualizarUsuario(entrada: EntradaCambiosUsuario): Promise<Resultado> {
  const datos = EsquemaCambiosUsuario.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const { repo, yo } = await repoUsuarios();
  if (datos.data.id === yo.id && (!datos.data.esAdmin || !datos.data.activo))
    return { ok: false, errores: { _: "No puedes quitarte el rol de administrador ni desactivarte a ti mismo" } };
  if (!(await puedeTocar(repo, yo, datos.data.id, datos.data))) return { ok: false, errores: { _: SOLO_REGISTRADORES } };
  return ejecutar(() => repo.actualizarUsuario(datos.data));
}

export async function cambiarContrasenaUsuario(entrada: { id: string; password: string }): Promise<Resultado> {
  const id = z.uuid().or(z.literal("demo")).safeParse(entrada.id);
  const password = EsquemaContrasena.safeParse(entrada.password);
  if (!id.success) return { ok: false, errores: { _: "Usuario inválido" } };
  if (!password.success) return { ok: false, errores: { password: password.error.issues[0]!.message } };
  const { repo, yo } = await repoUsuarios();
  if (!(await puedeTocar(repo, yo, id.data))) return { ok: false, errores: { _: SOLO_REGISTRADORES } };
  return ejecutar(() => repo.cambiarContrasena(id.data, password.data));
}

const EsquemaSubidaDrive = z.object({
  cajaId: z.uuid(),
  movimientoId: z.uuid(), // o el id del ingreso / del pago, si tipo = "ingreso" / "devolucion"
  tipo: z.enum(["documento", "pago", "otro", "ingreso", "devolucion"]),
  mime: z.enum(MIME_PERMITIDOS),
  tamano: z.number().int().positive().max(TAMANO_MAXIMO),
  fecha: z.iso.date(),
  referencia: z.string().max(120), // proveedor o detalle, para el nombre del archivo
  monto: z.number().nonnegative().nullable(),
});

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
};

/**
 * Prepara la subida de un comprobante a Google Drive: verifica que el usuario pueda registrar
 * en la caja, crea/ubica la carpeta Factudex/<Empresa>/Caja NN - <Nombre>/<AAAA-MM> y devuelve
 * la URL a la que el navegador sube el archivo directamente.
 */
export async function iniciarSubidaDrive(
  entrada: z.input<typeof EsquemaSubidaDrive>,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const d = EsquemaSubidaDrive.safeParse(entrada);
  if (!d.success || modoDemo() || !driveConfigurado()) return { ok: false, error: "Subida a Drive no disponible" };
  const repo = await repoAutenticado();
  const sb = await createClient();
  const { data: puede } = await sb.rpc("tiene_acceso_caja", { p_caja: d.data.cajaId, p_min: "registrador" });
  if (!puede) return { ok: false, error: "Sin permiso para registrar en esta caja" };

  const [cajas, empresas] = await Promise.all([repo.listarCajas(), repo.listarEmpresas()]);
  const caja = cajas.find((c) => c.id === d.data.cajaId);
  const empresa = empresas.find((e) => e.id === caja?.empresaId);
  if (!caja || !empresa) return { ok: false, error: "Caja no encontrada" };

  const tipo: TipoAdjunto | "ingreso" | "devolucion" = d.data.tipo;
  const monto = d.data.monto !== null ? `S-${d.data.monto.toFixed(2)}` : "";
  const nombre = [d.data.fecha, d.data.referencia, monto, tipo].filter(Boolean).join("_") + `.${EXTENSION[d.data.mime]}`;
  try {
    const carpetaId = await asegurarCarpeta([
      empresa.nombreCorto,
      `Caja ${String(caja.numero).padStart(2, "0")} - ${caja.nombre}`,
      d.data.fecha.slice(0, 7),
    ]);
    const h = await headers();
    const origen = h.get("origin") ?? `https://${h.get("host")}`;
    const url = await iniciarSubida({
      nombre,
      mime: d.data.mime,
      tamano: d.data.tamano,
      carpetaId,
      origen,
      propiedades: { movimientoId: d.data.movimientoId, cajaId: d.data.cajaId, tipo },
    });
    return { ok: true, url };
  } catch (e) {
    console.error("Subida a Drive:", e);
    return { ok: false, error: "No se pudo preparar la subida a Google Drive" };
  }
}

export async function cerrarSesion() {
  if (!modoDemo()) {
    const sb = await createClient();
    await sb.auth.signOut();
  }
  redirect("/login");
}
