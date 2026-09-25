import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace mágico: canjea el código por una sesión y entra a la app.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get("code");
  if (codigo) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(`${origin}/registro`);
  }
  return NextResponse.redirect(`${origin}/login?error=enlace`);
}
