"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  EsquemaNuevoMovimiento,
  EsquemaNuevoProveedor,
  erroresPorCampo,
  type EntradaMovimiento,
} from "@/lib/datos/esquemas";
import { ErrorDeNegocio, modoDemo, obtenerRepositorio } from "@/lib/datos/repositorio";
import type { EstadoMovimiento, NuevoProveedor, Proveedor } from "@/lib/datos/tipos";
import { COOKIE_CAJA } from "@/lib/seleccion";
import { createClient } from "@/lib/supabase/server";

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

export type ResultadoMovimiento =
  | { ok: true; id: string; estado: EstadoMovimiento }
  | { ok: false; errores: Record<string, string> };

export async function registrarMovimiento(entrada: EntradaMovimiento): Promise<ResultadoMovimiento> {
  const datos = EsquemaNuevoMovimiento.safeParse(entrada);
  if (!datos.success) return { ok: false, errores: erroresPorCampo(datos.error) };
  const { sinDocumento: _, ...movimiento } = datos.data;

  // Los archivos solo pueden venir de la carpeta de este movimiento (ver convención de Storage).
  const prefijo = `${movimiento.cajaId}/${movimiento.id}/`;
  if (!modoDemo() && movimiento.adjuntos.some((a) => !a.storagePath.startsWith(prefijo))) {
    return { ok: false, errores: { _: "Ruta de archivo inválida" } };
  }

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

export async function cerrarSesion() {
  if (!modoDemo()) {
    const sb = await createClient();
    await sb.auth.signOut();
  }
  redirect("/login");
}
