import { cerrarSesion } from "@/app/acciones";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { FormularioContrasena } from "./FormularioContrasena";

export const metadata = { title: "Mi cuenta · Factudex" };

export default async function PaginaCuenta() {
  const usuario = await (await obtenerRepositorio()).usuarioActual();
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
    </main>
  );
}
