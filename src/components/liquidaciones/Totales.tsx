import type { LiquidacionResumen } from "@/lib/datos/tipos";
import { formatoSoles } from "@/lib/formato";

/** Cuadro del formato de contabilidad: saldo anterior + ingresos − egresos = por reembolsar. */
export function Totales({ l }: { l: LiquidacionResumen }) {
  const celdas: [string, number, string?][] = [
    ["Saldo anterior", l.saldoInicial],
    ["Ingresos", l.ingresos],
    ["Egresos", l.egresos],
    ["Por reembolsar", l.porReembolsar, "text-fx-primary-light"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
      {celdas.map(([titulo, valor, color]) => (
        <div key={titulo} className="rounded-xl border border-white/8 bg-white/4 px-3.5 py-3">
          <div className="text-[10.5px] uppercase tracking-[0.6px] text-white/40">{titulo}</div>
          <div className={`mt-1 font-display text-[16px] font-bold md:text-lg ${color ?? ""}`}>{formatoSoles(valor)}</div>
        </div>
      ))}
    </div>
  );
}
