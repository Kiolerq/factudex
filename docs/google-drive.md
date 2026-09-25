# Fotos de comprobantes en Google Drive (plan)

Objetivo: que las fotos y PDF de los comprobantes queden en el Google Drive de la empresa
(5 TB libres) en carpetas ordenadas, en lugar del Storage de Supabase (1 GB en el plan gratis).

## Cómo funcionará
- La app se conecta **una sola vez** a la cuenta de Google del administrador (botón
  "Conectar Google Drive"), con el permiso `drive.file`: la app solo ve los archivos que ella misma
  crea, no el resto del Drive.
- Cada foto se sube a:
  `Factudex/<Empresa>/Caja <NN> - <Área>/<AAAA-MM>/<fecha>_<proveedor>_<monto>_<documento|pago>.jpg`
  — el Drive queda ordenado y se puede revisar sin entrar a la app.
- El navegador sube el archivo directo a Google (sesión de subida creada por el servidor), así no
  pasa por el límite de 4.5 MB de Vercel.
- Los archivos quedan **privados**. La app los muestra a través de su servidor, que primero verifica
  que el usuario tenga acceso a esa caja.
- En la base (`adjuntos`) se guarda el ID del archivo en Drive en vez de la ruta de Storage.

## Qué hace falta (una sola vez)
1. Proyecto en [Google Cloud Console](https://console.cloud.google.com) con la cuenta dueña del Drive.
2. Habilitar **Google Drive API**.
3. **Pantalla de consentimiento OAuth**: tipo *Externo*, nombre "Factudex", y **publicarla**
   (con el permiso `drive.file` no requiere verificación de Google; en modo "Prueba" el acceso
   vence cada 7 días).
4. **Credenciales → ID de cliente OAuth → Aplicación web**, con URI de redirección
   `https://<dominio-vercel>/api/google/callback`.
5. Poner en Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `SUPABASE_SERVICE_ROLE_KEY`
   (solo servidor, para guardar el token de Google fuera del alcance de los usuarios).
