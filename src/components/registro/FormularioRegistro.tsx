"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { buscarProveedores, crearProveedor, registrarMovimiento } from "@/app/acciones";
import { BadgeEstado } from "@/components/ui/BadgeEstado";
import { EsquemaNuevoMovimiento, TAMANO_MAXIMO, erroresPorCampo, fechaHoyLima, type EntradaMovimiento } from "@/lib/datos/esquemas";
import {
  ETIQUETA_DOCUMENTO,
  ETIQUETA_MEDIO_PAGO,
  MEDIOS_PAGO,
  MIME_PERMITIDOS,
  TIPOS_DOCUMENTO,
  estadoEsperado,
  nombreCaja,
  type AdjuntoSubido,
  type CajaSaldo,
  type EstadoMovimiento,
  type MedioPago,
  type Opcion,
  type Proveedor,
  type TipoAdjunto,
  type TipoDocumento,
} from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";
import { comprimirImagen } from "@/lib/imagen";
import { motivoNoLegible, pedirLectura } from "@/lib/ocr/cliente";
import type { ExtraccionComprobante } from "@/lib/ocr/esquema";
import { leerCompartidos } from "@/lib/compartir";
import { subirAdjunto, type Almacen } from "@/lib/subida";
import { nuevoUuid } from "@/lib/uuid";
import { BuscadorProveedor } from "./BuscadorProveedor";
import { CampoAdjunto } from "./CampoAdjunto";
import { AvisoLectura, type Lectura } from "./AvisoLectura";

interface Props {
  caja: CajaSaldo;
  empresaNombre: string;
  categorias: Opcion[];
  centrosCosto: Opcion[];
  solicitantes: string[];
  almacen: Almacen;
  ocr: boolean; // lectura con IA activada (hay API key en el servidor)
  compartido: boolean; // llegaron archivos desde "Compartir" del celular
}

type Archivos = Record<"documento" | "pago", File | null>;


