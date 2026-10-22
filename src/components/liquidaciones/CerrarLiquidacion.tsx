"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cerrarLiquidacion } from "@/app/acciones";
import { formatoSoles } from "@/lib/formato";

interface Props {
  id: string;
  folio: string;
  egresos: number;
  numIncompletos: number;
  montoIncompletos: number;
  reCierre?: boolean; // liquidación observada que se vuelve a enviar
}

/** Cierra la liquidación (= solicita la recarga). Los incompletos pasan a la siguiente. */
export function CerrarLiquidacion({ id, folio, egresos, numIncompletos, montoIncompletos, reCierre }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [cerrando, iniciar] = useTransition();
  const texto = reCierre ? "Volver a enviar" : "Cerrar liquidación";

  if (!confirmando) {
    return (
      <button
        type="button"
        disabled={egresos <= 0}
        title={egresos <= 0 ? "Necesita al menos un movimiento completo" : undefined}
        onClick={() => setConfirmando(true)}
        className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
      >
        {texto}
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-fx-primary-line bg-fx-primary-soft p-4 text-[13px]">
      <p>
        Se liquidarán <strong>{formatoSoles(egresos)}</strong> en {folio} y quedará <strong>en revisión</strong> hasta que el
        aprobador la apruebe y registre la recarga.
      </p>
      {numIncompletos > 0 && (
        <p className="text-fx-error">
          {numIncompletos} movimiento{numIncompletos === 1 ? "" : "s"} incompleto{numIncompletos === 1 ? "" : "s"} (
          {formatoSoles(montoIncompletos)}) no entra{numIncompletos === 1 ? "" : "n"}: pasará
          {numIncompletos === 1 ? "" : "n"} a la siguiente liquidación.
        </p>
      )}
      {error && <p className="text-fx-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setConfirmando(false)} className="fx-btn rounded-[10px] px-4 py-2 text-white/60">
          Cancelar
        </button>
        <button
          type="button"
          disabled={cerrando}
          onClick={() =>
            iniciar(async () => {
              const r = await cerrarLiquidacion(id);
              if (r.ok) {
                setConfirmando(false);
                router.refresh();
              } else setError(r.errores._ ?? "No se pudo cerrar");
            })
          }
          className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {cerrando ? "Cerrando…" : `Sí, ${texto.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
