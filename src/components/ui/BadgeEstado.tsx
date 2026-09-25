import type { EstadoMovimiento } from "@/lib/datos/tipos";

const ESTILOS: Record<EstadoMovimiento, string> = {
  pendiente: "bg-fx-pendiente/16 border-fx-pendiente/40 text-fx-pendiente",
  completo: "bg-fx-completo/16 border-fx-completo/40 text-fx-completo",
};

const TEXTO: Record<EstadoMovimiento, string> = {
  pendiente: "Pendiente",
  completo: "Completo",
};

export function BadgeEstado({ estado, texto }: { estado: EstadoMovimiento; texto?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold ${ESTILOS[estado]}`}
    >
      ● {texto ?? TEXTO[estado]}
    </span>
  );
}
