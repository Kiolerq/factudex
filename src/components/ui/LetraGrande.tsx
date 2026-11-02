"use client";

import { useSyncExternalStore } from "react";

// El valor vive en <html data-letra>; los oyentes se avisan al cambiarlo.
const oyentes = new Set<() => void>();
const suscribir = (f: () => void) => (oyentes.add(f), () => oyentes.delete(f));
const leer = () => document.documentElement.dataset.letra === "grande";

/** Interruptor "Letra extra grande": se guarda en este equipo (localStorage). */
export function LetraGrande() {
  const grande = useSyncExternalStore(suscribir, leer, () => false);

  const cambiar = (v: boolean) => {
    if (v) document.documentElement.dataset.letra = "grande";
    else delete document.documentElement.dataset.letra;
    try {
      if (v) localStorage.setItem("fx_letra", "grande");
      else localStorage.removeItem("fx_letra");
    } catch {}
    oyentes.forEach((f) => f());
  };

  return (
    <section className="fx-card flex flex-col gap-3 p-5 md:p-7">
      <div className="text-xs uppercase tracking-[1px] text-white/75">Pantalla</div>
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-fx-md font-semibold">Letra extra grande</span>
          <span className="block text-fx-xs text-white/75">Agranda todos los textos en este celular o computadora.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="h-7 w-7 shrink-0 accent-[var(--fx-primary)]"
          checked={grande}
          onChange={(e) => cambiar(e.target.checked)}
        />
      </label>
    </section>
  );
}
