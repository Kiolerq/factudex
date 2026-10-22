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
- [ ] Deploy en Vercel conectado al repo (preview por PR). Proyecto `juaneco-s-org/factudex`, región `gru1`; si no despliega, ver "Si Vercel no despliega" en docs/mudanza.md.
- [x] Modo demo con datos de ejemplo cuando no hay Supabase configurado.
- [ ] Cargar las listas reales de centros de costo y placas por empresa, y las cajas reales (número y área).
- [x] `src/proxy.ts` para refrescar la sesión y redirigir a `/login`.

**Pantallas** (en este orden; referencia visual en `diseno/`)
1. [x] **Shell / HUD**: logo, switch San Lorenzo / SIPE, selector de caja, saldo de cada caja, navegación (pestañas en escritorio, barra inferior en móvil).
2. [x] **Registro** (`/registro`): "¿De qué caja sale el dinero?" (empresa y caja, con su saldo) cuando la persona registra en varias; formulario completo en escritorio con panel de vista previa; en móvil botón grande "Tomar foto del comprobante" y barra fija Cancelar/Guardar. Autocompletado de proveedores, alta rápida de proveedor, centro de costo desplegable ("General" por defecto; incluye placas), solicitante con sugerencias, medio de pago (Efectivo / Yape / Transferencia), dos espacios de adjunto (documento y constancia de pago; el de pago se oculta si es efectivo) y "Aún no tengo el documento".
3. [x] **Historial** (`/historial`): tabla (escritorio) / tarjetas (móvil), búsqueda, filtros Todos / Pendientes / Completos / Anulados + caja. Pendientes en ámbar. Detalle (`/movimientos/[id]`) con adjuntos, "Completar sustento" (adjuntar documento o constancia que falta) y anulación con motivo.
4. [x] **Pendientes** (`/pendientes`): lista con días de antigüedad (informativo, sin plazo) y qué falta (documento, pago o ambos).
5. [x] **Liquidaciones** (`/liquidaciones`): folio, fechas, saldo anterior / ingresos / egresos / por reembolsar; incompletos en rojo con aviso "pasarán a la siguiente liquidación"; botón "Cerrar liquidación" (y "Volver a enviar" si fue observada); aviso cuando el saldo baja del umbral; detalle (`/liquidaciones/[id]`) y descarga en Excel.
6. [x] **Recargas** (`/recargas`): bandeja del aprobador — aprobar/observar liquidación y registrar la recarga manual con monto libre (sugerido: total liquidado).
7. [x] **Compartir** (`/compartir`): el service worker recibe el POST del Web Share Target (Android) y abre un registro nuevo con la imagen y pregunta qué es (tipo de documento o constancia de Yape/Plin/transferencia, con la sugerencia de la IA) y si va a un gasto nuevo o a un pendiente al que le falta ese archivo (el más probable primero).
8. [x] Admin mínimo (`/admin` → Usuarios): crear usuarios con contraseña temporal, cambiar contraseña, activar/desactivar, administrador sí/no, módulos que ve y rol por caja (lector / registrador / aprobador). Requiere la migración `20261022000000_modulos_por_usuario.sql`.

**Criterio de salida**: gerencia ve en vivo el saldo de cada caja y qué falta sustentar, y otra persona puede liquidar una caja sin ayuda de la titular.

## Fase 2 — Lectura automática con IA
- [x] Route Handler `POST /api/ocr` (solo servidor, API key en variable de entorno) que envía la imagen o PDF a Claude y valida la respuesta contra `src/lib/ocr/esquema.ts`.
- [x] Guardar cada lectura en `extracciones_ocr`.
- [x] Pre-llenar el formulario de Registro (solo campos vacíos), con aviso si la lectura es dudosa. **El usuario siempre confirma; nunca se guarda automático.**
- [x] Si el RUC/DNI leído no existe en el maestro, ofrecer crear el proveedor.
- [x] Integrarlo con el flujo de `/compartir` (captura de Yape/BCP → pre-llenado).
- [x] Sugerencias con datos de la app: proveedor por parecido de nombre, categoría, centro de costo / placa (con alta en la lista), duplicados y montos que no coinciden.
- [ ] Medir precisión (campos corregidos por el usuario vs. leídos).

## Fase 3 — Producción
- [ ] Alta de todas las cajas reales y sus límites; usuarios y roles definitivos.
- [x] Exportar liquidación a Excel (formato que usa contabilidad): `/api/liquidaciones/<id>/excel`. Falta PDF.
- [ ] Notificaciones (push PWA o correo): saldo bajo umbral, pendientes críticos, liquidación por aprobar.
- [ ] Modo sin conexión para registrar en campo y sincronizar después.
- [ ] Bitácora de auditoría (quién cambió qué).
- [ ] Respaldos: export periódico de la base y del bucket (el plan free no incluye backups automáticos).
- [ ] Flujo para comprobantes físicos que llegan por cargo a planta u oficina.
- [ ] Revisión de seguridad de RLS y pruebas automatizadas del flujo de liquidación.
