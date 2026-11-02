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
      <Interruptor texto="Tema oscuro" ayuda="Fondo oscuro en vez de claro." activo={oscuro} onCambiar={setOscuro} />
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
