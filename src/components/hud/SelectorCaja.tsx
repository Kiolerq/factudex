"use client";

import { useTransition } from "react";
import { seleccionarCaja } from "@/app/acciones";
import type { CajaSaldo, Empresa } from "@/lib/datos/tipos";
import { formatoSoles } from "@/lib/formato";

interface Props {
  empresas: Empresa[];
  cajas: CajaSaldo[];
  cajaActivaId: string;
}

/** Switch San Lorenzo / SIPE + tira con el saldo de cada caja de la empresa activa. */
export function SelectorCaja({ empresas, cajas, cajaActivaId }: Props) {
  const [pendiente, iniciar] = useTransition();
  const activa = cajas.find((c) => c.id === cajaActivaId)!;
  const cajasEmpresa = cajas.filter((c) => c.empresaId === activa.empresaId);

  const elegir = (cajaId: string) => {
    if (cajaId !== cajaActivaId) iniciar(() => seleccionarCaja(cajaId));
  };

  const switchEmpresa = (
    <div
      role="group"
      aria-label="Empresa"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-fx-glass-border bg-fx-glass p-[5px]"
    >
      {empresas.map((e) => {
        const primera = cajas.find((c) => c.empresaId === e.id);
        const esActiva = e.id === activa.empresaId;
        return (
          <button
            key={e.id}
            type="button"
            disabled={!primera}
            aria-pressed={esActiva}
            onClick={() => primera && elegir(primera.id)}
            className={`fx-btn rounded-full px-3.5 py-2 text-xs font-semibold uppercase transition-colors md:px-[18px] md:py-[9px] md:text-[13px] ${
              esActiva ? "bg-white/12 text-white" : "text-white/50 hover:text-white/80"
            } disabled:opacity-40`}
          >
            {e.nombreCorto}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`transition-opacity ${pendiente ? "opacity-60" : ""}`} aria-busy={pendiente}>
      {/* Escritorio: switch arriba a la derecha lo pone el HUD; aquí van las tarjetas de caja */}
      <div className="hidden md:flex md:flex-col md:gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs uppercase tracking-[1.2px] text-white/40">
            Cajas de {empresas.find((e) => e.id === activa.empresaId)?.nombreCorto}
          </div>
          {switchEmpresa}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
          {cajasEmpresa.map((c) => (
            <TarjetaCaja key={c.id} caja={c} activa={c.id === cajaActivaId} onElegir={elegir} />
          ))}
        </div>
      </div>

      {/* Móvil: switch + chips de caja en una sola fila con scroll horizontal */}
      <div className="fx-scroll-x -mx-5 flex items-center gap-2 overflow-x-auto px-5 md:hidden">
        {switchEmpresa}
        {cajasEmpresa.map((c) => {
          const esActiva = c.id === cajaActivaId;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={esActiva}
              onClick={() => elegir(c.id)}
              className={`fx-btn flex shrink-0 flex-col items-start rounded-xl border px-3 py-1.5 text-left ${
                esActiva
                  ? "border-fx-primary bg-fx-primary-soft text-white"
                  : "border-fx-glass-border bg-fx-glass text-white/60"
              }`}
            >
              <span className="text-[11px] leading-tight">
                {String(c.numero).padStart(2, "0")} · {c.nombre}
              </span>
              <span
                className={`font-display text-[13px] font-bold leading-tight ${
                  c.bajoUmbral ? "text-fx-pendiente" : ""
                }`}
              >
                {formatoSoles(c.saldo)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TarjetaCaja({
  caja,
  activa,
  onElegir,
}: {
  caja: CajaSaldo;
  activa: boolean;
  onElegir: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={() => onElegir(caja.id)}
      className={`fx-card fx-btn relative overflow-hidden py-[18px] pl-6 pr-5 text-left text-white transition-colors ${
        activa ? "border-fx-primary-line!" : "hover:bg-white/6"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1 ${
          caja.bajoUmbral ? "bg-fx-pendiente" : activa ? "bg-fx-primary" : "bg-white/10"
        }`}
      />
      <span className="mb-2 flex items-center justify-between gap-2 text-xs text-white/50">
        <span className="truncate">
          Caja {String(caja.numero).padStart(2, "0")} · {caja.nombre}
        </span>
        {activa && (
          <span className="shrink-0 rounded-full bg-fx-primary-soft px-2 py-0.5 text-[10px] font-semibold text-fx-primary-light">
            ACTIVA
          </span>
        )}
      </span>
      <span className="block font-display text-[26px] font-bold leading-none">
        {formatoSoles(caja.saldo)}
      </span>
      <span className="mt-2 block text-xs text-white/40">
        {caja.bajoUmbral ? (
          <span className="text-fx-pendiente">● Bajo el umbral de {formatoSoles(caja.umbralAlerta)}</span>
        ) : (
          <>Umbral de alerta {formatoSoles(caja.umbralAlerta)}</>
        )}
        {caja.pendientes > 0 && (
          <>
            {" · "}
            {caja.pendientes} pendiente{caja.pendientes === 1 ? "" : "s"}
          </>
        )}
      </span>
    </button>
  );
}
