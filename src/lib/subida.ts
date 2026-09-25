import { iniciarSubidaDrive } from "@/app/acciones";
import { createClient } from "@/lib/supabase/client";
import { nuevoUuid } from "@/lib/uuid";
import type { AdjuntoSubido, MimePermitido, TipoAdjunto } from "@/lib/datos/tipos";

// Solo navegador. Los archivos van directo del celular a su destino, sin pasar por el
// servidor de Next (Vercel limita el cuerpo de las peticiones a ~4.5 MB):
//  - drive:    Google Drive, carpeta Factudex/<Empresa>/Caja NN - <Nombre>/<AAAA-MM>.
//  - supabase: Storage, ruta <caja_id>/<movimiento_id>/<uuid>.<ext> (base del RLS).
//  - demo:     no se guarda; solo se registra la metadata.

export type Almacen = "demo" | "supabase" | "drive";

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export async function subirAdjunto(opciones: {
  almacen: Almacen;
  cajaId: string;
  movimientoId: string;
  tipo: TipoAdjunto;
  archivo: File;
  // Para el nombre del archivo en Drive: 2026-09-16_ACEROS SUSMAR_S-220.00_documento.jpg
  fecha: string;
  referencia: string;
  monto: number | null;
}): Promise<AdjuntoSubido> {
  const { almacen, cajaId, movimientoId, tipo, archivo } = opciones;
  const mimeType = archivo.type as MimePermitido; // validado al elegir el archivo

  if (almacen === "drive") {
    const sesion = await iniciarSubidaDrive({
      cajaId,
      movimientoId,
      tipo,
      mime: mimeType,
      tamano: archivo.size,
      fecha: opciones.fecha,
      referencia: opciones.referencia.slice(0, 120),
      monto: opciones.monto,
    });
    if (!sesion.ok) throw new Error(sesion.error);
    const r = await fetch(sesion.url, { method: "PUT", headers: { "Content-Type": mimeType }, body: archivo });
    if (!r.ok) throw new Error(`No se pudo subir el archivo a Google Drive (${r.status})`);
    const { id } = (await r.json()) as { id: string };
    return { tipo, storagePath: `drive:${id}`, mimeType, tamanoBytes: archivo.size };
  }

  const ruta = `${cajaId}/${movimientoId}/${nuevoUuid()}.${EXTENSION[archivo.type] ?? "bin"}`;
  if (almacen === "supabase") {
    const { error } = await createClient()
      .storage.from("comprobantes")
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  }
  return { tipo, storagePath: ruta, mimeType, tamanoBytes: archivo.size, nombreArchivo: archivo.name };
}
