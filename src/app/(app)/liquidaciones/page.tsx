import Link from "next/link";
import { BadgeLiquidacion } from "@/components/liquidaciones/BadgeLiquidacion";
import { CerrarLiquidacion } from "@/components/liquidaciones/CerrarLiquidacion";
import { Totales } from "@/components/liquidaciones/Totales";
import { contextoPagina, exigirModulo } from "@/lib/contexto";
import { nombreCaja, type LiquidacionResumen } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Liquidaciones · Factudex" };

export default async function PaginaLiquidaciones() {
  await exigirModulo("liquidaciones");
  const { repo, caja, empresa } = await contextoPagina();
  if (!caja || !empresa) return null;
  const [liquidaciones, permisos] = await Promise.all([repo.listarLiquidaciones([caja.id]), repo.permisosCaja(caja.id)]);

  const abierta = liquidaciones.find((l) => l.estado === "abierta");
  const observadas = liquidaciones.filter((l) => l.estado === "observada");
  const anteriores = liquidaciones.filter((l) => l.estado !== "abierta");

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div>
        <h1 className="text-lg font-bold md:text-xl">Liquidaciones</h1>
        <p className="text-xs text-white/45">
          {empresa.nombreCorto} › {nombreCaja(caja)} · Solo se liquidan los gastos completos (documento y pago).
        </p>
      </div>

      {observadas.map((l) => (
        <section key={l.id} className="fx-card flex flex-col gap-4 border-fx-error/40! p-4 md:p-6">
          <Cabecera l={l} />
          <p className="rounded-xl border border-fx-error/40 bg-fx-error/10 px-4 py-3 text-[13px] text-fx-error">
            Observada: {l.observaciones ?? "revisa los movimientos"}. Corrige y vuelve a enviarla.
          </p>
          <Totales l={l} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Acciones l={l} />
            {permisos.registrar && (
              <CerrarLiquidacion
                id={l.id}
                folio={l.folio}
                egresos={l.egresos}
                numIncompletos={l.numIncompletos}
                montoIncompletos={l.montoIncompletos}
                reCierre
              />
            )}
          </div>
        </section>
      ))}

      {abierta ? (
        <section className="fx-card flex flex-col gap-4 p-4 md:p-6">
          <Cabecera l={abierta} />
          <Totales l={abierta} />
          <div className="text-[13px] text-white/55">
            {abierta.numMovimientos - abierta.numIncompletos} movimiento
            {abierta.numMovimientos - abierta.numIncompletos === 1 ? "" : "s"} completo
            {abierta.numMovimientos - abierta.numIncompletos === 1 ? "" : "s"} para liquidar
          </div>
          {abierta.numIncompletos > 0 && (
            <Link
              href="/pendientes"
              className="rounded-xl border border-fx-error/40 bg-fx-error/10 px-4 py-3 text-[13px] text-fx-error hover:bg-fx-error/15"
            >
              ● {abierta.numIncompletos} incompleto{abierta.numIncompletos === 1 ? "" : "s"} ({formatoSoles(abierta.montoIncompletos)})
              no entrará{abierta.numIncompletos === 1 ? "" : "n"} al cierre: pasará{abierta.numIncompletos === 1 ? "" : "n"} a la
              siguiente liquidación. Complétalos antes de cerrar →
            </Link>
          )}
          {caja.bajoUmbral && (
            <p className="text-[13px] text-fx-pendiente">
              El saldo ({formatoSoles(caja.saldo)}) bajó del umbral de {formatoSoles(caja.umbralAlerta)}: cierra la liquidación
              para solicitar la recarga.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Acciones l={abierta} />
            {permisos.registrar && (
              <CerrarLiquidacion
                id={abierta.id}
                folio={abierta.folio}
                egresos={abierta.egresos}
                numIncompletos={abierta.numIncompletos}
                montoIncompletos={abierta.montoIncompletos}
              />
            )}
          </div>
        </section>
      ) : (
        <div className="fx-card px-5 py-8 text-center text-sm text-white/50">
          No hay una liquidación abierta: se abre sola con el próximo gasto o recarga de esta caja.
        </div>
      )}

      {anteriores.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">Anteriores</h2>
          <div className="fx-card overflow-hidden">
            {anteriores.map((l) => (
              <Link
                key={l.id}
                href={`/liquidaciones/${l.id}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-white/5 px-4 py-3.5 text-[13px] last:border-b-0 hover:bg-white/4 md:grid-cols-[1.2fr_1.2fr_130px_120px_120px] md:px-5"
              >
                <span className="font-semibold">{l.folio}</span>
                <span className="text-right md:order-3 md:text-left">
                  <BadgeLiquidacion estado={l.estado} />
                </span>
                <span className="text-white/50 md:order-2">
                  {formatoFecha(l.fechaInicio)} – {l.fechaCierre ? formatoFecha(l.fechaCierre) : "…"}
                </span>
                <span className="text-right text-white/65 md:order-4">Egresos {formatoSoles(l.egresos)}</span>
                <span className="hidden text-right font-semibold md:order-5 md:block">{formatoSoles(l.porReembolsar)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Cabecera({ l }: { l: LiquidacionResumen }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-display text-lg font-bold md:text-xl">{l.folio}</div>
        <div className="text-xs text-white/45">
          Desde {formatoFecha(l.fechaInicio)}
          {l.fechaCierre && ` · cerrada el ${formatoFecha(l.fechaCierre)}`}
        </div>
      </div>
      <BadgeLiquidacion estado={l.estado} />
    </div>
  );
}

function Acciones({ l }: { l: LiquidacionResumen }) {
  return (
    <>
      <Link href={`/liquidaciones/${l.id}`} className="fx-btn rounded-[10px] border border-white/12 px-4 py-2.5 text-[13px] text-white/75 hover:text-white">
        Ver detalle
      </Link>
      <a
        href={`/api/liquidaciones/${l.id}/excel`}
        className="fx-btn rounded-[10px] border border-white/12 px-4 py-2.5 text-[13px] text-white/75 hover:text-white"
      >
        Descargar Excel
      </a>
    </>
  );
}
