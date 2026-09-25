"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SECCIONES = [
  { href: "/registro", texto: "Registro" },
  { href: "/pendientes", texto: "Pendientes" },
  { href: "/historial", texto: "Historial" },
  { href: "/liquidaciones", texto: "Liquidaciones" },
  { href: "/recargas", texto: "Recargas" },
] as const;

export function Navegacion({ pendientes }: { pendientes: number }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones" className="fx-scroll-x -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
      {SECCIONES.map((s) => {
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
