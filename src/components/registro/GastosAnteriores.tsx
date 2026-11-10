"use client";

import { useState } from "react";
import { ConvertirEnPago } from "@/components/movimientos/ConvertirEnPago";
import { claveCentro, ETIQUETA_MEDIO_PAGO, type GastoAnterior } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

/** Gastos recientes (también de la caja anterior) que pudieron pagarse junto con otro. */
export function GastosAnteriores({ gastos }: { gastos: GastoAnterior[] }) {
  const [texto, setTexto] = useState("");
  const clave = claveCentro(texto);
  const visibles = gastos
    .filter((g) => !clave || claveCentro(`${g.detalle} ${g.proveedor ?? ""} ${g.monto.toFixed(2)}`).includes(clave))
    .slice(0, 20);
  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        className="fx-input"
        placeholder="Buscar por detalle, proveedor o monto (ej. peaje, 40)"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Buscar gasto"
      />
      {visibles.length === 0 ? (
        <p className="fx-card px-4 py-4 text-fx-sm text-white/72">No hay gastos que coincidan.</p>
      ) : (
        <ul className="fx-card flex flex-col divide-y divide-white/8">
          {visibles.map((g) => (
            <li key={g.id} className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-fx-sm font-semibold">{g.detalle}</div>
                  <div className="truncate text-fx-xs text-white/68">
                    {formatoFecha(g.fecha)}
                    {g.medioPago && ` · ${ETIQUETA_MEDIO_PAGO[g.medioPago]}`}
                    {g.proveedor && ` · ${g.proveedor}`} · {g.cajaCodigo}
                    {g.liquidado && g.folio && ` · liquidado en ${g.folio}`}
                  </div>
                </div>
                <b className="shrink-0 font-display">{formatoSoles(g.monto)}</b>
              </div>
              <ConvertirEnPago movimientoId={g.id} monto={g.monto} compacto />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
