import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Usuario con sesión y si es administrador (según perfiles.rol, leído con su propio RLS). */
export async function sesionActual() {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: perfil } = await sb.from("perfiles").select("rol").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, esAdmin: perfil?.rol === "admin" };
}