export function FormularioRegistro({ caja, empresaNombre, categorias, centrosCosto, solicitantes, almacen, ocr, compartido }: Props) {
  const centroGeneral = centrosCosto.find((c) => c.codigo === "GEN" || c.nombre === "General")?.id ?? "";

  const [movimientoId, setMovimientoId] = useState(() => nuevoUuid());
  const [fecha, setFecha] = useState(fechaHoyLima);
  const [solicitante, setSolicitante] = useState("");
  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [categoriaId, setCategoriaId] = useState("");
  const [centroCostoId, setCentroCostoId] = useState(centroGeneral);
  const [detalle, setDetalle] = useState("");
  const [montoTexto, setMontoTexto] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | null>(null);
  const [serieNumero, setSerieNumero] = useState("");
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [operacionPago, setOperacionPago] = useState("");
  const [sinDocumento, setSinDocumento] = useState(false);
  const [archivos, setArchivos] = useState<Archivos>({ documento: null, pago: null });

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState<{ estado: EstadoMovimiento; detalle: string; monto: number } | null>(null);
  const [guardando, iniciar] = useTransition();
  const [paso, setPaso] = useState("");
  const camaraRapida = useRef<HTMLInputElement>(null);
  const inicio = useRef<HTMLDivElement>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  // Movimiento en curso: si el usuario reinicia el formulario, se ignoran lecturas que lleguen tarde.
  const idActual = useRef(movimientoId);
  idActual.current = movimientoId;
  // Quién puso la fecha: la IA no pisa la que eligió el usuario, y la del documento manda sobre la del pago.
  const origenFecha = useRef<"usuario" | "documento" | "pago" | null>(null);

  const monto = leerMonto(montoTexto);
  const esEfectivo = medioPago === "efectivo";
  const estado = estadoEsperado(!!archivos.documento, !!archivos.pago, medioPago);
  const faltantes = [
    !archivos.documento && "documento",
    !esEfectivo && !archivos.pago && "constancia de pago",
  ].filter(Boolean);

  const quitarError = (campo: string) =>
    setErrores((e) => {
      if (!(campo in e)) return e;
      const { [campo]: _, ...resto } = e;
      return resto;
    });

  /** Valida y comprime; devuelve null (y muestra el error) si no sirve. */
  async function prepararArchivo(tipo: keyof Archivos, f: File): Promise<File | null> {
    if (!(MIME_PERMITIDOS as readonly string[]).includes(f.type)) {
      setErrores((e) => ({ ...e, [tipo]: "Formato no permitido. Usa JPG, PNG o PDF." }));
      return null;
    }
    const final = await comprimirImagen(f);
    if (final.size > TAMANO_MAXIMO) {
      setErrores((e) => ({ ...e, [tipo]: "El archivo pesa más de 10 MB." }));
      return null;
    }
    quitarError(tipo);
    return final;
  }

  function colocar(tipo: keyof Archivos, archivo: File) {
    setArchivos((a) => ({ ...a, [tipo]: archivo }));
    if (tipo === "documento") setSinDocumento(false);
  }

  async function elegirArchivo(tipo: keyof Archivos, f: File) {
    const final = await prepararArchivo(tipo, f);
    if (!final) return;
    colocar(tipo, final);
    if (!ocr) return;
    const motivo = motivoNoLegible(final);
    if (motivo) setLectura({ estado: "error", mensaje: motivo });
    else void leer(tipo, final);
  }

  /** Lee el archivo con IA y pre-llena lo que esté vacío. El usuario revisa y guarda. */
  async function leer(tipo: keyof Archivos, archivo: File) {
    const id = movimientoId;
    setLectura({ estado: "leyendo" });
    const r = await pedirLectura(archivo, tipo, id);
    if (idActual.current !== id) return;
    if (!r.ok) {
      setLectura({ estado: "error", mensaje: r.error });
      return;
    }
    await aplicarLectura(tipo, archivo, r.datos);
  }

  async function aplicarLectura(tipo: keyof Archivos, archivo: File, d: ExtraccionComprobante) {
    if (!d.es_comprobante) {
      setLectura({ estado: "listo", datos: d, campos: [] });
      return;
    }
    const campos: string[] = [];
    const esPago = d.es_captura_yape;

    // Una captura de Yape/Plin puesta como documento va al espacio de la constancia de pago.
    let movido = false;
    if (tipo === "documento" && esPago) {
      setArchivos((a) => (a.pago || a.documento !== archivo ? a : { documento: null, pago: archivo }));
      movido = true;
    }

    if (d.monto !== null) {
      setMontoTexto((p) => (p.trim() ? p : d.monto!.toFixed(2)));
      campos.push("monto");
    }
    const deDocumento = !esPago;
    if (d.fecha && d.fecha <= fechaHoyLima()) {
      const puede =
        origenFecha.current === null || (deDocumento && origenFecha.current === "pago");
      if (puede) {
        setFecha(d.fecha);
        origenFecha.current = deDocumento ? "documento" : "pago";
        campos.push("fecha");
      }
    }
    if (d.concepto) {
      setDetalle((p) => p || d.concepto!);
      campos.push("detalle");
    }
    if (deDocumento && d.tipo_documento) {
      setTipoDocumento((p) => p ?? d.tipo_documento);
      campos.push("tipo de documento");
    }
    if (deDocumento && d.serie_numero) {
      setSerieNumero((p) => p || d.serie_numero!);
      campos.push("N° de documento");
    }
    const medio = d.medio_pago ?? (esPago ? "yape" : null);
    if (medio && medio !== "efectivo") {
      setMedioPago((p) => p ?? medio);
      campos.push("medio de pago");
    }
    if (d.numero_operacion) {
      setOperacionPago((p) => p || d.numero_operacion!);
      campos.push("N° de operación");
    }

    // Proveedor: solo del documento (en una constancia de pago el nombre es de quien recibe).
    let proveedorNuevo: { numDoc: string; razonSocial: string } | undefined;
    if (deDocumento && d.proveedor_num_doc) {
      const hallado = (await buscarProveedores(d.proveedor_num_doc)).find((p) => p.numDoc === d.proveedor_num_doc);
      if (idActual.current !== movimientoId) return;
      if (hallado) {
        setProveedor((p) => p ?? hallado);
        quitarError("proveedorId");
        campos.push("proveedor");
      } else if (d.proveedor_razon_social) {
        proveedorNuevo = { numDoc: d.proveedor_num_doc, razonSocial: d.proveedor_razon_social };
      }
    }

    for (const c of ["monto", "fecha", "detalle", "tipoDocumento"]) quitarError(c);
    setLectura({ estado: "listo", datos: d, campos, proveedorNuevo, movido });
  }

  async function crearProveedorLeido() {
    const n = lectura?.estado === "listo" ? lectura.proveedorNuevo : undefined;
    if (!n) return;
    const r = await crearProveedor({ tipoDoc: n.numDoc.length === 11 ? "RUC" : "DNI", numDoc: n.numDoc, razonSocial: n.razonSocial });
    if (r.ok) {
      setProveedor(r.proveedor);
      quitarError("proveedorId");
      setLectura((l) => (l?.estado === "listo" ? { ...l, proveedorNuevo: undefined, campos: [...l.campos, "proveedor"] } : l));
    } else {
      setLectura((l) => (l?.estado === "listo" ? { ...l, errorProveedor: Object.values(r.errores)[0] } : l));
    }
  }

  // Archivos que llegaron con "Compartir" (Android): la IA decide si son comprobante o constancia de pago.
  useEffect(() => {
    // Se revisa siempre (no solo con ?compartido=1): si la app pidió iniciar sesión al abrirse
    // desde "Compartir", el aviso se pierde en el login pero los archivos siguen en la caché.
    let cancelado = false;
    (async () => {
      const recibidos = await leerCompartidos();
      if (compartido) history.replaceState(null, "", "/registro");
      if (!recibidos.length) {
        if (compartido && !cancelado)
          setErrores((e) => ({ ...e, _: "No llegó el archivo compartido. Vuelve a compartirlo desde la otra app." }));
        return;
      }
      const ocupados = { documento: false, pago: false };
      for (const f of recibidos.slice(0, 2)) {
        if (cancelado) return;
        const final = await prepararArchivo("documento", f);
        if (!final) continue;
        let datos: ExtraccionComprobante | null = null;
        const motivo = ocr ? motivoNoLegible(final) : null;
        if (motivo) setLectura({ estado: "error", mensaje: motivo });
        else if (ocr) {
          setLectura({ estado: "leyendo" });
          const r = await pedirLectura(final, "documento", idActual.current);
          if (r.ok) datos = r.datos;
          else setLectura({ estado: "error", mensaje: r.error });
        }
        if (cancelado) return;
        let tipo: keyof Archivos = datos?.es_captura_yape ? "pago" : "documento";
        if (ocupados[tipo]) tipo = tipo === "pago" ? "documento" : "pago";
        if (ocupados[tipo]) break;
        ocupados[tipo] = true;
        colocar(tipo, final);
        if (datos) await aplicarLectura(tipo, final, datos);
      }
    })();
    return () => {
      cancelado = true;
    };
    // Solo al abrir la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reiniciar(conservarCabecera: boolean) {
    setMovimientoId(nuevoUuid());
    if (!conservarCabecera) {
      setFecha(fechaHoyLima());
      setSolicitante("");
    }
    setProveedor(null);
    setCategoriaId("");
    setCentroCostoId(centroGeneral);
    setDetalle("");
    setMontoTexto("");
    setTipoDocumento(null);
    setSerieNumero("");
    setMedioPago(null);
    setOperacionPago("");
    setSinDocumento(false);
    setArchivos({ documento: null, pago: null });
    setErrores({});
    setLectura(null);
    origenFecha.current = null;
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardado(null);

    const entrada: EntradaMovimiento = {
      id: movimientoId,
      cajaId: caja.id,
      fecha,
      solicitante: solicitante || null,
      proveedorId: proveedor?.id ?? null,
      categoriaId,
      centroCostoId: centroCostoId || null,
      detalle,
      monto,
      tipoDocumento,
      serieNumero: sinDocumento ? null : serieNumero || null,
      medioPago,
      operacionPago: medioPago && medioPago !== "efectivo" ? operacionPago || null : null,
      sinDocumento,
      adjuntos: [],
    };
    const validacion = EsquemaNuevoMovimiento.safeParse(entrada);
    if (!validacion.success) {
      setErrores(erroresPorCampo(validacion.error));
      inicio.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    iniciar(async () => {
      try {
        const adjuntos: AdjuntoSubido[] = [];
        const porSubir = (Object.entries(archivos) as [TipoAdjunto, File | null][]).filter(
          ([tipo, f]) => f && !(tipo === "documento" && sinDocumento) && !(tipo === "pago" && esEfectivo),
        );
        for (const [i, [tipo, archivo]] of porSubir.entries()) {
          setPaso(`Subiendo archivo ${i + 1} de ${porSubir.length}…`);
          adjuntos.push(
            await subirAdjunto({
              almacen,
              cajaId: caja.id,
              movimientoId,
              tipo,
              archivo: archivo!,
              fecha,
              referencia: proveedor?.razonSocial ?? detalle,
              monto: Number.isNaN(monto) ? null : monto,
            }),
          );
        }
        setPaso("Guardando…");
        const r = await registrarMovimiento({ ...entrada, adjuntos });
        if (r.ok) {
          setGuardado({ estado: r.estado, detalle, monto });
          reiniciar(true);
        } else {
          setErrores(r.errores);
        }
      } catch (err) {
        setErrores({ _: err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo." });
      } finally {
        setPaso("");
        inicio.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  const nombreCategoria = categorias.find((c) => c.id === categoriaId)?.nombre;
  const resumenDocumento =
    [tipoDocumento && ETIQUETA_DOCUMENTO[tipoDocumento], medioPago && ETIQUETA_MEDIO_PAGO[medioPago]]
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <form onSubmit={guardar} noValidate className="grid items-start gap-5 md:grid-cols-[1.5fr_1fr]">
      <div ref={inicio} className="flex scroll-mt-4 flex-col gap-3.5 md:gap-0">
        {guardado && (
          <div role="status" className="fx-card mb-4 flex flex-wrap items-center justify-between gap-3 border-fx-completo/40! px-5 py-4">
            <div className="text-sm">
              <span className="font-semibold">Registro guardado.</span>{" "}
              <span className="text-white/55">
                {guardado.detalle} · {formatoSoles(guardado.monto)}
              </span>
            </div>
            <BadgeEstado estado={guardado.estado} />
          </div>
        )}
        {errores._ && (
          <div role="alert" className="mb-4 rounded-xl border border-fx-error/50 bg-fx-error/10 px-4 py-3 text-sm text-fx-error">
            {errores._}
          </div>
        )}

        {lectura && (
          <AvisoLectura
            lectura={lectura}
            hayProveedor={!!proveedor}
            onCrearProveedor={crearProveedorLeido}
            onCerrar={() => setLectura(null)}
          />
        )}

        {/* Móvil: acción principal = foto del documento */}
        <input
          ref={camaraRapida}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void elegirArchivo("documento", f);
            e.target.value = "";
          }}
        />
        <h1 className="mt-1.5 font-display text-[19px] font-bold md:hidden">Nuevo registro</h1>
        <button
          type="button"
          onClick={() => camaraRapida.current?.click()}
          className="fx-btn flex w-full items-center justify-center gap-2.5 rounded-[14px] bg-linear-135 from-fx-primary to-fx-primary-dark p-4 text-sm font-bold text-white md:hidden"
        >
          <span aria-hidden className="text-lg">📷</span>
          {archivos.documento ? "Cambiar foto del comprobante" : "Tomar foto del comprobante"}
        </button>
        <p className="-mt-1.5 text-center text-[11px] text-white/35 md:hidden">
          {ocr ? "La IA lee la foto y llena los datos por ti" : "o sube un archivo en la sección de adjuntos"}
        </p>

        <div className="fx-card flex flex-col gap-3.5 rounded-[14px] p-4 md:gap-4 md:rounded-2xl md:px-7 md:py-[26px]">
          <div className="hidden md:block">
            <h2 className="mb-1 text-lg font-bold">Nuevo registro de movimiento</h2>
            <p className="text-xs text-white/45">
              {empresaNombre} › {nombreCaja(caja)} — los campos con * son obligatorios.
            </p>
          </div>

          <div className="flex flex-col gap-3.5 md:gap-4">
            {/* Monto: primero en móvil, después del detalle en escritorio */}
            <div className="order-1 md:order-5">
              <label htmlFor="monto" className="fx-label">
                Monto (S/) *
              </label>
              <input
                id="monto"
                className="fx-input font-display text-xl! font-bold md:text-lg!"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={montoTexto}
                aria-invalid={!!errores.monto}
                onChange={(e) => {
                  setMontoTexto(e.target.value);
                  quitarError("monto");
                }}
              />
              {errores.monto && <p className="mt-1.5 text-xs text-fx-error">{errores.monto}</p>}
            </div>

            <div className="order-6 grid grid-cols-2 gap-3.5 md:order-1 md:gap-4">
              <div>
                <label htmlFor="fecha" className="fx-label">
                  Fecha *
                </label>
                <input
                  id="fecha"
                  className="fx-input"
                  type="date"
                  max={fechaHoyLima()}
                  value={fecha}
                  aria-invalid={!!errores.fecha}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    origenFecha.current = "usuario";
                    quitarError("fecha");
                  }}
                />
                {errores.fecha && <p className="mt-1.5 text-xs text-fx-error">{errores.fecha}</p>}
              </div>
              <div>
                <label htmlFor="solicitante" className="fx-label">
                  Solicitante
                </label>
                <input
                  id="solicitante"
                  className="fx-input"
                  type="text"
                  placeholder="Quién pide el gasto"
                  list="lista-solicitantes"
                  autoComplete="off"
                  value={solicitante}
                  onChange={(e) => setSolicitante(e.target.value)}
                />
                <datalist id="lista-solicitantes">
                  {solicitantes.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="order-2">
              <BuscadorProveedor
                valor={proveedor}
                requerido={!sinDocumento}
                error={errores.proveedorId}
                onCambiar={(p) => {
                  setProveedor(p);
                  quitarError("proveedorId");
                }}
              />
            </div>

            <div className="order-3 grid gap-3.5 md:grid-cols-2 md:gap-4">
              <div>
                <label htmlFor="categoria" className="fx-label">
                  Categoría *
                </label>
                <select
                  id="categoria"
                  className="fx-input"
                  value={categoriaId}
                  aria-invalid={!!errores.categoriaId}
                  onChange={(e) => {
                    setCategoriaId(e.target.value);
                    quitarError("categoriaId");
                  }}
                >
                  <option value="" disabled>
                    Elige…
                  </option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {errores.categoriaId && <p className="mt-1.5 text-xs text-fx-error">{errores.categoriaId}</p>}
              </div>
              <div>
                <label htmlFor="centro" className="fx-label">
                  Centro de costo
                </label>
                <select id="centro" className="fx-input" value={centroCostoId} onChange={(e) => setCentroCostoId(e.target.value)}>
                  <option value="">Sin centro de costo</option>
                  {centrosCosto.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="order-4">
              <label htmlFor="detalle" className="fx-label">
                Detalle de compra *
              </label>
              <input
                id="detalle"
                className="fx-input"
                type="text"
                placeholder="Ej. Peaje pesado 3 ejes"
                value={detalle}
                maxLength={300}
                aria-invalid={!!errores.detalle}
                onChange={(e) => {
                  setDetalle(e.target.value);
                  quitarError("detalle");
                }}
              />
              {errores.detalle && <p className="mt-1.5 text-xs text-fx-error">{errores.detalle}</p>}
            </div>

            <fieldset className="order-7">
              <legend className="fx-label">Tipo de documento{!sinDocumento && " *"}</legend>
              <div className="flex flex-wrap gap-2">
                {TIPOS_DOCUMENTO.map((t) => (
                  <Chip
                    key={t}
                    activo={tipoDocumento === t}
                    onClick={() => {
                      setTipoDocumento(tipoDocumento === t ? null : t);
                      quitarError("tipoDocumento");
                    }}
                  >
                    {ETIQUETA_DOCUMENTO[t]}
                  </Chip>
                ))}
              </div>
              {errores.tipoDocumento && <p className="mt-1.5 text-xs text-fx-error">{errores.tipoDocumento}</p>}
              {!sinDocumento && tipoDocumento && (
                <div className="mt-3 max-w-xs">
                  <label htmlFor="serie" className="fx-label">
                    N° de documento
                  </label>
                  <input
                    id="serie"
                    className="fx-input font-mono"
                    type="text"
                    placeholder="Ej. F001-00012345"
                    value={serieNumero}
                    onChange={(e) => setSerieNumero(e.target.value.toUpperCase())}
                  />
                </div>
              )}
            </fieldset>

            <fieldset className="order-8">
              <legend className="fx-label">Medio de pago</legend>
              <div className="flex flex-wrap gap-2">
                {MEDIOS_PAGO.map((m) => (
                  <Chip key={m} activo={medioPago === m} onClick={() => setMedioPago(medioPago === m ? null : m)}>
                    {ETIQUETA_MEDIO_PAGO[m]}
                  </Chip>
                ))}
              </div>
              {esEfectivo && (
                <p className="mt-1.5 text-[11px] text-white/40">
                  En efectivo basta el documento (boleta física, comprobante de egreso…).
                </p>
              )}
              {medioPago && !esEfectivo && (
                <div className="mt-3 max-w-xs">
                  <label htmlFor="operacion" className="fx-label">
                    N° de operación
                  </label>
                  <input
                    id="operacion"
                    className="fx-input font-mono"
                    type="text"
                    inputMode={medioPago === "yape" || medioPago === "plin" ? "numeric" : "text"}
                    placeholder="Opcional"
                    value={operacionPago}
                    onChange={(e) => setOperacionPago(e.target.value)}
                  />
                </div>
              )}
            </fieldset>

            <label className="order-9 flex cursor-pointer items-center gap-2.5 py-1">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={sinDocumento}
                onChange={(e) => {
                  setSinDocumento(e.target.checked);
                  if (e.target.checked) setArchivos((a) => ({ ...a, documento: null }));
                  quitarError("proveedorId");
                  quitarError("tipoDocumento");
                }}
              />
              <span
                aria-hidden
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-white/30 text-[11px] peer-focus-visible:outline-2 peer-focus-visible:outline-white ${
                  sinDocumento ? "bg-fx-pendiente text-fx-bg" : ""
                }`}
              >
                {sinDocumento && "✓"}
              </span>
              <span className="text-[12.5px] text-white/75 md:text-[13px]">
                Aún no tengo el documento — marcar como pendiente
              </span>
            </label>

            <div className="order-10 grid gap-3.5 md:grid-cols-2 md:gap-4">
              {!sinDocumento && (
                <CampoAdjunto
                  etiqueta="Documento (factura, boleta, planilla…)"
                  ayuda="Arrastra el archivo o haz clic para elegirlo"
                  archivo={archivos.documento}
                  error={errores.documento}
                  onElegir={(f) => void elegirArchivo("documento", f)}
                  onQuitar={() => setArchivos((a) => ({ ...a, documento: null }))}
                />
              )}
              {!esEfectivo && (
                <CampoAdjunto
                  etiqueta="Constancia de pago (Yape/Plin, transferencia…)"
                  ayuda="Captura del Yape/Plin o voucher de la transferencia"
                  archivo={archivos.pago}
                  error={errores.pago}
                  resaltarPendiente={sinDocumento}
                  onElegir={(f) => void elegirArchivo("pago", f)}
                  onQuitar={() => setArchivos((a) => ({ ...a, pago: null }))}
                />
              )}
              {sinDocumento && (
                <p className="rounded-xl border border-dashed border-fx-pendiente/60 bg-fx-pendiente/6 px-4 py-3 text-[12.5px] text-white/60 md:col-span-2">
                  Se guardará como <span className="font-semibold text-fx-pendiente">pendiente</span>. Podrás
                  adjuntar el documento después; mientras tanto no entra a la liquidación.
                </p>
              )}
            </div>
          </div>

          {/* Escritorio: botones al pie del formulario */}
          <div className="mt-2 hidden justify-end gap-2.5 md:flex">
            <BotonesAccion guardando={guardando} paso={paso} onCancelar={() => reiniciar(false)} />
          </div>
        </div>
      </div>

      {/* Escritorio: panel lateral */}
      <aside className="hidden flex-col gap-4 md:sticky md:top-6 md:flex">
        <div className="fx-card px-[22px] py-5">
          <div className="mb-3 text-xs uppercase tracking-[1px] text-white/40">Vista previa</div>
          <dl className="flex flex-col gap-2.5 text-[13px]">
            <Fila etiqueta="Caja">{nombreCaja(caja)}</Fila>
            <Fila etiqueta="Proveedor">{proveedor?.razonSocial ?? (sinDocumento ? "Por definir" : "—")}</Fila>
            <Fila etiqueta="Categoría">{nombreCategoria ?? "—"}</Fila>
            <Fila etiqueta="Monto">
              <span className="font-bold text-fx-primary-light">
                {Number.isNaN(monto) ? "—" : formatoSoles(monto)}
              </span>
            </Fila>
            <Fila etiqueta="Documento">{resumenDocumento}</Fila>
            <Fila etiqueta="Estado">
              <BadgeEstado estado={estado} texto={estado === "pendiente" ? "Pendiente de documento" : "Completo"} />
            </Fila>
          </dl>
          {estado === "pendiente" && faltantes.length > 0 && (
            <p className="mt-3 text-xs text-white/45">Falta adjuntar: {faltantes.join(" y ")}.</p>
          )}
        </div>
        <div className="fx-card px-[22px] py-5">
          <div className="mb-2.5 text-xs uppercase tracking-[1px] text-white/40">Nota</div>
          <p className="text-[12.5px] leading-relaxed text-white/55">
            Si el proveedor aún no emite el documento, marca &ldquo;pendiente&rdquo; y sigue trabajando: el
            movimiento descuenta el saldo ahora y queda en Pendientes hasta que adjuntes el documento y la
            constancia de pago. Solo los movimientos completos entran a la liquidación.
          </p>
        </div>
      </aside>

      {/* Móvil: barra inferior fija */}
      <div className="sticky bottom-0 -mx-5 flex gap-2.5 bg-linear-to-t from-fx-bg from-60% to-transparent px-5 pb-[calc(22px+env(safe-area-inset-bottom))] pt-3.5 md:hidden">
        <BotonesAccion guardando={guardando} paso={paso} onCancelar={() => reiniciar(false)} movil />
      </div>
    </form>
  );
}

function BotonesAccion({
  guardando,
  paso,
  onCancelar,
  movil = false,
}: {
  guardando: boolean;
  paso: string;
  onCancelar: () => void;
  movil?: boolean;
}) {
  const base = movil ? "rounded-xl p-3.5" : "rounded-[10px] px-[22px] py-[11px]";
  return (
    <>
      <button
        type="button"
        onClick={onCancelar}
        disabled={guardando}
        className={`fx-btn border border-white/18 bg-transparent text-[13px] font-semibold text-white/60 ${base} ${movil ? "flex-1" : ""}`}
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={guardando}
        className={`fx-btn bg-fx-primary text-[13px] text-white disabled:opacity-70 ${base} ${movil ? "flex-2 font-bold" : "font-semibold"}`}
      >
        {guardando ? paso || "Guardando…" : "Guardar registro"}
      </button>
    </>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`fx-btn rounded-full border px-4 py-[9px] text-xs font-semibold transition-colors ${
        activo ? "border-fx-primary bg-fx-primary/22 text-white" : "border-white/10 bg-white/5 text-white/55 hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-white/45">{etiqueta}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}
