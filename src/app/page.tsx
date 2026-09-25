// Placeholder: las pantallas se construyen después de aprobar el plan (ver docs/roadmap.md).
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="fx-card flex max-w-md flex-col gap-3 p-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[11px] bg-gradient-to-br from-fx-primary to-fx-accent font-display text-lg font-bold text-fx-bg">
          F
        </div>
        <h1 className="text-2xl font-bold">Factudex</h1>
        <p className="text-sm text-fx-muted">
          Control de cajas chicas. Estructura inicial lista; pantallas en camino.
        </p>
      </div>
    </main>
  );
}
