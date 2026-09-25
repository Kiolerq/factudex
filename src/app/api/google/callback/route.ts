import { NextResponse, type NextRequest } from "next/server";
import {
  canjearCodigo,
  carpetaUtilizable,
  carpetaVisible,
  correoCuenta,
  crearCarpeta,
  NOMBRE_RAIZ,
  olvidarToken,
  urlPublica,
} from "@/lib/drive/google";
import { sesionActual } from "@/lib/permisos";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Google vuelve aquí tras autorizar. Guarda el refresh_token y fija la carpeta raíz:
// la que eligió el administrador o, si no eligió, una carpeta "Factudex" nueva.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const base = urlPublica(origin);
  const volver = (estado: string) => {
    const r = NextResponse.redirect(`${base}/cuenta?drive=${estado}`);
    r.cookies.delete({ name: "fx_google_estado", path: "/api/google" });
    r.cookies.delete({ name: "fx_google_carpeta", path: "/api/google" });
    return r;
  };

  const sesion = await sesionActual();
  if (!sesion?.esAdmin) return volver("sin-permiso");
  const estado = request.cookies.get("fx_google_estado")?.value;
  if (!estado || estado !== searchParams.get("state")) return volver("error");
  const codigo = searchParams.get("code");
  if (!codigo) return volver(searchParams.get("error") === "access_denied" ? "cancelado" : "error");
  const carpetaElegida = request.cookies.get("fx_google_carpeta")?.value ?? null;

  try {
    const token = await canjearCodigo(codigo, `${base}/api/google/callback`);
    if (!token.refresh_token) return volver("sin-refresh");
    const admin = crearClienteAdmin();
    const { data: previa } = await admin
      .from("integraciones")
      .select("carpeta_raiz_id")
      .eq("proveedor", "google_drive")
      .maybeSingle();

    let carpeta: string;
    if (carpetaElegida) {
      if (!(await carpetaUtilizable(carpetaElegida, token.access_token))) return volver("carpeta-sin-acceso");
      carpeta = carpetaElegida;
    } else if (previa && (await carpetaVisible(previa.carpeta_raiz_id, token.access_token))) {
      carpeta = previa.carpeta_raiz_id;
    } else {
      carpeta = await crearCarpeta(NOMBRE_RAIZ, null, token.access_token);
    }
    // Si cambió la carpeta raíz, la caché de subcarpetas ya no sirve.
    if (previa?.carpeta_raiz_id !== carpeta) await admin.from("drive_carpetas").delete().neq("ruta", "");

    const { error } = await admin.from("integraciones").upsert({
      proveedor: "google_drive",
      refresh_token: token.refresh_token,
      carpeta_raiz_id: carpeta,
      cuenta_email: await correoCuenta(token.access_token),
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
