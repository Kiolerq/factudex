# Mudar Factudex a cuentas nuevas (GitHub, Supabase, Vercel, Google)

Orden: GitHub → Supabase → Vercel → Google. Tiempo estimado: 30 minutos. Todo en planes gratis.

## 1. GitHub (el código)
Con la cuenta nueva de GitHub:
1. Ve a **https://github.com/new/import**.
2. *Your old repository's clone URL*: `https://github.com/mtts01sanlorenzo-crypto/factudex`.
   Si el repositorio es privado, GitHub pide usuario y un token de la cuenta antigua; otra opción
   es, desde la cuenta antigua, **Settings → General → Transfer ownership** hacia la nueva.
3. Nombre: `factudex`. Privado. **Begin import**.

## 2. Supabase (la base de datos)
Sigue `docs/configurar-supabase.md`. En resumen:
1. **New project** → `factudex`, región **São Paulo**.
2. **SQL Editor** → pega `supabase/instalacion_completa.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: desactiva *Allow new users to sign up*.
4. **Authentication → Users → Add user**: tu correo + contraseña, *Auto Confirm User*.
5. **SQL Editor** → pega `supabase/primer_admin.sql` (con tu correo) → **Run**.
6. **Project Settings → API**: copia *Project URL*, *anon key* y *service_role key*.

## 3. Vercel (la página)
1. **Add New → Project** → importa el repositorio `factudex` de la cuenta nueva de GitHub.
2. Antes de **Deploy**, en *Environment Variables* agrega:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `GOOGLE_CLIENT_ID` | del paso 4 (se puede agregar después + Redeploy) |
   | `GOOGLE_CLIENT_SECRET` | del paso 4 |

3. **Deploy**. Anota la dirección final (ej. `https://factudex.vercel.app` o
   `https://factudex-xxxx.vercel.app`; se cambia en **Settings → Domains**).
4. En Supabase → **Authentication → URL Configuration**: *Site URL* = esa dirección; *Redirect URLs*
   = `<dirección>/auth/callback`.

## 4. Google (fotos en Drive)
Detalle en `docs/google-drive.md`. Con la cuenta de Google dueña de la carpeta de comprobantes:
1. **console.cloud.google.com** → proyecto nuevo `Factudex` → habilita **Google Drive API**.
2. **Google Auth Platform → Marca (Branding)**:
   - Página principal: `<dirección>/login`
   - Política de privacidad: `<dirección>/privacidad`
   - Condiciones del servicio: `<dirección>/terminos`
   - Dominio autorizado: el dominio de Vercel (ej. `factudex.vercel.app`).
3. **Público (Audience)**: *Externo* → **Publicar app** (queda "En producción"). **No** enviar a
   verificación: no hace falta para uso interno (aparece el aviso "app no verificada").
4. **Clientes → Crear cliente** → *Aplicación web* → URI de redirección autorizada:
   `<dirección>/api/google/callback`. Copia el ID y el secreto a Vercel y haz **Redeploy**.
5. En la app: **Mi cuenta** → pega el enlace de la carpeta → **Conectar Google Drive**.

La app arma la dirección de retorno con la dirección de producción de Vercel
(`VERCEL_PROJECT_PRODUCTION_URL`); si usas un dominio propio, define `NEXT_PUBLIC_SITE_URL`.
