/** Mientras llega una pantalla que aún no estaba precargada: su estructura, al instante. */
export default function Cargando() {
  return (
    <main aria-busy="true" aria-label="Cargando" className="flex animate-pulse flex-col gap-4 md:gap-5">
      <div className="h-6 w-48 rounded-lg bg-white/8" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="fx-card h-20 md:h-24" />
        ))}
      </div>
      <div className="fx-card h-64" />
      <div className="fx-card h-40" />
    </main>
  );
}
