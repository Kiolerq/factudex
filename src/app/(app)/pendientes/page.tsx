import { EnConstruccion } from "@/components/ui/EnConstruccion";

export const metadata = { title: "Pendientes · Factudex" };

export default function Pagina() {
  return (
    <EnConstruccion
      titulo="Pendientes"
      descripcion="Movimientos a los que les falta el documento o la constancia de pago, con los días que llevan."
    />
  );
}
