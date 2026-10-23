"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Modulo } from "@/lib/datos/tipos";

type Acceso = Modulo | "todos" | "tesoreria" | "admin";

export const SECCIONES: { href: string; texto: string; acceso: Acceso }[] = [
  { href: "/panel", texto: "Panel", acceso: "todos" },
  { href: "/registro", texto: "Registro", acceso: "registro" },
  { href: "/pendientes", texto: "Pendientes", acceso: "pendientes" },
  { href: "/historial", texto: "Historial", acceso: "historial" },
  { href: "/liquidaciones", texto: "Liquidaciones", acceso: "liquidaciones" },
  { href: "/tesoreria", texto: "Tesorería", acceso: "tesoreria" },
  { href: "/admin", texto: "Usuarios", acceso: "admin" },
];

interface Props {
  pendientes: number;
  modulos: Modulo[];
  esAdmin: boolean;
  esTesoreria: boolean;
}

export function Navegacion({ pendientes, modulos, esAdmin, esTesoreria }: Props) {
  const ruta = usePathname();
  const visibles = SECCIONES.filter((s) =>
    s.acceso === "todos"
      ? true
      : s.acceso === "admin"
        ? esAdmin
        : s.acceso === "tesoreria"
          ? esTesoreria
          : esTesoreria || modulos.includes(s.acceso),
  );
  return (
    <nav aria-label="Secciones" className="fx-scroll-x -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
      {visibles.map((s) => {
        const activa = ruta.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            // Precarga la pantalla completa al abrir la app: cambiar de pestaña es instantáneo.
            prefetch
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
