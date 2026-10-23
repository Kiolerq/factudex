"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { adjuntarCompartido, pendientesParaAdjuntar } from "@/app/acciones";
import { textoFalta } from "@/components/movimientos/textos";
import type { ExtraccionComprobante, SugerenciasLectura } from "@/lib/ocr/esquema";
import { motivoNoLegible, pedirLectura } from "@/lib/ocr/cliente";
import {
  ETIQUETA_DOCUMENTO,
  ETIQUETA_MEDIO_PAGO,
  TIPOS_DOCUMENTO,
  type CajaSaldo,
  type EstadoMovimiento,
  type MedioPago,
  type MovimientoResumen,
  type TipoDocumento,
} from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";
import { subirAdjunto, type Almacen } from "@/lib/subida";

export type Eleccion =
  | { tipo: "documento"; subtipo: TipoDocumento }
  | { tipo: "pago"; subtipo: Exclude<MedioPago, "efectivo"> };

interface Props {
  archivos: File[];
  /** Cajas donde puede registrar, con el nombre de su empresa; elige de cuál sale el dinero. */
  cajas: CajaSaldo[];
  empresas: { empresaId: string; nombre: string }[];
  cajaInicialId: string;
  ocr: boolean;
  almacen: Almacen;
  movimientoId: string; // el del registro nuevo (para anotar la lectura)
  /** Nuevo gasto: el registro pone el archivo en su lugar y aplica lo leído. */
  onNuevo: (
    archivo: File,
    eleccion: Eleccion,
    datos: ExtraccionComprobante | null,
    sugerencias: SugerenciasLectura | null,
    cajaId: string,
  ) => void;
  onTerminar: () => void;
}

const MEDIOS: Exclude<MedioPago, "efectivo">[] = ["yape", "plin", "transferencia", "otro"];

type Lectura =
  | { estado: "leyendo" }
  | { estado: "listo"; datos: ExtraccionComprobante | null; sugerencias?: SugerenciasLectura; error?: string };

/** Lo que la IA cree que es el archivo; null si no lo sabe. */
function sugerencia(d: ExtraccionComprobante | null): Eleccion | null {
  if (!d?.es_comprobante) return null;
  if (d.es_captura_yape) {
    const medio = d.medio_pago && d.medio_pago !== "efectivo" ? d.medio_pago : "yape";
    return { tipo: "pago", subtipo: medio };
  }
  return d.tipo_documento ? { tipo: "documento", subtipo: d.tipo_documento } : null;
}

/** Coincidencias con lo leído: el pendiente más probable va primero. */
function coincidencias(m: MovimientoResumen, d: ExtraccionComprobante | null): string[] {
  if (!d) return [];
  const r: string[] = [];
  if (d.monto !== null && Math.abs(d.monto - m.monto) < 0.01) r.push("Coincide el monto");
  if (d.proveedor_num_doc && d.proveedor_num_doc === m.proveedorDoc) r.push("Mismo proveedor");
  if (d.fecha && d.fecha === m.fecha) r.push("Misma fecha");
  return r;
}

/**
 * Ventana que aparece al abrir Factudex desde "Compartir": por cada archivo pregunta qué es
 * (documento o constancia de pago) y para qué gasto (uno nuevo o un pendiente al que le falta).
 */
