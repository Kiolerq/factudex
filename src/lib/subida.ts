import { createClient } from "@/lib/supabase/client";
import { nuevoUuid } from "@/lib/uuid";
import type { AdjuntoSubido, MimePermitido, TipoAdjunto } from "@/lib/datos/tipos";

// Solo navegador. Los archivos van directo del celular a Supabase Storage (bucket privado),
// sin pasar por el servidor de Next: Vercel limita el cuerpo de las peticiones a ~4.5 MB.
// Ruta: <caja_id>/<movimiento_id>/<uuid>.<ext> — el primer segmento es la base del RLS.

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export async function subirAdjunto(opciones: {
  demo: boolean;
  cajaId: string;
  movimientoId: string;
  tipo: TipoAdjunto;
  archivo: File;
}): Promise<AdjuntoSubido> {
  const { demo, cajaId, movimientoId, tipo, archivo } = opciones;
  const ruta = `${cajaId}/${movimientoId}/${nuevoUuid()}.${EXTENSION[archivo.type] ?? "bin"}`;

  if (!demo) {
    const { error } = await createClient()
      .storage.from("comprobantes")
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  }
  // En modo demo el archivo no se guarda en ningún lado; solo se registra su metadata.

  // El tipo MIME ya se validó al elegir el archivo.
  return { tipo, storagePath: ruta, mimeType: archivo.type as MimePermitido, tamanoBytes: archivo.size };
}
