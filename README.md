# Factudex

App web (PWA) para registrar, sustentar y liquidar las **cajas chicas** de
**Compañía San Lorenzo S.A.C.** y **SIPE** (Perú, montos en S/).

Hoy una sola persona liquida varias cajas con libretas, fotos sueltas y facturas físicas;
si se atrasa o se enferma, todo se detiene. Factudex centraliza el proceso en un solo canal:
cada gasto se registra en el momento, descuenta el saldo de su caja al instante y queda
visible qué falta sustentar.

- Propuesta original: [`docs/Factudex_Propuesta.pdf`](docs/Factudex_Propuesta.pdf)
- Diseño aprobado: [`diseno/`](diseno/LEEME.md)
- Modelo de datos: [`docs/modelo-datos.md`](docs/modelo-datos.md)
- Roadmap: [`docs/roadmap.md`](docs/roadmap.md)

## Módulos

| Módulo | Qué hace |
|---|---|
| Registro | Nuevo gasto: empresa/caja, monto, fecha, proveedor (autocompletado por RUC/DNI o nombre), categoría, centro de costo/placa, tipo de documento, "Se pagó por Yape", foto o archivo. Opción "Aún no tengo el comprobante" → queda **Pendiente**. |
| Historial | Todos los movimientos con búsqueda y filtros (Todos / Pendientes / Completos, empresa, caja). |
| Pendientes | Movimientos sin documento, con alerta por días de antigüedad. |
| Liquidaciones | Folio por caja (`SL-MANT-0001`), fechas de inicio/cierre, aviso de saldo bajo umbral, incompletos en rojo. |
| Recargas | El aprobador da visto bueno y registra manualmente la recarga que repone la caja. |

Fase 2: lectura automática de comprobantes con un modelo de IA con visión que **pre-llena**
el formulario (el usuario siempre confirma).

## Stack (costo cero)

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) ·
Vercel · PWA con Web Share Target (Android).

## Cómo correrlo

Requisitos: Node.js 20+ y un proyecto en [Supabase](https://supabase.com) (plan free).

```bash
npm install
cp .env.example .env.local      # completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                     # http://localhost:3000
```

### Base de datos

Opción A — desde el panel de Supabase: abre **SQL Editor**, pega y ejecuta
`supabase/migrations/20260925000000_esquema_inicial.sql` y luego `supabase/seed.sql`.

Opción B — con la CLI de Supabase:

```bash
npx supabase link --project-ref <tu-project-ref>
npx supabase db push                         # aplica supabase/migrations
psql "<connection-string>" -f supabase/seed.sql
npx supabase gen types typescript --project-id <id> > src/types/database.ts
```

Para convertir a un usuario en admin (después de que inicie sesión por primera vez):

```sql
update perfiles set rol = 'admin' where email = 'tu@correo.pe';
```

### Scripts

| Comando | |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build de producción |
| `npm run lint` | ESLint |

### Deploy

Importa el repo en Vercel, define las mismas variables de `.env.example` y listo: cada push
a `main` despliega producción y cada PR genera una preview.

## Estructura

```
src/
  app/             rutas (App Router), layout, estilos globales, manifest PWA
  lib/supabase/    clientes Supabase (navegador y servidor)
  lib/tema/        paleta por empresa y colores de estado
  lib/ocr/         contrato JSON de la lectura con IA (fase 2)
  types/           tipos de la base (generados con supabase gen types)
supabase/
  migrations/      esquema SQL + RLS
  seed.sql         datos de demo
diseno/            prototipos HTML aprobados (referencia visual, no código de producción)
docs/              propuesta, modelo de datos, roadmap
```
