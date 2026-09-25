import { NextResponse, type NextRequest } from "next/server";
import { canjearCodigo, carpetaVisible, correoCuenta, crearCarpeta, NOMBRE_RAIZ, olvidarToken } from "@/lib/drive/google";
import { sesionActual } from "@/lib/permisos";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Google vuelve aquí tras autorizar. Guarda el refresh_token y crea la carpeta raíz "Factudex".
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const volver = (estado: string) => {
    const r = NextResponse.redirect(`${origin}/cuenta?drive=${estado}`);
    r.cookies.delete({ name: "fx_google_estado", path: "/api/google" });
    return r;
  };

  const sesion = await sesionActual();
  if (!sesion?.esAdmin) return volver("sin-permiso");
  const estado = request.cookies.get("fx_google_estado")?.value;
  if (!estado || estado !== searchParams.get("state")) return volver("error");
  const codigo = searchParams.get("code");
  if (!codigo) return volver(searchParams.get("error") === "access_denied" ? "cancelado" : "error");

  try {
    const token = await canjearCodigo(codigo, `${origin}/api/google/callback`);
    if (!token.refresh_token) return volver("sin-refresh");
    const admin = crearClienteAdmin();
    const { data: previa } = await admin
      .from("integraciones")
      .select("carpeta_raiz_id")
      .eq("proveedor", "google_drive")
      .maybeSingle();
    // Al reconectar la misma cuenta se reutiliza la carpeta "Factudex". Si es otra cuenta, la
    // anterior no es visible: se crea una nueva y se limpia la caché de subcarpetas.
    const correo = await correoCuenta(token.access_token);
    let carpeta = previa && (await carpetaVisible(previa.carpeta_raiz_id, token.access_token)) ? previa.carpeta_raiz_id : null;
    if (!carpeta) {
      carpeta = await crearCarpeta(NOMBRE_RAIZ, null, token.access_token);
      await admin.from("drive_carpetas").delete().neq("ruta", "");
    }
    const { error } = await admin.from("integraciones").upsert({
      proveedor: "google_drive",
      refresh_token: token.refresh_token,
      carpeta_raiz_id: carpeta,
      cuenta_email: correo,
      conectado_por: sesion.id,
      conectado_en: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    olvidarToken();
    return volver("ok");
  } catch (e) {
    console.error("Conexión con Google Drive:", e);
    return volver("error");
  }
}
