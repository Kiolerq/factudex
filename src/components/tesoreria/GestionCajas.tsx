"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { actualizarTope, guardarCaja } from "@/app/acciones";
import { codigoCaja, type CajaAdmin, type CodigoEmpresa } from "@/lib/datos/tipos";
import { formatoSoles, leerMonto } from "@/lib/formato";

interface EmpresaTope {
  id: string;
  codigo: CodigoEmpresa;
  nombre: string;
  topeGasto: number;
}

/** Tesorería: cajas (numeración SL-CAJA-MT-01) y tope por gasto de cada empresa. */
export function GestionCajas({ cajas, empresas }: { cajas: CajaAdmin[]; empresas: EmpresaTope[] }) {
  const [editando, setEditando] = useState<CajaAdmin | "nueva" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {empresas.map((e) => (
          <Tope key={e.id} empresa={e} />
        ))}
      </div>

      {editando ? (
        <EditorCaja
          key={editando === "nueva" ? "nueva" : editando.id}
          caja={editando === "nueva" ? null : editando}
          empresas={empresas}
          cajas={cajas}
          onCerrar={() => setEditando(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando("nueva")}
          className="fx-btn self-start rounded-[10px] bg-fx-primary px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          + Nueva caja
        </button>
      )}

      {empresas.map((e) => {
        const deEmpresa = cajas.filter((c) => c.empresaId === e.id);
        return (
          <section key={e.id} className="flex flex-col gap-2">
            <h3 className="text-xs uppercase tracking-[1.2px] text-white/40">{e.nombre}</h3>
            <div className="fx-card overflow-hidden">
              {deEmpresa.length === 0 && <div className="px-5 py-5 text-[13px] text-white/45">Sin cajas.</div>}
              {deEmpresa.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-[13px] last:border-b-0 md:px-5 ${c.activa ? "" : "opacity-50"}`}
                >
                  <div className="min-w-0">
                    <div className="font-mono font-semibold">{codigoCaja(c)}</div>
                    <div className="truncate text-[12px] text-white/50">
                      {c.nombre} · umbral {formatoSoles(c.umbralAlerta)}
                      {!c.activa && " · inactiva"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditando(c)}
                    className="fx-btn shrink-0 rounded-[10px] border border-white/12 px-3.5 py-1.5 text-[12.5px] text-white/75 hover:text-white"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tope({ empresa }: { empresa: EmpresaTope }) {
  const router = useRouter();
  const [texto, setTexto] = useState(empresa.topeGasto.toFixed(2));
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  return (
    <form
      className="fx-card flex flex-col gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await actualizarTope({ empresaId: empresa.id, tope: leerMonto(texto) });
          setAviso(r.ok ? { ok: true, texto: "Guardado" } : { ok: false, texto: r.errores.tope ?? r.errores._ ?? "No se pudo guardar" });
          if (r.ok) router.refresh();
        });
      }}
    >
      <label htmlFor={`tope-${empresa.id}`} className="fx-label">
        Tope por gasto · {empresa.nombre}
      </label>
      <div className="flex gap-2">
        <input id={`tope-${empresa.id}`} className="fx-input font-display font-bold" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button type="submit" disabled={guardando} className="fx-btn shrink-0 rounded-[10px] border border-white/12 px-4 text-[13px] text-white/80 disabled:opacity-60">
          Guardar
        </button>
      </div>
      <p className="text-[11.5px] text-white/45">Un gasto mayor queda “por autorizar” por tesorería.</p>
      {aviso && <p className={`text-xs ${aviso.ok ? "text-fx-completo" : "text-fx-error"}`}>{aviso.texto}</p>}
    </form>
  );
}

function EditorCaja({
  caja,
  empresas,
  cajas,
  onCerrar,
}: {
  caja: CajaAdmin | null;
  empresas: EmpresaTope[];
  cajas: CajaAdmin[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(caja?.empresaId ?? empresas[0]?.id ?? "");
  const siguienteNumero = Math.max(0, ...cajas.filter((c) => c.empresaId === empresaId).map((c) => c.numero)) + 1;
  const [numeroTexto, setNumeroTexto] = useState(String(caja?.numero ?? siguienteNumero));
  const [area, setArea] = useState(caja?.area ?? "");
  const [nombre, setNombre] = useState(caja?.nombre ?? "");
  const [umbralTexto, setUmbralTexto] = useState((caja?.umbralAlerta ?? 200).toFixed(2));
  const [activa, setActiva] = useState(caja?.activa ?? true);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, iniciar] = useTransition();

  const empresa = empresas.find((e) => e.id === empresaId);
  const numero = Number(numeroTexto);
  const vistaCodigo = empresa && area && numero ? codigoCaja({ empresaCodigo: empresa.codigo, area: area.toUpperCase(), numero }) : "—";

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const r = await guardarCaja({
        id: caja?.id ?? null,
        empresaId,
        numero,
        area,
        nombre,
        umbralAlerta: leerMonto(umbralTexto),
        activa,
      });
      if (r.ok) {
        router.refresh();
        onCerrar();
      } else setErrores(r.errores);
    });
  };

  return (
    <form onSubmit={guardar} noValidate className="fx-card flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">{caja ? "Editar caja" : "Nueva caja"}</h3>
        <span className="font-mono text-[13px] text-fx-primary-light">{vistaCodigo}</span>
      </div>
      {errores._ && <p className="text-[13px] text-fx-error">{errores._}</p>}
      <div className="grid gap-3.5 md:grid-cols-3">
        <div>
          <label htmlFor="caja-empresa" className="fx-label">
            Empresa
          </label>
          <select id="caja-empresa" className="fx-input" value={empresaId} disabled={!!caja} onChange={(e) => setEmpresaId(e.target.value)}>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="caja-area" className="fx-label">
            Área (sigla) *
          </label>
          <input
            id="caja-area"
            className="fx-input uppercase"
            placeholder="MT, OP, GE…"
            maxLength={4}
            value={area}
            aria-invalid={!!errores.area}
            onChange={(e) => setArea(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
          {errores.area && <p className="mt-1.5 text-xs text-fx-error">{errores.area}</p>}
        </div>
        <div>
          <label htmlFor="caja-numero" className="fx-label">
            Número *
          </label>
          <input
            id="caja-numero"
            className="fx-input"
            inputMode="numeric"
            value={numeroTexto}
            aria-invalid={!!errores.numero}
            onChange={(e) => setNumeroTexto(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
          {errores.numero && <p className="mt-1.5 text-xs text-fx-error">{errores.numero}</p>}
        </div>
        <div className="md:col-span-2">
          <label htmlFor="caja-nombre" className="fx-label">
            Nombre *
          </label>
          <input
            id="caja-nombre"
            className="fx-input"
            placeholder="Mantenimiento"
            value={nombre}
            aria-invalid={!!errores.nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {errores.nombre && <p className="mt-1.5 text-xs text-fx-error">{errores.nombre}</p>}
        </div>
        <div>
          <label htmlFor="caja-umbral" className="fx-label">
            Umbral de alerta (S/)
          </label>
          <input id="caja-umbral" className="fx-input" inputMode="decimal" value={umbralTexto} onChange={(e) => setUmbralTexto(e.target.value)} />
        </div>
      </div>
      {caja && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Activa (desmárcala para dejar de usarla; su historial
          se conserva)
        </label>
      )}
      {caja && (caja.numero !== numero || caja.area !== area) && (
        <p className="text-[12px] text-fx-pendiente">
          Las liquidaciones ya generadas conservan su folio; las nuevas salen con la numeración nueva.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="fx-btn rounded-[10px] px-4 py-2 text-[13px] text-white/60">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="fx-btn rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {guardando ? "Guardando…" : caja ? "Guardar cambios" : "Crear caja"}
        </button>
      </div>
    </form>
  );
}
