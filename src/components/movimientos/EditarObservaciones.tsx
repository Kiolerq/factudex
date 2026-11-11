"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { actualizarObservaciones } from "@/app/acciones";

/** Observaciones del gasto (para quién fue y el motivo): se ven y, si se puede, se corrigen. */
export function EditarObservaciones({ id, valor, editable }: { id: string; valor: string | null; editable: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  if (!editando) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className={valor ? "whitespace-pre-line text-white/85" : "text-white/60"}>{valor ?? "Sin observaciones"}</p>
        {editable && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="self-start text-fx-xs font-semibold text-fx-primary-light hover:underline"
          >
            {valor ? "Corregir" : "＋ Agregar observaciones"}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="fx-input h-auto min-h-[76px] py-3"
        rows={2}
        maxLength={300}
        autoFocus
        placeholder="Para quién fue en realidad y el motivo"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {error && <p className="text-fx-xs text-fx-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={guardando}
          onClick={() =>
            iniciar(async () => {
              try {
                const r = await actualizarObservaciones(id, texto);
                if (!r.ok) return setError(Object.values(r.errores)[0] ?? "No se pudo guardar");
                setEditando(false);
                router.refresh();
              } catch {
                setError("No se pudo guardar. Inténtalo de nuevo.");
              }
            })
          }
          className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2 text-fx-sm font-semibold text-blanco disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditando(false)} className="fx-btn rounded-[10px] px-4 py-2 text-fx-sm text-white/75">
          Cancelar
        </button>
      </div>
    </div>
  );
}
