import Link from "next/link";
import { notFound } from "next/navigation";
import { AnularMovimiento } from "@/components/movimientos/AnularMovimiento";
import { AutorizarGasto } from "@/components/movimientos/AutorizarGasto";
import { CompletarPendiente } from "@/components/movimientos/CompletarPendiente";
import { PagoVariasSalidas } from "@/components/movimientos/PagoVariasSalidas";
import { ConvertirEnPago } from "@/components/movimientos/ConvertirEnPago";
import { AccionesPlanilla } from "@/components/movimientos/AccionesPlanilla";
import { textoFalta } from "@/components/movimientos/textos";
import { BadgeEstado } from "@/components/ui/BadgeEstado";
import { exigirDetalle } from "@/lib/contexto";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { fechaHoyLima, restarDias } from "@/lib/datos/esquemas";
import { ETIQUETA_DOCUMENTO, ETIQUETA_LIQUIDACION, ETIQUETA_MEDIO_PAGO, esSoloTesoreria } from "@/lib/datos/tipos";
import { almacenActivo } from "@/lib/drive/estado";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Movimiento · Factudex" };

export default async function PaginaMovimiento({ params }: PageProps<"/movimientos/[id]">) {
  const yo = await exigirDetalle("historial", "pendientes");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const repo = await obtenerRepositorio();
  const m = await repo.obtenerMovimiento(id);
  if (!m) notFound();
  const [permisos, almacen, pago, planilla] = await Promise.all([
    repo.permisosCaja(m.cajaId),
    almacenActivo(),
    m.pagoId ? repo.obtenerPago(m.pagoId) : null,
    m.tipoDocumento === "planilla_movilidad" ? repo.obtenerPlanillaDeMovimiento(m.id) : null,
  ]);

  // Para "lo que falta ya se liquidó en una caja anterior".
  const anteriores =
    pago && pago.falta > 0.005 && permisos.registrar ? await repo.listarAnteriores(pago.empresaId, restarDias(fechaHoyLima(), 120)) : null;

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
      <Link prefetch={false} key="l" href={`/liquidaciones/${m.liquidacion.id}`} className="text-fx-primary-light hover:underline">
        {m.liquidacion.folio} · {ETIQUETA_LIQUIDACION[m.liquidacion.estado]}
      </Link>,
    ],
  ];

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <Link prefetch={false} href={yo.esAdmin || !yo.esTesoreria ? "/historial" : "/tesoreria"} className="text-fx-sm text-white/68 hover:text-white">
        ← Historial
      </Link>

      <div className="grid items-start gap-4 md:grid-cols-[1.4fr_1fr] md:gap-5">
        <section className="fx-card flex flex-col gap-5 p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className={`text-lg font-bold md:text-xl ${m.anulado ? "line-through opacity-60" : ""}`}>{m.detalle}</h1>
              <p className="text-xs text-white/68">{m.proveedor ?? "Proveedor por definir"}</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-xl font-bold md:text-2xl">{formatoSoles(m.monto)}</div>
              <div className="mt-1.5">
                {m.anulado ? (
                  <span className="rounded-full border border-white/20 bg-white/8 px-3 py-1 text-fx-2xs font-semibold text-white/75">
                    ● Anulado
                  </span>
                ) : (
                  <BadgeEstado estado={m.estado} />
                )}
              </div>
            </div>
          </div>

          {m.anulado && (
            <p className="rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-fx-sm text-white/75">
              Anulado: {m.motivoAnulacion}
            </p>
          )}
          {pendiente && (
            <p className="rounded-xl border border-fx-pendiente/40 bg-fx-pendiente/10 px-4 py-3 text-fx-sm text-fx-pendiente">
              {textoFalta(m)}. No entra a la liquidación hasta completarlo.
            </p>
          )}
          {m.porAutorizar && (
            <div className="flex flex-col gap-3 rounded-xl border border-fx-pendiente/40 bg-fx-pendiente/10 px-4 py-3 text-fx-sm text-fx-pendiente">
              <span>
                Supera el tope por gasto de la empresa: necesita autorización de tesorería para entrar a una liquidación.
                {yo.esTesoreria && " Si no corresponde, anúlalo con el motivo."}
              </span>
              {yo.esTesoreria && <AutorizarGasto id={m.id} />}
            </div>
          )}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-fx-sm sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k}>
                <dt className="text-fx-2xs uppercase tracking-[0.6px] text-white/60">{k}</dt>
                <dd className="mt-0.5 text-white/85">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="fx-card flex flex-col gap-3 p-4 md:p-6">
          <h2 className="text-base font-bold">Adjuntos</h2>
          {m.adjuntos.length === 0 && <p className="text-fx-sm text-white/68">Sin archivos todavía.</p>}
          {m.adjuntos.map((a) => {
            const etiqueta = a.tipo === "documento" ? "Documento" : a.tipo === "pago" ? "Constancia de pago" : "Otro";
            const contenido = (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/8 text-fx-2xs font-bold text-white/75">
                  {a.mimeType === "application/pdf" ? "PDF" : "IMG"}
                </span>
                <span className="min-w-0">
                  <span className="block text-fx-sm font-semibold">{etiqueta}</span>
                  <span className="block truncate text-fx-xs text-white/68">{a.nombreArchivo ?? "Archivo"}</span>
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

      {planilla && (
        <AccionesPlanilla
          planilla={planilla}
          sinPdf={!m.adjuntos.some((a) => a.tipo === "documento")}
          puedeRegistrar={permisos.registrar && !m.anulado}
        />
      )}
      {pago && (
        <PagoVariasSalidas
          pago={pago}
          actualId={m.id}
          puedeRegistrar={permisos.registrar}
          almacen={almacen}
          gastosAnteriores={anteriores?.gastos ?? []}
        />
      )}
      {!pago && !planilla && !m.anulado && permisos.registrar && !esSoloTesoreria(yo) && (
        <div className="flex flex-col gap-1.5">
          <ConvertirEnPago movimientoId={m.id} monto={m.monto} />
          <p className="text-fx-xs text-white/60">
            Si con el mismo Yape o pago se cubrió otro gasto (ej. la comida con una planilla), aunque este ya se haya liquidado.
          </p>
        </div>
      )}
      {pendiente && (m.faltaDocumento || m.faltaPago) && permisos.registrar && (
        <CompletarPendiente movimiento={m} almacen={almacen} medioEditable={liquidacionAbierta} />
      )}
      {!m.anulado && liquidacionAbierta && (permisos.registrar || permisos.aprobar) && <AnularMovimiento id={m.id} />}
    </main>
  );
}
