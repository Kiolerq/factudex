@AGENTS.md

# Factudex — contexto para sesiones de Claude

App web (PWA) de cajas chicas para **Compañía San Lorenzo S.A.C.** (`SL`) y **SIPE** (`SIPE`), Perú.
Montos en soles (`S/ 1,240.00`), fechas `dd/mm` o `dd/mm/aaaa`, zona `America/Lima`.
**Todo el producto (UI, docs, commits, comentarios) va en español.**

Lee antes de trabajar: `docs/modelo-datos.md`, `docs/roadmap.md`, `diseno/LEEME.md`.

## Stack
- Next.js 16 App Router + TypeScript estricto + Tailwind CSS 4 (config en CSS, `@theme` en `src/app/globals.css`).
  Next 16 cambió cosas: `middleware` ahora es `proxy.ts`; revisa `node_modules/next/dist/docs/` ante la duda.
- Supabase: Postgres + Auth + Storage (bucket privado `comprobantes`). Clientes en `src/lib/supabase/{client,server}.ts`.
- Validación con `zod`. Deploy en Vercel. Todo debe caber en los free tiers.

## Reglas de diseño (no negociables)
La referencia visual aprobada son los HTML de `diseno/`. Copia de ahí espaciados, radios y estructura.
- **Tema oscuro siempre.** Nunca fondo blanco ni negro plano. Fondo: degradado `#0A0E1A → #0D1526 → #0A0F1C` (ya en `body`).
- **Glass**: `rgba(255,255,255,0.045)`, borde `rgba(255,255,255,0.09)`, `blur(16px)`, radio 16px (14px en móvil). Usa `.fx-card`, `.fx-input`, `.fx-label`.
- **Fuentes**: Space Grotesk para títulos y cifras grandes (`font-display`), IBM Plex Sans para texto (`font-sans`).
- **Marca por empresa** vía `data-empresa="SL|SIPE"` (en el contenedor del layout `(app)`), que cambia `--fx-primary` / `--fx-accent`:
  San Lorenzo `#2E75B6` + `#D3453A` · SIPE `#1FA2C9` + `#2FAE60`. Usa `text-fx-primary`, `bg-fx-primary-soft`, etc. — nunca hex de marca sueltos en componentes.
- **Estados** (no cambian por empresa): Pendiente `#D9A441` (`fx-pendiente`), Completo `#3FBE72` (`fx-completo`). Incompletos en la liquidación abierta (no entrarán al cierre): rojo `fx-error`.
- Badges de estado: pastilla con fondo del color al 16%, borde al 40%, texto del color, prefijo `●`.
- **Mobile-first**: botón grande "Tomar foto del comprobante" y barra inferior fija con Cancelar / Guardar. Escritorio: formulario + panel lateral de vista previa.

## Reglas de negocio
- El saldo **se calcula** (`v_saldo_cajas`), nunca se guarda ni se calcula en el cliente.
- Pendiente/Completo lo decide la BD (`fx_estado_movimiento`): completo = adjunto `documento` (factura, boleta, planilla de movilidad, comprobante de egreso…) **y** adjunto `pago` (captura Yape, voucher…). Si `medio_pago = 'efectivo'`, basta el documento.
- Solo se liquidan movimientos completos. Los pendientes no tienen plazo: al cerrar, `cerrar_liquidacion` los pasa a la siguiente liquidación.
- Centro de costo (`centros_costo`): lista por empresa. Incluye **placas** o cualquier destino del gasto (no hay campo placa aparte). Opcional; preselecciona "General". En el registro se escribe y se filtra (`CampoCentroCosto`); si no existe, "＋ Agregar" lo suma a la lista de la empresa (registradores de esa empresa pueden; migración `20261023000000`). Nunca texto suelto en el movimiento: siempre `centro_costo_id`. Se compara sin mayúsculas, tildes ni guiones (`claveCentro`).
- Solicitantes (`solicitantes`): lista por empresa que solo sugiere nombres; el movimiento guarda el texto.
- Datos maestros llegan en `docs/plantillas/datos_maestros_factudex.xlsx` (centros de costo, solicitantes, proveedores).
- Folio de liquidación: `NNLQXX-AREA-0001` (ej. `SLLQ01-MT-0001`), lo genera la BD con `empresas.sigla`, `cajas.numero` y `cajas.area`.
- Monto de recarga libre (no hay fondo fijo por caja).
- El medio de pago (efectivo / Yape / transferencia / otro) es independiente del tipo de documento.
- Movimientos no se borran: se anulan con motivo. Si la liquidación ya se cerró, no se editan ni se les quitan adjuntos.
- Cambios de estado de liquidación solo por RPC (`cerrar_liquidacion`, `revisar_liquidacion`) o al insertar la recarga.
- Recargas son **manuales**; no hay integración bancaria.
- IA/OCR: solo **pre-llena** campos vacíos; el usuario confirma siempre. Además de leer, el servidor sugiere (`src/lib/ocr/sugerencias.ts`): proveedor por RUC o por parecido de nombre (Yape), categoría y centro de costo de las listas de la empresa (o la placa leída para agregarla), comprobante ya registrado (mismo RUC y N°) y aviso si el monto del documento y del pago no coinciden. Nunca guardar automático. Contrato en `src/lib/ocr/esquema.ts`, llamada en `src/lib/ocr/leer.ts`: Gemini si hay `GEMINI_API_KEY`, si no Claude con `ANTHROPIC_API_KEY` (claves solo en el servidor), ruta `POST /api/ocr`. Ver `docs/lectura-ia.md`.
- Compartir (Android): `public/sw.js` recibe el POST de `/compartir` (Web Share Target), guarda los archivos en la caché `fx-compartido` y abre `/registro?compartido=1`.

