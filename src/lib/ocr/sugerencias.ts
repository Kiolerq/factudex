import "server-only";
import type { Repositorio } from "@/lib/datos/repositorio";
import { claveCentro, type Opcion, type Proveedor } from "@/lib/datos/tipos";
import type { ExtraccionComprobante, SugerenciasLectura } from "./esquema";
import type { ContextoLectura } from "./leer";

// Cruza lo que leyó la IA con los datos de la app. Todo es sugerencia: el formulario solo llena
// campos vacíos y la persona confirma.

const FORMAS_SOCIETARIAS = new Set(["SAC", "SA", "SRL", "EIRL", "SAA", "SCRL", "SOCIEDAD", "ANONIMA", "CERRADA", "EMPRESA", "DE", "DEL", "LA", "LOS", "Y"]);

function palabras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !FORMAS_SOCIETARIAS.has(p));
}

/**
 * Parecido entre dos nombres (0 a 1): cuántas palabras del más corto aparecen en el otro.
 * Una inicial cuenta si coincide con el comienzo de una palabra ("Johan Y. Mesa R." ≈ "Johan Yarlin Mesa Rios").
 */
function parecido(a: string, b: string): { puntaje: number; completas: number } {
  let [corto, largo] = [palabras(a), palabras(b)];
  if (corto.length > largo.length) [corto, largo] = [largo, corto];
  if (!corto.length) return { puntaje: 0, completas: 0 };
  let aciertos = 0;
  let completas = 0;
  for (const p of corto) {
    if (largo.includes(p)) {
      aciertos++;
      if (p.length >= 3) completas++;
    } else if (p.length === 1 && largo.some((q) => q.startsWith(p))) aciertos++;
  }
  return { puntaje: aciertos / corto.length, completas };
}

/** Proveedor del maestro: por RUC/DNI exacto, o por nombre parecido (constancias de Yape sin RUC). */
async function buscarProveedor(repo: Repositorio, d: ExtraccionComprobante): Promise<{ p: Proveedor | null; porNombre: boolean }> {
  if (d.proveedor_num_doc) {
    const exacto = (await repo.buscarProveedores(d.proveedor_num_doc)).find((p) => p.numDoc === d.proveedor_num_doc);
    if (exacto) return { p: exacto, porNombre: false };
    if (!d.es_captura_yape) return { p: null, porNombre: false }; // RUC nuevo: se ofrece crearlo
  }
  const nombre = d.proveedor_razon_social;
  if (!nombre) return { p: null, porNombre: false };
  const claves = palabras(nombre).filter((p) => p.length >= 3).slice(0, 2);
  const candidatos = new Map<string, Proveedor>();
  for (const c of claves) for (const p of await repo.buscarProveedores(c)) candidatos.set(p.id, p);
  let mejor: { p: Proveedor; puntaje: number } | null = null;
  for (const p of candidatos.values()) {
    const r = [p.razonSocial, p.nombreComercial ?? ""].map((n) => parecido(nombre, n)).sort((x, y) => y.puntaje - x.puntaje)[0]!;
    if (r.puntaje >= 0.75 && r.completas >= 1 && (!mejor || r.puntaje > mejor.puntaje)) mejor = { p, puntaje: r.puntaje };
  }
  return { p: mejor?.p ?? null, porNombre: !!mejor };
}

/** Listas de la empresa de la caja (para la IA) y las cajas que ve el usuario. */
export async function contextoDeCaja(repo: Repositorio, cajaId: string | null) {
  const cajas = await repo.listarCajas();
  const caja = cajas.find((c) => c.id === cajaId);
  if (!caja) return { cajas, categorias: [] as Opcion[], centros: [] as Opcion[], contexto: undefined };
  const [categorias, centros] = await Promise.all([repo.listarCategorias(caja.empresaId), repo.listarCentrosCosto(caja.empresaId)]);
  const contexto: ContextoLectura = { categorias: categorias.map((c) => c.nombre), centrosCosto: centros.map((c) => c.nombre) };
  return { cajas, categorias, centros, contexto };
}

export async function sugerir(
  repo: Repositorio,
  d: ExtraccionComprobante,
  ctx: Awaited<ReturnType<typeof contextoDeCaja>>,
): Promise<SugerenciasLectura> {
  const vacio: SugerenciasLectura = {
    proveedor: null,
    proveedorPorNombre: false,
    categoriaId: null,
    centroCostoId: null,
    centroCostoNuevo: null,
    duplicado: null,
  };
  if (!d.es_comprobante) return vacio;

  const { p, porNombre } = await buscarProveedor(repo, d);

  const categoria = d.categoria
    ? ctx.categorias.find((c) => c.nombre.toLowerCase() === d.categoria!.toLowerCase())
    : undefined;

  let centroCostoId: string | null = null;
  let centroCostoNuevo: string | null = null;
  if (d.centro_costo) {
    const k = claveCentro(d.centro_costo);
    const centro = ctx.centros.find((c) => claveCentro(c.nombre) === k || claveCentro(c.codigo ?? "") === k);
    if (centro) centroCostoId = centro.id;
    else if (k.length >= 2) centroCostoNuevo = d.centro_costo.toUpperCase();
  }

  // Duplicado: mismo RUC/DNI y mismo N° de documento ya registrado (no anulado) en alguna caja que ve.
  let duplicado: SugerenciasLectura["duplicado"] = null;
  if (d.serie_numero && d.proveedor_num_doc && !d.es_captura_yape) {
    const { movimientos } = await repo.listarMovimientos({
      cajaIds: ctx.cajas.map((c) => c.id),
      estado: "todos",
      texto: d.serie_numero,
      limite: 20,
    });
    const igual = movimientos.find(
      (m) => m.proveedorDoc === d.proveedor_num_doc && claveCentro(m.serieNumero ?? "") === claveCentro(d.serie_numero!),
    );
    if (igual) duplicado = { id: igual.id, detalle: igual.detalle, fecha: igual.fecha, monto: igual.monto };
  }

  return {
    proveedor: p,
    proveedorPorNombre: porNombre,
    categoriaId: categoria?.id ?? null,
    centroCostoId,
    centroCostoNuevo,
    duplicado,
  };
}
