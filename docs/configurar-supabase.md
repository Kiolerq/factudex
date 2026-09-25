# Configurar Supabase (paso a paso)

> **Estado:** el proyecto `factudex` (ref `twbwgoyfbhvjwxuuhiwo`, región São Paulo) ya está creado
> con el esquema y los datos de ejemplo. Esta guía queda para rehacerlo o crear otro ambiente.
>
> **Límite del correo por defecto de Supabase:** solo envía enlaces de acceso a los correos que son
> miembros del equipo de la organización en Supabase, y pocos por hora. Para que el resto del equipo
> reciba su enlace hay que configurar un SMTP propio (**Authentication → Emails → SMTP Settings**),
> por ejemplo Resend (gratis hasta 3,000 correos/mes) o una cuenta de Gmail con contraseña de aplicación.

Todo en el plan gratuito. Tiempo estimado: 15 minutos.

## 1. Crear el proyecto
1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `factudex`. Región: **South America (São Paulo)** (la más cercana a Perú).
3. Guarda la contraseña de la base de datos en un lugar seguro (no se usa en la app).

## 2. Cargar el esquema y los datos iniciales
1. En el proyecto: **SQL Editor → New query**.
2. Pega todo el contenido de `supabase/migrations/20260925000000_esquema_inicial.sql` → **Run**.
3. Nueva consulta: pega `supabase/seed.sql` → **Run**.
   (Crea las empresas, las cajas de ejemplo, categorías, centros de costo y placas de ejemplo.)

## 3. Configurar el acceso por correo
1. **Authentication → Sign In / Providers → Email**: activado. Desactiva *Allow new users to sign up*
   (solo entran usuarios creados por un administrador).
2. **Authentication → URL Configuration**:
   - *Site URL*: la dirección de Vercel (ej. `https://factudex.vercel.app`). Mientras no exista, `http://localhost:3000`.
   - *Redirect URLs*: agrega `https://<tu-dominio>/auth/callback` y `http://localhost:3000/auth/callback`.

## 4. Crear el primer usuario (administrador)
1. **Authentication → Users → Add user → Create new user**: tu correo, marca *Auto Confirm User*.
2. **SQL Editor**:
   ```sql
   update perfiles set rol = 'admin', nombre = 'Tu Nombre' where email = 'tu@correo.com';
   ```

Para otros usuarios: créalos igual y dales acceso a sus cajas:
```sql
-- rol: 'registrador' (registra gastos), 'aprobador' (aprueba y registra recargas), 'lector' (solo ve)
insert into accesos_caja (usuario_id, caja_id, rol)
select p.id, c.id, 'registrador'
  from perfiles p, cajas c join empresas e on e.id = c.empresa_id
 where p.email = 'persona@correo.com' and e.codigo = 'SL' and c.numero = 1;
```

## 5. Conectar la app
En **Project Settings → API** copia:
- *Project URL* → variable `NEXT_PUBLIC_SUPABASE_URL`
- *anon public key* → variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Ponlas en Vercel (**Settings → Environment Variables**) y vuelve a publicar, o en `.env.local`
para correrla en tu computadora. Con esas dos variables la app deja el modo demo.

> La *service_role key* **nunca** va en la app ni en Vercel como `NEXT_PUBLIC_`: salta todas las
> reglas de seguridad.
