"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completarMovimiento } from "@/app/acciones";
import { BuscadorProveedor } from "@/components/registro/BuscadorProveedor";
import { CampoAdjunto } from "@/components/registro/CampoAdjunto";
import { TAMANO_MAXIMO } from "@/lib/datos/esquemas";
import {
  ETIQUETA_DOCUMENTO,
  ETIQUETA_MEDIO_PAGO,
  MEDIOS_PAGO,
  MIME_PERMITIDOS,
  TIPOS_DOCUMENTO,
  type AdjuntoSubido,
  type DetalleMovimiento,
  type MedioPago,
  type Proveedor,
  type TipoDocumento,
} from "@/lib/datos/tipos";
import { comprimirImagen } from "@/lib/imagen";
import { subirAdjunto, type Almacen } from "@/lib/subida";

interface Props {
  movimiento: DetalleMovimiento;
  almacen: Almacen;
  /** El medio de pago solo se cambia mientras la liquidación siga abierta u observada. */
  medioEditable: boolean;
}

function proveedorInicial(m: DetalleMovimiento): Proveedor | null {
  if (!m.proveedorId || !m.proveedor) return null;
  const doc = m.proveedorDoc ?? "";
  return {
    id: m.proveedorId,
    tipoDoc: /^\d{11}$/.test(doc) ? "RUC" : /^\d{8}$/.test(doc) ? "DNI" : "OTRO",
    numDoc: doc,
    razonSocial: m.proveedor,
    nombreComercial: null,
  };
}

