"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Modulo } from "@/lib/datos/tipos";

export const SECCIONES: { href: string; texto: string; modulo: Modulo | null }[] = [
  { href: "/registro", texto: "Registro", modulo: "registro" },
  { href: "/pendientes", texto: "Pendientes", modulo: "pendientes" },
  { href: "/historial", texto: "Historial", modulo: "historial" },
  { href: "/liquidaciones", texto: "Liquidaciones", modulo: "liquidaciones" },
  { href: "/recargas", texto: "Recargas", modulo: "recargas" },
  { href: "/admin", texto: "Usuarios", modulo: null }, // solo administradores
];

interface Props {
  pendientes: number;
  modulos: Modulo[];
  esAdmin: boolean;
}

export function Navegacion({ pendientes, modulos, esAdmin }: Props) {
  const ruta = usePathname();
  const visibles = SECCIONES.filter((s) => (s.modulo ? modulos.includes(s.modulo) : esAdmin));
  return (
    <nav aria-label="Secciones" className="fx-scroll-x -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
      {visibles.map((s) => {
        const activa = ruta.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={activa ? "page" : undefined}
            className={`shrink-0 rounded-[10px] border px-4 py-[9px] text-[13px] font-semibold transition-colors ${
              activa
                ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light"
                : "border-fx-glass-border bg-white/5 text-white/55 hover:text-white/80"
            }`}
          >
            {s.texto}
            {s.href === "/pendientes" && pendientes > 0 && (
              <span className="ml-1.5 text-fx-pendiente">· {pendientes}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
