import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeLiquidacion } from "@/components/liquidaciones/BadgeLiquidacion";
import { CerrarLiquidacion } from "@/components/liquidaciones/CerrarLiquidacion";
import { RevisarLiquidacion } from "@/components/liquidaciones/RevisarLiquidacion";
import { Totales } from "@/components/liquidaciones/Totales";
import { textoFalta } from "@/components/movimientos/textos";
import { exigirModulo } from "@/lib/contexto";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { ETIQUETA_DOCUMENTO, ETIQUETA_FORMA_INGRESO, ETIQUETA_TIPO_RECARGA } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Liquidación · Factudex" };

export default async function PaginaLiquidacion({ params }: PageProps<"/liquidaciones/[id]">) {
  await exigirModulo("liquidaciones", "recargas");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const repo = await obtenerRepositorio();
  const l = await repo.obtenerLiquidacion(id);
  if (!l) notFound();
  const permisos = await repo.permisosCaja(l.cajaId);
  const enCurso = l.estado === "abierta" || l.estado === "observada";

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <Link href="/liquidaciones" className="text-[13px] text-white/50 hover:text-white">
        ← Liquidaciones
      </Link>

      <section className="fx-card flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-bold md:text-xl">{l.folio}</h1>
            <p className="text-xs text-white/45">
              {formatoFecha(l.fechaInicio)} – {l.fechaCierre ? formatoFecha(l.fechaCierre) : "en curso"}
              {l.folioAnterior && ` · viene de ${l.folioAnterior}`}
            </p>
          </div>
          <BadgeLiquidacion estado={l.estado} />
        </div>
        {l.observaciones && (
          <p className="rounded-xl border border-fx-error/40 bg-fx-error/10 px-4 py-3 text-[13px] text-fx-error">
            Observación: {l.observaciones}
          </p>
        )}
        <Totales l={l} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a
            href={`/api/liquidaciones/${l.id}/excel`}
            className="fx-btn rounded-[10px] border border-white/12 px-4 py-2.5 text-[13px] text-white/75 hover:text-white"
          >
            Descargar Excel
          </a>
          {enCurso && permisos.registrar && (
            <CerrarLiquidacion
              id={l.id}
              folio={l.folio}
              egresos={l.egresos}
              numIncompletos={l.numIncompletos}
              montoIncompletos={l.montoIncompletos}
              reCierre={l.estado === "observada"}
            />
          )}
          {l.estado === "en_revision" && permisos.aprobar && <RevisarLiquidacion id={l.id} />}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">Ingresos</h2>
        <div className="fx-card overflow-hidden">
          <Fila izquierda={l.folioAnterior ? `Saldo de ${l.folioAnterior}` : "Saldo anterior"} derecha={formatoSoles(l.saldoInicial)} />
          {l.recargas.map((r) => (
            <Fila
              key={r.id}
              izquierda={`${formatoFecha(r.fecha)} · ${r.descripcion ?? ETIQUETA_TIPO_RECARGA[r.tipo]}`}
              detalle={[ETIQUETA_FORMA_INGRESO[r.forma], r.banco, r.operacion && `Op. ${r.operacion}`, r.recibo && `Recibo ${r.recibo}`]
                .filter(Boolean)
                .join(" · ")}
              derecha={formatoSoles(r.monto)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">Egresos</h2>
        <div className="fx-card overflow-hidden">
          {l.movimientos.length === 0 && <Fila izquierda="Sin movimientos" derecha="" />}
          {l.movimientos.map((m) => {
            const incompleto = m.estado === "pendiente";
            return (
              <Link key={m.id} href={`/movimientos/${m.id}`} className="block hover:bg-white/4">
                <Fila
                  izquierda={`${formatoFecha(m.fecha, true)} · ${m.detalle}`}
                  detalle={
                    incompleto
                      ? `${textoFalta(m)} — no entra al cierre, pasa a la siguiente liquidación`
                      : [m.proveedor, m.tipoDocumento && ETIQUETA_DOCUMENTO[m.tipoDocumento], m.serieNumero, m.centroCosto]
                          .filter(Boolean)
                          .join(" · ")
                  }
                  derecha={formatoSoles(m.monto)}
                  rojo={incompleto}
                />
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Fila({ izquierda, detalle, derecha, rojo }: { izquierda: string; detalle?: string; derecha: string; rojo?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 text-[13px] last:border-b-0 md:px-5 ${
        rojo ? "bg-fx-error/8 text-fx-error" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="truncate">{izquierda}</div>
        {detalle && <div className={`truncate text-[11.5px] ${rojo ? "text-fx-error/80" : "text-white/45"}`}>{detalle}</div>}
      </div>
      <div className="shrink-0 font-semibold">{derecha}</div>
    </div>
  );
}
