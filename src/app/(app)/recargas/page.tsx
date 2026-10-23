import { redirect } from "next/navigation";

// Recargas pasó a Tesorería (ingresos, aprobación y reposición en un solo módulo).
export default function PaginaRecargas() {
  redirect("/tesoreria");
}
