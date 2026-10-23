import Link from "next/link";
import { BadgeLiquidacion } from "@/components/liquidaciones/BadgeLiquidacion";
import { RevisarLiquidacion } from "@/components/liquidaciones/RevisarLiquidacion";
import { AutorizarGasto } from "@/components/movimientos/AutorizarGasto";
import { FormularioRecarga } from "@/components/recargas/FormularioRecarga";
import { FormularioIngreso, type CajaIngreso } from "@/components/tesoreria/FormularioIngreso";
import { GestionCajas } from "@/components/tesoreria/GestionCajas";
import { contextoPagina, exigirTesoreria } from "@/lib/contexto";
import { codigoCaja, ETIQUETA_FORMA_INGRESO, ETIQUETA_TIPO_RECARGA, type CajaSaldo } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Tesorería · Factudex" };

const VISTAS = [
  { id: "bandeja", texto: "Bandeja" },
  { id: "autorizar", texto: "Por autorizar" },
  { id: "ingresos", texto: "Ingresos" },
  { id: "cajas", texto: "Cajas" },
] as const;
type Vista = (typeof VISTAS)[number]["id"];

export default async function PaginaTesoreria({ searchParams }: PageProps<"/tesoreria">) {
  await exigirTesoreria();
  const { vista: v } = await searchParams;
  const vista: Vista = VISTAS.some((x) => x.id === v) ? (v as Vista) : "bandeja";
  const { repo, empresas, cajas } = await contextoPagina();
  const ids = cajas.map((c) => c.id);
  const cajaDe = (id: string) => cajas.find((c) => c.id === id);
  const empresaDe = (c: CajaSaldo | undefined) => empresas.find((e) => e.id === c?.empresaId)?.nombreCorto ?? "";

  // Contadores para las pestañas (y los datos de la bandeja).
  const [liquidaciones, porAutorizar] = await Promise.all([
    repo.listarLiquidaciones(ids),
    repo.listarMovimientos({ cajaIds: ids, estado: "por_autorizar", texto: "", limite: 300 }),
  ]);
  const enRevision = liquidaciones.filter((l) => l.estado === "en_revision");
  const aprobadas = liquidaciones.filter((l) => l.estado === "aprobada");
  const contador: Partial<Record<Vista, number>> = {
    bandeja: enRevision.length + aprobadas.length,
    autorizar: porAutorizar.total,
  };

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold md:text-xl">Tesorería</h1>
          <p className="text-xs text-white/45">Todas las cajas de {empresas.map((e) => e.nombreCorto).join(" y ")}.</p>
        </div>
        <Link prefetch={false} href="/panel" className="text-[13px] font-semibold text-fx-primary-light hover:underline">
          Ver panel →
        </Link>
      </div>

      <nav aria-label="Secciones de tesorería" className="fx-scroll-x -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
        {VISTAS.map((x) => (
          <Link prefetch={false}
            key={x.id}
            href={`/tesoreria?vista=${x.id}`}
            aria-current={x.id === vista ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-2 text-[12.5px] font-semibold ${
              x.id === vista ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/12 text-white/55 hover:text-white"
            }`}
          >
            {x.texto}
            {!!contador[x.id] && <span className="text-fx-pendiente"> · {contador[x.id]}</span>}
          </Link>
        ))}
      </nav>

      {vista === "bandeja" && (
        <>
          <Seccion titulo={`Por aprobar (${enRevision.length})`} vacio="No hay liquidaciones esperando aprobación.">
            {enRevision.map((l) => {
              const c = cajaDe(l.cajaId);
              return (
                <div key={l.id} className="fx-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:px-5">
                  <div className="min-w-0">
                    <Link prefetch={false} href={`/liquidaciones/${l.id}`} className="font-display text-base font-bold hover:underline">
                      {l.folio}
                    </Link>
                    <div className="text-xs text-white/45">
                      {c && `${codigoCaja(c)} · ${c.nombre} · `}del {formatoFecha(l.fechaInicio)} al {l.fechaCierre && formatoFecha(l.fechaCierre)} ·{" "}
                      {l.numMovimientos} gasto{l.numMovimientos === 1 ? "" : "s"} · <strong className="text-white/80">{formatoSoles(l.egresos)}</strong>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/api/liquidaciones/${l.id}/excel`} className="fx-btn rounded-[10px] border border-white/12 px-3.5 py-2 text-[13px] text-white/75">
                      Excel
                    </a>
                    <RevisarLiquidacion id={l.id} />
                  </div>
                </div>
              );
            })}
          </Seccion>
          <Seccion titulo={`Por reponer (${aprobadas.length})`} vacio="No hay liquidaciones aprobadas esperando su reposición.">
            {aprobadas.map((l) => {
              const c = cajaDe(l.cajaId);
              return (
                <div key={l.id} className="fx-card flex flex-col gap-3 p-4 md:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link prefetch={false} href={`/liquidaciones/${l.id}`} className="font-display text-base font-bold hover:underline">
                        {l.folio}
                      </Link>
                      <div className="text-xs text-white/45">
                        {c && `${codigoCaja(c)} · ${c.nombre} · `}liquidado {formatoSoles(l.egresos)}
                      </div>
                    </div>
                    <BadgeLiquidacion estado={l.estado} />
                  </div>
                  <FormularioRecarga cajaId={l.cajaId} liquidacion={{ id: l.id, folio: l.folio, sugerido: l.egresos }} textoBoton="Registrar reposición" />
                </div>
              );
            })}
          </Seccion>
        </>
      )}

      {vista === "autorizar" && (
        <Seccion
          titulo={`Gastos sobre el tope (${porAutorizar.total})`}
          vacio="No hay gastos esperando autorización."
          ayuda="No entran a ninguna liquidación hasta que los autorices. Si no corresponden, ábrelos y anúlalos con el motivo."
        >
          {porAutorizar.movimientos.map((m) => {
            const c = cajaDe(m.cajaId);
            const tope = empresas.find((e) => e.id === c?.empresaId)?.topeGasto;
            return (
              <div key={m.id} className="fx-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:px-5">
                <div className="min-w-0">
                  <Link prefetch={false} href={`/movimientos/${m.id}`} className="text-[14px] font-semibold hover:underline">
                    {m.detalle}
                  </Link>
                  <div className="text-xs text-white/45">
                    {m.proveedor ?? "Proveedor por definir"} · {formatoFecha(m.fecha)} · {c && `${codigoCaja(c)} · `}
                    {m.solicitante && `pidió ${m.solicitante} · `}
                    {m.estado === "pendiente" ? "falta sustento" : "sustentado"}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-display text-lg font-bold text-fx-pendiente">{formatoSoles(m.monto)}</div>
                    {tope !== undefined && <div className="text-[11px] text-white/40">tope {formatoSoles(tope)}</div>}
                  </div>
                  <AutorizarGasto id={m.id} />
                </div>
              </div>
            );
          })}
        </Seccion>
      )}

      {vista === "ingresos" && <Ingresos />}

      {vista === "cajas" && (
        <GestionCajas
          cajas={await repo.listarCajasAdmin()}
          empresas={empresas.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombreCorto, topeGasto: e.topeGasto }))}
        />
      )}
    </main>
  );

  async function Ingresos() {
    const recargas = await repo.listarRecargas(ids);
    const cajasIngreso: CajaIngreso[] = cajas.map((c) => ({
      id: c.id,
      empresa: empresaDe(c),
      codigo: codigoCaja(c),
      nombre: c.nombre,
      porReponer: aprobadas.filter((l) => l.cajaId === c.id).map((l) => ({ id: l.id, folio: l.folio, monto: l.egresos })),
    }));
    return (
      <>
        <FormularioIngreso cajas={cajasIngreso} />
        <Seccion titulo="Últimos ingresos" vacio="Aún no hay ingresos registrados.">
          {recargas.length > 0 && (
          <div className="fx-card overflow-hidden">
            {recargas.slice(0, 50).map((r) => {
              const c = cajaDe(r.cajaId);
              return (
                <div key={r.id} className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 text-[13px] last:border-b-0 md:px-5">
                  <div className="min-w-0">
                    <div className="truncate">
                      {formatoFecha(r.fecha)} · {c ? codigoCaja(c) : ""} · {r.descripcion ?? ETIQUETA_TIPO_RECARGA[r.tipo]}
                    </div>
                    <div className="truncate text-[11.5px] text-white/45">
                      {[ETIQUETA_TIPO_RECARGA[r.tipo], r.folioRepuesto && `repone ${r.folioRepuesto}`, ETIQUETA_FORMA_INGRESO[r.forma], r.banco, r.operacion && `Op. ${r.operacion}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className={`shrink-0 font-semibold ${r.monto < 0 ? "text-fx-error" : "text-fx-completo"}`}>
                    {r.monto > 0 ? "+" : ""}
                    {formatoSoles(r.monto)}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </Seccion>
      </>
    );
  }
}

function Seccion({ titulo, vacio, ayuda, children }: { titulo: string; vacio: string; ayuda?: string; children: React.ReactNode }) {
  const hay = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">{titulo}</h2>
      {ayuda && <p className="-mt-1 text-[12px] text-white/45">{ayuda}</p>}
      {hay ? children : <div className="fx-card px-5 py-7 text-center text-sm text-white/50">{vacio}</div>}
    </section>
  );
}
