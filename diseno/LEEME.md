# Factudex — Referencia de diseño

Prototipo de estilo aprobado (hecho en Claude, canvas de diseño).
Estos HTML son REFERENCIA VISUAL, no código de producción: úsalos para
copiar colores, espaciados, tipografía y estructura de pantallas.

| Archivo | Pantalla |
|---|---|
| Main.html | Paleta, KPIs, switch de empresa (San Lorenzo / SIPE) |
| Registro-Escritorio.html | Formulario de registro (desktop) |
| Registro-Movil.html | Registro móvil + tarjeta de imagen compartida desde Yape |
| Historial-Escritorio.html | Tabla de movimientos con filtros |
| Historial-Movil.html | Lista de movimientos en tarjetas |

Reglas clave:
- Fondo oscuro siempre: degradado #0A0E1A → #0D1526 → #0A0F1C
- Glass: rgba(255,255,255,0.045) + borde rgba(255,255,255,0.09) + blur(16px)
- Fuentes: Space Grotesk (títulos) + IBM Plex Sans (texto)
- San Lorenzo: #2E75B6 + #D3453A | SIPE: #1FA2C9 + #2FAE60
- Pendiente #D9A441 | Completo #3FBE72

Nota: la lógica interactiva (bloque <script type="text/x-dc">) es del
prototipo; en la app real se reimplementa en React.
