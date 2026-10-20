import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { modoDemo, obtenerRepositorio } from "@/lib/datos/repositorio";
import { MIME_LEGIBLES, TAMANO_MAXIMO_OCR, type ExtraccionComprobante } from "@/lib/ocr/esquema";
import { ErrorOcr, leerComprobante, MODELO_OCR, ocrConfigurado } from "@/lib/ocr/leer";
import { createClient } from "@/lib/supabase/server";

// Lectura con IA de un comprobante. Recibe el archivo ya comprimido por el navegador
// (multipart: archivo, tipo, movimientoId) y devuelve los datos para PRE-LLENAR el formulario.
export const maxDuration = 60;

const Campos = z.object({
  tipo: z.enum(["documento", "pago"]),
  movimientoId: z.uuid(),
});

export type RespuestaOcr = { ok: true; datos: ExtraccionComprobante } | { ok: false; error: string };

const responder = (r: RespuestaOcr, status = 200) => NextResponse.json(r, { status });

export async function POST(request: NextRequest) {
  if (!ocrConfigurado()) return responder({ ok: false, error: "La lectura con IA no está activada." }, 503);
  const repo = await obtenerRepositorio();
  if (!(await repo.usuarioActual())) return responder({ ok: false, error: "Sesión expirada." }, 401);

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const campos = Campos.safeParse({ tipo: form?.get("tipo"), movimientoId: form?.get("movimientoId") });
  if (!(archivo instanceof File) || !campos.success) return responder({ ok: false, error: "Petición inválida." }, 400);
  if (!(MIME_LEGIBLES as readonly string[]).includes(archivo.type))
    return responder({ ok: false, error: "La IA lee JPG, PNG, WEBP o PDF." }, 415);
  if (archivo.size > TAMANO_MAXIMO_OCR)
    return responder({ ok: false, error: "Archivo muy pesado para leerlo con IA (máx. 4 MB)." }, 413);

  let datos: ExtraccionComprobante | null = null;
  let error: string | null = null;
  try {
    datos = await leerComprobante(Buffer.from(await archivo.arrayBuffer()), archivo.type);
  } catch (e) {
    if (!(e instanceof ErrorOcr)) console.error("OCR:", e);
    error = e instanceof ErrorOcr ? e.message : "No se pudo leer el archivo.";
  }

  // Registro de cada lectura (para medir precisión). El archivo aún no está subido: se anota a qué
  // movimiento y espacio iba. Si falla el registro, la lectura se devuelve igual.
  if (!modoDemo()) {
    const sb = await createClient();
    const { error: e } = await sb.from("extracciones_ocr").insert({
      storage_path: `previa:${campos.data.movimientoId}/${campos.data.tipo}`,
      modelo: MODELO_OCR,
      respuesta: datos,
      error,
    });
    if (e) console.error("Registro OCR:", e.message);
  }

  return datos ? responder({ ok: true, datos }) : responder({ ok: false, error: error! }, 502);
}
