import Link from "next/link";

export function EnConstruccion({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <main className="fx-card flex flex-col items-start gap-3 p-6 md:p-8">
      <h1 className="text-lg font-bold md:text-xl">{titulo}</h1>
      <p className="max-w-xl text-sm leading-relaxed text-white/55">{descripcion}</p>
      <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        Próximamente
      </span>
      <Link href="/registro" className="text-sm font-semibold text-fx-primary-light hover:underline">
        + Nuevo registro
      </Link>
    </main>
  );
}
