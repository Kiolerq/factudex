import Link from "next/link";
import { BadgeLiquidacion } from "@/components/liquidaciones/BadgeLiquidacion";
import { RevisarLiquidacion } from "@/components/liquidaciones/RevisarLiquidacion";
import { FormularioRecarga } from "@/components/recargas/FormularioRecarga";
import { contextoPagina, exigirModulo } from "@/lib/contexto";
import { ETIQUETA_FORMA_INGRESO, ETIQUETA_TIPO_RECARGA, nombreCaja } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Recargas · Factudex" };

export default async function PaginaRecargas() {
  await exigirModulo("recargas");
  const { repo, caja, empresa, cajasEmpresa } = await contextoPagina();
  if (!caja || !empresa) return null;

  const ids = cajasEmpresa.map((c) => c.id);
  const [liquidaciones, recargas, permisos] = await Promise.all([
    repo.listarLiquidaciones(ids),
    repo.listarRecargas([caja.id]),
    Promise.all(cajasEmpresa.map(async (c) => [c.id, await repo.permisosCaja(c.id)] as const)),
  ]);
  const puedeAprobar = new Map(permisos.map(([id, p]) => [id, p.aprobar]));
  const bandeja = liquidaciones.filter((l) => l.estado === "en_revision" || l.estado === "aprobada");
  const cajaDe = (id: string) => cajasEmpresa.find((c) => c.id === id)!;
  const esAprobador = permisos.some(([, p]) => p.aprobar);

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div>
        <h1 className="text-lg font-bold md:text-xl">Recargas</h1>
        <p className="text-xs text-white/45">
          {empresa.nombreCorto} · Aprueba las liquidaciones cerradas y registra el depósito que las repone. Registro manual,
          monto libre.
        </p>
      </div>

      {!esAprobador && (
        <p className="rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-[13px] text-white/60">
          Solo un aprobador de la caja puede aprobar liquidaciones y registrar recargas. Aquí puedes ver en qué van.
        </p>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">Bandeja</h2>
        {bandeja.length === 0 && (
          <div className="fx-card px-5 py-8 text-center text-sm text-white/50">
            No hay liquidaciones por revisar ni por reponer en {empresa.nombreCorto}.
          </div>
        )}
        {bandeja.map((l) => {
          const c = cajaDe(l.cajaId);
          const aprueba = puedeAprobar.get(l.cajaId);
          return (
            <div key={l.id} className="fx-card flex flex-col gap-3.5 p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/liquidaciones/${l.id}`} className="font-display text-base font-bold hover:underline">
                    {l.folio}
                  </Link>
                  <div className="text-xs text-white/45">
                    {nombreCaja(c)} · {formatoFecha(l.fechaInicio)} – {l.fechaCierre && formatoFecha(l.fechaCierre)} ·{" "}
                    {l.numMovimientos} movimiento{l.numMovimientos === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.6px] text-white/40">Liquidado</div>
                  <div className="font-display text-lg font-bold">{formatoSoles(l.egresos)}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <BadgeLiquidacion estado={l.estado} />
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/liquidaciones/${l.id}/excel`}
                    className="fx-btn rounded-[10px] border border-white/12 px-4 py-2 text-[13px] text-white/75 hover:text-white"
                  >
                    Excel
                  </a>
                  {aprueba && l.estado === "en_revision" && <RevisarLiquidacion id={l.id} />}
                </div>
              </div>
              {aprueba && l.estado === "aprobada" && (
                <FormularioRecarga
                  cajaId={l.cajaId}
                  liquidacion={{ id: l.id, folio: l.folio, sugerido: l.egresos }}
                  textoBoton="Registrar reposición"
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">Recargas de {nombreCaja(caja)}</h2>
          {puedeAprobar.get(caja.id) && <FormularioRecarga cajaId={caja.id} textoBoton="+ Otra recarga" />}
        </div>
        <div className="fx-card overflow-hidden">
          {recargas.length === 0 && <div className="px-5 py-8 text-center text-sm text-white/50">Sin recargas registradas.</div>}
          {recargas.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 text-[13px] last:border-b-0 md:px-5"
            >
              <div className="min-w-0">
                <div className="truncate">
                  {formatoFecha(r.fecha)} · {r.descripcion ?? ETIQUETA_TIPO_RECARGA[r.tipo]}
                </div>
                <div className="truncate text-[11.5px] text-white/45">
                  {[
                    ETIQUETA_TIPO_RECARGA[r.tipo],
                    r.folioRepuesto && `repone ${r.folioRepuesto}`,
                    ETIQUETA_FORMA_INGRESO[r.forma],
                    r.banco,
                    r.operacion && `Op. ${r.operacion}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className={`shrink-0 font-semibold ${r.monto < 0 ? "text-fx-error" : "text-fx-completo"}`}>
                {r.monto > 0 ? "+" : ""}
                {formatoSoles(r.monto)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
