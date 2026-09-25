# Fotos de comprobantes en Google Drive

Las fotos y PDF de los comprobantes se guardan en el Google Drive de la empresa, en carpetas
ordenadas. Si Drive no está conectado, la app usa Supabase Storage como respaldo.

## Cómo funciona
- El administrador, en **Mi cuenta**, pega el **enlace de la carpeta de Drive** donde irán todos
  los comprobantes y conecta **una sola vez** la cuenta de Google dueña de esa carpeta (o con
  permiso de editor). Permiso `drive` (necesario para escribir en una carpeta que ya existía);
  el código solo crea y lee dentro de esa carpeta. Si no se pega enlace, crea una carpeta "Factudex".
- Estructura dentro de la carpeta elegida: `<Empresa> / Caja NN - <Nombre> / <AAAA-MM> /`
  `2026-09-16_ACEROS SUSMAR_S-220.00_documento.jpg`.
- La conexión siempre usa la dirección oficial `https://factudex.vercel.app` (Google solo acepta
  la dirección de retorno registrada); si se entra por otro dominio de Vercel, redirige primero.
- El navegador sube el archivo **directo a Google** (sesión de subida reanudable creada por el
  servidor), sin pasar por Vercel.
- Cada archivo lleva marcas (`appProperties`: movimiento, caja, tipo). Al guardar, el servidor
  verifica esas marcas antes de registrar el adjunto.
- Los archivos quedan **privados** en el Drive. La app los muestra por `/api/archivos/<id>`, que
  primero verifica (RLS) que el usuario tenga acceso a esa caja.
- El token de Google se guarda en la tabla `integraciones` (RLS sin políticas: solo el servidor
  con la clave `service_role` la lee). Caché de carpetas en `drive_carpetas`.

## Configuración (una sola vez)
1. Google Cloud Console → proyecto "Factudex" → habilitar **Google Drive API**.
2. Pantalla de consentimiento OAuth: *Externo*, **publicada** (en modo "Prueba" el permiso vence
   cada 7 días).
3. Credenciales → ID de cliente OAuth → *Aplicación web* → URI de redirección
   `https://factudex.vercel.app/api/google/callback`.
4. Vercel → Settings → Environment Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys → *service_role*).
   Luego **Redeploy**.
5. En la app: **Mi cuenta** → pegar el enlace de la carpeta → **Conectar Google Drive** → elegir la
   cuenta dueña de la carpeta → Permitir (si aparece "Google no verificó esta app": Configuración
   avanzada → Ir a Factudex).

Código: `src/lib/drive/google.ts` (API), `src/lib/drive/estado.ts`, `src/app/api/google/*`,
`src/app/api/archivos/[id]`, acción `iniciarSubidaDrive` en `src/app/acciones.ts`.
