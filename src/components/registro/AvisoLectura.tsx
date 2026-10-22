"use client";

import Link from "next/link";
import { useState } from "react";
import { formatoFecha, formatoSoles } from "@/lib/formato";
import type { ExtraccionComprobante, SugerenciasLectura } from "@/lib/ocr/esquema";

export type Lectura =
  | { estado: "leyendo" }
  | { estado: "error"; mensaje: string }
  | {
      estado: "listo";
      datos: ExtraccionComprobante;
      campos: string[];
      movido?: boolean;
      proveedorNuevo?: { numDoc: string; razonSocial: string };
      errorProveedor?: string;
      centroNuevo?: string; // placa/área leída que no está en la lista
      errorCentro?: string;
      duplicado?: SugerenciasLectura["duplicado"];
      diferenciaMonto?: { documento: number; pago: number };
    };

interface Props {
  lectura: Lectura;
  hayProveedor: boolean;
  onCrearProveedor: () => Promise<void>;
  hayCentro: boolean; // ya eligió un centro de costo distinto de "General"
  onCrearCentro: () => Promise<void>;
  onCerrar: () => void;
}

/** Resultado de la lectura con IA: qué se llenó y qué revisar. Nunca guarda nada solo. */
export function AvisoLectura({ lectura, hayProveedor, onCrearProveedor, hayCentro, onCrearCentro, onCerrar }: Props) {
  const [creando, setCreando] = useState(false);
  const [creandoCentro, setCreandoCentro] = useState(false);

  if (lectura.estado === "leyendo") {
    return (
      <div role="status" className="fx-card mb-4 flex items-center gap-3 border-fx-primary-line! px-4 py-3 text-[13px]">
        <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-fx-primary border-t-transparent" />
        <span className="text-white/75">Leyendo el comprobante con IA…</span>
      </div>
    );
  }

  const cerrar = (
    <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="fx-btn shrink-0 px-1 text-white/40 hover:text-white">
      ✕
    </button>
  );

  if (lectura.estado === "error") {
    return (
      <div role="status" className="fx-card mb-4 flex items-start justify-between gap-3 px-4 py-3 text-[12.5px] text-white/60">
        <span>No se pudo leer con IA: {lectura.mensaje} Llena los datos a mano.</span>
        {cerrar}
      </div>
    );
  }

  const { datos, campos, movido, proveedorNuevo, errorProveedor, centroNuevo, errorCentro, duplicado, diferenciaMonto } = lectura;
  const dudosa = datos.confianza < 0.7;

  if (!datos.es_comprobante) {
    return (
      <div role="status" className="fx-card mb-4 flex items-start justify-between gap-3 border-fx-pendiente/50! px-4 py-3 text-[12.5px]">
        <span className="text-white/70">La imagen no parece un comprobante ni una constancia de pago. Llena los datos a mano.</span>
        {cerrar}
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`fx-card mb-4 flex flex-col gap-2 px-4 py-3 text-[12.5px] ${dudosa ? "border-fx-pendiente/50!" : "border-fx-primary-line!"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold">
            <span aria-hidden>✨ </span>
            {campos.length ? "Datos leídos con IA" : "La IA no encontró datos nuevos"}
          </div>
          {campos.length > 0 && (
            <p className="mt-0.5 text-white/60">
              Llenó: {campos.join(", ")}. <span className="text-white/80">Revísalos antes de guardar.</span>
            </p>
          )}
        </div>
        {cerrar}
      </div>
      {dudosa && (
        <p className="text-fx-pendiente">La imagen no se leyó con claridad: revisa cada dato con cuidado.</p>
      )}
      {movido && <p className="text-white/60">Es una captura de pago: la pasé a &ldquo;Constancia de pago&rdquo;.</p>}
      {duplicado && (
        <p className="rounded-lg border border-fx-error/40 bg-fx-error/10 px-3 py-2 text-fx-error">
          Este comprobante ya parece registrado: {duplicado.detalle} · {formatoFecha(duplicado.fecha)} ·{" "}
          {formatoSoles(duplicado.monto)}.{" "}
          <Link href={`/movimientos/${duplicado.id}`} className="font-semibold underline">
            Ver gasto
          </Link>
        </p>
      )}
      {diferenciaMonto && (
        <p className="text-fx-pendiente">
          Ojo: el documento dice {formatoSoles(diferenciaMonto.documento)} y la constancia de pago{" "}
          {formatoSoles(diferenciaMonto.pago)}. Revisa el monto.
        </p>
      )}
      {centroNuevo && !hayCentro && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <span className="min-w-0 flex-1 text-white/70">
            Centro de costo leído: <span className="font-mono font-medium text-white">{centroNuevo}</span> (no está en la lista)
          </span>
          <button
            type="button"
            disabled={creandoCentro}
            onClick={async () => {
              setCreandoCentro(true);
              await onCrearCentro();
              setCreandoCentro(false);
            }}
            className="fx-btn rounded-lg bg-fx-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {creandoCentro ? "Agregando…" : "Agregar y usar"}
          </button>
          {errorCentro && <p className="w-full text-fx-error">{errorCentro}</p>}
        </div>
      )}
      {proveedorNuevo && !hayProveedor && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <span className="min-w-0 flex-1 text-white/70">
            Proveedor nuevo: <span className="font-medium text-white">{proveedorNuevo.razonSocial}</span>{" "}
            <span className="font-mono text-white/50">
              {proveedorNuevo.numDoc.length === 11 ? "RUC" : "DNI"} {proveedorNuevo.numDoc}
            </span>
          </span>
          <button
            type="button"
            disabled={creando}
            onClick={async () => {
              setCreando(true);
              await onCrearProveedor();
              setCreando(false);
            }}
            className="fx-btn rounded-lg bg-fx-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {creando ? "Agregando…" : "Agregar y usar"}
          </button>
          {errorProveedor && <p className="w-full text-fx-error">{errorProveedor}</p>}
        </div>
      )}
    </div>
  );
}
