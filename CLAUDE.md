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
- **Marca por empresa** vía `data-empresa="SL|SIPE"` en `<html>`, que cambia `--fx-primary` / `--fx-accent`:
  San Lorenzo `#2E75B6` + `#D3453A` · SIPE `#1FA2C9` + `#2FAE60`. Usa `text-fx-primary`, `bg-fx-primary-soft`, etc. — nunca hex de marca sueltos en componentes.
- **Estados** (no cambian por empresa): Pendiente `#D9A441` (`fx-pendiente`), Completo `#3FBE72` (`fx-completo`). Incompletos en la liquidación abierta (no entrarán al cierre): rojo `fx-error`.
- Badges de estado: pastilla con fondo del color al 16%, borde al 40%, texto del color, prefijo `●`.
- **Mobile-first**: botón grande "Tomar foto del comprobante" y barra inferior fija con Cancelar / Guardar. Escritorio: formulario + panel lateral de vista previa.

## Reglas de negocio
- El saldo **se calcula** (`v_saldo_cajas`), nunca se guarda ni se calcula en el cliente.
- Pendiente/Completo lo decide la BD (trigger sobre `adjuntos`): completo = tiene adjunto `documento` (factura, boleta, planilla de movilidad, comprobante de egreso…) **y** adjunto `pago` (captura Yape, voucher…). Con uno solo sigue pendiente.
- Solo se liquidan movimientos completos. Los pendientes no tienen plazo: al cerrar, `cerrar_liquidacion` los pasa a la siguiente liquidación.
- Centro de costo: lista fija por empresa (`centros_costo`), siempre desplegable, nunca texto libre.
- Monto de recarga libre (no hay fondo fijo por caja).
- "Se pagó por Yape" es independiente del tipo de documento (pueden coexistir).
- Movimientos no se borran: se anulan con motivo. Si la liquidación ya se cerró, no se editan ni se les quitan adjuntos.
- Cambios de estado de liquidación solo por RPC (`cerrar_liquidacion`, `revisar_liquidacion`) o al insertar la recarga.
- Recargas son **manuales**; no hay integración bancaria.
- IA/OCR (fase 2): solo **pre-llena**; el usuario confirma siempre. Nunca guardar automático. Contrato en `src/lib/ocr/esquema.ts`. La API key vive solo en el servidor.

## Convenciones
- Nombres de dominio en español y snake_case en la BD (`movimientos`, `caja_id`); camelCase en TS.
- Toda tabla nueva: RLS activado + políticas usando `tiene_acceso_caja()` / `es_admin()`. Nuevos cambios de esquema = nueva migración en `supabase/migrations/` (timestamp), nunca editar una ya aplicada en producción.
- Tras cambiar el esquema, regenerar `src/types/database.ts` con `supabase gen types`.
- Server Components y Server Actions por defecto; `"use client"` solo donde hay interacción.
- Archivos en Storage: `<caja_id>/<movimiento_id>/<uuid>.<ext>` (el primer segmento es la base del RLS).
- Formato de moneda: `Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })`.
- Antes de dar algo por terminado: `npm run lint` y `npm run build` sin errores.
