import Link from "next/link";
import { BadgeEstado } from "@/components/ui/BadgeEstado";
import type { MovimientoResumen } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";
import { textoDocumento } from "./textos";

interface Props {
  movimientos: MovimientoResumen[];
  /** Nombre corto de la caja de cada movimiento, cuando la lista mezcla varias cajas. */
  nombreCaja?: (cajaId: string) => string;
  vacio?: string;
}

const COLUMNAS = "md:grid-cols-[84px_1.3fr_1.6fr_1fr_110px_1.1fr_128px]";

/** Movimientos en tabla (escritorio) o tarjetas (móvil). Cada uno abre su detalle. */
export function ListaMovimientos({ movimientos, nombreCaja, vacio = "No hay movimientos." }: Props) {
  if (!movimientos.length) {
    return <div className="fx-card px-5 py-10 text-center text-sm text-white/45">{vacio}</div>;
  }

  return (
    <>
      {/* Escritorio */}
      <div className="fx-card hidden overflow-hidden md:block">
        <div
          className={`grid ${COLUMNAS} gap-2.5 border-b border-white/8 px-5 py-3.5 text-[11px] uppercase tracking-[0.6px] text-white/40`}
        >
          <span>Fecha</span>
          <span>Proveedor</span>
          <span>Detalle</span>
          <span>Categoría</span>
          <span className="text-right">Monto</span>
          <span>Documento</span>
          <span>Estado</span>
        </div>
        {movimientos.map((m) => {
          const doc = textoDocumento(m);
          const pendiente = m.estado === "pendiente" && !m.anulado;
          return (
            <Link
              key={m.id}
              href={`/movimientos/${m.id}`}
              className={`grid ${COLUMNAS} items-center gap-2.5 border-b border-white/5 px-5 py-3.5 text-[13px] last:border-b-0 hover:bg-white/4 ${
                pendiente ? "bg-fx-pendiente/5" : ""
              } ${m.anulado ? "opacity-50" : ""}`}
            >
              <span className="text-white/50">{formatoFecha(m.fecha, true)}</span>
              <span className="truncate">{m.proveedor ?? <span className="text-white/45">Por definir</span>}</span>
              <span className="min-w-0 text-white/65">
                <span className={`block truncate ${m.anulado ? "line-through" : ""}`}>{m.detalle}</span>
                {nombreCaja && <span className="block truncate text-[11px] text-white/35">{nombreCaja(m.cajaId)}</span>}
              </span>
              <span className="truncate text-white/65">{m.categoria ?? "Sin categorizar"}</span>
              <span className="text-right font-semibold">{formatoSoles(m.monto)}</span>
              <span className={`truncate ${doc.falta ? "text-fx-pendiente" : "text-white/50"}`}>{doc.texto}</span>
              <span>{m.anulado ? <BadgeAnulado /> : m.porAutorizar ? <BadgePorAutorizar /> : <BadgeEstado estado={m.estado} />}</span>
            </Link>
          );
        })}
      </div>

      {/* Móvil */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {movimientos.map((m) => {
          const doc = textoDocumento(m);
          const pendiente = m.estado === "pendiente" && !m.anulado;
          return (
            <Link
              key={m.id}
              href={`/movimientos/${m.id}`}
              className={`fx-card block rounded-[14px] p-3.5 ${pendiente ? "border-fx-pendiente/35!" : ""} ${
                m.anulado ? "opacity-50" : ""
              }`}
            >
              <div className="mb-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold">{m.proveedor ?? "Por definir"}</div>
                  <div className="truncate text-[11.5px] text-white/45">
                    <span className={m.anulado ? "line-through" : ""}>{m.detalle}</span> · {formatoFecha(m.fecha, true)}
                    {nombreCaja && <> · {nombreCaja(m.cajaId)}</>}
                  </div>
                </div>
                <div className="shrink-0 font-display text-[15px] font-bold">{formatoSoles(m.monto)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`truncate text-[11px] ${doc.falta ? "text-fx-pendiente" : "text-white/40"}`}>{doc.texto}</span>
                {m.anulado ? <BadgeAnulado /> : m.porAutorizar ? <BadgePorAutorizar /> : <BadgeEstado estado={m.estado} />}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

/** Supera el tope por gasto de la empresa: no entra a la liquidación hasta que tesorería lo autorice. */
export function BadgePorAutorizar() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-fx-pendiente/40 bg-fx-pendiente/16 px-3 py-1 text-[11px] font-semibold text-fx-pendiente">
      ● Por autorizar
    </span>
  );
}

function BadgeAnulado() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/55">
      ● Anulado
    </span>
  );
}
