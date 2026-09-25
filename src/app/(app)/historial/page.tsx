import { EnConstruccion } from "@/components/ui/EnConstruccion";

export const metadata = { title: "Historial · Factudex" };

export default function Pagina() {
  return (
    <EnConstruccion
      titulo="Historial"
      descripcion="Todos los movimientos con búsqueda y filtros (Todos / Pendientes / Completos), en tabla o tarjetas según el dispositivo."
    />
  );
}
