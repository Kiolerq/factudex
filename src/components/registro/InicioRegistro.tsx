import Link from "next/link";
import { formatoSoles } from "@/lib/formato";

/**
 * Pantalla con la que abre Registro: qué quieres hacer. Las tres salidas grandes, para el celular.
 */
export function InicioRegistro({ porCompletar, faltaTotal }: { porCompletar: number; faltaTotal: number }) {
  const opciones = [
    {
      href: "/registro?nuevo=1",
      icono: "📷",
      titulo: "Nuevo registro",
      texto: "Factura, boleta, peaje, recibo… Toma la foto del comprobante y la IA llena los datos.",
      principal: true,
    },
    {
      href: "/registro/planilla",
      icono: "📝",
      titulo: "Planilla de movilidad",
      texto: "Movilidad o alimentación del personal, sin comprobante. Tope S/ 40 por trabajador y día.",
    },
    {
      href: "/registro/completar",
      icono: "🧩",
      titulo: "Completar un registro anterior",
      texto:
        porCompletar > 0
          ? `Tienes ${porCompletar} pago${porCompletar === 1 ? "" : "s"} con saldo por sustentar (${formatoSoles(faltaTotal)}). Agrégale la factura o la planilla que falta.`
          : "Un pago (Yape, transferencia, efectivo) que cubrió varios gastos: agrega lo que faltó, aunque sea de la caja anterior.",
      aviso: porCompletar > 0 ? porCompletar : null,
    },
  ];
  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <h1 className="text-lg font-bold md:text-xl">¿Qué vas a registrar?</h1>
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        {opciones.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className={`fx-card relative flex items-start gap-4 p-5 transition hover:border-fx-primary-line md:flex-col md:gap-3 md:p-6 ${
              o.principal ? "border-fx-primary-line!" : ""
            }`}
          >
            <span
              aria-hidden
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl ${
                o.principal ? "bg-fx-primary text-blanco" : "bg-fx-primary-soft"
              }`}
            >
              {o.icono}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-fx-lg font-bold">{o.titulo}</span>
              <span className="text-fx-sm text-white/72">{o.texto}</span>
            </span>
            {o.aviso && (
              <span className="absolute top-3 right-3 rounded-full border border-fx-pendiente/40 bg-fx-pendiente/16 px-2.5 py-0.5 text-fx-xs font-semibold text-fx-pendiente">
                ● {o.aviso}
              </span>
            )}
          </Link>
        ))}
      </div>
      <p className="text-fx-sm text-white/68">
        ¿A un gasto le falta la foto del comprobante o del pago?{" "}
        <Link prefetch={false} href="/pendientes" className="font-semibold text-fx-primary-light hover:underline">
          Ve a Pendientes →
        </Link>
      </p>
    </main>
  );
}
