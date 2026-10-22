"use client";

import { useId, useState } from "react";
import { crearCentroCosto } from "@/app/acciones";
import { claveCentro, type Opcion } from "@/lib/datos/tipos";

interface Props {
  empresaId: string;
  centros: Opcion[];
  valor: string; // id del centro elegido; "" = sin centro de costo
  onCambiar: (id: string) => void;
  /** Uno nuevo agregado a la lista de la empresa. */
  onCreado: (c: Opcion) => void;
}

/**
 * Centro de costo (áreas, placas…): se escribe y se filtra la lista de la empresa. Si no existe,
 * "＋ Agregar" lo suma a esa lista para todos (no queda texto suelto en el movimiento).
 */
export function CampoCentroCosto({ empresaId, centros, valor, onCambiar, onCreado }: Props) {
  const id = useId();
  const elegido = centros.find((c) => c.id === valor);
  const [texto, setTexto] = useState<string | null>(null); // null = mostrando el elegido
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");

  const escrito = texto ?? "";
  const clave = claveCentro(escrito);
  const filtrados = clave
    ? centros.filter((c) => claveCentro(c.nombre).includes(clave) || claveCentro(c.codigo ?? "").includes(clave))
    : centros;
  const existeIgual = centros.some((c) => claveCentro(c.nombre) === clave || claveCentro(c.codigo ?? "") === clave);
  const puedeAgregar = escrito.trim().length >= 2 && !existeIgual;

  const elegir = (c: Opcion | null) => {
    onCambiar(c?.id ?? "");
    setTexto(null);
    setAbierto(false);
    setError("");
  };

  const agregar = async () => {
    setCreando(true);
    setError("");
    const r = await crearCentroCosto({ empresaId, nombre: escrito });
    setCreando(false);
    if (!r.ok) return setError(r.error);
    onCreado(r.centro);
    elegir(r.centro);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="fx-label">
        Centro de costo
      </label>
      <input
        id={id}
        className="fx-input"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        autoComplete="off"
        placeholder="Escribe área o placa…"
        value={texto ?? elegido?.nombre ?? ""}
        onFocus={(e) => {
          setAbierto(true);
          e.target.select();
        }}
        onBlur={() => setTimeout(() => {
          setAbierto(false);
          setTexto(null);
        }, 150)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (filtrados[0] && (existeIgual || !puedeAgregar)) elegir(filtrados[0]);
          else if (puedeAgregar) void agregar();
        }}
      />
      {abierto && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-fx-glass-border bg-fx-bg p-1 shadow-2xl"
        >
          {!clave && (
            <Opcion activa={!valor} onElegir={() => elegir(null)}>
              <span className="text-white/50">Sin centro de costo</span>
            </Opcion>
          )}
          {filtrados.map((c) => (
            <Opcion key={c.id} activa={c.id === valor} onElegir={() => elegir(c)}>
              {c.nombre}
            </Opcion>
          ))}
          {puedeAgregar && (
            <li>
              <button
                type="button"
                disabled={creando}
                onMouseDown={(e) => e.preventDefault()}
                onClick={agregar}
                className="fx-btn w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-fx-primary-light hover:bg-fx-primary-soft disabled:opacity-60"
              >
                {creando ? "Agregando…" : `＋ Agregar «${escrito.trim()}» a la lista`}
              </button>
            </li>
          )}
          {!filtrados.length && !puedeAgregar && <li className="px-3 py-2.5 text-[12.5px] text-white/45">Sin coincidencias</li>}
        </ul>
      )}
      {error && <p className="mt-1.5 text-xs text-fx-error">{error}</p>}
    </div>
  );
}

function Opcion({ activa, onElegir, children }: { activa: boolean; onElegir: () => void; children: React.ReactNode }) {
  return (
    <li role="option" aria-selected={activa}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onElegir}
        className={`fx-btn w-full rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-white/8 ${activa ? "bg-white/6 font-semibold" : ""}`}
      >
        {children}
      </button>
    </li>
  );
}
