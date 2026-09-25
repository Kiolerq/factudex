import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Google Drive vía REST (sin librerías pesadas).
// Permiso `drive`: necesario para escribir en una carpeta que ya existía en el Drive (la que
// elige el administrador). El código SOLO crea y lee dentro de esa carpeta raíz.

const ALCANCE = "https://www.googleapis.com/auth/drive";
const CARPETA = "application/vnd.google-apps.folder";
export const NOMBRE_RAIZ = "Factudex";

export function driveConfigurado(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * URL pública fija de la app. Google solo acepta la dirección de retorno registrada
 * (https://factudex.vercel.app/api/google/callback), así que no se usa el dominio de cada
 * deploy de Vercel. VERCEL_PROJECT_PRODUCTION_URL la define Vercel automáticamente.
 */
export function urlPublica(origenPeticion: string): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return origenPeticion;
}

/** Acepta el enlace de una carpeta de Drive o su id; devuelve el id o null. */
export function idCarpetaDesdeTexto(texto: string): string | null {
  const t = texto.trim();
  const m = t.match(/\/folders\/([\w-]{10,})/) ?? t.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1]!;
  return /^[\w-]{10,}$/.test(t) ? t : null;
}

/** Verifica que la cuenta conectada pueda crear archivos dentro de la carpeta. */
export async function carpetaUtilizable(id: string, token: string): Promise<boolean> {
  try {
    const d = await drive<{ mimeType: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean } }>(
      `files/${encodeURIComponent(id)}?fields=mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`,
      {},
      token,
    );
    return d.mimeType === CARPETA && !d.trashed && d.capabilities?.canAddChildren === true;
  } catch {
    return false;
  }
}

export function urlAutorizacion(estado: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ALCANCE,
    access_type: "offline",
    prompt: "consent", // garantiza refresh_token aunque ya se haya autorizado antes
    include_granted_scopes: "true",
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface RespuestaToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function pedirToken(cuerpo: Record<string, string>): Promise<RespuestaToken> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...cuerpo,
    }),
  });
  const d = (await r.json()) as Partial<RespuestaToken> & { error?: string };
  if (!r.ok || !d.access_token) throw new Error(`Google rechazó el token: ${d.error ?? r.status}`);
  return d as RespuestaToken;
}

export function canjearCodigo(codigo: string, redirectUri: string) {
  return pedirToken({ grant_type: "authorization_code", code: codigo, redirect_uri: redirectUri });
}

// Token de acceso en memoria del servidor (dura ~1 h); se renueva con el refresh_token guardado.
let cache: { token: string; vence: number } | null = null;

export async function tokenAcceso(): Promise<string> {
  if (cache && cache.vence > Date.now() + 60_000) return cache.token;
  const { data } = await crearClienteAdmin()
    .from("integraciones")
    .select("refresh_token")
    .eq("proveedor", "google_drive")
    .maybeSingle();
  if (!data) throw new Error("Google Drive no está conectado");
  const t = await pedirToken({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  cache = { token: t.access_token, vence: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

export function olvidarToken() {
  cache = null;
}

async function drive<T>(ruta: string, init: RequestInit = {}, token?: string): Promise<T> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? (await tokenAcceso())}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

export async function crearCarpeta(nombre: string, padre: string | null, token?: string): Promise<string> {
  const d = await drive<{ id: string }>(
    "files?fields=id&supportsAllDrives=true",
    { method: "POST", body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: padre ? [padre] : undefined }) },
    token,
  );
  return d.id;
}

export async function carpetaVisible(id: string, token: string): Promise<boolean> {
  try {
    const d = await drive<{ trashed?: boolean }>(`files/${encodeURIComponent(id)}?fields=id,trashed&supportsAllDrives=true`, {}, token);
    return !d.trashed;
  } catch {
    return false;
  }
}

export async function correoCuenta(token: string): Promise<string | null> {
  try {
    const d = await drive<{ user?: { emailAddress?: string } }>("about?fields=user(emailAddress)", {}, token);
    return d.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Nombre seguro para Drive (sin caracteres problemáticos, máx. 80). */
export const nombreSeguro = (s: string) =>
  s.replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/** Devuelve el id de Factudex/<seg1>/<seg2>/…, creando lo que falte (con caché en la BD). */
export async function asegurarCarpeta(segmentos: string[]): Promise<string> {
  const admin = crearClienteAdmin();
  const { data: raiz } = await admin
    .from("integraciones")
    .select("carpeta_raiz_id")
    .eq("proveedor", "google_drive")
    .single();
  if (!raiz) throw new Error("Google Drive no está conectado");

  let padre = raiz.carpeta_raiz_id;
  let ruta = "";
  for (const seg of segmentos.map(nombreSeguro)) {
    ruta = ruta ? `${ruta}/${seg}` : seg;
    const { data: guardada } = await admin.from("drive_carpetas").select("folder_id").eq("ruta", ruta).maybeSingle();
    if (guardada) {
      padre = guardada.folder_id;
      continue;
    }
    const q = `name = '${seg.replace(/'/g, "\\'")}' and '${padre}' in parents and mimeType = '${CARPETA}' and trashed = false`;
    const hallada = await drive<{ files: { id: string }[] }>(`files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    padre = hallada.files[0]?.id ?? (await crearCarpeta(seg, padre));
    await admin.from("drive_carpetas").upsert({ ruta, folder_id: padre });
  }
  return padre;
}

/**
 * Crea una sesión de subida reanudable. El navegador sube el archivo directo a la URL
 * devuelta (iniciada con `Origin`, la sesión acepta CORS), sin pasar por Vercel.
 */
export async function iniciarSubida(o: {
  nombre: string;
  mime: string;
  tamano: number;
  carpetaId: string;
  origen: string;
  propiedades: Record<string, string>;
}): Promise<string> {
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await tokenAcceso()}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": o.mime,
      "X-Upload-Content-Length": String(o.tamano),
      Origin: o.origen,
    },
    body: JSON.stringify({ name: nombreSeguro(o.nombre), parents: [o.carpetaId], appProperties: o.propiedades }),
  });
  const url = r.headers.get("location");
  if (!r.ok || !url) throw new Error(`No se pudo iniciar la subida a Drive (${r.status})`);
  return url;
}

export function metadatos(fileId: string) {
  return drive<{ id: string; name: string; mimeType: string; size?: string; appProperties?: Record<string, string> }>(
    `files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,appProperties&supportsAllDrives=true`,
  );
}

export async function descargar(fileId: string): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${await tokenAcceso()}` },
  });
}
