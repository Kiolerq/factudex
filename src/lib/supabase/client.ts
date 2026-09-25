import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Cliente para Client Components. Usa la anon key: la seguridad la ponen las políticas RLS.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
