import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { driveConfigurado, idCarpetaDesdeTexto, urlAutorizacion, urlPublica } from "@/lib/drive/google";
import { sesionActual } from "@/lib/permisos";

// Inicia la conexión con Google Drive. Solo el administrador.
// ?carpeta=<enlace o id> : carpeta del Drive donde irán todos los comprobantes.
export async function GET(request: NextRequest) {
  const { origin, searchParams, search } = request.nextUrl;
  const base = urlPublica(origin);
  // Google solo acepta la dirección registrada: si se entró por otro dominio de Vercel,
  // primero se pasa al dominio oficial (ahí también vive la cookie de la conexión).
  if (base !== origin) return NextResponse.redirect(`${base}/api/google/conectar${search}`);

  const sesion = await sesionActual();
  if (!sesion?.esAdmin) return NextResponse.redirect(`${base}/cuenta?drive=sin-permiso`);
  if (!driveConfigurado()) return NextResponse.redirect(`${base}/cuenta?drive=sin-configurar`);
  const carpetaTexto = searchParams.get("carpeta") ?? "";
  const carpeta = carpetaTexto ? idCarpetaDesdeTexto(carpetaTexto) : null;
  if (carpetaTexto && !carpeta) return NextResponse.redirect(`${base}/cuenta?drive=carpeta-invalida`);

  const estado = randomBytes(24).toString("hex");
  const respuesta = NextResponse.redirect(urlAutorizacion(estado, `${base}/api/google/callback`));
  const opciones = { httpOnly: true, secure: base.startsWith("https"), sameSite: "lax" as const, maxAge: 600, path: "/api/google" };
  respuesta.cookies.set("fx_google_estado", estado, opciones);
  if (carpeta) respuesta.cookies.set("fx_google_carpeta", carpeta, opciones);
  else respuesta.cookies.delete({ name: "fx_google_carpeta", path: "/api/google" });
  return respuesta;
}
