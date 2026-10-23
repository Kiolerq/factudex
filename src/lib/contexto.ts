import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import type { Modulo } from "@/lib/datos/tipos";
import { leerCajaActiva } from "@/lib/seleccion";

/** Usuario de la petición (una sola consulta aunque lo pidan el layout y la página). */
export const usuarioPeticion = cache(async () => (await obtenerRepositorio()).usuarioActual());

export const RUTA_MODULO: Record<Modulo, string> = {
  registro: "/registro",
  pendientes: "/pendientes",
  historial: "/historial",
  liquidaciones: "/liquidaciones",
};

/**
 * La página solo se muestra si el usuario tiene alguno de estos módulos (o es tesorería, que ve
 * todo); si no, vuelve al Panel. Es lo que ve en pantalla: qué datos puede tocar lo decide el RLS.
 */
export async function exigirModulo(...modulos: Modulo[]) {
  const u = await usuarioPeticion();
  if (!u) redirect("/login");
  if (!u.esTesoreria && !modulos.some((m) => u.modulos.includes(m))) redirect("/panel");
  return u;
}

/** Solo tesorería (o admin). */
export async function exigirTesoreria() {
  const u = await usuarioPeticion();
  if (!u) redirect("/login");
  if (!u.esTesoreria) redirect("/panel");
  return u;
}

/** Repositorio, empresas, cajas y la caja activa del HUD (el layout ya exige sesión y cajas). */
export async function contextoPagina() {
  const repo = await obtenerRepositorio();
  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const caja = await leerCajaActiva(cajas);
  const empresa = empresas.find((e) => e.id === caja?.empresaId) ?? null;
  const cajasEmpresa = cajas.filter((c) => c.empresaId === caja?.empresaId);
  return { repo, empresas, cajas, caja, empresa, cajasEmpresa };
}
