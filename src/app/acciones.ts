"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  EsquemaAnular,
  EsquemaCompletarMovimiento,
  EsquemaNuevaRecarga,
  EsquemaNuevoMovimiento,
  EsquemaNuevoProveedor,
  EsquemaRevision,
  erroresPorCampo,
  type EntradaCompletar,
  type EntradaMovimiento,
  type EntradaRecarga,
} from "@/lib/datos/esquemas";
import { ErrorDeNegocio, modoDemo, obtenerRepositorio } from "@/lib/datos/repositorio";
import type { AdjuntoSubido, EstadoMovimiento, NuevoProveedor, Proveedor } from "@/lib/datos/tipos";
import { COOKIE_CAJA } from "@/lib/seleccion";
import { createClient } from "@/lib/supabase/server";
import { asegurarCarpeta, driveConfigurado, iniciarSubida, metadatos } from "@/lib/drive/google";
import { headers } from "next/headers";
import type { TipoAdjunto } from "@/lib/datos/tipos";
import { MIME_PERMITIDOS } from "@/lib/datos/tipos";
import { TAMANO_MAXIMO } from "@/lib/datos/esquemas";
import { z } from "zod";

// Toda acción verifica sesión: las Server Actions son invocables por POST directo.
async function repoAutenticado() {
  const repo = await obtenerRepositorio();
  if (!(await repo.usuarioActual())) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
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

export type ResultadoMovimiento =
  | { ok: true; id: string; estado: EstadoMovimiento }
  | { ok: false; errores: Record<string, string> };

export async function registrarMovimiento(entrada: EntradaMovimiento): Promise<ResultadoMovimiento> {
  const datos = EsquemaNuevoMovimiento.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const { sinDocumento: _, ...movimiento } = datos.data;

  const errorArchivos = await verificarAdjuntos(movimiento.cajaId, movimiento.id, movimiento.adjuntos);
  if (errorArchivos) return { ok: false, errores: { _: errorArchivos } };

  const repo = await repoAutenticado();
  try {
    const r = await repo.registrarMovimiento(movimiento);
    revalidatePath("/", "layout");
    return { ok: true, ...r };
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
  const repo = await repoAutenticado();
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

export async function anularMovimiento(entrada: { id: string; motivo: string }): Promise<Resultado> {
  const datos = EsquemaAnular.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoAutenticado();
  return ejecutar(() => repo.anularMovimiento(datos.data.id, datos.data.motivo));
}

export async function cerrarLiquidacion(id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, errores: { _: "Liquidación inválida" } };
  const repo = await repoAutenticado();
  return ejecutar(() => repo.cerrarLiquidacion(id));
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

export async function registrarRecarga(entrada: EntradaRecarga): Promise<Resultado> {
  const datos = EsquemaNuevaRecarga.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const repo = await repoAutenticado();
  return ejecutar(() => repo.registrarRecarga(datos.data));
}

const EsquemaSubidaDrive = z.object({
  cajaId: z.uuid(),
  movimientoId: z.uuid(),
  tipo: z.enum(["documento", "pago", "otro"]),
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

  const tipo: TipoAdjunto = d.data.tipo;
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
