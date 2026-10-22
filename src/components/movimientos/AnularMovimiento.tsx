"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anularMovimiento } from "@/app/acciones";

/** Los movimientos no se borran: se anulan con motivo (y dejan de descontar del saldo). */
export function AnularMovimiento({ id }: { id: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [anulando, iniciar] = useTransition();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fx-btn self-start rounded-[10px] border border-fx-error/40 px-4 py-2 text-[13px] font-semibold text-fx-error hover:bg-fx-error/10"
      >
        Anular movimiento
      </button>
    );
  }

  return (
    <form
      className="fx-card flex flex-col gap-3 border-fx-error/40! p-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await anularMovimiento({ id, motivo });
          if (r.ok) router.refresh();
          else setError(r.errores.motivo ?? r.errores._ ?? "No se pudo anular");
        });
      }}
    >
      <label htmlFor="motivo" className="fx-label">
        Motivo de la anulación
      </label>
      <textarea
        id="motivo"
        className="fx-input min-h-20"
        placeholder="Ej. registrado dos veces, monto equivocado…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        aria-invalid={!!error}
      />
      {error && <p className="text-xs text-fx-error">{error}</p>}
      <p className="text-xs text-white/45">El monto vuelve al saldo de la caja. No se puede deshacer.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="fx-btn rounded-[10px] px-4 py-2 text-[13px] text-white/60">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={anulando}
          className="fx-btn rounded-[10px] bg-fx-error px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {anulando ? "Anulando…" : "Anular"}
        </button>
      </div>
    </form>
  );
}
