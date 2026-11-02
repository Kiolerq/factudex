"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { registrarDevolucion } from "@/app/acciones";
import { MIME_PERMITIDOS, type Pago } from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";
import { comprimirImagen } from "@/lib/imagen";
import { subirFotoDevolucion, type Almacen } from "@/lib/subida";
import { fechaHoyLima } from "@/lib/datos/esquemas";

/** Lo que sobró de un pago y volvió a la caja: monto, motivo y foto. Así el pago cuadra. */
export function RegistrarDevolucion({ pago, almacen }: { pago: Pago; almacen: Almacen }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [montoTexto, setMontoTexto] = useState(pago.falta.toFixed(2));
  const [motivo, setMotivo] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fx-btn self-start rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82"
      >
        ↩ Registrar devolución
      </button>
    );
  }

  const guardar = () =>
    iniciar(async () => {
      const monto = leerMonto(montoTexto);
      let comprobantePath: string | null = null;
      let comprobanteMime: (typeof MIME_PERMITIDOS)[number] | null = null;
      try {
        if (foto) {
          const r = await subirFotoDevolucion({
            almacen,
            cajaId: pago.cajaId,
            pagoId: pago.id,
            archivo: await comprimirImagen(foto),
            fecha: fechaHoyLima(),
            monto: Number.isFinite(monto) ? monto : 0,
          });
          comprobantePath = r.storagePath;
          comprobanteMime = r.mime;
        }
      } catch (e) {
        setErrores({ _: e instanceof Error ? e.message : "No se pudo subir la foto" });
        return;
      }
      const r = await registrarDevolucion({ pagoId: pago.id, monto, motivo, comprobantePath, comprobanteMime });
      if (!r.ok) {
        setErrores(r.errores);
        return;
      }
      setAbierto(false);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/3 p-3.5">
      <div className="text-fx-md font-semibold">Devolución a la caja</div>
      <p className="-mt-1.5 text-fx-xs text-white/75">
        Si del pago sobró dinero y volvió a la caja. Falta cuadrar {formatoSoles(pago.falta)}.
      </p>
      {errores._ && <p className="text-fx-sm text-fx-error">{errores._}</p>}
      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
        <div>
          <label htmlFor="dev-monto" className="fx-label">
            Monto devuelto (S/) *
          </label>
          <input
            id="dev-monto"
            className="fx-input font-display font-bold"
            inputMode="decimal"
            value={montoTexto}
            aria-invalid={!!errores.monto}
            onChange={(e) => setMontoTexto(e.target.value)}
          />
          {errores.monto && <p className="mt-1.5 text-xs text-fx-error">{errores.monto}</p>}
        </div>
        <div>
          <label htmlFor="dev-motivo" className="fx-label">
            Motivo *
          </label>
          <input
            id="dev-motivo"
            className="fx-input"
            placeholder="Ej. Sobró del viaje, se devolvió en efectivo"
            value={motivo}
            aria-invalid={!!errores.motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {errores.motivo && <p className="mt-1.5 text-xs text-fx-error">{errores.motivo}</p>}
        </div>
      </div>
      <div>
        <span className="fx-label">Foto de la devolución</span>
        <input
          ref={entrada}
          type="file"
          accept={MIME_PERMITIDOS.join(",")}
          className="hidden"
          aria-label="Foto de la devolución"
          onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="fx-btn w-full truncate rounded-[10px] border border-dashed border-white/25 px-3.5 py-3 text-left text-fx-sm text-white/75"
        >
          {foto ? `📎 ${foto.name}` : "Adjuntar foto (Yape devuelto, voucher o recibo)"}
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="fx-btn rounded-[10px] px-4 py-2 text-fx-sm text-white/68">
          Cancelar
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={guardar}
          className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar devolución"}
        </button>
      </div>
    </div>
  );
}
