// Archivos recibidos con "Compartir" del celular (Web Share Target, Android).
// public/sw.js recibe el POST a /compartir, guarda los archivos en esta caché y abre
// /registro?compartido=1; el formulario los toma de aquí y los borra.
export const CACHE_COMPARTIDO = "fx-compartido";

export async function leerCompartidos(): Promise<File[]> {
  if (!("caches" in window)) return [];
  try {
    const cache = await caches.open(CACHE_COMPARTIDO);
    const archivos: File[] = [];
    for (const solicitud of await cache.keys()) {
      const r = await cache.match(solicitud);
      if (r) {
        const blob = await r.blob();
        const nombre = decodeURIComponent(r.headers.get("x-nombre") ?? "compartido");
        archivos.push(new File([blob], nombre, { type: blob.type || r.headers.get("content-type") || "" }));
      }
      await cache.delete(solicitud);
    }
    return archivos;
  } catch {
    return [];
  }
}
