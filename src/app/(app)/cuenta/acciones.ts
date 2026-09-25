"use server";

import { z } from "zod";
import { modoDemo } from "@/lib/datos/repositorio";
import { createClient } from "@/lib/supabase/server";

export type EstadoCambio = { ok?: boolean; error?: string };

const NuevaClave = z
  .object({
    nueva: z.string().min(8, "Usa al menos 8 caracteres.").max(72),
    confirmar: z.string(),
  })
  .refine((d) => d.nueva === d.confirmar, { message: "Las contraseñas no coinciden.", path: ["confirmar"] });

export async function cambiarContrasena(_: EstadoCambio, formData: FormData): Promise<EstadoCambio> {
  if (modoDemo()) return { error: "En modo demo no hay cuentas." };
  const datos = NuevaClave.safeParse({ nueva: formData.get("nueva"), confirmar: formData.get("confirmar") });
  if (!datos.success) return { error: datos.error.issues[0]!.message };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sesión expirada. Vuelve a ingresar." };
  const { error } = await supabase.auth.updateUser({ password: datos.data.nueva });
  if (error) return { error: error.message.includes("different") ? "Usa una contraseña distinta a la actual." : "No se pudo cambiar la contraseña." };
  return { ok: true };
}
