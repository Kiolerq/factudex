"use client";

import { useActionState } from "react";
import { cambiarContrasena, type EstadoCambio } from "./acciones";

export function FormularioContrasena() {
  const [estado, accion, guardando] = useActionState<EstadoCambio, FormData>(cambiarContrasena, {});
  return (
    <form action={accion} className="flex flex-col gap-3">
      <div>
        <label htmlFor="nueva" className="fx-label">
          Nueva contraseña
        </label>
        <input id="nueva" name="nueva" type="password" autoComplete="new-password" required minLength={8} className="fx-input" />
      </div>
      <div>
        <label htmlFor="confirmar" className="fx-label">
          Repite la nueva contraseña
        </label>
        <input id="confirmar" name="confirmar" type="password" autoComplete="new-password" required className="fx-input" />
      </div>
      {estado.error && <p className="text-xs text-fx-error">{estado.error}</p>}
      {estado.ok && <p className="text-xs text-fx-completo">● Contraseña actualizada.</p>}
      <button
        type="submit"
        disabled={guardando}
        className="fx-btn self-start rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-70"
      >
        {guardando ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
