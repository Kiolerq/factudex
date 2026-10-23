"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { abrirCaja, registrarRecarga } from "@/app/acciones";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import { codigoCaja, ETIQUETA_FORMA_INGRESO, ETIQUETA_TIPO_RECARGA, type CodigoEmpresa, type FormaIngreso, type TipoRecarga } from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";

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

const OTROS: TipoRecarga[] = ["extraordinaria", "apertura", "ajuste"];

/**
 * Ingresos de tesorería, en dos caminos: agregar dinero a una caja que ya existe, o abrir una
 * caja nueva (se elige la empresa y el código SL-CAJA-MT-01 sale solo) con su monto de apertura.
 */
export function FormularioIngreso({ cajas, empresas }: { cajas: CajaIngreso[]; empresas: EmpresaIngreso[] }) {
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
      {modo === "recargar" ? <RecargarCaja cajas={cajas} /> : <AbrirCaja empresas={empresas} />}
    </div>
  );
}

/**
 * Agregar dinero a una caja existente: a qué corresponde (la reposición de una liquidación
 * aprobada, o una recarga extraordinaria, apertura o ajuste). Monto libre.
 */
function RecargarCaja({ cajas }: { cajas: CajaIngreso[] }) {
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

/** Abrir una caja nueva: empresa, área y nombre; el número y el código los pone la app. */
function AbrirCaja({ empresas }: { empresas: EmpresaIngreso[] }) {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [area, setArea] = useState("");
  const [nombre, setNombre] = useState("");
  const [umbralTexto, setUmbralTexto] = useState("200.00");
  const [montoTexto, setMontoTexto] = useState("");
  const [fecha, setFecha] = useState(fechaHoyLima());
  const [forma, setForma] = useState<FormaIngreso>("banco");
  const [banco, setBanco] = useState("");
  const [operacion, setOperacion] = useState("");
  const [recibo, setRecibo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState("");
  const [guardando, iniciar] = useTransition();

  const empresa = empresas.find((e) => e.id === empresaId);
  const numero = Math.max(0, ...(empresa?.numeros ?? [])) + 1;
  const codigo = empresa ? codigoCaja({ empresaCodigo: empresa.codigo, area: area || "??", numero }) : "—";

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setListo("");
    iniciar(async () => {
      const r = await abrirCaja({
        empresaId,
        area,
        nombre,
        umbralAlerta: leerMonto(umbralTexto),
        monto: leerMonto(montoTexto),
        fecha,
        forma,
        banco: forma === "banco" ? banco || null : null,
        operacion: operacion || null,
        recibo: recibo || null,
      });
      if (r.ok) {
        setErrores({});
        setListo(`Caja ${r.codigo} abierta con ${formatoSoles(leerMonto(montoTexto))}.`);
        setArea("");
        setNombre("");
        setMontoTexto("");
        setOperacion("");
        setRecibo("");
        router.refresh();
      } else setErrores(r.errores);
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
        <div>
          <label htmlFor="nueva-area" className="fx-label">
            Área (sigla) *
          </label>
          <input
            id="nueva-area"
            className="fx-input uppercase"
            placeholder="MT, AD, OP…"
            maxLength={4}
            value={area}
            aria-invalid={!!errores.area}
            onChange={(e) => setArea(e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, "").replace("Ñ", "N"))}
          />
          {errores.area && <p className="mt-1.5 text-xs text-fx-error">{errores.area}</p>}
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
        <div>
          <label htmlFor="nueva-umbral" className="fx-label">
            Avisar cuando el saldo baje de (S/)
          </label>
          <input id="nueva-umbral" className="fx-input" inputMode="decimal" value={umbralTexto} onChange={(e) => setUmbralTexto(e.target.value)} />
          {errores.umbralAlerta && <p className="mt-1.5 text-xs text-fx-error">{errores.umbralAlerta}</p>}
        </div>
        <div>
          <label htmlFor="nueva-fecha" className="fx-label">
            Fecha del depósito *
          </label>
          <input id="nueva-fecha" type="date" className="fx-input" max={fechaHoyLima()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          {errores.fecha && <p className="mt-1.5 text-xs text-fx-error">{errores.fecha}</p>}
        </div>
        <div>
          <label htmlFor="nueva-forma" className="fx-label">
            Forma
          </label>
          <select id="nueva-forma" className="fx-input" value={forma} onChange={(e) => setForma(e.target.value as FormaIngreso)}>
            {(Object.keys(ETIQUETA_FORMA_INGRESO) as FormaIngreso[]).map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FORMA_INGRESO[f]}
              </option>
            ))}
          </select>
        </div>
        {forma === "banco" && (
          <div>
            <label htmlFor="nueva-banco" className="fx-label">
              Banco
            </label>
            <input id="nueva-banco" className="fx-input" placeholder="BCP, Interbank…" value={banco} onChange={(e) => setBanco(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="nueva-op" className="fx-label">
            N° de operación
          </label>
          <input id="nueva-op" className="fx-input" value={operacion} onChange={(e) => setOperacion(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nueva-recibo" className="fx-label">
            Recibo
          </label>
          <input id="nueva-recibo" className="fx-input" value={recibo} onChange={(e) => setRecibo(e.target.value)} />
        </div>
      </div>
      <p className="text-[11.5px] text-white/45">
        El número es el siguiente de la empresa ({String(numero).padStart(2, "0")}). Luego da acceso a la caja en Usuarios.
      </p>
      <button
        type="submit"
        disabled={guardando}
        className="fx-btn self-end rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {guardando ? "Abriendo…" : "Abrir caja"}
      </button>
    </form>
  );
}
