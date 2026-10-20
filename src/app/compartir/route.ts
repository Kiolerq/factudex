import { NextResponse, type NextRequest } from "next/server";

// Normalmente public/sw.js atiende el POST de "Compartir" sin llegar al servidor.
// Si el service worker aún no está instalado (primera vez), se vuelve al registro con un aviso.
export function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/registro?compartido=sin-sw", request.url), 303);
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/registro", request.url));
}
