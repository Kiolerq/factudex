import "server-only";
import { modoDemo } from "@/lib/datos/repositorio";
import { createClient } from "@/lib/supabase/server";
import { driveConfigurado } from "./google";

export type Almacen = "demo" | "supabase" | "drive";

/** Dónde se guardan los adjuntos nuevos: Drive si está conectado; si no, Supabase Storage. */
export async function almacenActivo(): Promise<Almacen> {
  if (modoDemo()) return "demo";
  if (!driveConfigurado()) return "supabase";
  const { data } = await (await createClient()).rpc("drive_conectado");
  return data?.[0]?.conectado ? "drive" : "supabase";
}

export async function estadoDrive(): Promise<{
  configurado: boolean;
  conectado: boolean;
  cuenta: string | null;
  carpetaId: string | null;
}> {
  if (modoDemo() || !driveConfigurado()) return { configurado: false, conectado: false, cuenta: null, carpetaId: null };
  const { data } = await (await createClient()).rpc("drive_conectado");
  const d = data?.[0];
  return { configurado: true, conectado: !!d?.conectado, cuenta: d?.cuenta_email ?? null, carpetaId: d?.carpeta_id ?? null };
}
