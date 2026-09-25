import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

// Páginas públicas (sin sesión) que Google exige para publicar la pantalla de consentimiento.
export function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 md:py-10">
      <Link href="/login" className="flex items-center gap-3">
        <Logo tamano={36} />
        <span className="font-display text-lg font-bold">Factudex</span>
      </Link>
      <article className="fx-card flex flex-col gap-4 p-6 text-sm leading-relaxed text-white/75 md:p-8 [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="font-display text-2xl font-bold text-white">{titulo}</h1>
        <p className="text-xs text-white/45">Última actualización: 25/09/2026</p>
        {children}
      </article>
      <nav className="flex gap-4 text-xs text-white/45">
        <Link href="/privacidad" className="hover:text-white">Política de privacidad</Link>
        <Link href="/terminos" className="hover:text-white">Condiciones del servicio</Link>
      </nav>
    </main>
  );
}
