import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import type { CajaSaldo, Empresa, Usuario } from "@/lib/datos/tipos";
import { formatoSoles, iniciales } from "@/lib/formato";
import { Navegacion } from "./Navegacion";
import { SelectorCaja } from "./SelectorCaja";

interface Props {
  empresas: Empresa[];
  cajas: CajaSaldo[];
  cajaActiva: CajaSaldo | null; // null: tesorería o admin sin ninguna caja abierta todavía
  usuario: Usuario;
  demo: boolean;
}

/** HUD superior: logo, empresa/caja activa, saldos de las cajas y navegación. */
export function Hud({ empresas, cajas, cajaActiva, usuario, demo }: Props) {
  const empresa = empresas.find((e) => e.id === cajaActiva?.empresaId);
  const pendientesEmpresa = cajas
    .filter((c) => c.empresaId === cajaActiva?.empresaId)
    .reduce((s, c) => s + c.pendientes, 0);

  return (
    <header className="flex flex-col gap-3.5 md:gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5 md:gap-3.5">
          <span className="md:hidden">
            <Logo tamano={30} />
          </span>
          <span className="hidden md:block">
            <Logo tamano={40} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-base font-bold tracking-[0.2px] md:text-xl">Factudex</div>
            <div className="hidden truncate text-xs text-white/45 md:block">
              {cajaActiva ? (
                <>
                  {empresa?.nombreCorto} <span className="text-white/30">›</span> Caja{" "}
                  {String(cajaActiva.numero).padStart(2, "0")} · {cajaActiva.nombre}
                </>
              ) : (
                "Sin cajas abiertas"
              )}
            </div>
          </div>
          {demo && (
            <span
              title="Sin Supabase configurado: datos de ejemplo en memoria, se reinician al reiniciar el servidor."
              className="rounded-full border border-fx-pendiente/40 bg-fx-pendiente/16 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-fx-pendiente"
            >
              Modo demo
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {cajaActiva && (
          <div
            className={`flex items-center gap-2.5 rounded-full border px-2.5 py-[5px] md:px-4 md:py-2 ${
              cajaActiva.bajoUmbral
                ? "border-fx-pendiente/40 bg-fx-pendiente/16"
                : "border-fx-primary-line bg-fx-primary-soft"
            }`}
          >
            <span className="hidden text-xs text-white/55 md:inline">Saldo disponible</span>
            <span
              className={`font-display text-[11px] font-bold md:text-[15px] ${
                cajaActiva.bajoUmbral ? "text-fx-pendiente" : "text-fx-primary-light"
              }`}
            >
              {formatoSoles(cajaActiva.saldo)}
            </span>
          </div>
          )}
          <Link
            href="/cuenta"
            title={`${usuario.nombre} — mi cuenta`}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/12 bg-white/8 text-[11px] font-semibold text-white/70 hover:text-white md:h-[34px] md:w-[34px] md:text-xs"
          >
            {iniciales(usuario.nombre)}
          </Link>
        </div>
      </div>

      {cajaActiva ? (
        <SelectorCaja empresas={empresas} cajas={cajas} cajaActivaId={cajaActiva.id} />
      ) : (
        <div className="fx-card px-4 py-3 text-[13px] text-white/60">
          Aún no hay cajas. Ábrelas en{" "}
          <Link href="/tesoreria?vista=ingresos" className="font-semibold text-fx-primary-light hover:underline">
            Tesorería → Ingresos → ＋ Abrir caja nueva
          </Link>
          .
        </div>
      )}

      {cajaActiva?.bajoUmbral && (
        <div
          role="status"
          className="rounded-xl border border-fx-pendiente/40 bg-fx-pendiente/10 px-4 py-2.5 text-[12.5px] text-fx-pendiente"
        >
          El saldo de la caja {String(cajaActiva.numero).padStart(2, "0")} · {cajaActiva.nombre} bajó del
          umbral de {formatoSoles(cajaActiva.umbralAlerta)}. Toca liquidar para solicitar la recarga.
        </div>
      )}

      <Navegacion
        pendientes={pendientesEmpresa}
        modulos={usuario.modulos}
        esAdmin={usuario.esAdmin}
        esTesoreria={usuario.esTesoreria}
      />
    </header>
  );
}
