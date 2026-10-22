import { notFound } from "next/navigation";
import { GestionUsuarios } from "@/components/admin/GestionUsuarios";
import { contextoPagina, usuarioPeticion } from "@/lib/contexto";
import { modoDemo } from "@/lib/datos/repositorio";

export const metadata = { title: "Usuarios · Factudex" };

export default async function PaginaAdmin() {
  const yo = await usuarioPeticion();
  if (!yo?.esAdmin) notFound();
  const { repo, empresas, cajas } = await contextoPagina();
  const usuarios = await repo.listarUsuarios();

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div>
        <h1 className="text-lg font-bold md:text-xl">Usuarios</h1>
        <p className="text-xs text-white/45">
          Crea cuentas, define qué módulos ve cada persona y qué puede hacer en cada caja.
          {modoDemo() && " (Modo demo: los cambios no se guardan al reiniciar.)"}
        </p>
      </div>
      <GestionUsuarios
        usuarios={usuarios}
        miId={yo.id}
        empresas={empresas.map((e) => ({
          id: e.id,
          nombre: e.nombreCorto,
          cajas: cajas
            .filter((c) => c.empresaId === e.id)
            .map((c) => ({ id: c.id, nombre: `Caja ${String(c.numero).padStart(2, "0")} · ${c.nombre}` })),
        }))}
      />
    </main>
  );
}
