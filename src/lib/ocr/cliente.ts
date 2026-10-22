import type { RespuestaOcr } from "@/app/api/ocr/route";
import { MIME_LEGIBLES, TAMANO_MAXIMO_OCR } from "./esquema";

/** Por qué la IA no puede leer este archivo (HEIC o muy pesado), o null si sí puede. */
export function motivoNoLegible(archivo: File): string | null {
  if (!(MIME_LEGIBLES as readonly string[]).includes(archivo.type))
    return "La IA lee JPG, PNG, WEBP o PDF; este archivo se adjuntó pero llena los datos a mano.";
  if (archivo.size > TAMANO_MAXIMO_OCR)
    return "El archivo pesa más de 4 MB para leerlo con IA; se adjuntó pero llena los datos a mano.";
  return null;
}

/** Envía el archivo (ya comprimido) a /api/ocr y devuelve los datos leídos. */
export async function pedirLectura(
  archivo: File,
  tipo: "documento" | "pago",
  movimientoId: string,
  cajaId: string | null = null, // para que sugiera categoría y centro de costo de su empresa
): Promise<RespuestaOcr> {
  const cuerpo = new FormData();
  cuerpo.set("archivo", archivo);
  cuerpo.set("tipo", tipo);
  cuerpo.set("movimientoId", movimientoId);
  if (cajaId) cuerpo.set("cajaId", cajaId);
  try {
    const r = await fetch("/api/ocr", { method: "POST", body: cuerpo });
    // Sin sesión, el proxy redirige a /login (HTML, no JSON).
    if (r.redirected || r.status === 401) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
    return (await r.json()) as RespuestaOcr;
  } catch {
    return { ok: false, error: "Sin conexión con la IA." };
  }
}
