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
  if (error) {
    if (error.code === "invalid_credentials") return { error: "Correo o contraseña incorrectos.", email };
    if (error.code === "email_not_confirmed") return { error: "Tu correo aún no está confirmado. Avisa al administrador.", email };
    // Cualquier otro error es de conexión o configuración con Supabase, no de la persona.
    console.error("Login:", error.status, error.code, error.message);
    return { error: `No se pudo conectar con la base de datos (${error.status ?? "sin respuesta"} · ${error.code ?? error.name}). Avisa al administrador.`, email };
  }
  redirect(destinoSeguro(formData.get("siguiente")));
}

/** Solo rutas internas de la app (evita redirigir a otro sitio con ?siguiente=https://…). */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const destino = typeof valor === "string" ? valor : "";
  return /^\/(?!\/)[^\\]*$/.test(destino) && !destino.startsWith("/login") ? destino : "/panel";
}
