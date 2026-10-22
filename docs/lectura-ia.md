# Lectura de comprobantes con IA

Al adjuntar una foto o PDF (o al compartirla desde otra app en Android), la app la manda a
Claude y **pre-llena** el formulario. El usuario siempre revisa y toca "Guardar"; nunca se
guarda nada solo.

## Qué lee
- **Comprobante** (factura, boleta, RxH, planilla, comprobante de egreso): monto total, fecha,
  RUC/DNI y razón social del emisor, tipo y N° de documento, concepto.
- **Constancia de pago** (Yape, Plin, transferencia): monto, fecha, medio de pago, N° de
  operación. Si se puso en el espacio del documento, la mueve a "Constancia de pago".
- Además, con los datos de la app:
  - **Proveedor** por RUC/DNI, o por **parecido de nombre** cuando no hay RUC (en un Yape sale
    "Johan Y. Mesa R." → *Johan Yarlin Mesa Rios*); se marca "revísalo".
  - **Categoría** y **centro de costo** elegidos de las listas de la empresa de la caja; si lee
    una placa que no está en la lista, ofrece **"Agregar y usar"**.
  - **Duplicado**: si ya hay un gasto con el mismo RUC y N° de documento, lo avisa con enlace.
  - Si el documento y la constancia de pago dicen **montos distintos**, lo avisa.
- Solo llena campos **vacíos**: no pisa lo que el usuario escribió. La fecha del documento
  manda sobre la del pago.
- Si el RUC leído no está en proveedores, ofrece **"Agregar y usar"**.
- Si la lectura es dudosa (confianza < 0.7) muestra un aviso en ámbar.
- Formatos: JPG, PNG, WEBP y PDF hasta 4 MB (las fotos se comprimen antes en el navegador).
  HEIC no se lee (se adjunta igual).

## Configuración
La app usa **Gemini** (Google) si encuentra `GEMINI_API_KEY`; si no, **Claude** con
`ANTHROPIC_API_KEY`. Sin ninguna de las dos funciona igual, solo sin lectura automática.

### Gemini (plan gratis)
1. Entra a **https://aistudio.google.com/apikey** con una cuenta de Google → *Create API key*.
2. Vercel → Settings → Environment Variables → `GEMINI_API_KEY` → **Redeploy**.
3. Opcional: `OCR_MODELO` para usar otro modelo (por defecto `gemini-3.6-flash`; si está saturado
   o sin cupo, prueba solo con `gemini-3.8-flash`).

El plan gratis tiene un límite de lecturas por minuto y por día; si se pasa, la app avisa
"Se acabó el cupo gratis". **Ojo:** en el plan gratis Google puede usar lo que se le envía
(facturas, RUC, montos) para mejorar sus productos. Activando la facturación en Google AI Studio
deja de hacerlo (y se cobra por uso).

### Claude
1. Crea una API key en **https://platform.claude.com** → *API Keys* (requiere cargar saldo).
2. Vercel → Settings → Environment Variables → `ANTHROPIC_API_KEY` → **Redeploy**.
3. Opcional: `OCR_MODELO` (por defecto `claude-opus-5-5`; `claude-haiku-5-5` cuesta ~40 veces menos).

Costo aproximado con `claude-opus-5-5` y esfuerzo `low`: unos 2–4 centavos de dólar por
comprobante. La petición usa `fallbacks: "default"`: si el modelo declina leer algo, la API
reintenta con el modelo de respaldo recomendado.

Cada lectura queda en la tabla `extracciones_ocr` (modelo, respuesta o error).

## Compartir desde el celular (Android)
1. Abre la app en Chrome → menú ⋮ → **Instalar app** / *Agregar a pantalla principal*.
2. Abre Factudex instalada una vez (para que se active el service worker).
3. Desde Yape, WhatsApp, Galería o el banco: **Compartir → Factudex**. Se abre una ventana que
   pregunta, por cada archivo:
   - **¿Qué es?** Documento (factura, boleta, RxH, planilla, comprobante de egreso) o constancia
     de pago (Yape, Plin, transferencia). Viene marcado lo que leyó la IA.
   - **¿De qué caja sale el dinero?** Empresa y caja (si la persona registra en varias); cada
     caja muestra cuántos pendientes le faltan justo ese archivo.
   - **¿Para qué gasto?** Uno **nuevo** (abre el registro en esa caja con el archivo en su lugar
     y los datos leídos) o un **pendiente** de esa caja al que le falta justo eso (el que
     coincide en monto, proveedor o fecha va primero). Al juntarlo, lo leído solo llena lo
     que estaba vacío (tipo y N° de documento, proveedor, medio y N° de operación).

En Xiaomi/Redmi, Chrome necesita el permiso *Otros permisos → Accesos directos de la pantalla de
inicio* para instalar la app; sin él queda como acceso directo y no aparece en Compartir.

En iPhone, Safari no permite que las apps web reciban "Compartir": usa el botón
"Tomar foto del comprobante" o elige el archivo desde el formulario.

Código: `src/lib/ocr/` (contrato, llamada, cliente), `src/app/api/ocr/route.ts`,
`src/components/registro/AvisoLectura.tsx`, `src/components/registro/SelectorCompartido.tsx`,
`public/sw.js`, `src/lib/compartir.ts`.
