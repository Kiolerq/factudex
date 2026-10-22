"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revisarLiquidacion } from "@/app/acciones";

/** Aprobador: aprueba (queda lista para reponer) u observa con lo que hay que corregir. */
export function RevisarLiquidacion({ id }: { id: string }) {
  const router = useRouter();
  const [observando, setObservando] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();

  const enviar = (aprobar: boolean) =>
    iniciar(async () => {
      const r = await revisarLiquidacion({ id, aprobar, observaciones: aprobar ? null : observaciones });
      if (r.ok) {
        setObservando(false);
        router.refresh();
      } else setError(r.errores.observaciones ?? r.errores._ ?? "No se pudo guardar");
    });

  if (observando) {
    return (
      <div className="flex w-full flex-col gap-2.5">
        <label htmlFor={`obs-${id}`} className="fx-label">
          ¿Qué hay que corregir?
        </label>
        <textarea
          id={`obs-${id}`}
          className="fx-input min-h-20"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          aria-invalid={!!error}
        />
        {error && <p className="text-xs text-fx-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setObservando(false)} className="fx-btn rounded-[10px] px-4 py-2 text-[13px] text-white/60">
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => enviar(false)}
            className="fx-btn rounded-[10px] bg-fx-error px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            Observar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="w-full text-xs text-fx-error">{error}</p>}
      <button
        type="button"
        onClick={() => setObservando(true)}
        className="fx-btn rounded-[10px] border border-fx-error/40 px-4 py-2 text-[13px] font-semibold text-fx-error hover:bg-fx-error/10"
      >
        Observar
      </button>
      <button
        type="button"
        disabled={enviando}
        onClick={() => enviar(true)}
        className="fx-btn rounded-[10px] bg-fx-completo px-4 py-2 text-[13px] font-semibold text-[#0A0E1A] disabled:opacity-60"
      >
        {enviando ? "Aprobando…" : "Aprobar"}
      </button>
    </div>
  );
}
