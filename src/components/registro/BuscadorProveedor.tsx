"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { buscarProveedores, crearProveedor } from "@/app/acciones";
import type { Proveedor, TipoDocIdentidad } from "@/lib/datos/tipos";

interface Props {
  valor: Proveedor | null;
  onCambiar: (p: Proveedor | null) => void;
  error?: string;
  requerido: boolean;
}

/** Autocompletado por nombre o RUC/DNI contra el maestro de proveedores, con alta rápida. */
export function BuscadorProveedor({ valor, onCambiar, error, requerido }: Props) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Proveedor[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [creando, setCreando] = useState(false);
  // Texto para el que ya llegaron resultados; si difiere de `texto`, la búsqueda está en curso.
  const [buscado, setBuscado] = useState("");
  const consulta = useRef(0);

  useEffect(() => {
    const q = texto.trim();
    const n = ++consulta.current;
    const t = setTimeout(async () => {
      const r = q.length >= 2 ? await buscarProveedores(q) : [];
      if (n === consulta.current) {
        setResultados(r);
        setIndice(0);
        setBuscado(texto);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [texto]);
  const buscando = buscado !== texto;

  const elegir = (p: Proveedor) => {
    onCambiar(p);
    setTexto("");
    setAbierto(false);
  };

  if (valor) {
    return (
      <div>
        <span className="fx-label">Proveedor{requerido && " *"}</span>
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-fx-primary-line bg-fx-primary-soft px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{valor.razonSocial}</div>
            <div className="font-mono text-xs text-white/50">
              {valor.tipoDoc} {valor.numDoc}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onCambiar(null)}
            className="fx-btn shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-fx-primary-light hover:bg-white/8"
          >
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  if (creando) {
    return (
      <AltaProveedor
        textoInicial={texto}
        onCancelar={() => setCreando(false)}
        onCreado={(p) => {
          setCreando(false);
          elegir(p);
        }}
      />
    );
  }

  const opciones = abierto && texto.trim().length >= 2;
  const total = resultados.length + 1; // + "Nuevo proveedor"

  return (
    <div className="relative">
      <label htmlFor={id} className="fx-label">
        Proveedor{requerido && " *"}
      </label>
      <input
        id={id}
        className="fx-input"
        type="text"
        autoComplete="off"
        placeholder="Buscar por nombre o RUC…"
        value={texto}
        aria-invalid={!!error}
        aria-expanded={opciones}
        aria-controls={`${id}-lista`}
        role="combobox"
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!opciones) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndice((i) => (i + 1) % total);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndice((i) => (i - 1 + total) % total);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (buscando) return; // no crear un proveedor nuevo antes de ver si ya existe
            if (indice < resultados.length) elegir(resultados[indice]!);
            else setCreando(true);
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
      />
      {opciones && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="fx-card absolute inset-x-0 top-full z-20 mt-1.5 flex flex-col bg-fx-bg/90! p-1.5"
        >
          {buscando && resultados.length === 0 && (
            <li className="px-3 py-2.5 text-[13px] text-white/40">Buscando…</li>
          )}
          {resultados.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === indice}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(p);
              }}
              onMouseEnter={() => setIndice(i)}
              className={`flex cursor-pointer justify-between gap-3 rounded-lg px-3 py-2.5 text-[13px] ${
                i === indice ? "bg-fx-primary-soft text-white" : "text-white/60"
              }`}
            >
              <span className="truncate">{p.razonSocial}</span>
              <span className="shrink-0 font-mono text-white/45">{p.numDoc}</span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={indice === resultados.length}
            onMouseDown={(e) => {
              e.preventDefault();
              setCreando(true);
            }}
            onMouseEnter={() => setIndice(resultados.length)}
            className={`cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-semibold text-fx-primary-light ${
              indice === resultados.length ? "bg-white/6" : ""
            }`}
          >
            + Nuevo proveedor{!buscando && resultados.length === 0 && ` “${texto.trim()}”`}
          </li>
        </ul>
      )}
      {error ? (
        <p className="mt-1.5 text-xs text-fx-error">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-white/35">
          RUC y razón social se autocompletan al elegir de la base de proveedores — evita redigitar.
        </p>
      )}
    </div>
  );
}

function AltaProveedor({
  textoInicial,
  onCancelar,
  onCreado,
}: {
  textoInicial: string;
  onCancelar: () => void;
  onCreado: (p: Proveedor) => void;
}) {
  const esNumero = /^\d+$/.test(textoInicial.trim());
  const [tipoDoc, setTipoDoc] = useState<TipoDocIdentidad>(
    esNumero && textoInicial.trim().length === 8 ? "DNI" : "RUC",
  );
  const [numDoc, setNumDoc] = useState(esNumero ? textoInicial.trim() : "");
  const [razonSocial, setRazonSocial] = useState(esNumero ? "" : textoInicial.trim());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, iniciar] = useTransition();

  const guardar = () =>
    iniciar(async () => {
      const r = await crearProveedor({ tipoDoc, numDoc, razonSocial });
      if (r.ok) onCreado(r.proveedor);
      else setErrores(r.errores);
    });

  // No es un <form> anidado (no se permite dentro del formulario de registro): Enter guarda.
  const alEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      guardar();
    }
  };

  return (
    <div className="rounded-xl border border-fx-primary-line bg-white/3 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold">Nuevo proveedor</span>
        <span className="text-[11px] text-white/40">Queda guardado para la próxima vez</span>
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <div>
          <label className="fx-label" htmlFor="alta-tipo">
            Documento
          </label>
          <select
            id="alta-tipo"
            className="fx-input"
            value={tipoDoc}
            onChange={(e) => setTipoDoc(e.target.value as TipoDocIdentidad)}
          >
            <option value="RUC">RUC</option>
            <option value="DNI">DNI</option>
            <option value="CE">C.E.</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>
        <div>
          <label className="fx-label" htmlFor="alta-num">
            Número *
          </label>
          <input
            id="alta-num"
            className="fx-input font-mono"
            inputMode={tipoDoc === "RUC" || tipoDoc === "DNI" ? "numeric" : "text"}
            value={numDoc}
            aria-invalid={!!errores.numDoc}
            onChange={(e) => setNumDoc(e.target.value)}
            onKeyDown={alEnter}
            autoFocus={!numDoc}
          />
        </div>
      </div>
      {errores.numDoc && <p className="mt-1.5 text-xs text-fx-error">{errores.numDoc}</p>}
      <label className="fx-label mt-3" htmlFor="alta-razon">
        Razón social o nombre *
      </label>
      <input
        id="alta-razon"
        className="fx-input"
        value={razonSocial}
        aria-invalid={!!errores.razonSocial}
        onChange={(e) => setRazonSocial(e.target.value)}
        onKeyDown={alEnter}
        autoFocus={!!numDoc}
      />
      {errores.razonSocial && <p className="mt-1.5 text-xs text-fx-error">{errores.razonSocial}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="fx-btn rounded-[10px] border border-white/18 px-4 py-2 text-[13px] font-semibold text-white/60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar proveedor"}
        </button>
      </div>
    </div>
  );
}
