import { cerrarSesion } from "@/app/acciones";
import { modoDemo, obtenerRepositorio } from "@/lib/datos/repositorio";
import { estadoDrive } from "@/lib/drive/estado";
import { sesionActual } from "@/lib/permisos";
import { FormularioContrasena } from "./FormularioContrasena";

export const metadata = { title: "Mi cuenta · Factudex" };

const AVISOS: Record<string, { texto: string; ok: boolean }> = {
  ok: { texto: "Google Drive conectado. Las fotos nuevas se guardarán en la carpeta Factudex.", ok: true },
  cancelado: { texto: "Cancelaste la autorización en Google.", ok: false },
  "sin-refresh": { texto: "Google no entregó el permiso permanente. Vuelve a intentarlo.", ok: false },
  "sin-permiso": { texto: "Solo el administrador puede conectar Google Drive.", ok: false },
  "sin-configurar": { texto: "Faltan las variables de Google o Supabase en Vercel.", ok: false },
  error: { texto: "No se pudo conectar con Google Drive. Intenta de nuevo.", ok: false },
};

export default async function PaginaCuenta({ searchParams }: PageProps<"/cuenta">) {
  const usuario = await (await obtenerRepositorio()).usuarioActual();
  const esAdmin = !modoDemo() && (await sesionActual())?.esAdmin;
  const drive = esAdmin ? await estadoDrive() : null;
  const aviso = AVISOS[String((await searchParams).drive ?? "")];

  return (
    <main className="grid items-start gap-5 md:grid-cols-[1.5fr_1fr]">
      <section className="fx-card flex flex-col gap-4 p-5 md:p-7">
        <div>
          <h1 className="text-lg font-bold">Mi cuenta</h1>
          <p className="text-sm text-white/55">
            {usuario?.nombre} · {usuario?.email ?? "sin correo"}
          </p>
        </div>
        <FormularioContrasena />
      </section>

      <div className="flex flex-col gap-5">
        {drive && (
          <section className="fx-card flex flex-col gap-3 p-5 md:p-7">
            <div className="text-xs uppercase tracking-[1px] text-white/40">Google Drive</div>
            {aviso && (
              <p className={`text-[12.5px] ${aviso.ok ? "text-fx-completo" : "text-fx-error"}`}>● {aviso.texto}</p>
            )}
            {!drive.configurado ? (
              <p className="text-sm text-white/55">
                Falta configurar en Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y SUPABASE_SERVICE_ROLE_KEY.
              </p>
            ) : drive.conectado ? (
              <>
                <p className="text-sm text-white/70">
                  <span className="text-fx-completo">● Conectado</span>
                  {drive.cuenta && <> a {drive.cuenta}</>}. Las fotos se guardan en la carpeta{" "}
                  <span className="font-semibold">Factudex</span>, ordenadas por empresa, caja y mes.
                </p>
                <a href="/api/google/conectar" className="text-[12.5px] text-white/45 underline hover:text-white/70">
                  Reconectar u otra cuenta
                </a>
              </>
            ) : (
              <>
                <p className="text-sm text-white/55">
                  Conecta tu cuenta de Google para guardar las fotos de los comprobantes en tu Drive. La app
                  solo verá los archivos que ella misma cree.
                </p>
                <a
                  href="/api/google/conectar"
                  className="fx-btn self-start rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white"
                >
                  Conectar Google Drive
                </a>
              </>
            )}
          </section>
        )}
        <section className="fx-card flex flex-col gap-3 p-5 md:p-7">
          <p className="text-sm text-white/55">¿Terminaste? Cierra sesión si usas un equipo compartido.</p>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="fx-btn rounded-[10px] border border-white/18 px-5 py-2.5 text-[13px] font-semibold text-white/70 hover:text-white"
            >
              Cerrar sesión
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
