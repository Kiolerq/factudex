"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { FiltroEstado } from "@/lib/datos/tipos";

interface Props {
  texto: string;
  estado: FiltroEstado;
  caja: string; // id de caja o "todas"
  opcionesCaja: { id: string; nombre: string }[];
  pendientes: number;
}

const ESTADOS: { valor: FiltroEstado; texto: string }[] = [
  { valor: "todos", texto: "Todos" },
  { valor: "pendiente", texto: "Pendientes" },
  { valor: "completo", texto: "Completos" },
  { valor: "anulado", texto: "Anulados" },
];

/** Búsqueda, estado y caja. Todo vive en la URL (se puede compartir o recargar). */
export function FiltrosHistorial({ texto, estado, caja, opcionesCaja, pendientes }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [buscando, iniciar] = useTransition();
  const [busqueda, setBusqueda] = useState(texto);

  const aplicar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("n"); // al cambiar el filtro se vuelve a la primera página
    iniciar(() => router.replace(`${ruta}?${p}`, { scroll: false }));
  };

  // Búsqueda con una pequeña espera para no consultar en cada tecla.
  useEffect(() => {
    if (busqueda === texto) return;
    const t = setTimeout(() => aplicar({ q: busqueda.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  return (
    <div className={`flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center md:gap-3 ${buscando ? "opacity-70" : ""}`}>
      <input
        type="search"
        className="fx-input md:min-w-[220px] md:flex-1"
        placeholder="Buscar por proveedor, detalle, N° o solicitante…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        aria-label="Buscar movimientos"
      />
      <div
        role="group"
        aria-label="Estado"
        className="fx-scroll-x -mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:rounded-full md:border md:border-fx-glass-border md:bg-white/4 md:p-[5px]"
      >
        {ESTADOS.map((e) => {
          const activo = e.valor === estado;
          return (
            <button
              key={e.valor}
              type="button"
              aria-pressed={activo}
              onClick={() => aplicar({ estado: e.valor === "todos" ? null : e.valor })}
              className={`fx-btn shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold md:border-transparent ${
                activo ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/10 text-white/55 hover:text-white/80"
              }`}
            >
              {e.texto}
              {e.valor === "pendiente" && pendientes > 0 && <span className="text-fx-pendiente"> · {pendientes}</span>}
            </button>
          );
        })}
      </div>
      <select
        className="fx-input md:w-auto"
        value={caja}
        onChange={(e) => aplicar({ caja: e.target.value })}
        aria-label="Caja"
      >
        <option value="todas">Todas las cajas</option>
        {opcionesCaja.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
