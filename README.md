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
- Configurar Supabase paso a paso: [`docs/configurar-supabase.md`](docs/configurar-supabase.md)

## Módulos

| Módulo | Qué hace |
|---|---|
| Registro | Nuevo gasto: empresa/caja, monto, fecha, proveedor (autocompletado por RUC/DNI o nombre), categoría, centro de costo y placa (listas fijas), tipo de documento (factura, boleta, RxH, planilla de movilidad, comprobante de egreso, otro), medio de pago (efectivo / Yape / transferencia). Se adjunta el **documento** y la **constancia de pago** (en efectivo basta el documento); si falta algo queda **Pendiente**. |
| Historial | Todos los movimientos con búsqueda y filtros (Todos / Pendientes / Completos, empresa, caja). |
| Pendientes | Movimientos a los que les falta el documento o el pago, con los días que llevan (sin plazo máximo). |
| Liquidaciones | Folio por caja (`SLLQ01-MT-0001`), fechas de inicio/cierre, aviso de saldo bajo umbral. Solo se liquidan movimientos completos; los pendientes pasan a la siguiente liquidación. |
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
npm run dev                     # http://localhost:3000
```

**Modo demo:** si no hay variables de Supabase, la app arranca con datos de ejemplo en memoria
(empresas, cajas, proveedores, centros de costo y placas de ejemplo) y un aviso "Modo demo" en el
HUD. Sirve para mostrar la app sin crear nada; los datos se reinician al reiniciar el servidor y
los archivos adjuntos no se guardan.

**Con Supabase:**

```bash
cp .env.example .env.local      # completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

El acceso es por enlace mágico al correo (`/login`). Solo entran usuarios creados por un
administrador en Supabase (**Authentication → Users → Add user**); nadie se autorregistra.
En **Authentication → URL Configuration** agrega `https://<tu-dominio>/auth/callback` (y
`http://localhost:3000/auth/callback`) a las *Redirect URLs*.

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
    (app)/         pantallas con HUD: registro, historial, pendientes, liquidaciones, recargas
    acciones.ts    Server Actions (seleccionar caja, proveedores, registrar movimiento)
    login/, auth/  acceso por enlace mágico
  components/      hud/, registro/, ui/
  lib/datos/       tipos, esquemas zod y repositorio (Supabase o demo)
  lib/supabase/    clientes Supabase (navegador, servidor y proxy de sesión)
  lib/tema/        paleta por empresa y colores de estado
  lib/ocr/         contrato JSON de la lectura con IA (fase 2)
  types/           tipos de la base (generados con supabase gen types)
supabase/
  migrations/      esquema SQL + RLS
  seed.sql         datos de demo
diseno/            prototipos HTML aprobados (referencia visual, no código de producción)
docs/              propuesta, modelo de datos, roadmap
```
