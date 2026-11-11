"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { corregirGastoLiquidado } from "@/app/acciones";
import { CampoAdjunto } from "@/components/registro/CampoAdjunto";
import { fechaHoyLima, TAMANO_MAXIMO } from "@/lib/datos/esquemas";
import { MIME_PERMITIDOS } from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";
import { comprimirImagen } from "@/lib/imagen";
import { subirAdjunto, type Almacen } from "@/lib/subida";
import { nuevoUuid } from "@/lib/uuid";

/**
 * Tesorería corrige un gasto ya liquidado: ej. la factura de S/ 9.80 se anuló y la nueva es de
 * S/ 6.55. En la caja abierta entra una línea por la diferencia (–S/ 3.25) con la factura nueva;
 * el gasto original no cambia.
 */
export function CorregirGastoLiquidado({
  originalId,
  vigente,
  serieNumero,
  destino,
  almacen,
}: {
  originalId: string;
  vigente: number;
  serieNumero: string | null;
  destino: { id: string; codigo: string };
  almacen: Almacen;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [montoTexto, setMontoTexto] = useState("");
  const [serie, setSerie] = useState("");
  const [motivo, setMotivo] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState<string | null>(null);
  const [paso, setPaso] = useState("");
  const [guardando, iniciar] = useTransition();

  const leido = leerMonto(montoTexto);
  const monto = Number.isFinite(leido) && leido >= 0 ? leido : null;
  const diferencia = monto === null ? null : Math.round((monto - vigente) * 100) / 100;

  if (hecho)
    return (
      <p role="status" className="rounded-xl border border-fx-completo/40 bg-fx-completo/10 px-4 py-3 text-fx-sm font-semibold text-fx-completo">
        ✓ {hecho}
      </p>
    );

  if (!abierto)
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fx-btn self-start rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82 hover:border-fx-primary-line"
      >
        ✎ Corregir gasto liquidado
      </button>
    );

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (monto === null) err.monto = "Escribe el monto correcto";
    else if (diferencia === 0) err.monto = `El gasto ya está en ${formatoSoles(vigente)}`;
    if (motivo.trim().length < 3) err.motivo = "Escribe el motivo";
    if (!archivo) err.documento = "Sube la foto del documento nuevo (o de la nota de crédito)";
    setErrores(err);
    if (Object.keys(err).length) return;
    iniciar(async () => {
      try {
        const id = nuevoUuid();
        setPaso("Subiendo el documento…");
        const documento = await subirAdjunto({
          almacen,
          cajaId: destino.id,
          movimientoId: id,
          tipo: "documento",
          archivo: archivo!,
          fecha: fechaHoyLima(),
          referencia: `Correccion ${serie.trim() || serieNumero || ""}`.trim(),
          monto: diferencia,
        });
        setPaso("Guardando…");
        const r = await corregirGastoLiquidado({
          id,
          originalId,
          cajaId: destino.id,
          montoCorrecto: monto!,
          serieNumero: serie.trim() || null,
          motivo,
          documento,
        });
        setPaso("");
        if (!r.ok) return setErrores(r.errores);
        setHecho(
          `Corregido a ${formatoSoles(monto!)}: entra una línea de ${formatoSoles(diferencia!)} en la próxima liquidación de ${destino.codigo}.`,
        );
        router.refresh();
      } catch (err) {
        setPaso("");
        setErrores({ _: err instanceof Error ? err.message : "No se pudo guardar" });
      }
    });
  };

  const error = (k: string) => errores[k] && <p className="mt-1.5 text-xs text-fx-error">{errores[k]}</p>;

  return (
    <form onSubmit={guardar} noValidate className="fx-card flex flex-col gap-3.5 border-fx-primary-line! p-4 md:p-5">
      <div>
        <h3 className="text-base font-bold">Corregir gasto liquidado</h3>
        <p className="text-fx-xs text-white/68">
          Este gasto ya se rindió y no se modifica. La diferencia entra como una línea en la próxima liquidación de{" "}
          <b>{destino.codigo}</b>, con el documento nuevo.
        </p>
      </div>
      {errores._ && <p className="text-fx-sm text-fx-error">{errores._}</p>}
      <div className="grid gap-3.5 md:grid-cols-2">
        <div>
          <label htmlFor="corr-monto" className="fx-label">
            Monto correcto * <span className="font-normal text-white/60">(hoy {formatoSoles(vigente)})</span>
          </label>
          <input
            id="corr-monto"
            className="fx-input"
            inputMode="decimal"
            placeholder="Ej. 6.55"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
          />
          {error("monto") ||
            (diferencia !== null && diferencia !== 0 && (
              <p className={`mt-1.5 text-fx-xs font-semibold ${diferencia < 0 ? "text-fx-completo" : "text-fx-pendiente"}`}>
                {diferencia < 0
                  ? `Vuelven ${formatoSoles(-diferencia)} a la caja (línea de ${formatoSoles(diferencia)})`
                  : `Se agregan ${formatoSoles(diferencia)} al gasto`}
              </p>
            ))}
        </div>
        <div>
          <label htmlFor="corr-serie" className="fx-label">
            N° del documento nuevo
          </label>
          <input
            id="corr-serie"
            className="fx-input"
            placeholder={serieNumero ? `Antes ${serieNumero}` : "Ej. FB82-00020411"}
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="corr-motivo" className="fx-label">
            Motivo *
          </label>
          <textarea
            id="corr-motivo"
            className="fx-input h-auto min-h-[76px] py-3"
            rows={2}
            maxLength={300}
            placeholder="Ej. Proveedor anuló la FB82-00020410 (faltó un material) y emitió la FB82-00020411"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {error("motivo")}
        </div>
        <div className="md:col-span-2">
          <CampoAdjunto
            etiqueta="Documento nuevo (factura, boleta o nota de crédito) *"
            ayuda="Toma la foto o elige el archivo"
            archivo={archivo}
            error={errores.documento}
            onElegir={async (f) => {
              if (!(MIME_PERMITIDOS as readonly string[]).includes(f.type))
                return setErrores((e) => ({ ...e, documento: "Formato no permitido. Usa JPG, PNG o PDF." }));
              const final = await comprimirImagen(f);
              if (final.size > TAMANO_MAXIMO) return setErrores((e) => ({ ...e, documento: "El archivo pesa más de 10 MB." }));
              setArchivo(final);
              setErrores(({ documento: _, ...resto }) => resto);
            }}
            onQuitar={() => setArchivo(null)}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="fx-btn rounded-[10px] px-4 py-2.5 text-fx-sm text-white/75">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="fx-btn rounded-[10px] bg-fx-primary px-5 py-2.5 text-fx-sm font-semibold text-blanco disabled:opacity-60"
        >
          {guardando ? paso || "Guardando…" : "Guardar corrección"}
        </button>
      </div>
    </form>
  );
}
