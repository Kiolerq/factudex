"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { generarLiquidacion } from "@/app/acciones";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import type { MovimientoResumen } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

interface Props {
  cajaId: string;
  cajaCodigo: string;
  folio: string; // el que tendrá esta liquidación
  saldoInicial: number;
  ingresos: number; // depósitos asignados a esta liquidación
  movimientos: MovimientoResumen[]; // de la liquidación abierta (sin anulados)
  puedeGenerar: boolean;
}

const liquidable = (m: MovimientoResumen) => m.estado === "completo" && !m.porAutorizar && !m.anulado;
const suma = (ms: MovimientoResumen[]) => Math.round(ms.reduce((s, m) => s + m.monto, 0) * 100) / 100;

/**
 * Liquidar una caja por rango de fechas: entran sus gastos completos del rango (se pueden
 * desmarcar); lo demás queda para la siguiente liquidación de la caja.
 */
export function GenerarLiquidacion({ cajaId, cajaCodigo, folio, saldoInicial, ingresos, movimientos, puedeGenerar }: Props) {
  const router = useRouter();
  const hoy = fechaHoyLima();
  const listos = useMemo(() => movimientos.filter(liquidable).sort((a, b) => a.fecha.localeCompare(b.fecha)), [movimientos]);
  const [desde, setDesde] = useState(listos[0]?.fecha ?? hoy);
  const [hasta, setHasta] = useState(hoy);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [generando, iniciar] = useTransition();

  const enRango = listos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const entran = enRango.filter((m) => !excluidos.has(m.id));
  const total = suma(entran);
  const anteriores = listos.filter((m) => m.fecha < desde);
  const posteriores = listos.filter((m) => m.fecha > hasta);
  const sinSustento = movimientos.filter((m) => !m.anulado && m.estado === "pendiente");
  const porAutorizar = movimientos.filter((m) => !m.anulado && m.estado === "completo" && m.porAutorizar);

  const alternar = (id: string) =>
    setExcluidos((xs) => {
      const n = new Set(xs);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const generar = () =>
    iniciar(async () => {
      setError("");
      const r = await generarLiquidacion({ cajaId, desde, hasta, excluir: enRango.filter((m) => excluidos.has(m.id)).map((m) => m.id) });
      // La página muestra el aviso (al recargar, este formulario se rehace con la liquidación nueva).
      if (r.ok) router.replace(`/liquidaciones?caja=${cajaId}&generada=${encodeURIComponent(r.folio)}`, { scroll: false });
      else setError(r.errores._ ?? r.errores.hasta ?? "No se pudo generar");
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3.5 md:max-w-md">
        <div>
          <label htmlFor="liq-desde" className="fx-label">
            Desde
          </label>
          <input id="liq-desde" type="date" className="fx-input" max={hasta} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label htmlFor="liq-hasta" className="fx-label">
            Hasta
          </label>
          <input id="liq-hasta" type="date" className="fx-input" min={desde} max={hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      {anteriores.length > 0 && (
        <p className="rounded-xl border border-fx-pendiente/40 bg-fx-pendiente/10 px-4 py-2.5 text-[12.5px] text-fx-pendiente">
          Hay {anteriores.length} gasto{anteriores.length === 1 ? "" : "s"} completo{anteriores.length === 1 ? "" : "s"} anterior
          {anteriores.length === 1 ? "" : "es"} al {formatoFecha(desde)} sin liquidar ({formatoSoles(suma(anteriores))}). Quedarán en la caja.
        </p>
      )}

      <div className="fx-card overflow-hidden">
        <div className="border-b border-white/8 px-4 py-2.5 text-[11px] uppercase tracking-[0.6px] text-white/40 md:px-5">
          Gastos que entran ({entran.length} de {enRango.length})
        </div>
        {enRango.length === 0 && <div className="px-5 py-6 text-center text-[13px] text-white/45">No hay gastos completos en ese rango.</div>}
        {enRango.map((m) => {
          const marcado = !excluidos.has(m.id);
          return (
            <label
              key={m.id}
              className={`flex cursor-pointer items-center gap-3 border-b border-white/5 px-4 py-2.5 text-[13px] last:border-b-0 hover:bg-white/4 md:px-5 ${marcado ? "" : "opacity-50"}`}
            >
              <input type="checkbox" checked={marcado} onChange={() => alternar(m.id)} disabled={!puedeGenerar} />
              <span className="w-12 shrink-0 text-white/50">{formatoFecha(m.fecha, true)}</span>
              <span className="min-w-0 flex-1 truncate">
                {m.detalle}
                <span className="text-white/40"> · {m.proveedor ?? "Por definir"}</span>
              </span>
              <span className="shrink-0 font-semibold">{formatoSoles(m.monto)}</span>
            </label>
          );
        })}
      </div>

      {(posteriores.length > 0 || sinSustento.length > 0 || porAutorizar.length > 0 || excluidos.size > 0) && (
        <div className="flex flex-col gap-1 text-[12.5px] text-white/55">
          <span className="text-[11px] uppercase tracking-[0.6px] text-white/40">Quedan en la caja para la siguiente</span>
          {posteriores.length > 0 && <span>· {posteriores.length} posterior{posteriores.length === 1 ? "" : "es"} al {formatoFecha(hasta)} ({formatoSoles(suma(posteriores))})</span>}
          {enRango.length - entran.length > 0 && <span>· {enRango.length - entran.length} desmarcado{enRango.length - entran.length === 1 ? "" : "s"}</span>}
          {sinSustento.length > 0 && (
            <Link prefetch={false} href="/pendientes" className="text-fx-error hover:underline">
              · {sinSustento.length} sin sustento completo ({formatoSoles(suma(sinSustento))}) →
            </Link>
          )}
          {porAutorizar.length > 0 && (
            <span className="text-fx-pendiente">
              · {porAutorizar.length} por autorizar por tesorería ({formatoSoles(suma(porAutorizar))})
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <Cifra titulo="Saldo anterior" valor={saldoInicial} />
        <Cifra titulo="Ingresos" valor={ingresos} />
        <Cifra titulo={`Gastos (${entran.length})`} valor={total} />
        <Cifra titulo="Por reembolsar" valor={Math.round((saldoInicial + ingresos - total) * 100) / 100} destacado />
      </div>

      {error && <p className="text-[13px] text-fx-error">{error}</p>}
      {puedeGenerar &&
        (confirmando ? (
          <div className="flex flex-col gap-3 rounded-xl border border-fx-primary-line bg-fx-primary-soft p-4 text-[13px]">
            <p>
              Se generará <strong>{folio}</strong> de <strong>{cajaCodigo}</strong>, del {formatoFecha(desde)} al{" "}
              {formatoFecha(hasta)}, con {entran.length} gasto{entran.length === 1 ? "" : "s"} por <strong>{formatoSoles(total)}</strong>. Queda en
              revisión de tesorería.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmando(false)} className="fx-btn rounded-[10px] px-4 py-2 text-white/60">
                Cancelar
              </button>
              <button
                type="button"
                disabled={generando}
                onClick={generar}
                className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                {generando ? "Generando…" : "Sí, generar"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={!entran.length}
            onClick={() => setConfirmando(true)}
            className="fx-btn self-end rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Generar liquidación {folio}
          </button>
        ))}
    </div>
  );
}

function Cifra({ titulo, valor, destacado }: { titulo: string; valor: number; destacado?: boolean }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 px-3.5 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.6px] text-white/40">{titulo}</div>
      <div className={`mt-1 font-display text-[16px] font-bold md:text-lg ${destacado ? "text-fx-primary-light" : ""}`}>{formatoSoles(valor)}</div>
    </div>
  );
}
