import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

// Justo después de iniciar sesión, el token puede llegar "del futuro" por un desfase de
// reloj de pocos segundos entre servidores de Supabase. Reintenta hasta 2 veces esperando 1.5 s.
const fetchConReintento: typeof fetch = async (entrada, init) => {
  for (let intento = 0; ; intento++) {
    const r = await fetch(entrada, init);
    if (r.status !== 401 || intento >= 2) return r;
    const cuerpo = await r.clone().text();
    if (!cuerpo.includes("issued at future")) return r;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
};

// Cliente para Server Components, Server Actions y Route Handlers.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchConReintento },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: el refresco de sesión lo hará proxy.ts.
          }
        },
      },
    },
  );
}
