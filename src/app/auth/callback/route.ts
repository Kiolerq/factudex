import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace mágico. Acepta los dos formatos de Supabase:
//  - ?code=…                   (PKCE: el enlace se abre en el mismo navegador que lo pidió)
//  - ?token_hash=…&type=…      (plantilla de correo propia; funciona desde cualquier dispositivo)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const supabase = await createClient();

  const codigo = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;

  const { error } = codigo
    ? await supabase.auth.exchangeCodeForSession(codigo)
    : tokenHash && tipo
      ? await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
      : { error: new Error("Enlace incompleto") };

  if (!error) return NextResponse.redirect(`${origin}/registro`);
  return NextResponse.redirect(`${origin}/login?error=enlace`);
}
