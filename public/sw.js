// Service worker de Factudex. Por ahora solo recibe lo que se comparte desde otras apps
// (Web Share Target de Android, ver src/app/manifest.ts): guarda los archivos y abre el registro.
// No cachea páginas ni datos.
const CACHE_COMPARTIDO = "fx-compartido"; // igual que src/lib/compartir.ts
const MAXIMO = 2; // documento + constancia de pago

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/compartir") return;

  evento.respondWith(
    (async () => {
      try {
        const datos = await evento.request.formData();
        const archivos = datos.getAll("archivo").filter((f) => f instanceof File).slice(0, MAXIMO);
        const cache = await caches.open(CACHE_COMPARTIDO);
        for (const vieja of await cache.keys()) await cache.delete(vieja);
        await Promise.all(
          archivos.map((f, i) =>
            cache.put(
              `/compartido/${Date.now()}-${i}`,
              new Response(f, {
                headers: { "content-type": f.type, "x-nombre": encodeURIComponent(f.name || `compartido-${i + 1}`) },
              }),
            ),
          ),
        );
        return Response.redirect(new URL(archivos.length ? "/registro?compartido=1" : "/registro", self.location.origin), 303);
      } catch {
        return Response.redirect(new URL("/registro", self.location.origin), 303);
      }
    })(),
  );
});
