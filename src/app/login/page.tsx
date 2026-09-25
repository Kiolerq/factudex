import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { modoDemo } from "@/lib/datos/repositorio";
import { FormularioLogin } from "./FormularioLogin";

export const metadata = { title: "Ingresar · Factudex" };

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  if (modoDemo()) redirect("/registro");
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-5">
      <div className="fx-card flex w-full max-w-sm flex-col gap-6 p-7">
        <div className="flex items-center gap-3">
          <Logo tamano={40} />
          <div>
            <h1 className="text-xl font-bold">Factudex</h1>
            <p className="text-xs text-white/45">Control de cajas chicas</p>
          </div>
        </div>
        <FormularioLogin errorEnlace={error === "enlace"} />
        <nav className="flex justify-center gap-4 text-[11px] text-white/40">
          <Link href="/privacidad" className="hover:text-white">Privacidad</Link>
          <Link href="/terminos" className="hover:text-white">Condiciones</Link>
        </nav>
      </div>
    </main>
  );
}
