import Link from "next/link";
import { FiltrosHistorial } from "@/components/historial/FiltrosHistorial";
import { ListaMovimientos } from "@/components/movimientos/ListaMovimientos";
import type { FiltroEstado } from "@/lib/datos/tipos";
import { contextoPagina, exigirModulo } from "@/lib/contexto";

export const metadata = { title: "Historial · Factudex" };

const ESTADOS: FiltroEstado[] = ["todos", "pendiente", "completo", "anulado"];
const POR_PAGINA = 100;

export default async function PaginaHistorial({ searchParams }: PageProps<"/historial">) {
  await exigirModulo("historial");
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const { repo, empresas, cajas, caja } = await contextoPagina();
  if (!caja) return null;

  const texto = uno(sp.q).slice(0, 60);
  const estado = (ESTADOS as string[]).includes(uno(sp.estado)) ? (uno(sp.estado) as FiltroEstado) : "todos";
  const cajaElegida = uno(sp.caja) === "todas" ? "todas" : cajas.some((c) => c.id === uno(sp.caja)) ? uno(sp.caja) : caja.id;
  const cajaIds = cajaElegida === "todas" ? cajas.map((c) => c.id) : [cajaElegida];
  const limite = Math.min(Math.max(Number(uno(sp.n)) || POR_PAGINA, POR_PAGINA), 1000);

  const [pagina, pendientes] = await Promise.all([
    repo.listarMovimientos({ cajaIds, estado, texto, limite }),
    repo.listarMovimientos({ cajaIds, estado: "pendiente", texto: "", limite: 0 }),
  ]);

  const empresaDe = (empresaId: string) => empresas.find((e) => e.id === empresaId)?.nombreCorto ?? "";
  const opcionesCaja = cajas.map((c) => ({ id: c.id, nombre: `${empresaDe(c.empresaId)} — ${c.nombre}` }));
  const nombreCaja = (id: string) => {
    const c = cajas.find((x) => x.id === id);
    return c ? `${empresaDe(c.empresaId)} · Caja ${String(c.numero).padStart(2, "0")}` : "";
  };

  const masParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") masParams.set(k, v);
  masParams.set("n", String(limite + POR_PAGINA));

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold md:text-xl">Historial de movimientos</h1>
        <Link
          href="/registro"
          aria-label="Nuevo registro"
          className="fx-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-fx-primary text-base font-semibold text-white md:h-auto md:w-auto md:rounded-[10px] md:px-4 md:py-2.5 md:text-[13px]"
        >
          <span className="md:hidden">+</span>
          <span className="hidden md:inline">+ Nuevo registro</span>
        </Link>
      </div>

      <FiltrosHistorial
        key={`${texto}|${estado}|${cajaElegida}`}
        texto={texto}
        estado={estado}
        caja={cajaElegida}
        opcionesCaja={opcionesCaja}
        pendientes={pendientes.total}
      />

      <ListaMovimientos
        movimientos={pagina.movimientos}
        nombreCaja={cajaElegida === "todas" ? nombreCaja : undefined}
        vacio={texto || estado !== "todos" ? "Ningún movimiento coincide con el filtro." : "Todavía no hay movimientos en esta caja."}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/35">
        <span>
          Mostrando {pagina.movimientos.length} de {pagina.total} movimiento{pagina.total === 1 ? "" : "s"}
          {pendientes.total > 0 && ` · ${pendientes.total} pendiente${pendientes.total === 1 ? "" : "s"} de sustento`}
        </span>
        {pagina.total > pagina.movimientos.length && (
          <Link href={`/historial?${masParams}`} scroll={false} className="font-semibold text-fx-primary-light hover:underline">
            Ver más
          </Link>
        )}
      </div>
    </main>
  );
}
