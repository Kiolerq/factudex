import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { driveConfigurado, urlAutorizacion } from "@/lib/drive/google";
import { sesionActual } from "@/lib/permisos";

// Inicia la conexión con Google Drive. Solo el administrador.
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const sesion = await sesionActual();
  if (!sesion?.esAdmin) return NextResponse.redirect(`${origin}/cuenta?drive=sin-permiso`);
  if (!driveConfigurado()) return NextResponse.redirect(`${origin}/cuenta?drive=sin-configurar`);

  const estado = randomBytes(24).toString("hex");
  const respuesta = NextResponse.redirect(urlAutorizacion(estado, `${origin}/api/google/callback`));
  respuesta.cookies.set("fx_google_estado", estado, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google",
  });
  return respuesta;
}