export function SelectorCompartido({
  archivos,
  cajas,
  empresas,
  cajaInicialId,
  ocr,
  almacen,
  movimientoId,
  onNuevo,
  onTerminar,
}: Props) {
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const [lecturas, setLecturas] = useState<Lectura[]>(() => archivos.map(() => ({ estado: "leyendo" }) as Lectura));
  const [elecciones, setElecciones] = useState<(Eleccion | null)[]>(() => archivos.map(() => null));
  const [pendientes, setPendientes] = useState<MovimientoResumen[] | null>(null);
  const [cajaId, setCajaId] = useState(cajaInicialId);
  const [confirmar, setConfirmar] = useState<MovimientoResumen | null>(null);
  const [resultado, setResultado] = useState<{ m: MovimientoResumen; estado: EstadoMovimiento } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const archivo = archivos[indice]!;
  const lectura = lecturas[indice]!;
  const datos = lectura.estado === "listo" ? lectura.datos : null;
  const eleccion = elecciones[indice] ?? null;
  const vista = useMemo(
    () => (archivo.type.startsWith("image/") && archivo.type !== "image/heic" ? URL.createObjectURL(archivo) : null),
    [archivo],
  );
  useEffect(() => () => void (vista && URL.revokeObjectURL(vista)), [vista]);

  // La IA lee todos los archivos de una vez, mientras la persona elige.
  useEffect(() => {
    archivos.forEach(async (f, i) => {
      const motivo = ocr ? motivoNoLegible(f) : "La lectura con IA no está activada.";
      const r = motivo ? null : await pedirLectura(f, "documento", movimientoId, cajaInicialId);
      const lectura: Lectura = r?.ok
        ? { estado: "listo", datos: r.datos, sugerencias: r.sugerencias }
        : { estado: "listo", datos: null, error: r ? r.error : motivo! };
      setLecturas((ls) => ls.map((l, j) => (j === i ? lectura : l)));
      // Preselecciona lo que cree la IA, si la persona aún no eligió.
      const s = sugerencia(lectura.estado === "listo" ? lectura.datos : null);
      if (s) setElecciones((es) => es.map((e, j) => (j === i && !e ? s : e)));
    });
    pendientesParaAdjuntar(cajas.map((c) => c.id))
      .then(setPendientes)
      .catch(() => setPendientes([]));
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pendientes a los que les falta justo lo que se comparte (por caja, para el contador de cada una).
  const lesFalta = useMemo(
    () => (pendientes ?? []).filter((m) => eleccion && (eleccion.tipo === "documento" ? m.faltaDocumento : m.faltaPago)),
    [pendientes, eleccion],
  );
  const candidatos = useMemo(() => {
    if (!eleccion || !pendientes) return [];
    return lesFalta
      .filter((m) => m.cajaId === cajaId)
      .map((m) => ({ m, motivos: coincidencias(m, datos) }))
      .sort((a, b) => b.motivos.length - a.motivos.length || b.m.fecha.localeCompare(a.m.fecha));
  }, [eleccion, pendientes, lesFalta, cajaId, datos]);

  const elegir = (e: Eleccion) => {
    setElecciones((es) => es.map((x, j) => (j === indice ? e : x)));
    setConfirmar(null);
    setError("");
  };

  const siguiente = () => {
    setConfirmar(null);
    setResultado(null);
    setError("");
    if (indice + 1 < archivos.length) setIndice(indice + 1);
    else onTerminar();
  };

  const nuevo = () => {
    if (!eleccion) return;
    onNuevo(archivo, eleccion, datos, lectura.estado === "listo" ? (lectura.sugerencias ?? null) : null, cajaId);
    siguiente();
  };

  const adjuntar = async (m: MovimientoResumen) => {
    if (!eleccion) return;
    setEnviando(true);
    setError("");
    try {
      const adjunto = await subirAdjunto({
        almacen,
        cajaId: m.cajaId,
        movimientoId: m.id,
        tipo: eleccion.tipo,
        archivo,
        fecha: m.fecha,
        referencia: m.proveedor ?? m.detalle,
        monto: m.monto,
      });
      const r = await adjuntarCompartido({
        id: m.id,
        tipo: eleccion.tipo,
        subtipo: eleccion.subtipo,
        adjunto,
        leido: datos
          ? { serieNumero: datos.serie_numero, numDoc: datos.proveedor_num_doc, operacion: datos.numero_operacion }
          : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResultado({ m, estado: r.estado });
      setConfirmar(null);
      // Ya no le falta eso: sale de la lista para los siguientes archivos.
      setPendientes((ps) =>
        ps?.map((x) =>
          x.id === m.id ? { ...x, faltaDocumento: x.faltaDocumento && eleccion.tipo !== "documento", faltaPago: x.faltaPago && eleccion.tipo !== "pago" } : x,
        ) ?? null,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo adjuntar. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const nombreEleccion = eleccion
    ? eleccion.tipo === "documento"
      ? ETIQUETA_DOCUMENTO[eleccion.subtipo]
      : `Constancia de ${ETIQUETA_MEDIO_PAGO[eleccion.subtipo]}`
    : "";
  const caja = cajas.find((c) => c.id === cajaId) ?? cajas[0]!;
  const nombreEmpresa = empresas.find((e) => e.empresaId === caja.empresaId)?.nombre ?? "";
  const nombreCaja = `${nombreEmpresa} · Caja ${String(caja.numero).padStart(2, "0")} · ${caja.nombre}`;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-compartido" className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 md:items-center md:p-6">
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl border border-fx-glass-border bg-fx-bg p-4 shadow-2xl md:rounded-2xl md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-compartido" className="text-base font-bold">
            Archivo compartido{archivos.length > 1 && ` ${indice + 1} de ${archivos.length}`}
          </h2>
          {!resultado && (
            <button type="button" onClick={siguiente} className="fx-btn text-[13px] text-white/50 hover:text-white">
              Descartar
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-2.5">
          {vista ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
            <img src={vista} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white/8 text-xs font-bold text-white/60">
              {archivo.type === "application/pdf" ? "PDF" : "ARCHIVO"}
            </div>
          )}
          <div className="min-w-0 text-[12.5px]">
            <div className="truncate font-semibold">{archivo.name}</div>
            {lectura.estado === "leyendo" ? (
              <div className="text-fx-primary-light">La IA está leyendo…</div>
            ) : datos?.es_comprobante ? (
              <div className="text-white/60">
                La IA leyó:{" "}
                {[
                  datos.es_captura_yape ? "constancia de pago" : datos.tipo_documento && ETIQUETA_DOCUMENTO[datos.tipo_documento],
                  datos.serie_numero,
                  datos.monto !== null && formatoSoles(datos.monto),
                  datos.proveedor_razon_social,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : (
              <div className="text-white/45">{lectura.error ?? "La IA no reconoció un comprobante. Elige qué es."}</div>
            )}
          </div>
        </div>

        {resultado ? (
          <div className="flex flex-col gap-3">
            <p
              className={`rounded-xl border px-4 py-3 text-[13px] ${
                resultado.estado === "completo"
                  ? "border-fx-completo/40 bg-fx-completo/10 text-fx-completo"
                  : "border-fx-pendiente/40 bg-fx-pendiente/10 text-fx-pendiente"
              }`}
            >
              Listo: {nombreEleccion} adjuntada a <strong>{resultado.m.detalle}</strong>.{" "}
              {resultado.estado === "completo" ? "Quedó Completo y entra a la liquidación." : "Sigue pendiente: aún le falta un archivo."}
            </p>
            <div className="flex justify-end gap-2">
              <Link prefetch={false} href={`/movimientos/${resultado.m.id}`} className="fx-btn rounded-[10px] border border-white/12 px-4 py-2 text-[13px] text-white/75">
                Ver gasto
              </Link>
              <button type="button" onClick={siguiente} className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2 text-[13px] font-semibold text-white">
                {indice + 1 < archivos.length ? "Siguiente archivo" : "Cerrar"}
              </button>
            </div>
          </div>
        ) : confirmar ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl border border-fx-primary-line bg-fx-primary-soft px-4 py-3 text-[13px]">
              Adjuntar <strong>{nombreEleccion}</strong>
              {eleccion?.tipo === "documento" && datos?.serie_numero && ` ${datos.serie_numero}`} a{" "}
              <strong>
                {confirmar.detalle} · {formatoSoles(confirmar.monto)}
              </strong>
              {cajas.length > 1 && ` (${nombreCaja})`}.
              {datos && datos.monto !== null && Math.abs(datos.monto - confirmar.monto) >= 0.01 && (
                <span className="mt-1.5 block text-fx-pendiente">
                  Ojo: la IA leyó {formatoSoles(datos.monto)} y el gasto es de {formatoSoles(confirmar.monto)}.
                </span>
              )}
            </p>
            {error && <p className="text-[13px] text-fx-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={enviando} onClick={() => setConfirmar(null)} className="fx-btn rounded-[10px] px-4 py-2 text-[13px] text-white/60">
                Volver
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => adjuntar(confirmar)}
                className="fx-btn rounded-[10px] bg-fx-primary px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {enviando ? "Adjuntando…" : "Adjuntar"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              <div className="text-[13px] font-semibold">¿Qué es?</div>
              <Grupo titulo="Documento">
                {TIPOS_DOCUMENTO.map((t) => (
                  <Chip key={t} activo={eleccion?.tipo === "documento" && eleccion.subtipo === t} onClick={() => elegir({ tipo: "documento", subtipo: t })}>
                    {ETIQUETA_DOCUMENTO[t]}
                  </Chip>
                ))}
              </Grupo>
              <Grupo titulo="Constancia de pago">
                {MEDIOS.map((t) => (
                  <Chip key={t} activo={eleccion?.tipo === "pago" && eleccion.subtipo === t} onClick={() => elegir({ tipo: "pago", subtipo: t })}>
                    {ETIQUETA_MEDIO_PAGO[t]}
                  </Chip>
                ))}
              </Grupo>
            </div>

            {eleccion && cajas.length > 1 && (
              <div className="flex flex-col gap-2.5">
                <div className="text-[13px] font-semibold">¿De qué caja sale el dinero?</div>
                {empresas.map((e) => {
                  const deEmpresa = cajas.filter((c) => c.empresaId === e.empresaId);
                  if (!deEmpresa.length) return null;
                  return (
                    <Grupo key={e.empresaId} titulo={e.nombre}>
                      {deEmpresa.map((c) => {
                        const n = lesFalta.filter((m) => m.cajaId === c.id).length;
                        return (
                          <Chip key={c.id} activo={c.id === cajaId} onClick={() => setCajaId(c.id)}>
                            {String(c.numero).padStart(2, "0")} · {c.nombre}
                            {n > 0 && <span className="text-fx-pendiente"> · {n}</span>}
                          </Chip>
                        );
                      })}
                    </Grupo>
                  );
                })}
              </div>
            )}

            {eleccion && (
              <div className="flex flex-col gap-2.5">
                <div className="text-[13px] font-semibold">¿Para qué gasto?</div>
                <button
                  type="button"
                  onClick={nuevo}
                  className="fx-btn rounded-xl border border-fx-primary-line bg-fx-primary-soft px-4 py-3 text-left text-[13.5px] font-semibold text-fx-primary-light"
                >
                  ＋ Nuevo gasto
                  <span className="block text-[11.5px] font-normal text-white/50">
                    Se abre el registro en {nombreCaja} con el archivo como{" "}
                    {eleccion.tipo === "documento" ? "documento" : "constancia de pago"}
                    {lectura.estado === "listo" && datos?.es_comprobante ? " y los datos que leyó la IA" : ""}.
                  </span>
                </button>
                {pendientes === null ? (
                  <p className="text-[12.5px] text-white/45">Buscando pendientes…</p>
                ) : candidatos.length === 0 ? (
                  <p className="text-[12.5px] text-white/45">
                    En esta caja no hay gastos pendientes a los que les falte{" "}
                    {eleccion.tipo === "documento" ? "el documento" : "la constancia de pago"}.
                  </p>
                ) : (
                  <>
                    <div className="text-[11.5px] text-white/45">
                      O júntalo a un gasto al que le falta {eleccion.tipo === "documento" ? "el documento" : "la constancia de pago"}:
                    </div>
                    {candidatos.map(({ m, motivos }) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setConfirmar(m)}
                        className="fx-btn flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-left hover:bg-white/8"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{m.detalle}</span>
                          <span className="block truncate text-[11.5px] text-white/45">
                            {m.proveedor ?? "Por definir"} · {formatoFecha(m.fecha, true)}
                            {" · "}
                            {textoFalta(m)}
                          </span>
                          {motivos.length > 0 && <span className="block text-[11px] font-semibold text-fx-completo">✓ {motivos.join(" · ")}</span>}
                        </span>
                        <span className="shrink-0 font-display text-[14px] font-bold">{formatoSoles(m.monto)}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] uppercase tracking-[0.6px] text-white/40">{titulo}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`fx-btn rounded-full border px-3.5 py-2 text-[12.5px] font-semibold ${
        activo ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/12 text-white/65 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
