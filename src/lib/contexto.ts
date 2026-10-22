import "server-only";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { leerCajaActiva } from "@/lib/seleccion";

/** Repositorio, empresas, cajas y la caja activa del HUD (el layout ya exige sesión y cajas). */
export async function contextoPagina() {
  const repo = await obtenerRepositorio();
  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const caja = await leerCajaActiva(cajas);
  const empresa = empresas.find((e) => e.id === caja?.empresaId) ?? null;
  const cajasEmpresa = cajas.filter((c) => c.empresaId === caja?.empresaId);
  return { repo, empresas, cajas, caja, empresa, cajasEmpresa };
}
