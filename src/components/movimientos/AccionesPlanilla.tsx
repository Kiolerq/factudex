"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { readjuntarPdfPlanilla } from "@/app/acciones";
import type { Planilla } from "@/lib/datos/tipos";
import { formatoSoles } from "@/lib/formato";

/** Detalle de un gasto que es una planilla de movilidad: imprimir, Excel y re-adjuntar el PDF. */
export function AccionesPlanilla({ planilla, sinPdf, puedeRegistrar }: { planilla: Planilla; sinPdf: boolean; puedeRegistrar: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();
  return (
    <section className="fx-card flex flex-col gap-3 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold md:text-lg">
          Planilla de movilidad {planilla.serie}-{planilla.numero}
        </h2>
        <span className="font-display text-xl font-bold">{formatoSoles(planilla.total)}</span>
      </div>
      <p className="-mt-1 text-fx-sm text-white/75">
        {planilla.filas.length} fila{planilla.filas.length === 1 ? "" : "s"} ·{" "}
        {[...new Set(planilla.filas.map((f) => f.trabajador))].join(", ")}. Imprímela para que firmen; sin firma igual vale.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/planillas/${planilla.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco"
        >
          🖨 Imprimir PDF
        </a>
        <a href={`/api/planillas/${planilla.id}/excel`} className="fx-btn rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82">
          Descargar Excel
        </a>
        {sinPdf && puedeRegistrar && (
          <button
            type="button"
            disabled={enviando}
            onClick={() =>
              iniciar(async () => {
                const r = await readjuntarPdfPlanilla(planilla.id);
                setError(r.ok ? "" : (r.errores._ ?? "No se pudo adjuntar"));
                if (r.ok) router.refresh();
              })
            }
            className="fx-btn rounded-[10px] border border-fx-pendiente/60 px-4 py-2.5 text-fx-sm font-semibold text-fx-pendiente disabled:opacity-60"
          >
            {enviando ? "Adjuntando…" : "Adjuntar el PDF al gasto"}
          </button>
        )}
      </div>
      {error && <p className="text-fx-sm text-fx-error">{error}</p>}
    </section>
  );
}
