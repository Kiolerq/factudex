"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { enviado: boolean; error?: string; email?: string };

export async function enviarEnlace(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { enviado: false, error: "Ingresa un correo válido." };

  const h = await headers();
  const origen = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    // Solo usuarios creados por un administrador; nadie se autorregistra.
    options: { emailRedirectTo: `${origen}/auth/callback`, shouldCreateUser: false },
  });
  if (error) return { enviado: false, error: "No se pudo enviar el enlace. ¿Tu correo está registrado?" };
  return { enviado: true, email: email.data };
}
