import { redirect } from "next/navigation";
import { Hud } from "@/components/hud/Hud";
import { modoDemo, obtenerRepositorio } from "@/lib/datos/repositorio";
import { leerCajaActiva } from "@/lib/seleccion";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const repo = await obtenerRepositorio();
  const usuario = await repo.usuarioActual();
  if (!usuario) redirect("/login");

  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const cajaActiva = await leerCajaActiva(cajas);

  if (!cajaActiva) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="fx-card max-w-md p-8 text-center text-sm text-white/60">
          Tu usuario todavía no tiene cajas asignadas. Pide a un administrador que te dé acceso.
        </div>
      </main>
    );
  }

  return (
    <div
      data-empresa={cajaActiva.empresaCodigo}
      className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-5 pb-8 pt-[18px] md:gap-7 md:px-14 md:pb-16 md:pt-9"
    >
      <Hud
        empresas={empresas}
        cajas={cajas}
        cajaActiva={cajaActiva}
        usuario={usuario}
        demo={modoDemo()}
      />
      {children}
    </div>
  );
}
