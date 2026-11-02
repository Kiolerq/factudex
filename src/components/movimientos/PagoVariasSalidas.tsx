import Link from "next/link";
import { BarraPago } from "@/components/registro/FormularioRegistro";
import { BadgeEstado } from "@/components/ui/BadgeEstado";
import { ETIQUETA_DOCUMENTO, ETIQUETA_MEDIO_PAGO, type Pago } from "@/lib/datos/tipos";
import type { Almacen } from "@/lib/subida";
import { formatoFecha, formatoSoles } from "@/lib/formato";
import { RegistrarDevolucion } from "./RegistrarDevolucion";

/** Detalle de un gasto que es parte de un pago con varias salidas: todas las salidas y devoluciones. */
export function PagoVariasSalidas({
  pago,
  actualId,
  puedeRegistrar,
  almacen,
}: {
  pago: Pago;
  actualId: string;
  puedeRegistrar: boolean;
  almacen: Almacen;
}) {
  const cuadrado = Math.abs(pago.falta) < 0.005;
  return (
    <section id="pago" className="fx-card flex scroll-mt-4 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold md:text-lg">Pago con varias salidas</h2>
        <span className="font-display text-xl font-bold">{formatoSoles(pago.monto)}</span>
      </div>
      <p className="-mt-2 text-fx-sm text-white/75">
        {pago.medioPago ? ETIQUETA_MEDIO_PAGO[pago.medioPago] : "Pago"}
        {pago.operacion && ` · Op. ${pago.operacion}`} · {formatoFecha(pago.fecha)} ·{" "}
        {pago.tieneConstancia ? "constancia subida ✓" : pago.medioPago === "efectivo" ? "en efectivo" : "falta la constancia"}
      </p>
      <BarraPago pago={pago} />

      <div className="flex flex-col divide-y divide-white/8 rounded-xl border border-white/12">
        {pago.salidas.map((s) => (
          <Link
            prefetch={false}
            key={s.id}
            href={`/movimientos/${s.id}`}
            className={`flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-white/4 ${s.id === actualId ? "bg-fx-primary-soft" : ""}`}
          >
            <div className="min-w-0">
              <div className={`truncate text-fx-sm font-semibold ${s.anulado ? "line-through opacity-60" : ""}`}>{s.detalle}</div>
              <div className="truncate text-fx-xs text-white/68">
                {s.tipoDocumento ? ETIQUETA_DOCUMENTO[s.tipoDocumento] : "Sin documento"}
                {s.serieNumero && ` · ${s.serieNumero}`}
                {s.proveedor && ` · ${s.proveedor}`}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-display font-bold">{formatoSoles(s.monto)}</span>
              {s.anulado ? <span className="text-fx-2xs text-white/60">Anulado</span> : <BadgeEstado estado={s.estado} />}
            </div>
          </Link>
        ))}
        {pago.devoluciones.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-fx-sm font-semibold">↩ Devolución a la caja</div>
              <div className="truncate text-fx-xs text-white/68">
                {d.motivo} · {formatoFecha(d.fecha)}
                {d.conFoto && (
                  <>
                    {" · "}
                    <a href={`/api/devoluciones/${d.id}/foto`} target="_blank" rel="noreferrer" className="font-semibold text-fx-primary-light hover:underline">
                      Ver foto
                    </a>
                  </>
                )}
              </div>
            </div>
            <span className="shrink-0 font-display font-bold text-fx-completo">{formatoSoles(d.monto)}</span>
          </div>
        ))}
      </div>

      {!cuadrado && pago.falta > 0 && (
        <p className="text-fx-sm text-white/75">
          Mientras falte <strong className="text-fx-pendiente">{formatoSoles(pago.falta)}</strong>, todas estas salidas quedan
          pendientes y no entran a la liquidación.
        </p>
      )}
      {pago.falta < -0.005 && (
        <p className="text-fx-sm text-fx-error">
          Las salidas suman más que el pago. Revisa los montos o anula la salida que sobra.
        </p>
      )}
      {puedeRegistrar && pago.falta > 0.005 && (
        <div className="flex flex-col gap-3">
          <Link
            prefetch={false}
            href={`/registro?pago=${pago.id}`}
            className="fx-btn self-start rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco"
          >
            ＋ Agregar otra salida
          </Link>
          <RegistrarDevolucion pago={pago} almacen={almacen} />
        </div>
      )}
    </section>
  );
}
