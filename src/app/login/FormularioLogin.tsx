"use client";

import { useActionState } from "react";
import { enviarEnlace, type EstadoLogin } from "./acciones";

export function FormularioLogin({ errorEnlace }: { errorEnlace: boolean }) {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(enviarEnlace, { enviado: false });

  if (estado.enviado) {
    return (
      <p className="text-sm leading-relaxed text-white/70">
        Te enviamos un enlace de acceso a <span className="font-semibold text-white">{estado.email}</span>. Ábrelo
        desde este mismo dispositivo para entrar.
      </p>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-3">
      <label htmlFor="email" className="fx-label">
        Correo
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="tu@correo.com"
        className="fx-input"
        aria-invalid={!!estado.error}
      />
      {(estado.error || errorEnlace) && (
        <p className="text-xs text-fx-error">{estado.error ?? "El enlace venció o ya se usó. Pide uno nuevo."}</p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="fx-btn mt-1 rounded-[10px] bg-fx-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
      >
        {enviando ? "Enviando…" : "Enviarme un enlace de acceso"}
      </button>
    </form>
  );
}
