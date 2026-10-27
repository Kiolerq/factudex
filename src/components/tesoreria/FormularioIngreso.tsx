"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { abrirCaja, adjuntarFotoIngreso, crearArea, registrarRecarga } from "@/app/acciones";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import {
  codigoCaja,
  ETIQUETA_FORMA_INGRESO,
  ETIQUETA_TIPO_RECARGA,
  MIME_PERMITIDOS,
  type Area,
  type CodigoEmpresa,
  type FormaIngreso,
  type TipoRecarga,
} from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";
import { comprimirImagen } from "@/lib/imagen";
import { subirFotoIngreso, type Almacen } from "@/lib/subida";

export interface CajaIngreso {
  id: string;
  empresa: string;
  codigo: string; // SL-CAJA-MT-01
  nombre: string;
  /** Liquidaciones aprobadas que esperan su reposición. */
  porReponer: { id: string; folio: string; monto: number }[];
}

export interface EmpresaIngreso {
  id: string;
  codigo: CodigoEmpresa;
  nombre: string;
  /** Números de caja ya usados (activas o no), para dar el siguiente. */
  numeros: number[];
}

/** Caja abierta que puede pasar su saldo a la nueva (misma empresa y área). */
export interface CajaAnterior {
  id: string;
  empresaId: string;
  area: string;
  numero: number;
  codigo: string;
  saldo: number;
  /** Gastos que no entraron a ninguna liquidación: pasan a la nueva. */
  sinLiquidar: number;
}

const OTROS: TipoRecarga[] = ["extraordinaria", "apertura", "ajuste"];

/** Sube la foto del depósito y la registra en el ingreso. Devuelve el error, o null si fue bien. */
async function guardarFoto(o: { almacen: Almacen; cajaId: string; recargaId: string; archivo: File; fecha: string; monto: number }) {
  try {
    const archivo = await comprimirImagen(o.archivo);
    const { storagePath, mime } = await subirFotoIngreso({ ...o, archivo });
    const r = await adjuntarFotoIngreso({ recargaId: o.recargaId, storagePath, mime });
    return r.ok ? null : (r.errores._ ?? "No se pudo registrar la foto");
  } catch (e) {
    return e instanceof Error ? e.message : "No se pudo subir la foto";
  }
}

/**
 * Ingresos de tesorería, en dos caminos: agregar dinero a una caja que ya existe, o abrir una
 * caja nueva (empresa y área de la lista; el código SL-CAJA-MT-01 sale solo) con su monto de apertura.
 */
