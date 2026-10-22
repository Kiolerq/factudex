# Configurar Supabase (paso a paso)

> Para mudar todo (GitHub, Supabase, Vercel y Google) a cuentas nuevas, sigue `docs/mudanza.md`.
>
> El acceso es con correo y contraseña, así que no depende del envío de correos de Supabase
> (que en el plan gratis solo llega a los miembros del equipo de la organización).

Todo en el plan gratuito. Tiempo estimado: 15 minutos.

## 1. Crear el proyecto
1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `factudex`. Región: **South America (São Paulo)** (la más cercana a Perú).
3. Guarda la contraseña de la base de datos en un lugar seguro (no se usa en la app).

## 2. Cargar el esquema y los datos iniciales
1. En el proyecto: **SQL Editor → New query**.
2. Pega todo el contenido de `supabase/instalacion_completa.sql` → **Run** (una sola vez).
   Es todas las migraciones + el seed en un archivo: empresas, cajas de ejemplo, categorías,
   centros de costo (con placas), solicitantes y proveedores de ejemplo.
   Se regenera con `npm run sql:instalacion` cuando cambia una migración o el seed.

## 3. Configurar el acceso
1. **Authentication → Sign In / Providers → Email**: activado. Desactiva *Allow new users to sign up*
   (solo entran usuarios creados por un administrador). Largo mínimo de contraseña: 8.
2. **Authentication → URL Configuration**:
   - *Site URL*: la dirección de Vercel (ej. `https://factudex.vercel.app`). Mientras no exista, `http://localhost:3000`.
   - *Redirect URLs*: agrega `https://<tu-dominio>/auth/callback` y `http://localhost:3000/auth/callback`.

## 4. Crear el primer usuario (administrador)
1. **Authentication → Users → Add user → Create new user**: correo + contraseña temporal, marca *Auto Confirm User*.
   La persona la cambia luego en **Mi cuenta**.
2. **SQL Editor**: pega `supabase/primer_admin.sql`, cambia el correo y el nombre de arriba → **Run**.
   Lo hace administrador y da a cada caja un saldo de ejemplo de S/ 2,000 (cámbialo o pon 0).

Para otros usuarios lo más simple es la app: **Usuarios** (solo lo ve el administrador) → *Nuevo
usuario* → correo, contraseña temporal, módulos y permisos por caja. También se puede a mano:
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

- *service_role key* → variable `SUPABASE_SERVICE_ROLE_KEY` (solo la usa el servidor, para Drive)

Ponlas en Vercel (**Settings → Environment Variables**) y vuelve a publicar, o en `.env.local`
para correrla en tu computadora. Con las dos primeras la app deja el modo demo.

> La *service_role key* **nunca** lleva el prefijo `NEXT_PUBLIC_` ni va al navegador: salta todas
> las reglas de seguridad.

## Pausa del plan gratis
Supabase pausa el proyecto gratis tras ~1 semana sin uso. Se reactiva en el panel con
**Restore project** (no se pierde nada). Basta con que alguien entre a la app cada semana.
