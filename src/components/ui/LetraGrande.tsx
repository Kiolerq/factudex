"use client";

import { useSyncExternalStore } from "react";

// Preferencias de pantalla de este equipo: viven en <html data-letra / data-tema> y en localStorage.
type Opcion = { clave: "letra" | "tema"; valor: string; guardado: string };
const LETRA: Opcion = { clave: "letra", valor: "grande", guardado: "fx_letra" };
const TEMA: Opcion = { clave: "tema", valor: "oscuro", guardado: "fx_tema" };

const oyentes = new Set<() => void>();
const suscribir = (f: () => void) => (oyentes.add(f), () => oyentes.delete(f));

function usarOpcion(o: Opcion) {
  const activa = useSyncExternalStore(
    suscribir,
    () => document.documentElement.dataset[o.clave] === o.valor,
    () => false,
  );
  const cambiar = (v: boolean) => {
    if (v) document.documentElement.dataset[o.clave] = o.valor;
    else delete document.documentElement.dataset[o.clave];
    try {
      if (v) localStorage.setItem(o.guardado, o.valor);
      else localStorage.removeItem(o.guardado);
    } catch {}
    oyentes.forEach((f) => f());
  };
  return [activa, cambiar] as const;
}

/** Mi cuenta → Pantalla: letra extra grande y tema oscuro (se guardan en este equipo). */
export function LetraGrande() {
  const [grande, setGrande] = usarOpcion(LETRA);
  const [oscuro, setOscuro] = usarOpcion(TEMA);
  return (
    <section className="fx-card flex flex-col gap-4 p-5 md:p-7">
      <div className="text-xs uppercase tracking-[1px] text-white/75">Pantalla</div>
      <Interruptor
        texto="Letra extra grande"
        ayuda="Agranda todos los textos en este celular o computadora."
        activo={grande}
        onCambiar={setGrande}
      />
      <div className="flex flex-col gap-2">
        <span className="text-fx-md font-semibold">Modo</span>
        <div role="radiogroup" aria-label="Modo de pantalla" className="grid grid-cols-2 gap-2">
          {(
            [
              [false, "☀ Claro"],
              [true, "☾ Oscuro"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={texto}
              type="button"
              role="radio"
              aria-checked={oscuro === valor}
              onClick={() => setOscuro(valor)}
              className={`fx-btn rounded-[12px] border px-4 py-3 text-fx-md font-semibold ${
                oscuro === valor ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/20 text-white/75"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Interruptor(p: { texto: string; ayuda: string; activo: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-fx-md font-semibold">{p.texto}</span>
        <span className="block text-fx-xs text-white/75">{p.ayuda}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="h-7 w-7 shrink-0 accent-[var(--fx-primary)]"
        checked={p.activo}
        onChange={(e) => p.onCambiar(e.target.checked)}
      />
    </label>
  );
}
