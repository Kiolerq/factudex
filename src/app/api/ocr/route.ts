import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { modoDemo, obtenerRepositorio } from "@/lib/datos/repositorio";
import { MIME_LEGIBLES, TAMANO_MAXIMO_OCR, type ExtraccionComprobante, type SugerenciasLectura } from "@/lib/ocr/esquema";
import { contextoDeCaja, sugerir } from "@/lib/ocr/sugerencias";
import { ErrorOcr, leerComprobante, MODELO_OCR, ocrConfigurado } from "@/lib/ocr/leer";
import { createClient } from "@/lib/supabase/server";

// Lectura con IA de un comprobante. Recibe el archivo ya comprimido por el navegador
// (multipart: archivo, tipo, movimientoId) y devuelve los datos para PRE-LLENAR el formulario.
export const maxDuration = 60;

const Campos = z.object({
  tipo: z.enum(["documento", "pago"]),
  movimientoId: z.uuid(),
  cajaId: z.uuid().nullable(), // para sugerir categoría y centro de costo de su empresa
});

export type RespuestaOcr =
  | { ok: true; datos: ExtraccionComprobante; sugerencias: SugerenciasLectura }
  | { ok: false; error: string };

const responder = (r: RespuestaOcr, status = 200) => NextResponse.json(r, { status });

export async function POST(request: NextRequest) {
  if (!ocrConfigurado()) return responder({ ok: false, error: "La lectura con IA no está activada." }, 503);
  const repo = await obtenerRepositorio();
  if (!(await repo.usuarioActual())) return responder({ ok: false, error: "Sesión expirada." }, 401);

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const campos = Campos.safeParse({
    tipo: form?.get("tipo"),
    movimientoId: form?.get("movimientoId"),
    cajaId: form?.get("cajaId") || null,
  });
  if (!(archivo instanceof File) || !campos.success) return responder({ ok: false, error: "Petición inválida." }, 400);
  if (!(MIME_LEGIBLES as readonly string[]).includes(archivo.type))
    return responder({ ok: false, error: "La IA lee JPG, PNG, WEBP o PDF." }, 415);
  if (archivo.size > TAMANO_MAXIMO_OCR)
    return responder({ ok: false, error: "Archivo muy pesado para leerlo con IA (máx. 4 MB)." }, 413);

  let datos: ExtraccionComprobante | null = null;
  let error: string | null = null;
  const ctx = await contextoDeCaja(repo, campos.data.cajaId); // con RLS: solo cajas que ve
  try {
    datos = await leerComprobante(Buffer.from(await archivo.arrayBuffer()), archivo.type, ctx.contexto);
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

  if (!datos) return responder({ ok: false, error: error! }, 502);
  // Si fallan las sugerencias, la lectura se devuelve igual.
  const sugerencias = await sugerir(repo, datos, ctx).catch((e) => {
    console.error("Sugerencias OCR:", e);
    return { proveedor: null, proveedorPorNombre: false, categoriaId: null, centroCostoId: null, centroCostoNuevo: null, duplicado: null };
  });
  return responder({ ok: true, datos, sugerencias });
}
