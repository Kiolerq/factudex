import Link from "next/link";
import { BadgeLiquidacion } from "@/components/liquidaciones/BadgeLiquidacion";
import { CerrarLiquidacion } from "@/components/liquidaciones/CerrarLiquidacion";
import { GenerarLiquidacion } from "@/components/liquidaciones/GenerarLiquidacion";
import { Totales } from "@/components/liquidaciones/Totales";
import { contextoPagina, exigirModulo } from "@/lib/contexto";
import { codigoCaja, type LiquidacionResumen } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Liquidaciones · Factudex" };

export default async function PaginaLiquidaciones({ searchParams }: PageProps<"/liquidaciones">) {
  await exigirModulo("liquidaciones");
  const { repo, empresas, cajas, caja: activa } = await contextoPagina();
  if (!activa) return null;
  const { caja: cajaParam, generada } = await searchParams;
  // La caja a liquidar se elige aquí (por defecto, la activa del HUD).
  const caja = cajas.find((c) => c.id === cajaParam) ?? activa;

  const [liquidaciones, permisos] = await Promise.all([repo.listarLiquidaciones([caja.id]), repo.permisosCaja(caja.id)]);
  const abierta = liquidaciones.find((l) => l.estado === "abierta");
  const detalleAbierta = abierta ? await repo.obtenerLiquidacion(abierta.id) : null;
  const observadas = liquidaciones.filter((l) => l.estado === "observada");
  const anteriores = liquidaciones.filter((l) => l.estado !== "abierta");

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div>
        <h1 className="text-lg font-bold md:text-xl">Liquidaciones</h1>
        <p className="text-xs text-white/45">
          Elige la caja y el rango de fechas. Solo entran los gastos completos (documento y pago) y autorizados.
        </p>
      </div>

      <nav aria-label="Caja a liquidar" className="flex flex-col gap-2">
        {empresas.map((e) => {
          const deEmpresa = cajas.filter((c) => c.empresaId === e.id);
          if (!deEmpresa.length) return null;
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] uppercase tracking-[0.6px] text-white/40">{e.nombreCorto}</span>
              {deEmpresa.map((c) => (
                <Link prefetch={false}
                  key={c.id}
                  href={`/liquidaciones?caja=${c.id}`}
                  aria-current={c.id === caja.id ? "page" : undefined}
                  data-empresa={c.empresaCodigo}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
                    c.id === caja.id ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/12 text-white/55 hover:text-white"
                  }`}
                >
                  {codigoCaja(c)} · {c.nombre}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      {typeof generada === "string" && (
        <p role="status" className="rounded-xl border border-fx-completo/40 bg-fx-completo/10 px-4 py-3 text-[13px] text-fx-completo">
          ● Se generó la liquidación <strong>{generada}</strong>. Queda en revisión de tesorería; lo que no entró sigue en la caja para la
          siguiente.
        </p>
      )}

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

      <section className="fx-card flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold md:text-xl">Por liquidar · {codigoCaja(caja)}</h2>
            <p className="text-xs text-white/45">
              {caja.nombre} · saldo {formatoSoles(caja.saldo)}
              {abierta && ` · la próxima liquidación será ${abierta.folio}`}
            </p>
          </div>
          {abierta && (
            <a
              href={`/api/liquidaciones/${abierta.id}/excel`}
              className="fx-btn rounded-[10px] border border-white/12 px-4 py-2 text-[13px] text-white/75 hover:text-white"
            >
              Excel (borrador)
            </a>
          )}
        </div>
        {caja.bajoUmbral && (
          <p className="text-[13px] text-fx-pendiente">
            El saldo bajó del umbral de {formatoSoles(caja.umbralAlerta)}: liquida para solicitar la reposición.
          </p>
        )}
        {abierta && detalleAbierta && detalleAbierta.movimientos.length > 0 ? (
          <GenerarLiquidacion
            // Al cambiar de caja o tras generar, el formulario empieza de cero.
            key={abierta.id}
            cajaId={caja.id}
            cajaCodigo={codigoCaja(caja)}
            folio={abierta.folio}
            saldoInicial={abierta.saldoInicial}
            ingresos={abierta.ingresos}
            movimientos={detalleAbierta.movimientos}
            puedeGenerar={permisos.registrar}
          />
        ) : (
          <p className="text-[13px] text-white/50">No hay gastos por liquidar en esta caja.</p>
        )}
      </section>

      {anteriores.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">Liquidaciones de {codigoCaja(caja)}</h2>
          <div className="fx-card overflow-hidden">
            {anteriores.map((l) => (
              <Link prefetch={false}
                key={l.id}
                href={`/liquidaciones/${l.id}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-white/5 px-4 py-3.5 text-[13px] last:border-b-0 hover:bg-white/4 md:grid-cols-[1.2fr_1.2fr_130px_120px_120px] md:px-5"
              >
                <span className="font-semibold">{l.folio}</span>
                <span className="text-right md:order-3 md:text-left">
                  <BadgeLiquidacion estado={l.estado} />
                </span>
                <span className="text-white/50 md:order-2">
                  del {formatoFecha(l.fechaInicio)} al {l.fechaCierre ? formatoFecha(l.fechaCierre) : "…"}
                </span>
                <span className="text-right text-white/65 md:order-4">Gastos {formatoSoles(l.egresos)}</span>
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
          del {formatoFecha(l.fechaInicio)}
          {l.fechaCierre && ` al ${formatoFecha(l.fechaCierre)}`}
        </div>
      </div>
      <BadgeLiquidacion estado={l.estado} />
    </div>
  );
}

function Acciones({ l }: { l: LiquidacionResumen }) {
  return (
    <>
      <Link prefetch={false} href={`/liquidaciones/${l.id}`} className="fx-btn rounded-[10px] border border-white/12 px-4 py-2.5 text-[13px] text-white/75 hover:text-white">
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