export function FormularioIngreso({
  cajas,
  empresas,
  areas,
  anteriores,
  almacen,
}: {
  cajas: CajaIngreso[];
  empresas: EmpresaIngreso[];
  areas: Area[];
  anteriores: CajaAnterior[];
  almacen: Almacen;
}) {
  const [modo, setModo] = useState<"recargar" | "abrir">(cajas.length ? "recargar" : "abrir");
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Tipo de ingreso" className="grid grid-cols-2 gap-2 md:w-fit">
        {(
          [
            ["recargar", "Recargar caja"],
            ["abrir", "＋ Abrir caja nueva"],
          ] as const
        ).map(([m, texto]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={`fx-btn rounded-[10px] border px-4 py-2.5 text-[13px] font-semibold ${
              modo === m ? "border-fx-primary-line bg-fx-primary-soft text-fx-primary-light" : "border-white/10 text-white/60"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      {modo === "recargar" ? (
        <RecargarCaja cajas={cajas} almacen={almacen} />
      ) : (
        <AbrirCaja empresas={empresas} areas={areas} anteriores={anteriores} almacen={almacen} />
      )}
    </div>
  );
}

/**
 * Agregar dinero a una caja existente: a qué corresponde (la reposición de una liquidación
 * aprobada, o una recarga extraordinaria, apertura o ajuste). Monto libre.
 */
function RecargarCaja({ cajas, almacen }: { cajas: CajaIngreso[]; almacen: Almacen }) {
  const router = useRouter();
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? "");
  const caja = cajas.find((c) => c.id === cajaId);
  // "liq:<id>" = reposición de esa liquidación; si no, un tipo de recarga.
  const [destino, setDestino] = useState<string>(() => (caja?.porReponer[0] ? `liq:${caja.porReponer[0].id}` : "extraordinaria"));
  const reposicion = destino.startsWith("liq:") ? caja?.porReponer.find((l) => `liq:${l.id}` === destino) : undefined;
  const [montoTexto, setMontoTexto] = useState(reposicion ? reposicion.monto.toFixed(2) : "");
  const [fecha, setFecha] = useState(fechaHoyLima());
  const [forma, setForma] = useState<FormaIngreso>("banco");
  const [banco, setBanco] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
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
    const monto = leerMonto(montoTexto.replace(/^-/, "")) * (negativo ? -1 : 1);
    iniciar(async () => {
      const r = await registrarRecarga({
        cajaId,
        tipo,
        liquidacionRepuestaId: reposicion?.id ?? null,
        monto,
        fecha,
        descripcion: descripcion || (reposicion ? `Reposición ${reposicion.folio}` : null),
        forma,
        banco: forma === "banco" ? banco || null : null,
        operacion: null,
        recibo: null,
        nota: null,
      });
      if (!r.ok) {
        setErrores(r.errores);
        return;
      }
      const errorFoto = foto ? await guardarFoto({ almacen, cajaId, recargaId: r.id, archivo: foto, fecha, monto }) : null;
      setErrores(errorFoto ? { _: `El ingreso se registró, pero la foto no: ${errorFoto}. Adjúntala desde la lista.` } : {});
      setListo(`Ingreso de ${formatoSoles(monto)} registrado en ${caja?.codigo}.`);
      setFoto(null);
      setDescripcion("");
      setMontoTexto("");
      router.refresh();
    });
  };

  if (!cajas.length) return <p className="text-[13px] text-white/50">No hay cajas activas. Abre una con “＋ Abrir caja nueva”.</p>;

  return (
    <form onSubmit={guardar} noValidate className="fx-card flex flex-col gap-4 p-4 md:p-6">
      <h2 className="text-base font-bold">Agregar dinero a una caja</h2>
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
        <CamposDeposito
          prefijo="ing"
          fecha={fecha}
          setFecha={setFecha}
          forma={forma}
          setForma={setForma}
          banco={banco}
          setBanco={setBanco}
          foto={foto}
          setFoto={setFoto}
          errores={errores}
        />
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

/** Abrir una caja nueva: empresa, área de la lista y nombre; el número sale solo (o se pone el que ya usaban). */
function AbrirCaja({
  empresas,
  areas,
  anteriores,
  almacen,
}: {
  empresas: EmpresaIngreso[];
  areas: Area[];
  anteriores: CajaAnterior[];
  almacen: Almacen;
}) {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [area, setArea] = useState("");
  const [nombre, setNombre] = useState("");
  const [numeroTexto, setNumeroTexto] = useState("");
  const [umbralTexto, setUmbralTexto] = useState("200.00");
  const [montoTexto, setMontoTexto] = useState("");
  const [fecha, setFecha] = useState(fechaHoyLima());
  const [forma, setForma] = useState<FormaIngreso>("banco");
  const [banco, setBanco] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  // Saldo que viene de antes: la caja anterior elegida (null = la más reciente; "ninguna" = no pasar) o, la
  // primera vez, el monto que traían.
  const [anteriorElegida, setAnteriorElegida] = useState<string | null>(null);
  const [saldoTexto, setSaldoTexto] = useState("");
  const [saldoNota, setSaldoNota] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState("");
  const [guardando, iniciar] = useTransition();

  const empresa = empresas.find((e) => e.id === empresaId);
  const candidatas = anteriores
    .filter((c) => c.empresaId === empresaId && c.area === area)
    .sort((a, b) => b.numero - a.numero);
  const anterior =
    anteriorElegida === "ninguna" ? null : (candidatas.find((c) => c.id === anteriorElegida) ?? candidatas[0] ?? null);
  const saldoManual = !candidatas.length && saldoTexto.trim() ? leerMonto(saldoTexto.replace(/^-/, "")) * (saldoTexto.trim().startsWith("-") ? -1 : 1) : 0;
  const saldoPrevio = anterior ? anterior.saldo : Number.isFinite(saldoManual) ? saldoManual : 0;
  const montoNum = leerMonto(montoTexto);
  const arranca = (Number.isFinite(montoNum) ? montoNum : 0) + saldoPrevio;
  const siguiente = Math.max(0, ...(empresa?.numeros ?? [])) + 1;
  const numeroElegido = numeroTexto.trim() ? Number(numeroTexto) : null;
  const numero = numeroElegido ?? siguiente;
  const repetido = numeroElegido !== null && !!empresa?.numeros.includes(numeroElegido);
  const codigo =
    empresa && Number.isInteger(numero) && numero >= 1 && numero <= 99
      ? codigoCaja({ empresaCodigo: empresa.codigo, area: area || "??", numero })
      : "—";

  const elegirArea = (a: Area | null) => {
    setArea(a?.codigo ?? "");
    // El nombre se propone con el área (si aún no lo escribieron a mano).
    if (a && (!nombre || nombre.startsWith("Caja chica "))) setNombre(`Caja chica ${a.nombre}`);
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setListo("");
    const monto = leerMonto(montoTexto);
    iniciar(async () => {
      const r = await abrirCaja({
        empresaId,
        area,
        nombre,
        umbralAlerta: leerMonto(umbralTexto),
        monto,
        fecha,
        forma,
        banco: forma === "banco" ? banco || null : null,
        numero: numeroElegido,
        cajaAnteriorId: anterior?.id ?? null,
        saldoAnterior: anterior || !saldoManual ? null : saldoManual,
        saldoAnteriorNota: anterior ? null : saldoNota || null,
      });
      if (!r.ok) {
        setErrores(r.errores);
        return;
      }
      const errorFoto = foto
        ? await guardarFoto({ almacen, cajaId: r.cajaId, recargaId: r.recargaId, archivo: foto, fecha, monto })
        : null;
      setErrores(errorFoto ? { _: `La caja se abrió, pero la foto no: ${errorFoto}. Adjúntala desde la lista.` } : {});
      setListo(
        anterior
          ? `Caja ${r.codigo} abierta con ${formatoSoles(monto + anterior.saldo)} (abono ${formatoSoles(monto)} ${anterior.saldo < 0 ? "−" : "+"} saldo de ${anterior.codigo} ${formatoSoles(Math.abs(anterior.saldo))})${anterior.sinLiquidar ? ` y sus ${anterior.sinLiquidar} gastos sin liquidar` : ""}. ${anterior.codigo} quedó cerrada y quien la manejaba ya tiene la nueva.`
          : r.saldoAnterior
            ? `Caja ${r.codigo} abierta con ${formatoSoles(monto + r.saldoAnterior)} (abono ${formatoSoles(monto)} ${r.saldoAnterior < 0 ? "−" : "+"} saldo anterior ${formatoSoles(Math.abs(r.saldoAnterior))}). Asígnala a su registrador en Usuarios.`
            : `Caja ${r.codigo} abierta con ${formatoSoles(monto)}. Asígnala a su registrador en Usuarios.`,
      );
      setAnteriorElegida(null);
      setSaldoTexto("");
      setSaldoNota("");
      setArea("");
      setNombre("");
      setNumeroTexto("");
      setMontoTexto("");
      setFoto(null);
      router.refresh();
    });
  };

  if (!empresas.length) return <p className="text-[13px] text-white/50">No hay empresas.</p>;

  return (
    <form onSubmit={guardar} noValidate className="fx-card flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Abrir caja nueva</h2>
        <span className="font-display text-lg font-bold text-fx-primary-light" aria-live="polite" data-testid="codigo-nueva">
          {codigo}
        </span>
      </div>
      {listo && <p className="text-[13px] text-fx-completo">● {listo}</p>}
      {errores._ && <p className="text-[13px] text-fx-error">{errores._}</p>}
      <div>
        <span className="fx-label">¿Para qué empresa? *</span>
        <div className="flex flex-wrap gap-2">
          {empresas.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={e.id === empresaId}
              onClick={() => setEmpresaId(e.id)}
              className={`fx-btn rounded-[10px] border px-4 py-2 text-[13px] font-semibold ${
                e.id === empresaId ? "border-fx-primary-line bg-fx-primary-soft text-fx-primary-light" : "border-white/10 text-white/60"
              }`}
            >
              {e.nombre}
            </button>
          ))}
        </div>
        {errores.empresaId && <p className="mt-1.5 text-xs text-fx-error">{errores.empresaId}</p>}
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        <CampoArea areas={areas} valor={area} onElegir={elegirArea} error={errores.area} />
        <div>
          <label htmlFor="nueva-numero" className="fx-label">
            N° de caja
          </label>
          <input
            id="nueva-numero"
            className="fx-input"
            inputMode="numeric"
            maxLength={2}
            placeholder={`${String(siguiente).padStart(2, "0")} (el siguiente)`}
            value={numeroTexto}
            aria-invalid={!!errores.numero || repetido}
            onChange={(e) => setNumeroTexto(e.target.value.replace(/\D/g, ""))}
          />
          {(errores.numero || repetido) && (
            <p className="mt-1.5 text-xs text-fx-error">
              {errores.numero ?? `${empresa?.nombre} ya tiene la caja N° ${String(numeroElegido).padStart(2, "0")}`}
            </p>
          )}
          {!errores.numero && !repetido && (
            <p className="mt-1.5 text-[11.5px] text-white/45">
              Déjalo vacío para usar el siguiente. Si ya venían trabajando con otras cajas, pon el número que les toca.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="nueva-nombre" className="fx-label">
            Nombre *
          </label>
          <input
            id="nueva-nombre"
            className="fx-input"
            placeholder="Ej. Caja chica Mantenimiento"
            value={nombre}
            aria-invalid={!!errores.nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {errores.nombre && <p className="mt-1.5 text-xs text-fx-error">{errores.nombre}</p>}
        </div>
        <div>
          <label htmlFor="nueva-monto" className="fx-label">
            Monto de apertura (S/) *
          </label>
          <input
            id="nueva-monto"
            className="fx-input font-display font-bold"
            inputMode="decimal"
            placeholder="0.00"
            value={montoTexto}
            aria-invalid={!!errores.monto}
            onChange={(e) => setMontoTexto(e.target.value)}
          />
          {errores.monto && <p className="mt-1.5 text-xs text-fx-error">{errores.monto}</p>}
        </div>
        {area && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/3 p-3.5 md:col-span-2">
            <span className="fx-label mb-0!">Saldo de caja anterior</span>
            {candidatas.length > 0 ? (
              <>
                {candidatas.map((c) => (
                  <label key={c.id} className="flex items-start gap-2.5 text-[13px]">
                    <input type="radio" name="anterior" className="mt-1" checked={anterior?.id === c.id} onChange={() => setAnteriorElegida(c.id)} />
                    <span>
                      Pasar el saldo de <strong className="font-display">{c.codigo}</strong>:{" "}
                      <span className={c.saldo < 0 ? "text-fx-error" : "text-fx-completo"}>{formatoSoles(c.saldo)}</span>
                      <span className="block text-[11.5px] text-white/45">
                        {c.sinLiquidar
                          ? `${c.sinLiquidar} gasto${c.sinLiquidar === 1 ? "" : "s"} sin liquidar (pendientes o sin rendir) pasan a la nueva. `
                          : ""}
                        {c.codigo} se cierra.
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2.5 text-[13px] text-white/60">
                  <input type="radio" name="anterior" checked={!anterior} onChange={() => setAnteriorElegida("ninguna")} />
                  No pasar saldo (la anterior sigue abierta)
                </label>
              </>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="nueva-saldo" className="fx-label">
                    Saldo que traían (S/)
                  </label>
                  <input
                    id="nueva-saldo"
                    className="fx-input"
                    inputMode="decimal"
                    placeholder="0.00 · en contra: -50.00"
                    value={saldoTexto}
                    aria-invalid={!!errores.saldoAnterior}
                    onChange={(e) => setSaldoTexto(e.target.value)}
                  />
                  {errores.saldoAnterior && <p className="mt-1.5 text-xs text-fx-error">{errores.saldoAnterior}</p>}
                </div>
                <div>
                  <label htmlFor="nueva-saldo-nota" className="fx-label">
                    ¿De qué caja viene?
                  </label>
                  <input
                    id="nueva-saldo-nota"
                    className="fx-input"
                    placeholder="Ej. Caja 02 (Excel)"
                    value={saldoNota}
                    onChange={(e) => setSaldoNota(e.target.value)}
                  />
                </div>
                <p className="text-[11.5px] text-white/45 md:col-span-2">
                  No hay otra caja abierta de esta empresa y área en la app. Si venían trabajando con una (en Excel o papel) y
                  quedó saldo, ponlo aquí; si no, déjalo vacío.
                </p>
              </div>
            )}
            {errores.cajaAnteriorId && <p className="text-xs text-fx-error">{errores.cajaAnteriorId}</p>}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/8 pt-2.5 text-[13px]">
              <span className="text-white/55">
                Abono {formatoSoles(Number.isFinite(montoNum) ? montoNum : 0)} {saldoPrevio < 0 ? "−" : "+"} saldo anterior{" "}
                {formatoSoles(Math.abs(saldoPrevio))}
              </span>
              <span>
                Arranca con <strong className="font-display text-base text-fx-primary-light">{formatoSoles(arranca)}</strong>
              </span>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="nueva-umbral" className="fx-label">
            Avisar cuando el saldo baje de (S/)
          </label>
          <input id="nueva-umbral" className="fx-input" inputMode="decimal" value={umbralTexto} onChange={(e) => setUmbralTexto(e.target.value)} />
          {errores.umbralAlerta && <p className="mt-1.5 text-xs text-fx-error">{errores.umbralAlerta}</p>}
        </div>
        <CamposDeposito
          prefijo="nueva"
          fecha={fecha}
          setFecha={setFecha}
          forma={forma}
          setForma={setForma}
          banco={banco}
          setBanco={setBanco}
          foto={foto}
          setFoto={setFoto}
          errores={errores}
        />
      </div>
      <button
        type="submit"
        disabled={guardando || repetido}
        className="fx-btn self-end rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {guardando ? "Abriendo…" : "Abrir caja"}
      </button>
    </form>
  );
}

/** Desplegable de áreas (MT, AD, OP…) con la opción de agregar una nueva con su nombre y descripción. */
function CampoArea({
  areas: iniciales,
  valor,
  onElegir,
  error,
}: {
  areas: Area[];
  valor: string;
  onElegir: (area: Area | null) => void;
  error?: string;
}) {
  const router = useRouter();
  const [areas, setAreas] = useState(iniciales);
  const [agregando, setAgregando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, iniciar] = useTransition();

  const guardar = () =>
    iniciar(async () => {
      const r = await crearArea({ codigo, nombre, descripcion: descripcion || null });
      if (!r.ok) {
        setErrores(r.errores);
        return;
      }
      const nueva = { codigo: codigo.toUpperCase(), nombre: nombre.trim(), descripcion: descripcion.trim() || null };
      setAreas((xs) => [...xs, nueva].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      onElegir(nueva);
      setAgregando(false);
      setCodigo("");
      setNombre("");
      setDescripcion("");
      setErrores({});
      router.refresh();
    });

  return (
    <div className="md:col-span-2">
      <label htmlFor="nueva-area" className="fx-label">
        Área *
      </label>
      <select
        id="nueva-area"
        className="fx-input"
        value={agregando ? "+" : valor}
        aria-invalid={!!error}
        onChange={(e) => {
          if (e.target.value === "+") setAgregando(true);
          else {
            setAgregando(false);
            onElegir(areas.find((a) => a.codigo === e.target.value) ?? null);
          }
        }}
      >
        <option value="">Elige el área…</option>
        {areas.map((a) => (
          <option key={a.codigo} value={a.codigo}>
            {a.codigo} · {a.nombre}
          </option>
        ))}
        <option value="+">＋ Agregar área nueva…</option>
      </select>
      {error && !agregando && <p className="mt-1.5 text-xs text-fx-error">{error}</p>}
      {!agregando && valor && areas.find((a) => a.codigo === valor)?.descripcion && (
        <p className="mt-1.5 text-[11.5px] text-white/45">{areas.find((a) => a.codigo === valor)!.descripcion}</p>
      )}
      {agregando && (
        <div className="mt-2.5 grid gap-3 rounded-xl border border-white/10 bg-white/3 p-3.5 md:grid-cols-[120px_1fr]">
          <div>
            <label htmlFor="area-codigo" className="fx-label">
              Sigla *
            </label>
            <input
              id="area-codigo"
              className="fx-input uppercase"
              placeholder="Ej. LG"
              maxLength={4}
              value={codigo}
              aria-invalid={!!errores.codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, "").replace("Ñ", "N"))}
            />
            {errores.codigo && <p className="mt-1.5 text-xs text-fx-error">{errores.codigo}</p>}
          </div>
          <div>
            <label htmlFor="area-nombre" className="fx-label">
              Nombre *
            </label>
            <input
              id="area-nombre"
              className="fx-input"
              placeholder="Ej. Logística"
              value={nombre}
              aria-invalid={!!errores.nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            {errores.nombre && <p className="mt-1.5 text-xs text-fx-error">{errores.nombre}</p>}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="area-desc" className="fx-label">
              Descripción
            </label>
            <input
              id="area-desc"
              className="fx-input"
              placeholder="Ej. Despachos, almacén y transporte de materiales"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          {errores._ && <p className="text-xs text-fx-error md:col-span-2">{errores._}</p>}
          <div className="flex justify-end gap-2 md:col-span-2">
            <button
              type="button"
              onClick={() => {
                setAgregando(false);
                setErrores({});
              }}
              className="fx-btn rounded-[10px] px-4 py-2 text-[13px] text-white/60"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Agregar área"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fecha, forma, banco y la foto de la operación (en vez de N° de operación y recibo). */
function CamposDeposito(p: {
  prefijo: string;
  fecha: string;
  setFecha: (v: string) => void;
  forma: FormaIngreso;
  setForma: (v: FormaIngreso) => void;
  banco: string;
  setBanco: (v: string) => void;
  foto: File | null;
  setFoto: (f: File | null) => void;
  errores: Record<string, string>;
}) {
  return (
    <>
      <div>
        <label htmlFor={`${p.prefijo}-fecha`} className="fx-label">
          Fecha del depósito *
        </label>
        <input
          id={`${p.prefijo}-fecha`}
          type="date"
          className="fx-input"
          max={fechaHoyLima()}
          value={p.fecha}
          onChange={(e) => p.setFecha(e.target.value)}
        />
        {p.errores.fecha && <p className="mt-1.5 text-xs text-fx-error">{p.errores.fecha}</p>}
      </div>
      <div>
        <label htmlFor={`${p.prefijo}-forma`} className="fx-label">
          Forma
        </label>
        <select id={`${p.prefijo}-forma`} className="fx-input" value={p.forma} onChange={(e) => p.setForma(e.target.value as FormaIngreso)}>
          {(Object.keys(ETIQUETA_FORMA_INGRESO) as FormaIngreso[]).map((f) => (
            <option key={f} value={f}>
              {ETIQUETA_FORMA_INGRESO[f]}
            </option>
          ))}
        </select>
      </div>
      {p.forma === "banco" && (
        <div>
          <label htmlFor={`${p.prefijo}-banco`} className="fx-label">
            Banco
          </label>
          <input
            id={`${p.prefijo}-banco`}
            className="fx-input"
            placeholder="BCP, Interbank…"
            value={p.banco}
            onChange={(e) => p.setBanco(e.target.value)}
          />
        </div>
      )}
      <div className={p.forma === "banco" ? "" : "md:col-span-2"}>
        <span className="fx-label">Foto de la operación</span>
        <ElegirFoto id={`${p.prefijo}-foto`} foto={p.foto} onCambiar={p.setFoto} />
      </div>
    </>
  );
}

function ElegirFoto({ id, foto, onCambiar }: { id: string; foto: File | null; onCambiar: (f: File | null) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={entrada}
        id={id}
        type="file"
        accept={MIME_PERMITIDOS.join(",")}
        className="hidden"
        onChange={(e) => onCambiar(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        className="fx-btn min-w-0 flex-1 truncate rounded-[10px] border border-dashed border-white/20 px-3.5 py-2.5 text-left text-[13px] text-white/70"
      >
        {foto ? `📎 ${foto.name}` : "Adjuntar foto o PDF del depósito / Yape"}
      </button>
      {foto && (
        <button
          type="button"
          onClick={() => {
            onCambiar(null);
            if (entrada.current) entrada.current.value = "";
          }}
          className="fx-btn shrink-0 rounded-[10px] px-2.5 py-2 text-[12px] text-white/50 hover:text-white"
        >
          Quitar
        </button>
      )}
    </div>
  );
}

/** En la lista de ingresos: adjuntar (o cambiar) la foto de un ingreso ya registrado. */
export function AdjuntarFotoIngreso({
  recargaId,
  cajaId,
  fecha,
  monto,
  almacen,
}: {
  recargaId: string;
  cajaId: string;
  fecha: string;
  monto: number;
  almacen: Almacen;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [subiendo, iniciar] = useTransition();
  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept={MIME_PERMITIDOS.join(",")}
        className="hidden"
        aria-label="Foto de la operación"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (!archivo) return;
          iniciar(async () => {
            const err = await guardarFoto({ almacen, cajaId, recargaId, archivo, fecha, monto });
            setError(err ?? "");
            if (!err) router.refresh();
          });
        }}
      />
      <button
        type="button"
        disabled={subiendo}
        title={error || undefined}
        onClick={() => entrada.current?.click()}
        className={`text-[11.5px] font-semibold hover:underline disabled:opacity-60 ${error ? "text-fx-error" : "text-fx-primary-light"}`}
      >
        {subiendo ? "Subiendo…" : error ? "No se subió · reintentar" : "＋ Foto"}
      </button>
    </>
  );
}
