// Solo navegador. Reduce fotos de celular (3–6 MB) a ~300–600 KB antes de subirlas:
// sube más rápido con datos móviles y cuida el espacio del plan gratuito de Supabase.
const LADO_MAXIMO = 1800;
const CALIDAD = 0.82;

export async function comprimirImagen(archivo: File): Promise<File> {
  const comprimible = ["image/jpeg", "image/png", "image/webp"].includes(archivo.type);
  if (!comprimible) return archivo; // PDF y HEIC se suben tal cual

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && archivo.size < 800 * 1024) {
      bitmap.close();
      return archivo;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;
    const nombre = archivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: archivo.lastModified });
  } catch {
    return archivo;
  }
}
