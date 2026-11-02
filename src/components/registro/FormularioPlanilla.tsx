"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { crearPlanilla } from "@/app/acciones";
import { BadgeEstado } from "@/components/ui/BadgeEstado";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import {
  claveTrabajador,
  codigoCaja,
  ETIQUETA_MEDIO_PAGO,
  ETIQUETA_MOTIVO_PLANILLA,
  ETIQUETA_TRANSPORTE,
  MOTIVOS_PLANILLA,
  TIPOS_TRANSPORTE,
  type CajaSaldo,
  type EstadoMovimiento,
  type GastoPlanillaDia,
  type MotivoPlanilla,
  type Opcion,
  type Pago,
  type TipoTransporte,
  type Trabajador,
} from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles, leerMonto } from "@/lib/formato";
import { nuevoUuid } from "@/lib/uuid";
import { BarraPago } from "./FormularioRegistro";

export interface EmpresaPlanilla {
  empresaId: string;
  nombre: string;
  topeDia: number; // S/ 40 por trabajador y día
  siguiente: { serie: string; numero: number } | null;
  categorias: Opcion[];
  centrosCosto: Opcion[];
  solicitantes: string[];
  trabajadores: Trabajador[];
  gastos: GastoPlanillaDia[]; // lo ya gastado en planillas (últimas semanas)
}

interface FilaForm {
  clave: string;
  fecha: string;
  trabajador: string;
  dni: string;
  motivo: MotivoPlanilla;
  origen: string;
  destino: string;
  importe: string;
  tipo: TipoTransporte | null;
}

const filaVacia = (fecha: string): FilaForm => ({
  clave: nuevoUuid(),
  fecha,
  trabajador: "",
  dni: "",
  motivo: "MOVILIDAD",
  origen: "",
  destino: "",
  importe: "",
  tipo: "T",
});

