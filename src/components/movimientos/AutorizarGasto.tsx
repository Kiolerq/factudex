"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { autorizarGasto } from "@/app/acciones";

/** Tesorería: autoriza un gasto que supera el tope (para que pueda liquidarse). */
export function AutorizarGasto({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [enviando, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            const r = await autorizarGasto(id);
            if (r.ok) router.refresh();
            else setError(r.errores._ ?? "No se pudo autorizar");
          })
        }
        className="fx-btn rounded-[10px] bg-fx-completo px-4 py-2 text-[13px] font-semibold text-[#0A0E1A] disabled:opacity-60"
      >
        {enviando ? "Autorizando…" : "Autorizar gasto"}
      </button>
      {error && <p className="text-xs text-fx-error">{error}</p>}
    </div>
  );
}