## Arquitectura
- Datos: `src/lib/datos/repositorio.ts` define la interfaz; `supabase.ts` es la real y `demo.ts` la de ejemplo (se usa sola si faltan las variables de Supabase). Toda pantalla nueva agrega sus métodos a **ambas**.
- Server Actions en `src/app/acciones.ts`: validan con zod (`src/lib/datos/esquemas.ts`) y verifican sesión siempre.
- Caja activa del HUD: cookie `fx_caja` (`src/lib/seleccion.ts`), solo preferencia de UI.
- Adjuntos: el navegador comprime la foto (`src/lib/imagen.ts`) y la sube directo a su destino (`src/lib/subida.ts`): **Google Drive** si está conectado (`docs/google-drive.md`, `adjuntos.almacen = 'drive'`, `storage_path = 'drive:<fileId>'`) o Supabase Storage como respaldo. La acción solo registra la ruta (y verifica las marcas del archivo en Drive). No mandar archivos por Server Actions (límite de ~4.5 MB en Vercel). Para mostrar un adjunto usar `/api/archivos/<id>`.
- `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor (`src/lib/supabase/admin.ts`, `import "server-only"`) y solo para tablas internas sin políticas (`integraciones`, `drive_carpetas`) y para Supabase Auth en el panel de usuarios (crear cuenta, cambiar contraseña, bloquear el ingreso), siempre después de verificar que quien llama es admin (`repoAdmin()` en `acciones.ts`). Perfiles y accesos se guardan con la sesión del admin (RLS).
- Usuarios (`/admin`, solo admin): rol global admin o no, módulos visibles (`perfiles.modulos`, null = todos; solo pantalla, se exige con `exigirModulo()` en `src/lib/contexto.ts`) y rol por caja (`accesos_caja`: lector / registrador / aprobador), que es lo que de verdad limita los datos (RLS).
- Exportación de liquidación a Excel: `src/lib/exportar/liquidacionExcel.ts` replica el formato de contabilidad (`pruebaliquidacion.xlsx`): mismas columnas y celdas, totales como fórmulas con su valor ya calculado. No cambiar columnas sin que lo pida contabilidad.
- Tokens de marca extra: `fx-primary-light` (texto sobre fondo suave), `fx-primary-dark` (degradado), `fx-primary-line` (bordes).

## Convenciones
- Nombres de dominio en español y snake_case en la BD (`movimientos`, `caja_id`); camelCase en TS.
- Toda tabla nueva: RLS activado + políticas usando `tiene_acceso_caja()` / `es_admin()`. Nuevos cambios de esquema = nueva migración en `supabase/migrations/` (timestamp), nunca editar una ya aplicada en producción.
- Tras cambiar el esquema, regenerar `src/types/database.ts` con `supabase gen types`.
- Server Components y Server Actions por defecto; `"use client"` solo donde hay interacción.
- Archivos en Storage: `<caja_id>/<movimiento_id>/<uuid>.<ext>` (el primer segmento es la base del RLS).
- Formato de moneda: `Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })`.
- Antes de dar algo por terminado: `npm run lint` y `npm run build` sin errores.
