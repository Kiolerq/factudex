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
  recargas: "/recargas",
};

/**
 * La página solo se muestra si el usuario tiene alguno de estos módulos; si no, va al primero
 * que sí tenga. Es lo que ve en pantalla: qué datos puede tocar lo decide el RLS por caja.
 */
export async function exigirModulo(...modulos: Modulo[]) {
  const u = await usuarioPeticion();
  if (!u) redirect("/login");
  if (!modulos.some((m) => u.modulos.includes(m))) redirect(u.modulos[0] ? RUTA_MODULO[u.modulos[0]] : "/cuenta");
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
