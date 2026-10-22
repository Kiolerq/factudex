import Link from "next/link";
import { textoFalta } from "@/components/movimientos/textos";
import { contextoPagina, exigirModulo } from "@/lib/contexto";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import { ETIQUETA_MEDIO_PAGO } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Pendientes · Factudex" };

const DIA = 24 * 60 * 60 * 1000;
const dias = (desde: string, hasta: string) => Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA));

export default async function PaginaPendientes() {
  await exigirModulo("pendientes");
  const { repo, empresa, cajasEmpresa } = await contextoPagina();
  if (!empresa) return null;

  const { movimientos, total } = await repo.listarMovimientos({
    cajaIds: cajasEmpresa.map((c) => c.id),
    estado: "pendiente",
    texto: "",
    limite: 500,
  });
  const hoy = fechaHoyLima();
  // Los más antiguos primero: son los que más urge sustentar (aunque no hay plazo máximo).
  const lista = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const monto = lista.reduce((s, m) => s + m.monto, 0);
  const variasCajas = cajasEmpresa.length > 1;
  const nombreCaja = (id: string) => {
    const c = cajasEmpresa.find((x) => x.id === id);
    return c ? `Caja ${String(c.numero).padStart(2, "0")} · ${c.nombre}` : "";
  };

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div>
        <h1 className="text-lg font-bold md:text-xl">Pendientes de sustento</h1>
        <p className="text-xs text-white/45">
          {empresa.nombreCorto} · Gastos sin documento o sin constancia de pago. No tienen plazo, pero no entran a la
          liquidación hasta completarlos: al cerrar, pasan a la siguiente.
        </p>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-3 gap-2.5 md:gap-4">
          <Indicador titulo="Pendientes" valor={String(total)} />
          <Indicador titulo="Monto sin sustentar" valor={formatoSoles(monto)} />
          <Indicador titulo="El más antiguo" valor={`${dias(lista[0]!.fecha, hoy)} días`} />
        </div>
      )}

      {lista.length === 0 ? (
        <div className="fx-card px-5 py-10 text-center text-sm text-white/55">
          <span className="text-fx-completo">●</span> Todo sustentado. No hay gastos pendientes en {empresa.nombreCorto}.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {lista.map((m) => {
            const d = dias(m.fecha, hoy);
            return (
              <Link
                key={m.id}
                href={`/movimientos/${m.id}`}
                className="fx-card flex flex-col gap-2.5 rounded-[14px] border-fx-pendiente/35! p-3.5 hover:bg-white/6 md:flex-row md:items-center md:gap-5 md:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{m.detalle}</div>
                  <div className="truncate text-[11.5px] text-white/45">
                    {m.proveedor ?? "Proveedor por definir"} · {formatoFecha(m.fecha)}
                    {m.medioPago && ` · ${ETIQUETA_MEDIO_PAGO[m.medioPago]}`}
                    {variasCajas && ` · ${nombreCaja(m.cajaId)}`}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 md:contents">
                  <span className="text-[12px] text-fx-pendiente md:w-[230px]">{textoFalta(m)}</span>
                  <span className="text-[11.5px] text-white/45 md:w-[90px] md:text-right">
                    {d === 0 ? "hoy" : `hace ${d} día${d === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 md:contents">
                  <span className="font-display text-[15px] font-bold md:w-[110px] md:text-right">{formatoSoles(m.monto)}</span>
                  <span className="rounded-[9px] bg-fx-primary px-3 py-1.5 text-[12px] font-semibold text-white">Adjuntar</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="fx-card rounded-[14px] px-3 py-3 md:px-5 md:py-4">
      <div className="text-[10.5px] uppercase tracking-[0.6px] text-white/40 md:text-[11px]">{titulo}</div>
      <div className="mt-1 font-display text-[15px] font-bold md:text-xl">{valor}</div>
    </div>
  );
}
