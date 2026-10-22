import Link from "next/link";
import { notFound } from "next/navigation";
import { AnularMovimiento } from "@/components/movimientos/AnularMovimiento";
import { CompletarPendiente } from "@/components/movimientos/CompletarPendiente";
import { textoFalta } from "@/components/movimientos/textos";
import { BadgeEstado } from "@/components/ui/BadgeEstado";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { ETIQUETA_DOCUMENTO, ETIQUETA_LIQUIDACION, ETIQUETA_MEDIO_PAGO } from "@/lib/datos/tipos";
import { almacenActivo } from "@/lib/drive/estado";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Movimiento · Factudex" };

export default async function PaginaMovimiento({ params }: PageProps<"/movimientos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const repo = await obtenerRepositorio();
  const m = await repo.obtenerMovimiento(id);
  if (!m) notFound();
  const [permisos, almacen] = await Promise.all([repo.permisosCaja(m.cajaId), almacenActivo()]);

  const liquidacionAbierta = m.liquidacion.estado === "abierta" || m.liquidacion.estado === "observada";
  const pendiente = m.estado === "pendiente" && !m.anulado;

  const datos: [string, React.ReactNode][] = [
    ["Fecha", formatoFecha(m.fecha)],
    ["Solicitante", m.solicitante ?? "—"],
    ["Proveedor", m.proveedor ? `${m.proveedor}${m.proveedorDoc ? ` · ${m.proveedorDoc}` : ""}` : "Por definir"],
    ["Categoría", m.categoria ?? "Sin categorizar"],
    ["Centro de costo", m.centroCosto ?? "—"],
    [
      "Documento",
      m.tipoDocumento ? `${ETIQUETA_DOCUMENTO[m.tipoDocumento]}${m.serieNumero ? ` · ${m.serieNumero}` : ""}` : "Sin indicar",
    ],
    [
      "Medio de pago",
      m.medioPago ? `${ETIQUETA_MEDIO_PAGO[m.medioPago]}${m.operacionPago ? ` · Op. ${m.operacionPago}` : ""}` : "Sin indicar",
    ],
    [
      "Liquidación",
      <Link key="l" href={`/liquidaciones/${m.liquidacion.id}`} className="text-fx-primary-light hover:underline">
        {m.liquidacion.folio} · {ETIQUETA_LIQUIDACION[m.liquidacion.estado]}
      </Link>,
    ],
  ];

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <Link href="/historial" className="text-[13px] text-white/50 hover:text-white">
        ← Historial
      </Link>

      <div className="grid items-start gap-4 md:grid-cols-[1.4fr_1fr] md:gap-5">
        <section className="fx-card flex flex-col gap-5 p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className={`text-lg font-bold md:text-xl ${m.anulado ? "line-through opacity-60" : ""}`}>{m.detalle}</h1>
              <p className="text-xs text-white/45">{m.proveedor ?? "Proveedor por definir"}</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-xl font-bold md:text-2xl">{formatoSoles(m.monto)}</div>
              <div className="mt-1.5">
                {m.anulado ? (
                  <span className="rounded-full border border-white/20 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/55">
                    ● Anulado
                  </span>
                ) : (
                  <BadgeEstado estado={m.estado} />
                )}
              </div>
            </div>
          </div>

          {m.anulado && (
            <p className="rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-[13px] text-white/60">
              Anulado: {m.motivoAnulacion}
            </p>
          )}
          {pendiente && (
            <p className="rounded-xl border border-fx-pendiente/40 bg-fx-pendiente/10 px-4 py-3 text-[13px] text-fx-pendiente">
              {textoFalta(m)}. No entra a la liquidación hasta completarlo.
            </p>
          )}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-[0.6px] text-white/40">{k}</dt>
                <dd className="mt-0.5 text-white/85">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="fx-card flex flex-col gap-3 p-4 md:p-6">
          <h2 className="text-base font-bold">Adjuntos</h2>
          {m.adjuntos.length === 0 && <p className="text-[13px] text-white/45">Sin archivos todavía.</p>}
          {m.adjuntos.map((a) => {
            const etiqueta = a.tipo === "documento" ? "Documento" : a.tipo === "pago" ? "Constancia de pago" : "Otro";
            const contenido = (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/8 text-[10px] font-bold text-white/60">
                  {a.mimeType === "application/pdf" ? "PDF" : "IMG"}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{etiqueta}</span>
                  <span className="block truncate text-[11.5px] text-white/45">{a.nombreArchivo ?? "Archivo"}</span>
                </span>
              </>
            );
            return a.url ? (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-2.5 hover:bg-white/8"
              >
                {contenido}
              </a>
            ) : (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-2.5">
                {contenido}
              </div>
            );
          })}
        </section>
      </div>

      {pendiente && permisos.registrar && (
        <CompletarPendiente movimiento={m} almacen={almacen} medioEditable={liquidacionAbierta} />
      )}
      {!m.anulado && liquidacionAbierta && permisos.registrar && <AnularMovimiento id={m.id} />}
    </main>
  );
}
