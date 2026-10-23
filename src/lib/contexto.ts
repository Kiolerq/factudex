import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { MODULOS, type Modulo, type Usuario } from "@/lib/datos/tipos";
import { leerCajaActiva } from "@/lib/seleccion";

/** Usuario de la petición (una sola consulta aunque lo pidan el layout y la página). */
export const usuarioPeticion = cache(async () => (await obtenerRepositorio()).usuarioActual());

export const RUTA_MODULO: Record<Modulo, string> = {
  registro: "/registro",
  pendientes: "/pendientes",
  historial: "/historial",
  liquidaciones: "/liquidaciones",
};

/** Pantalla de inicio: tesorería y admin, el Panel; un registrador entra directo a registrar. */
export function rutaInicio(u: Pick<Usuario, "esTesoreria" | "modulos">): string {
  if (u.esTesoreria) return "/panel";
  return RUTA_MODULO[MODULOS.find((m) => u.modulos.includes(m)) ?? "registro"];
}

/**
 * La página solo se muestra si el usuario tiene alguno de estos módulos (o es tesorería, que ve
 * todo); si no, vuelve a su inicio. Es lo que ve en pantalla: qué datos puede tocar lo decide el RLS.
 */
export async function exigirModulo(...modulos: Modulo[]) {
  const u = await usuarioPeticion();
  if (!u) redirect("/login");
  if (!u.esTesoreria && !modulos.some((m) => u.modulos.includes(m))) redirect(rutaInicio(u));
  return u;
}

/** Solo tesorería (o admin). */
export async function exigirTesoreria() {
  const u = await usuarioPeticion();
  if (!u) redirect("/login");
  if (!u.esTesoreria) redirect(rutaInicio(u));
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
