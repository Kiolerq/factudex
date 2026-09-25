import { NextResponse, type NextRequest } from "next/server";
import { descargar } from "@/lib/drive/google";
import { createClient } from "@/lib/supabase/server";

// Muestra un adjunto. Primero lo lee con la sesión del usuario: si el RLS no le deja ver
// el movimiento (caja ajena), no existe para él.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: adj } = await sb
    .from("adjuntos")
    .select("storage_path, almacen, mime_type, nombre_archivo")
    .eq("id", id)
    .maybeSingle();
  if (!adj) return new NextResponse("No encontrado", { status: 404 });

  if (adj.almacen === "drive") {
    const r = await descargar(adj.storage_path.replace(/^drive:/, ""));
    if (!r.ok || !r.body) return new NextResponse("No se pudo leer el archivo de Drive", { status: 502 });
    return new NextResponse(r.body, {
      headers: {
        "Content-Type": adj.mime_type,
        "Content-Disposition": `inline; filename="${encodeURIComponent(adj.nombre_archivo ?? "comprobante")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const { data } = await sb.storage.from("comprobantes").createSignedUrl(adj.storage_path, 300);
  if (!data) return new NextResponse("No encontrado", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
