import type { RespuestaOcr } from "@/app/api/ocr/route";
import { MIME_LEGIBLES, TAMANO_MAXIMO_OCR } from "./esquema";

/** ¿La IA puede leer este archivo? (HEIC o archivos muy pesados no). */
export function esLegible(archivo: File): boolean {
  return (MIME_LEGIBLES as readonly string[]).includes(archivo.type) && archivo.size <= TAMANO_MAXIMO_OCR;
}

/** Envía el archivo (ya comprimido) a /api/ocr y devuelve los datos leídos. */
export async function pedirLectura(archivo: File, tipo: "documento" | "pago", movimientoId: string): Promise<RespuestaOcr> {
  const cuerpo = new FormData();
  cuerpo.set("archivo", archivo);
  cuerpo.set("tipo", tipo);
  cuerpo.set("movimientoId", movimientoId);
  try {
    const r = await fetch("/api/ocr", { method: "POST", body: cuerpo });
    // Sin sesión, el proxy redirige a /login (HTML, no JSON).
    if (r.redirected || r.status === 401) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
    return (await r.json()) as RespuestaOcr;
  } catch {
    return { ok: false, error: "Sin conexión con la IA." };
  }
}
