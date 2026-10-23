import { redirect } from "next/navigation";
import { rutaInicio, usuarioPeticion } from "@/lib/contexto";

export default async function Inicio() {
  const u = await usuarioPeticion();
  redirect(u ? rutaInicio(u) : "/login");
}
