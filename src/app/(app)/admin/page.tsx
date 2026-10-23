import { notFound } from "next/navigation";
import { GestionUsuarios } from "@/components/admin/GestionUsuarios";
import { contextoPagina, usuarioPeticion } from "@/lib/contexto";
import { modoDemo } from "@/lib/datos/repositorio";
import { codigoCaja } from "@/lib/datos/tipos";

export const metadata = { title: "Usuarios · Factudex" };

export default async function PaginaAdmin() {
  const yo = await usuarioPeticion();
  if (!yo?.esTesoreria) notFound(); // admin o tesorería (esta solo gestiona registradores)
  const { repo, empresas, cajas } = await contextoPagina();
  const usuarios = await repo.listarUsuarios();

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div>
        <h1 className="text-lg font-bold md:text-xl">Usuarios</h1>
        <p className="text-xs text-white/45">
          {yo.esAdmin
            ? "Crea cuentas y define qué tipo de usuario es cada persona y qué cajas maneja."
            : "Crea registradores y asígnales o quítales cajas."}
          {modoDemo() && " (Modo demo: los cambios no se guardan al reiniciar.)"}
        </p>
      </div>
      <GestionUsuarios
        usuarios={usuarios}
        miId={yo.id}
        soyAdmin={yo.esAdmin}
        empresas={empresas.map((e) => ({
          id: e.id,
          nombre: e.nombreCorto,
          cajas: cajas
            .filter((c) => c.empresaId === e.id)
            .map((c) => ({ id: c.id, codigo: codigoCaja(c), nombre: c.nombre })),
        }))}
      />
    </main>
  );
}