/** Adjunta lo que le falta a un pendiente (documento y/o constancia de pago) y sus datos. */
export function CompletarPendiente({ movimiento: m, almacen, medioEditable }: Props) {
  const router = useRouter();
  const [guardando, iniciar] = useTransition();
  const [proveedor, setProveedor] = useState<Proveedor | null>(proveedorInicial(m));
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | null>(m.tipoDocumento);
  const [serieNumero, setSerieNumero] = useState(m.serieNumero ?? "");
  const [medioPago, setMedioPago] = useState<MedioPago | null>(m.medioPago);
  const [operacionPago, setOperacionPago] = useState(m.operacionPago ?? "");
  const [documento, setDocumento] = useState<File | null>(null);
  const [pago, setPago] = useState<File | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [paso, setPaso] = useState("");

  const esEfectivo = medioPago === "efectivo";
  const pideDocumento = m.faltaDocumento;
  const pidePago = !esEfectivo && !m.adjuntos.some((a) => a.tipo === "pago");

  async function preparar(campo: "documento" | "pago", f: File, poner: (f: File) => void) {
    if (!(MIME_PERMITIDOS as readonly string[]).includes(f.type)) {
      setErrores((e) => ({ ...e, [campo]: "Formato no permitido. Usa JPG, PNG o PDF." }));
      return;
    }
    const final = await comprimirImagen(f);
    if (final.size > TAMANO_MAXIMO) {
      setErrores((e) => ({ ...e, [campo]: "El archivo pesa más de 10 MB." }));
      return;
    }
    setErrores(({ [campo]: _, ...resto }) => resto);
    poner(final);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const faltan: Record<string, string> = {};
    if (documento && !proveedor) faltan.proveedorId = "Elige el proveedor del documento";
    if (documento && !tipoDocumento) faltan.tipoDocumento = "Elige el tipo de documento";
    if (!documento && !pago && medioPago === m.medioPago && !hayCambiosDeDatos())
      faltan._ = "Adjunta el documento o la constancia de pago que falta.";
    if (Object.keys(faltan).length) return setErrores(faltan);

    iniciar(async () => {
      try {
        const adjuntos: AdjuntoSubido[] = [];
        const porSubir = (
          [
            ["documento", documento],
            ["pago", esEfectivo ? null : pago],
          ] as const
        ).filter(([, f]) => f);
        for (const [i, [tipo, archivo]] of porSubir.entries()) {
          setPaso(`Subiendo archivo ${i + 1} de ${porSubir.length}…`);
          adjuntos.push(
            await subirAdjunto({
              almacen,
              cajaId: m.cajaId,
              movimientoId: m.id,
              tipo,
              archivo: archivo!,
              fecha: m.fecha,
              referencia: proveedor?.razonSocial ?? m.detalle,
              monto: m.monto,
            }),
          );
        }
        setPaso("Guardando…");
        const r = await completarMovimiento({
          id: m.id,
          proveedorId: proveedor?.id ?? null,
          tipoDocumento,
          serieNumero: serieNumero || null,
          medioPago,
          operacionPago: medioPago && !esEfectivo ? operacionPago || null : null,
          adjuntos,
        });
        if (r.ok) {
          setDocumento(null);
          setPago(null);
          setErrores({});
          router.refresh();
        } else {
          setErrores(r.errores);
        }
      } catch (err) {
        setErrores({ _: err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo." });
      } finally {
        setPaso("");
      }
    });
  }

  function hayCambiosDeDatos() {
    return (
      (proveedor?.id ?? null) !== m.proveedorId ||
      tipoDocumento !== m.tipoDocumento ||
      (serieNumero || null) !== m.serieNumero ||
      (operacionPago || null) !== m.operacionPago
    );
  }

  return (
    <form onSubmit={guardar} noValidate className="fx-card flex flex-col gap-4 border-fx-pendiente/35! p-4 md:p-6">
      <div>
        <h2 className="text-base font-bold">Completar sustento</h2>
        <p className="text-xs text-white/45">
          Adjunta lo que falta. Al tener {esEfectivo ? "el documento" : "el documento y la constancia de pago"} pasa a
          Completo y entra a la liquidación.
        </p>
      </div>

      {errores._ && (
        <div role="alert" className="rounded-xl border border-fx-error/50 bg-fx-error/10 px-4 py-3 text-sm text-fx-error">
          {errores._}
        </div>
      )}

      <BuscadorProveedor valor={proveedor} onCambiar={setProveedor} error={errores.proveedorId} requerido={!!documento} />

      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label htmlFor="tipo-doc" className="fx-label">
            Tipo de documento
          </label>
          <select
            id="tipo-doc"
            className="fx-input"
            value={tipoDocumento ?? ""}
            aria-invalid={!!errores.tipoDocumento}
            onChange={(e) => setTipoDocumento((e.target.value || null) as TipoDocumento | null)}
          >
            <option value="">Sin indicar</option>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_DOCUMENTO[t]}
              </option>
            ))}
          </select>
          {errores.tipoDocumento && <p className="mt-1.5 text-xs text-fx-error">{errores.tipoDocumento}</p>}
        </div>
        <div>
          <label htmlFor="serie" className="fx-label">
            N° de documento
          </label>
          <input
            id="serie"
            className="fx-input"
            placeholder="F001-00012345"
            value={serieNumero}
            onChange={(e) => setSerieNumero(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label htmlFor="medio" className="fx-label">
            Medio de pago
          </label>
          <select
            id="medio"
            className="fx-input"
            value={medioPago ?? ""}
            disabled={!medioEditable}
            onChange={(e) => setMedioPago((e.target.value || null) as MedioPago | null)}
          >
            <option value="">Sin indicar</option>
            {MEDIOS_PAGO.map((x) => (
              <option key={x} value={x}>
                {ETIQUETA_MEDIO_PAGO[x]}
              </option>
            ))}
          </select>
        </div>
        {medioPago && !esEfectivo && (
          <div>
            <label htmlFor="operacion" className="fx-label">
              N° de operación
            </label>
            <input
              id="operacion"
              className="fx-input"
              inputMode="numeric"
              value={operacionPago}
              onChange={(e) => setOperacionPago(e.target.value)}
            />
          </div>
        )}
      </div>

      {(pideDocumento || pidePago) && (
        <div className="grid gap-3.5 md:grid-cols-2">
          {pideDocumento && (
            <CampoAdjunto
              etiqueta="Documento"
              ayuda="Factura, boleta, planilla de movilidad, comprobante de egreso…"
              archivo={documento}
              onElegir={(f) => preparar("documento", f, setDocumento)}
              onQuitar={() => setDocumento(null)}
              error={errores.documento}
              resaltarPendiente
            />
          )}
          {pidePago && (
            <CampoAdjunto
              etiqueta="Constancia de pago"
              ayuda="Captura de Yape/Plin, voucher o constancia de transferencia"
              archivo={pago}
              onElegir={(f) => preparar("pago", f, setPago)}
              onQuitar={() => setPago(null)}
              error={errores.pago}
              resaltarPendiente
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {paso && <span className="text-xs text-white/50">{paso}</span>}
        <button
          type="submit"
          disabled={guardando}
          className="fx-btn rounded-[10px] bg-fx-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
