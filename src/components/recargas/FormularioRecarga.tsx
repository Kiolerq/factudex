"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registrarRecarga } from "@/app/acciones";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import { ETIQUETA_FORMA_INGRESO, ETIQUETA_TIPO_RECARGA, type FormaIngreso, type TipoRecarga } from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";

interface Props {
  cajaId: string;
  /** Reposición de una liquidación aprobada; sin esto es una recarga extraordinaria, apertura o ajuste. */
  liquidacion?: { id: string; folio: string; sugerido: number };
  textoBoton?: string;
}

const OTROS_TIPOS: TipoRecarga[] = ["extraordinaria", "apertura", "ajuste"];

/** Registro MANUAL de un depósito a la caja (no hay integración bancaria). Monto libre. */
export function FormularioRecarga({ cajaId, liquidacion, textoBoton = "Registrar recarga" }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoRecarga>(liquidacion ? "reposicion" : "extraordinaria");
  const [montoTexto, setMontoTexto] = useState(liquidacion && liquidacion.sugerido > 0 ? liquidacion.sugerido.toFixed(2) : "");
  const [fecha, setFecha] = useState(fechaHoyLima());
  const [forma, setForma] = useState<FormaIngreso>("banco");
  const [banco, setBanco] = useState("");
  const [operacion, setOperacion] = useState("");
  const [recibo, setRecibo] = useState("");
  const [descripcion, setDescripcion] = useState(liquidacion ? `Reposición ${liquidacion.folio}` : "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, iniciar] = useTransition();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-[13px] font-semibold text-white"
      >
        {textoBoton}
      </button>
    );
  }

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const r = await registrarRecarga({
        cajaId,
        tipo,
        liquidacionRepuestaId: liquidacion?.id ?? null,
        monto: leerMonto(montoTexto.replace(/^-/, "")) * (montoTexto.trim().startsWith("-") ? -1 : 1),
        fecha,
        descripcion: descripcion || null,
        forma,
        banco: forma === "banco" ? banco || null : null,
        operacion: operacion || null,
        recibo: recibo || null,
        nota: null,
      });
      if (r.ok) {
        setAbierto(false);
        router.refresh();
      } else setErrores(r.errores);
    });
  };

  return (
    <form onSubmit={guardar} noValidate className="flex w-full flex-col gap-3.5 rounded-xl border border-white/10 bg-white/4 p-4">
      {liquidacion && liquidacion.sugerido > 0 && (
        <p className="text-xs text-white/50">Sugerido: lo liquidado en {liquidacion.folio}, {formatoSoles(liquidacion.sugerido)}. El monto es libre.</p>
      )}
      {errores._ && <p className="text-[13px] text-fx-error">{errores._}</p>}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {!liquidacion && (
          <div>
            <label htmlFor={`tipo-${cajaId}`} className="fx-label">
              Tipo
            </label>
            <select id={`tipo-${cajaId}`} className="fx-input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRecarga)}>
              {OTROS_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_RECARGA[t]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`monto-${cajaId}`} className="fx-label">
            Monto (S/) *
          </label>
          <input
            id={`monto-${cajaId}`}
            className="fx-input font-display font-bold"
            inputMode="decimal"
            placeholder={tipo === "ajuste" ? "Ej. -20.00" : "0.00"}
            value={montoTexto}
            aria-invalid={!!errores.monto}
            onChange={(e) => setMontoTexto(e.target.value)}
          />
          {errores.monto && <p className="mt-1.5 text-xs text-fx-error">{errores.monto}</p>}
        </div>
        <div>
          <label htmlFor={`fecha-${cajaId}`} className="fx-label">
            Fecha del depósito *
          </label>
          <input
            id={`fecha-${cajaId}`}
            type="date"
            className="fx-input"
            max={fechaHoyLima()}
            value={fecha}
            aria-invalid={!!errores.fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          {errores.fecha && <p className="mt-1.5 text-xs text-fx-error">{errores.fecha}</p>}
        </div>
        <div>
          <label htmlFor={`forma-${cajaId}`} className="fx-label">
            Forma
          </label>
          <select id={`forma-${cajaId}`} className="fx-input" value={forma} onChange={(e) => setForma(e.target.value as FormaIngreso)}>
            {(Object.keys(ETIQUETA_FORMA_INGRESO) as FormaIngreso[]).map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FORMA_INGRESO[f]}
              </option>
            ))}
          </select>
        </div>
        {forma === "banco" && (
          <div>
            <label htmlFor={`banco-${cajaId}`} className="fx-label">
              Banco
            </label>
            <input id={`banco-${cajaId}`} className="fx-input" placeholder="BCP, Interbank…" value={banco} onChange={(e) => setBanco(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor={`op-${cajaId}`} className="fx-label">
            N° de operación
          </label>
          <input id={`op-${cajaId}`} className="fx-input" value={operacion} onChange={(e) => setOperacion(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`recibo-${cajaId}`} className="fx-label">
            Recibo
          </label>
          <input id={`recibo-${cajaId}`} className="fx-input" value={recibo} onChange={(e) => setRecibo(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label htmlFor={`desc-${cajaId}`} className="fx-label">
            Descripción
          </label>
          <input id={`desc-${cajaId}`} className="fx-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="fx-btn rounded-[10px] px-4 py-2 text-[13px] text-white/60">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="fx-btn rounded-[10px] bg-fx-primary px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar recarga"}
        </button>
      </div>
    </form>
  );
}
