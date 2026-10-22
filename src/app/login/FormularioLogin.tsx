"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";

export function FormularioLogin({ errorEnlace, siguiente }: { errorEnlace: boolean; siguiente: string }) {
  const [estado, accion, entrando] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  const error = estado.error ?? (errorEnlace ? "El enlace venció o ya se usó." : undefined);

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="siguiente" value={siguiente} />
      <div>
        <label htmlFor="email" className="fx-label">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="tu@correo.com"
          defaultValue={estado.email}
          className="fx-input"
          aria-invalid={!!error}
        />
      </div>
      <div>
        <label htmlFor="password" className="fx-label">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="fx-input"
          aria-invalid={!!error}
        />
      </div>
      {error && <p className="text-xs text-fx-error">{error}</p>}
      <button
        type="submit"
        disabled={entrando}
        className="fx-btn mt-1 rounded-[10px] bg-fx-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
      >
        {entrando ? "Entrando…" : "Ingresar"}
      </button>
      <p className="text-center text-[11px] text-white/35">
        ¿Olvidaste tu contraseña? Pídele al administrador que la restablezca.
      </p>
    </form>
  );
}
