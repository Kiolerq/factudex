import { NextResponse, type NextRequest } from "next/server";
import { descargar } from "@/lib/drive/google";
import { createClient } from "@/lib/supabase/server";

// Muestra la foto del depósito de un ingreso. Se lee con la sesión del usuario: si el RLS no le
// deja ver el ingreso (caja ajena), no existe para él.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const sb = await createClient();
  const { data: r } = await sb.from("recargas").select("comprobante_path, comprobante_mime").eq("id", id).maybeSingle();
  if (!r?.comprobante_path) return new NextResponse("No encontrado", { status: 404 });

  if (r.comprobante_path.startsWith("drive:")) {
    const archivo = await descargar(r.comprobante_path.replace(/^drive:/, ""));
    if (!archivo.ok || !archivo.body) return new NextResponse("No se pudo leer el archivo de Drive", { status: 502 });
    return new NextResponse(archivo.body, {
      headers: {
        "Content-Type": r.comprobante_mime ?? "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const { data } = await sb.storage.from("comprobantes").createSignedUrl(r.comprobante_path, 300);
  if (!data) return new NextResponse("No encontrado", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
