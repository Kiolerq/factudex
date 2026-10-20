# Lectura de comprobantes con IA

Al adjuntar una foto o PDF (o al compartirla desde otra app en Android), la app la manda a
Claude y **pre-llena** el formulario. El usuario siempre revisa y toca "Guardar"; nunca se
guarda nada solo.

## Qué lee
- **Comprobante** (factura, boleta, RxH, planilla, comprobante de egreso): monto total, fecha,
  RUC/DNI y razón social del emisor, tipo y N° de documento, concepto.
- **Constancia de pago** (Yape, Plin, transferencia): monto, fecha, medio de pago, N° de
  operación. Si se puso en el espacio del documento, la mueve a "Constancia de pago".
- Solo llena campos **vacíos**: no pisa lo que el usuario escribió. La fecha del documento
  manda sobre la del pago.
- Si el RUC leído no está en proveedores, ofrece **"Agregar y usar"**.
- Si la lectura es dudosa (confianza < 0.7) muestra un aviso en ámbar.
- Formatos: JPG, PNG, WEBP y PDF hasta 4 MB (las fotos se comprimen antes en el navegador).
  HEIC no se lee (se adjunta igual).

## Configuración
1. Crea una API key en **https://platform.claude.com** → *API Keys* (requiere cargar saldo).
2. Vercel → Settings → Environment Variables → `ANTHROPIC_API_KEY` → **Redeploy**.
3. Opcional: `OCR_MODELO` para usar otro modelo (por defecto `claude-opus-5-5`).

Sin `ANTHROPIC_API_KEY` la app funciona igual, solo sin lectura automática.

Costo aproximado con `claude-opus-5-5` y esfuerzo `low`: unos 2–4 centavos de dólar por
comprobante. Cada lectura queda en la tabla `extracciones_ocr` (modelo, respuesta o error).
La petición usa `fallbacks: "default"`: si el modelo declina leer algo, la API reintenta con el
modelo de respaldo recomendado.

## Compartir desde el celular (Android)
1. Abre la app en Chrome → menú ⋮ → **Instalar app** / *Agregar a pantalla principal*.
2. Abre Factudex instalada una vez (para que se active el service worker).
3. Desde Yape, WhatsApp, Galería o el banco: **Compartir → Factudex**. Se abre un registro
   nuevo con la imagen adjunta y los datos leídos.

En iPhone, Safari no permite que las apps web reciban "Compartir": usa el botón
"Tomar foto del comprobante" o elige el archivo desde el formulario.

Código: `src/lib/ocr/` (contrato, llamada, cliente), `src/app/api/ocr/route.ts`,
`src/components/registro/AvisoLectura.tsx`, `public/sw.js`, `src/lib/compartir.ts`.
