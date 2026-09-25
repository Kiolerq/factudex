# Roadmap — Factudex

## Fase 0 — Base (✅ esta entrega)
- Estructura Next.js 16 (App Router) + TypeScript + Tailwind 4.
- Tokens de diseño (tema oscuro, glass, colores por empresa) en `src/app/globals.css`.
- Clientes Supabase (`src/lib/supabase`), manifest PWA con Web Share Target, íconos.
- Esquema SQL con RLS + seed, contrato JSON de la lectura con IA.
- Documentación: README, CLAUDE.md, modelo de datos, este roadmap.

## Fase 1 — Demo para gerencia
Objetivo: una app usable con datos reales de una o dos cajas, instalada en el celular de quien liquida.

**Infraestructura**
- [x] Proyecto Supabase (free, São Paulo) + migración y seed aplicados; probado de punta a punta (login, registro con foto, saldo, alta de proveedor).
- [x] Acceso con correo y contraseña (cuentas creadas por el administrador) y página Mi cuenta.
- [x] Guardar las fotos de comprobantes en Google Drive (ver docs/google-drive.md); falta conectar la cuenta en producción.
- [ ] Deploy en Vercel conectado al repo (preview por PR).
- [x] Modo demo con datos de ejemplo cuando no hay Supabase configurado.
- [ ] Cargar las listas reales de centros de costo y placas por empresa, y las cajas reales (número y área).
- [x] `src/proxy.ts` para refrescar la sesión y redirigir a `/login`.

**Pantallas** (en este orden; referencia visual en `diseno/`)
1. [x] **Shell / HUD**: logo, switch San Lorenzo / SIPE, selector de caja, saldo de cada caja, navegación (pestañas en escritorio, barra inferior en móvil).
2. [x] **Registro** (`/registro`): formulario completo en escritorio con panel de vista previa; en móvil botón grande "Tomar foto del comprobante" y barra fija Cancelar/Guardar. Autocompletado de proveedores, alta rápida de proveedor, centro de costo desplegable ("General" por defecto; incluye placas), solicitante con sugerencias, medio de pago (Efectivo / Yape / Transferencia), dos espacios de adjunto (documento y constancia de pago; el de pago se oculta si es efectivo) y "Aún no tengo el documento".
3. [ ] **Historial** (`/historial`): tabla (escritorio) / tarjetas (móvil), búsqueda, filtros Todos / Pendientes / Completos + empresa/caja. Pendientes en ámbar. Adjuntar comprobante desde el detalle.
4. [ ] **Pendientes** (`/pendientes`): lista con días de antigüedad (informativo, sin plazo) y qué falta (documento, pago o ambos).
5. [ ] **Liquidaciones** (`/liquidaciones`): folio, fechas, total liquidable; incompletos en rojo con aviso "pasarán a la siguiente liquidación"; botón "Cerrar liquidación"; aviso cuando el saldo baja del umbral.
6. [ ] **Recargas** (`/recargas`): bandeja del aprobador — aprobar/observar liquidación y registrar la recarga manual con monto libre (sugerido: total liquidado).
7. [ ] **Compartir** (`/compartir`): recibe el POST del Web Share Target (Android), pregunta "Registro nuevo / Uno existente" y adjunta la imagen.
8. [ ] Admin mínimo: usuarios y accesos por caja (puede empezar desde el panel de Supabase).

**Criterio de salida**: gerencia ve en vivo el saldo de cada caja y qué falta sustentar, y otra persona puede liquidar una caja sin ayuda de la titular.

## Fase 2 — Lectura automática con IA
- [ ] Route Handler `POST /api/ocr` (solo servidor, API key en variable de entorno) que envía la imagen a un modelo de IA con visión y valida la respuesta contra `src/lib/ocr/esquema.ts`.
- [ ] Guardar cada lectura en `extracciones_ocr`.
- [ ] Pre-llenar el formulario de Registro, resaltando campos con baja confianza. **El usuario siempre confirma; nunca se guarda automático.**
- [ ] Si el RUC/DNI leído no existe en el maestro, ofrecer crear el proveedor.
- [ ] Integrarlo con el flujo de `/compartir` (captura de Yape/BCP → pre-llenado).
- [ ] Medir precisión (campos corregidos por el usuario vs. leídos).

## Fase 3 — Producción
- [ ] Alta de todas las cajas reales y sus límites; usuarios y roles definitivos.
- [ ] Exportar liquidación a PDF/Excel (formato que usa contabilidad).
- [ ] Notificaciones (push PWA o correo): saldo bajo umbral, pendientes críticos, liquidación por aprobar.
- [ ] Modo sin conexión para registrar en campo y sincronizar después.
- [ ] Bitácora de auditoría (quién cambió qué).
- [ ] Respaldos: export periódico de la base y del bucket (el plan free no incluye backups automáticos).
- [ ] Flujo para comprobantes físicos que llegan por cargo a planta u oficina.
- [ ] Revisión de seguridad de RLS y pruebas automatizadas del flujo de liquidación.
