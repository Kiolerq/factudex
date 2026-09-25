import { EnConstruccion } from "@/components/ui/EnConstruccion";

export const metadata = { title: "Liquidaciones · Factudex" };

export default function Pagina() {
  return (
    <EnConstruccion
      titulo="Liquidaciones"
      descripcion="Folios por caja, cierre de liquidación y movimientos que pasarán a la siguiente."
    />
  );
}
