"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { convertirEnPago } from "@/app/acciones";
import { formatoSoles, leerMonto } from "@/lib/formato";

/**
 * "Este pago cubrió más gastos": el Yape de S/ 60 pagó este peaje de S/ 40 y algo más. Se escribe
 * el total y el gasto pasa a ser la primera salida del pago; el resto se sustenta con una factura,
 * una boleta o una planilla (aunque este gasto ya se haya liquidado, incluso en la caja anterior).
 */
export function ConvertirEnPago({ movimientoId, monto, compacto }: { movimientoId: string; monto: number; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pagoId, setPagoId] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const leido = leerMonto(total);
  const valor = Number.isFinite(leido) && leido > 0 ? leido : null;
  const resto = valor !== null ? Math.round((valor - monto) * 100) / 100 : null;

  if (pagoId) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-fx-completo/40 bg-fx-completo/10 p-3.5">
        <p className="text-fx-sm font-semibold">
          Listo: falta sustentar {formatoSoles(resto ?? 0)} de ese pago. ¿Con qué?
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            href={`/registro/planilla?pago=${pagoId}`}
            className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco"
          >
            📝 Planilla de movilidad
          </Link>
          <Link
            prefetch={false}
            href={`/registro?pago=${pagoId}`}
            className="fx-btn rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82"
          >
            ＋ Factura, boleta u otro comprobante
          </Link>
        </div>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`fx-btn self-start rounded-[10px] border border-white/20 font-semibold text-white/82 hover:border-fx-primary-line ${
          compacto ? "px-3 py-2 text-fx-xs" : "px-4 py-2.5 text-fx-sm"
        }`}
      >
        🧩 Este pago cubrió más gastos
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2.5 rounded-xl border border-fx-primary-line bg-fx-primary-soft/40 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valor === null) return setError("Escribe el monto total del pago");
        setError(null);
        iniciar(async () => {
          const r = await convertirEnPago(movimientoId, valor);
          if (r.ok) setPagoId(r.pagoId);
          else setError(r.errores.monto ?? r.errores.movimientoId ?? r.errores._ ?? "No se pudo guardar");
        });
      }}
    >
      <label htmlFor={`total-${movimientoId}`} className="fx-label mb-0!">
        ¿Cuánto fue el pago completo? (este gasto es {formatoSoles(monto)})
      </label>
      <input
        id={`total-${movimientoId}`}
        inputMode="decimal"
        autoFocus
        className="fx-input"
        placeholder="Ej. 60.00"
        value={total}
        onChange={(e) => setTotal(e.target.value)}
      />
      {resto !== null && resto > 0 && (
        <p className="text-fx-sm text-white/75">
          Faltará sustentar <b>{formatoSoles(resto)}</b> (una planilla, otra factura o una devolución).
        </p>
      )}
      {error && <p className="text-fx-sm text-fx-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco disabled:opacity-60"
        >
          {enviando ? "Guardando…" : "Guardar el pago"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="fx-btn rounded-[10px] px-4 py-2.5 text-fx-sm font-semibold text-white/68"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
