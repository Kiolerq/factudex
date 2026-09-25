"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { error?: string; email?: string };

const Credenciales = z.object({
  email: z.email("Ingresa un correo válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
});

// Acceso con correo y contraseña. Las cuentas las crea un administrador (no hay registro público);
// lo que cada persona ve y puede hacer depende de su rol y de las cajas asignadas (accesos_caja).
export async function iniciarSesion(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const datos = Credenciales.safeParse({ email, password: String(formData.get("password") ?? "") });
  if (!datos.success) return { error: datos.error.issues[0]!.message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(datos.data);
  if (error) return { error: "Correo o contraseña incorrectos.", email };
  redirect("/registro");
}
