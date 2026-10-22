import { ETIQUETA_LIQUIDACION, type EstadoLiquidacion } from "@/lib/datos/tipos";

const ESTILOS: Record<EstadoLiquidacion, string> = {
  abierta: "bg-fx-primary-soft border-fx-primary-line text-fx-primary-light",
  en_revision: "bg-fx-pendiente/16 border-fx-pendiente/40 text-fx-pendiente",
  observada: "bg-fx-error/16 border-fx-error/40 text-fx-error",
  aprobada: "bg-fx-completo/16 border-fx-completo/40 text-fx-completo",
  repuesta: "bg-white/8 border-white/20 text-white/60",
};

export function BadgeLiquidacion({ estado }: { estado: EstadoLiquidacion }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold ${ESTILOS[estado]}`}
    >
      ● {ETIQUETA_LIQUIDACION[estado]}
    </span>
  );
}
