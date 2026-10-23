"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registrarRecarga } from "@/app/acciones";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import { ETIQUETA_FORMA_INGRESO, ETIQUETA_TIPO_RECARGA, type FormaIngreso, type TipoRecarga } from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";

export interface CajaIngreso {
  id: string;
  empresa: string;
  codigo: string; // SL-CAJA-MT-01
  nombre: string;
  /** Liquidaciones aprobadas que esperan su reposición. */
  porReponer: { id: string; folio: string; monto: number }[];
}

const OTROS: TipoRecarga[] = ["extraordinaria", "apertura", "ajuste"];

/**
 * Tesorería registra un ingreso: elige la caja y a qué corresponde (la reposición de una
 * liquidación aprobada, o una recarga extraordinaria, apertura o ajuste). Monto libre.
 */
export function FormularioIngreso({ cajas, cajaInicial }: { cajas: CajaIngreso[]; cajaInicial?: string }) {
  const router = useRouter();
  const [cajaId, setCajaId] = useState(cajaInicial ?? cajas[0]?.id ?? "");
  const caja = cajas.find((c) => c.id === cajaId);
  // "liq:<id>" = reposición de esa liquidación; si no, un tipo de recarga.
  const [destino, setDestino] = useState<string>(() => (caja?.porReponer[0] ? `liq:${caja.porReponer[0].id}` : "extraordinaria"));
  const reposicion = destino.startsWith("liq:") ? caja?.porReponer.find((l) => `liq:${l.id}` === destino) : undefined;
  const [montoTexto, setMontoTexto] = useState(reposicion ? reposicion.monto.toFixed(2) : "");
  const [fecha, setFecha] = useState(fechaHoyLima());
  const [forma, setForma] = useState<FormaIngreso>("banco");
  const [banco, setBanco] = useState("");
  const [operacion, setOperacion] = useState("");
  const [recibo, setRecibo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState("");
  const [guardando, iniciar] = useTransition();

  const elegirCaja = (id: string) => {
    setCajaId(id);
    const c = cajas.find((x) => x.id === id);
    const primera = c?.porReponer[0];
    setDestino(primera ? `liq:${primera.id}` : "extraordinaria");
    setMontoTexto(primera ? primera.monto.toFixed(2) : "");
  };
  const elegirDestino = (d: string) => {
    setDestino(d);
    const l = caja?.porReponer.find((x) => `liq:${x.id}` === d);
    if (l) setMontoTexto(l.monto.toFixed(2));
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setListo("");
    const negativo = montoTexto.trim().startsWith("-");
    const tipo: TipoRecarga = reposicion ? "reposicion" : (destino as TipoRecarga);
    iniciar(async () => {
      const r = await registrarRecarga({
        cajaId,
        tipo,
        liquidacionRepuestaId: reposicion?.id ?? null,
        monto: leerMonto(montoTexto.replace(/^-/, "")) * (negativo ? -1 : 1),
        fecha,
        descripcion: descripcion || (reposicion ? `Reposición ${reposicion.folio}` : null),
        forma,
        banco: forma === "banco" ? banco || null : null,
        operacion: operacion || null,
        recibo: recibo || null,
        nota: null,
      });
      if (r.ok) {
        setErrores({});
        setListo(`Ingreso de ${montoTexto} registrado en ${caja?.codigo}.`);
        setOperacion("");
        setRecibo("");
        setDescripcion("");
        setMontoTexto("");
        router.refresh();
      } else setErrores(r.errores);
    });
  };

  if (!cajas.length) return <p className="text-[13px] text-white/50">No hay cajas activas.</p>;

  return (
    <form onSubmit={guardar} noValidate className="fx-card flex flex-col gap-4 p-4 md:p-6">
      <h2 className="text-base font-bold">Registrar ingreso</h2>
      {listo && <p className="text-[13px] text-fx-completo">● {listo}</p>}
      {errores._ && <p className="text-[13px] text-fx-error">{errores._}</p>}
      <div className="grid gap-3.5 md:grid-cols-2">
        <div>
          <label htmlFor="ing-caja" className="fx-label">
            Caja *
          </label>
          <select id="ing-caja" className="fx-input" value={cajaId} onChange={(e) => elegirCaja(e.target.value)}>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.empresa} · {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ing-destino" className="fx-label">
            ¿A qué corresponde? *
          </label>
          <select id="ing-destino" className="fx-input" value={destino} onChange={(e) => elegirDestino(e.target.value)}>
            {caja?.porReponer.map((l) => (
              <option key={l.id} value={`liq:${l.id}`}>
                Reposición de {l.folio} ({formatoSoles(l.monto)})
              </option>
            ))}
            {OTROS.map((t) => (
              <option key={t} value={t}>
                Recarga {ETIQUETA_TIPO_RECARGA[t].toLowerCase()}
              </option>
            ))}
          </select>
          {errores.tipo && <p className="mt-1.5 text-xs text-fx-error">{errores.tipo}</p>}
        </div>
        <div>
          <label htmlFor="ing-monto" className="fx-label">
            Monto (S/) *
          </label>
          <input
            id="ing-monto"
            className="fx-input font-display font-bold"
            inputMode="decimal"
            placeholder={destino === "ajuste" ? "Ej. -20.00" : "0.00"}
            value={montoTexto}
            aria-invalid={!!errores.monto}
            onChange={(e) => setMontoTexto(e.target.value)}
          />
          {errores.monto && <p className="mt-1.5 text-xs text-fx-error">{errores.monto}</p>}
        </div>
        <div>
          <label htmlFor="ing-fecha" className="fx-label">
            Fecha del depósito *
          </label>
          <input id="ing-fecha" type="date" className="fx-input" max={fechaHoyLima()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          {errores.fecha && <p className="mt-1.5 text-xs text-fx-error">{errores.fecha}</p>}
        </div>
        <div>
          <label htmlFor="ing-forma" className="fx-label">
            Forma
          </label>
          <select id="ing-forma" className="fx-input" value={forma} onChange={(e) => setForma(e.target.value as FormaIngreso)}>
            {(Object.keys(ETIQUETA_FORMA_INGRESO) as FormaIngreso[]).map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FORMA_INGRESO[f]}
              </option>
            ))}
          </select>
        </div>
        {forma === "banco" && (
          <div>
            <label htmlFor="ing-banco" className="fx-label">
              Banco
            </label>
            <input id="ing-banco" className="fx-input" placeholder="BCP, Interbank…" value={banco} onChange={(e) => setBanco(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="ing-op" className="fx-label">
            N° de operación
          </label>
          <input id="ing-op" className="fx-input" value={operacion} onChange={(e) => setOperacion(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ing-recibo" className="fx-label">
            Recibo
          </label>
          <input id="ing-recibo" className="fx-input" value={recibo} onChange={(e) => setRecibo(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="ing-desc" className="fx-label">
            Descripción
          </label>
          <input
            id="ing-desc"
            className="fx-input"
            placeholder={reposicion ? `Reposición ${reposicion.folio}` : "Ej. Recarga por viaje a planta"}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[11.5px] text-white/45">
        El ingreso entra a la liquidación abierta de la caja (la siguiente que se genere).
      </p>
      <button
        type="submit"
        disabled={guardando}
        className="fx-btn self-end rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {guardando ? "Guardando…" : "Registrar ingreso"}
      </button>
    </form>
  );
}
