"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registrarDevolucion, vincularAPago } from "@/app/acciones";
import { claveCentro, type GastoAnterior } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles, leerMonto } from "@/lib/formato";

/**
 * "Lo que falta ya se liquidó en una caja anterior": el Yape de S/ 60 incluye S/ 29.30 de una planilla
 * que ya se rindió antes. O se junta ese gasto (si está en la app) o se anota la referencia (si se
 * liquidó en Excel o papel). En los dos casos el pago cuadra y lo liquidado no cambia.
 */
export function LiquidadoAntes({ pagoId, falta, gastos }: { pagoId: string; falta: number; gastos: GastoAnterior[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"app" | "fuera">("app");
  const [texto, setTexto] = useState("");
  const [monto, setMonto] = useState(falta.toFixed(2));
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (hecho) {
    return (
      <p role="status" className="rounded-xl border border-fx-completo/40 bg-fx-completo/10 px-3.5 py-3 text-fx-sm font-semibold text-fx-completo">
        ✓ {hecho}
      </p>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fx-btn self-start rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82 hover:border-fx-primary-line"
      >
        ✓ Lo que falta ya se liquidó en una caja anterior
      </button>
    );
  }

  const centavos = (n: number) => Math.round(n * 100);
  const clave = claveCentro(texto);
  const candidatos = gastos
    .filter((g) => g.monto <= falta + 0.005)
    .filter((g) => !clave || claveCentro(`${g.detalle} ${g.proveedor ?? ""} ${g.monto.toFixed(2)} ${g.cajaCodigo}`).includes(clave))
    .sort(
      (a, b) =>
        Number(centavos(b.monto) === centavos(falta)) - Number(centavos(a.monto) === centavos(falta)) ||
        Number(b.liquidado) - Number(a.liquidado) ||
        b.fecha.localeCompare(a.fecha),
    )
    .slice(0, 12);

  /** Ejecuta la acción y muestra siempre el resultado (nunca queda "sin pasar nada"). */
  const enviar = (accion: () => Promise<{ ok: true } | { ok: false; errores: Record<string, string> }>, exito: string) => {
    setError(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) {
          setError(r.errores.motivo ? "Escribe dónde se liquidó" : (Object.values(r.errores)[0] ?? "No se pudo guardar"));
          return;
        }
        setHecho(exito);
        router.refresh();
      } catch {
        setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo; si sigue, avisa a tesorería.");
      }
    });
  };

  const pestaña = (m: "app" | "fuera", t: string) => (
    <button
      type="button"
      onClick={() => {
        setModo(m);
        setError(null);
      }}
      className={`fx-btn flex-1 rounded-[10px] border px-3 py-2.5 text-fx-sm font-semibold ${
        modo === m ? "border-fx-primary-line bg-fx-primary-soft text-fx-primary-light" : "border-white/15 text-white/72"
      }`}
    >
      {t}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-fx-primary-line bg-white/3 p-3.5">
      <div className="text-fx-sm font-semibold">
        Faltan {formatoSoles(falta)} de este pago y ya se liquidaron antes. ¿Dónde?
      </div>
      <div className="flex gap-2">
        {pestaña("app", "Está en la app")}
        {pestaña("fuera", "Fuera de la app")}
      </div>

      {modo === "app" ? (
        <>
          <input
            type="search"
            className="fx-input"
            placeholder="Buscar: planilla, monto, caja…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Buscar el gasto ya liquidado"
          />
          {candidatos.length === 0 ? (
            <p className="text-fx-sm text-white/72">
              No hay gastos de hasta {formatoSoles(falta)} sin pago. Si se liquidó en Excel o papel, usa «Fuera de la app».
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/8 rounded-xl border border-white/12">
              {candidatos.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-fx-sm font-semibold">{g.detalle}</div>
                    <div className="truncate text-fx-xs text-white/68">
                      {formatoFecha(g.fecha)} · {g.cajaCodigo}
                      {g.folio && ` · ${g.liquidado ? "liquidado en" : "en"} ${g.folio}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <b className="font-display">{formatoSoles(g.monto)}</b>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() =>
                        enviar(() => vincularAPago(pagoId, g.id), `Listo: «${g.detalle}» quedó junto a este pago. El pago cuadra.`)
                      }
                      className="fx-btn rounded-[10px] bg-fx-primary px-3 py-2 text-fx-xs font-semibold text-blanco disabled:opacity-60"
                    >
                      Juntar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = leerMonto(monto);
            if (!Number.isFinite(v) || v <= 0) return setError("Escribe el monto");
            enviar(
              () =>
                registrarDevolucion({
                  pagoId,
                  tipo: "liquidado_antes",
                  monto: v,
                  motivo: referencia,
                  comprobantePath: null,
                  comprobanteMime: null,
                }),
              `Listo: ${formatoSoles(v)} quedan como ya liquidados (${referencia.trim()}).`,
            );
          }}
        >
          <label className="fx-label mb-0!" htmlFor={`antes-monto-${pagoId}`}>
            Monto ya liquidado
          </label>
          <input
            id={`antes-monto-${pagoId}`}
            inputMode="decimal"
            className="fx-input"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
          <label className="fx-label mb-0!" htmlFor={`antes-ref-${pagoId}`}>
            ¿Dónde se liquidó?
          </label>
          <input
            id={`antes-ref-${pagoId}`}
            className="fx-input"
            placeholder="Ej. Caja 4 · planilla de movilidad 10-150"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
          <button
            type="submit"
            disabled={enviando}
            className="fx-btn self-start rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco disabled:opacity-60"
          >
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </form>
      )}
      {error && <p className="text-fx-sm text-fx-error">{error}</p>}
      <button type="button" onClick={() => setAbierto(false)} className="self-start text-fx-sm text-white/68 hover:text-white">
        Cancelar
      </button>
    </div>
  );
}