/** Planilla de movilidad (también alimentación): serie y número, filas por trabajador, tope por día y PDF. */
export function FormularioPlanilla({
  cajas,
  cajaInicialId,
  empresas,
  pago,
}: {
  cajas: CajaSaldo[];
  cajaInicialId: string;
  empresas: EmpresaPlanilla[];
  pago: Pago | null;
}) {
  const [cajaId, setCajaId] = useState(pago?.cajaId ?? cajaInicialId);
  const caja = cajas.find((c) => c.id === cajaId) ?? cajas[0]!;
  const empresa = empresas.find((e) => e.empresaId === caja.empresaId)!;
  const general = empresa.centrosCosto.find((c) => c.nombre === "General")?.id ?? "";
  const movilidad = empresa.categorias.find((c) => c.nombre === "Movilidad")?.id ?? "";

  const [movimientoId, setMovimientoId] = useState(() => nuevoUuid());
  const [serie, setSerie] = useState(empresa.siguiente?.serie ?? "");
  const [numeroTexto, setNumeroTexto] = useState(empresa.siguiente ? String(empresa.siguiente.numero) : "");
  const [fechaEmision, setFechaEmision] = useState(() => pago?.fecha ?? fechaHoyLima());
  const [categoriaId, setCategoriaId] = useState(movilidad);
  const [centroCostoId, setCentroCostoId] = useState(general);
  const [solicitante, setSolicitante] = useState("");
  const [filas, setFilas] = useState<FilaForm[]>(() => [filaVacia(pago?.fecha ?? fechaHoyLima())]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState<{
    planillaId: string;
    movimientoId: string;
    nombre: string;
    total: number;
    estado: EstadoMovimiento;
    aviso: string | null;
    pago: Pago | null;
  } | null>(null);
  const [guardando, iniciar] = useTransition();

  const elegirCaja = (id: string) => {
    setCajaId(id);
    const c = cajas.find((x) => x.id === id)!;
    const e = empresas.find((x) => x.empresaId === c.empresaId)!;
    if (e.empresaId !== empresa.empresaId) {
      setSerie(e.siguiente?.serie ?? "");
      setNumeroTexto(e.siguiente ? String(e.siguiente.numero) : "");
      setCategoriaId(e.categorias.find((x) => x.nombre === "Movilidad")?.id ?? "");
      setCentroCostoId(e.centrosCosto.find((x) => x.nombre === "General")?.id ?? "");
    }
  };
  const cambiar = (i: number, cambios: Partial<FilaForm>) =>
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)));
  const elegirTrabajador = (i: number, nombre: string) => {
    const t = empresa.trabajadores.find((x) => x.nombre.toLowerCase() === nombre.trim().toLowerCase());
    cambiar(i, t ? { trabajador: t.nombre, dni: t.dni ?? "" } : { trabajador: nombre });
  };

  // Tope por trabajador y día: lo ya gastado en otras planillas + lo de esta.
  const usado = new Map(empresa.gastos.map((g) => [`${g.clave}|${g.fecha}`, g.total]));
  const porDia = new Map<string, { nombre: string; fecha: string; antes: number; ahora: number }>();
  for (const f of filas) {
    if (!f.trabajador.trim()) continue;
    const k = `${claveTrabajador(f.trabajador, f.dni || null)}|${f.fecha}`;
    const actual = porDia.get(k) ?? { nombre: f.trabajador.trim(), fecha: f.fecha, antes: usado.get(k) ?? 0, ahora: 0 };
    const imp = leerMonto(f.importe);
    actual.ahora += Number.isFinite(imp) ? imp : 0;
    porDia.set(k, actual);
  }
  const topes = [...porDia.values()];
  const pasados = topes.filter((t) => t.antes + t.ahora > empresa.topeDia + 0.001);
  const total = filas.reduce((t, f) => t + (Number.isFinite(leerMonto(f.importe)) ? leerMonto(f.importe) : 0), 0);
  const lugares = [...new Set(filas.flatMap((f) => [f.origen.trim(), f.destino.trim()]).filter(Boolean))];

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setListo(null);
    iniciar(async () => {
      const r = await crearPlanilla({
        movimientoId,
        cajaId: caja.id,
        categoriaId: categoriaId || null,
        centroCostoId: centroCostoId || null,
        solicitante: solicitante || null,
        serie: serie.trim(),
        numero: Number(numeroTexto),
        fechaEmision,
        pagoId: pago?.id ?? null,
        filas: filas.map((f) => ({
          fecha: f.fecha,
          trabajador: f.trabajador,
          dni: f.dni.trim() || null,
          motivo: f.motivo,
          origen: f.origen,
          destino: f.destino,
          importe: leerMonto(f.importe),
          tipo: f.tipo,
        })),
      });
      if (!r.ok) {
        setErrores(r.errores);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setErrores({});
      setListo({
        planillaId: r.planillaId,
        movimientoId: r.movimientoId,
        nombre: `${serie.trim()}-${numeroTexto}`,
        total,
        estado: r.estado,
        aviso: r.aviso,
        pago: r.pago,
      });
      // Lista para la siguiente planilla (número siguiente).
      setMovimientoId(nuevoUuid());
      setNumeroTexto(String(Number(numeroTexto) + 1));
      setFilas([filaVacia(fechaEmision)]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const err = (k: string) => errores[k] && <p className="mt-1.5 text-xs text-fx-error">{errores[k]}</p>;

  return (
    <form onSubmit={guardar} noValidate data-empresa={caja.empresaCodigo} className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold md:text-xl">Planilla de movilidad</h1>
        <Link prefetch={false} href={pago ? `/registro?pago=${pago.id}` : "/registro"} className="text-fx-sm text-white/68 hover:text-white">
          ← Volver al registro
        </Link>
      </div>

      {listo && (
        <div role="status" className="fx-card flex flex-col gap-3 border-fx-completo/40! p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-fx-md">
              <span className="font-semibold">Planilla {listo.nombre} guardada</span> · {formatoSoles(listo.total)}
            </div>
            <BadgeEstado estado={listo.estado} />
          </div>
          {listo.aviso && <p className="text-fx-sm text-fx-error">{listo.aviso}. Ábrela desde el historial para volver a adjuntar el PDF.</p>}
          <p className="text-fx-sm text-white/75">Imprímela para que firmen. Sin firma igual vale para la liquidación.</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/planillas/${listo.planillaId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco"
            >
              🖨 Imprimir PDF
            </a>
            <a
              href={`/api/planillas/${listo.planillaId}/excel`}
              className="fx-btn rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82"
            >
              Descargar Excel
            </a>
            <Link
              prefetch={false}
              href={`/movimientos/${listo.movimientoId}`}
              className="fx-btn rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82"
            >
              Ver el gasto
            </Link>
          </div>
          {listo.pago && (
            <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
              <BarraPago pago={listo.pago} />
              {listo.pago.falta > 0.005 && (
                <Link
                  prefetch={false}
                  href={`/registro?pago=${listo.pago.id}`}
                  className="fx-btn self-start rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco"
                >
                  ＋ Agregar otra salida del pago
                </Link>
              )}
            </div>
          )}
        </div>
      )}
      {errores._ && (
        <div role="alert" className="rounded-xl border border-fx-error/50 bg-fx-error/10 px-4 py-3 text-fx-sm text-fx-error">
          {errores._}
        </div>
      )}

      {pago && (
        <div className="fx-card flex flex-col gap-2 border-fx-primary-line! px-4 py-3.5">
          <div className="text-fx-md font-semibold">Salida del pago {pago.medioPago ? ETIQUETA_MEDIO_PAGO[pago.medioPago] : ""} · total {formatoSoles(pago.monto)}</div>
          <BarraPago pago={pago} />
        </div>
      )}

      <section className="fx-card grid gap-3.5 p-4 md:grid-cols-3 md:p-6">
        <div className="md:col-span-3">
          <label htmlFor="pl-caja" className="fx-label">
            ¿De qué caja sale el dinero? *
          </label>
          <select id="pl-caja" className="fx-input" value={caja.id} disabled={!!pago} onChange={(e) => elegirCaja(e.target.value)}>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {codigoCaja(c)} · {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pl-serie" className="fx-label">
            Serie *
          </label>
          <input id="pl-serie" className="fx-input font-bold" placeholder="Ej. 10" value={serie} aria-invalid={!!errores.serie} onChange={(e) => setSerie(e.target.value)} />
          {err("serie")}
        </div>
        <div>
          <label htmlFor="pl-numero" className="fx-label">
            N° (correlativo) *
          </label>
          <input
            id="pl-numero"
            className="fx-input font-bold"
            inputMode="numeric"
            placeholder="Ej. 157"
            value={numeroTexto}
            aria-invalid={!!errores.numero}
            onChange={(e) => setNumeroTexto(e.target.value.replace(/\D/g, ""))}
          />
          {err("numero")}
          {!empresa.siguiente && <p className="mt-1.5 text-fx-xs text-white/68">Primera planilla de {empresa.nombre}: pon su serie y número.</p>}
        </div>
        <div>
          <label htmlFor="pl-emision" className="fx-label">
            Fecha de emisión *
          </label>
          <input id="pl-emision" type="date" className="fx-input" max={fechaHoyLima()} value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          {err("fechaEmision")}
        </div>
        <div>
          <label htmlFor="pl-categoria" className="fx-label">
            Categoría
          </label>
          <select id="pl-categoria" className="fx-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sin categoría</option>
            {empresa.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pl-centro" className="fx-label">
            Centro de costo / placa
          </label>
          <select id="pl-centro" className="fx-input" value={centroCostoId} onChange={(e) => setCentroCostoId(e.target.value)}>
            {empresa.centrosCosto.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pl-solicitante" className="fx-label">
            Solicitante
          </label>
          <input
            id="pl-solicitante"
            className="fx-input"
            list="pl-solicitantes"
            placeholder="Quién pide el gasto"
            value={solicitante}
            onChange={(e) => setSolicitante(e.target.value)}
          />
          <datalist id="pl-solicitantes">
            {empresa.solicitantes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </section>

      <datalist id="pl-trabajadores">
        {empresa.trabajadores.map((t) => (
          <option key={t.nombre + t.dni} value={t.nombre}>
            {t.dni ?? ""}
          </option>
        ))}
      </datalist>
      <datalist id="pl-lugares">
        {lugares.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      {filas.map((f, i) => {
        const e = (k: string) => errores[`filas.${i}.${k}`];
        return (
          <section key={f.clave} className="fx-card flex flex-col gap-3 p-4 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-fx-md font-semibold">Fila {i + 1}</span>
              {filas.length > 1 && (
                <button type="button" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} className="fx-btn text-fx-sm text-fx-error">
                  Quitar
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="fx-label" htmlFor={`f${i}-fecha`}>
                  Fecha del gasto *
                </label>
                <input id={`f${i}-fecha`} type="date" className="fx-input" max={fechaHoyLima()} value={f.fecha} onChange={(ev) => cambiar(i, { fecha: ev.target.value })} />
                {e("fecha") && <p className="mt-1.5 text-xs text-fx-error">{e("fecha")}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="fx-label" htmlFor={`f${i}-trab`}>
                  Trabajador *
                </label>
                <input
                  id={`f${i}-trab`}
                  className="fx-input"
                  list="pl-trabajadores"
                  placeholder="Nombre y apellido"
                  value={f.trabajador}
                  aria-invalid={!!e("trabajador")}
                  onChange={(ev) => elegirTrabajador(i, ev.target.value)}
                />
                {e("trabajador") && <p className="mt-1.5 text-xs text-fx-error">{e("trabajador")}</p>}
              </div>
              <div>
                <label className="fx-label" htmlFor={`f${i}-dni`}>
                  DNI
                </label>
                <input
                  id={`f${i}-dni`}
                  className="fx-input font-mono font-bold tracking-wider"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="8 dígitos"
                  value={f.dni}
                  aria-invalid={!!e("dni")}
                  onChange={(ev) => cambiar(i, { dni: ev.target.value.replace(/\D/g, "") })}
                />
                {e("dni") && <p className="mt-1.5 text-xs text-fx-error">{e("dni")}</p>}
              </div>
            </div>
            <div>
              <span className="fx-label">Motivo *</span>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_PLANILLA.map((m) => (
                  <Opcion key={m} activa={f.motivo === m} onClick={() => cambiar(i, { motivo: m })}>
                    {ETIQUETA_MOTIVO_PLANILLA[m]}
                  </Opcion>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="fx-label" htmlFor={`f${i}-origen`}>
                  Origen *
                </label>
                <input id={`f${i}-origen`} className="fx-input" list="pl-lugares" placeholder="Ej. Quintana" value={f.origen} aria-invalid={!!e("origen")} onChange={(ev) => cambiar(i, { origen: ev.target.value })} />
                {e("origen") && <p className="mt-1.5 text-xs text-fx-error">{e("origen")}</p>}
              </div>
              <div>
                <label className="fx-label" htmlFor={`f${i}-destino`}>
                  Destino *
                </label>
                <input id={`f${i}-destino`} className="fx-input" list="pl-lugares" placeholder="Ej. Planta Huanchaco" value={f.destino} aria-invalid={!!e("destino")} onChange={(ev) => cambiar(i, { destino: ev.target.value })} />
                {e("destino") && <p className="mt-1.5 text-xs text-fx-error">{e("destino")}</p>}
              </div>
              <div>
                <label className="fx-label" htmlFor={`f${i}-importe`}>
                  Importe (S/) *
                </label>
                <input id={`f${i}-importe`} className="fx-input font-display font-bold" inputMode="decimal" placeholder="0.00" value={f.importe} aria-invalid={!!e("importe")} onChange={(ev) => cambiar(i, { importe: ev.target.value })} />
                {e("importe") && <p className="mt-1.5 text-xs text-fx-error">{e("importe")}</p>}
              </div>
            </div>
            <div>
              <span className="fx-label">Tipo de transporte</span>
              <div className="flex flex-wrap gap-2">
                {TIPOS_TRANSPORTE.map((t) => (
                  <Opcion key={t} activa={f.tipo === t} onClick={() => cambiar(i, { tipo: f.tipo === t ? null : t })}>
                    {ETIQUETA_TRANSPORTE[t]}
                  </Opcion>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilas((fs) => [...fs, filaVacia(fs.at(-1)?.fecha ?? fechaEmision)])}
          className="fx-btn rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82"
        >
          ＋ Fila nueva
        </button>
        <button
          type="button"
          onClick={() => setFilas((fs) => [...fs, { ...fs.at(-1)!, clave: nuevoUuid() }])}
          className="fx-btn rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82"
        >
          ⧉ Copiar la fila anterior
        </button>
      </div>
      {errores.filas && <p className="text-fx-sm text-fx-error">{errores.filas}</p>}

      {topes.length > 0 && (
        <section className="fx-card flex flex-col gap-2 p-4 md:p-5">
          <div className="text-fx-md font-semibold">Tope por trabajador y día: {formatoSoles(empresa.topeDia)}</div>
          {topes.map((t) => {
            const suma = t.antes + t.ahora;
            const pasa = suma > empresa.topeDia + 0.001;
            return (
              <div key={t.nombre + t.fecha} className={`flex flex-wrap justify-between gap-2 text-fx-sm ${pasa ? "text-fx-error" : "text-white/82"}`}>
                <span>
                  {t.nombre} · {formatoFecha(t.fecha)}
                  {t.antes > 0 && <span className="text-white/68"> (ya tenía {formatoSoles(t.antes)})</span>}
                </span>
                <span className="font-semibold">
                  {formatoSoles(suma)} de {formatoSoles(empresa.topeDia)} {pasa ? "· se pasa" : "✓"}
                </span>
              </div>
            );
          })}
        </section>
      )}

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border border-white/12 bg-fx-bg/95 p-3 shadow-lg backdrop-blur">
        <div>
          <div className="text-fx-xs text-white/68">Total de la planilla</div>
          <div className="font-display text-xl font-bold">{formatoSoles(total)}</div>
        </div>
        <button
          type="submit"
          disabled={guardando || pasados.length > 0}
          className="fx-btn rounded-[12px] bg-fx-primary px-5 py-3 text-fx-md font-bold text-blanco disabled:opacity-50"
        >
          {guardando ? "Guardando…" : pasados.length ? "Pasa el tope" : "Guardar planilla"}
        </button>
      </div>
    </form>
  );
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`fx-btn rounded-full border px-4 py-2 text-fx-sm font-semibold ${
        activa ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/20 text-white/75"
      }`}
    >
      {children}
    </button>
  );
}
