import Link from "next/link";
import { GastosAnteriores } from "@/components/registro/GastosAnteriores";
import { exigirModulo } from "@/lib/contexto";
import { fechaHoyLima, restarDias } from "@/lib/datos/esquemas";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { ETIQUETA_MEDIO_PAGO } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Completar un registro anterior · Factudex" };

/** Días hacia atrás de los gastos que se ofrecen para "este pago cubrió más gastos". */
const DIAS = 90;

/**
 * Completar un registro anterior: un pago (Yape, transferencia, efectivo) que cubrió varios gastos
 * y al que le falta sustentar una parte, aunque lo demás ya se haya liquidado en la caja anterior.
 */
export default async function PaginaCompletar() {
  await exigirModulo("registro");
  const repo = await obtenerRepositorio();
  const cajas = await repo.listarCajas();
  const permisos = await Promise.all(cajas.map((c) => repo.permisosCaja(c.id)));
  const cajasRegistro = cajas.filter((_, i) => permisos[i]!.registrar);
  const empresas = [...new Set(cajasRegistro.map((c) => c.empresaId))];
  const anteriores = await Promise.all(empresas.map((e) => repo.listarAnteriores(e, restarDias(fechaHoyLima(), DIAS))));
  const pagos = anteriores.flatMap((a) => a.pagos);
  const gastos = anteriores.flatMap((a) => a.gastos);

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold md:text-xl">Completar un registro anterior</h1>
        <Link prefetch={false} href="/registro" className="text-fx-sm text-white/68 hover:text-white">
          ← Volver
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-fx-md font-bold">Pagos a los que les falta sustentar</h2>
        {pagos.length === 0 ? (
          <p className="fx-card px-4 py-4 text-fx-sm text-white/72">
            No hay pagos con saldo por sustentar. Si un gasto que ya registraste se pagó junto con otro, búscalo abajo.
          </p>
        ) : (
          pagos.map((p) => (
            <article key={p.id} className="fx-card flex flex-col gap-3 p-4 md:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-fx-md font-semibold">
                  {p.medioPago ? ETIQUETA_MEDIO_PAGO[p.medioPago] : "Pago"} del {formatoFecha(p.fecha)} ·{" "}
                  {formatoSoles(p.monto)}
                  {p.operacion && <span className="font-normal text-white/68"> · Op. {p.operacion}</span>}
                </div>
                <span className="rounded-full border border-fx-pendiente/40 bg-fx-pendiente/16 px-2.5 py-0.5 text-fx-xs font-semibold text-fx-pendiente">
                  ● Falta {formatoSoles(p.falta)}
                </span>
              </div>
              <p className="-mt-1.5 text-fx-xs text-white/68">Registrado en {p.cajaCodigo}</p>
              <ul className="flex flex-col divide-y divide-white/8 rounded-xl border border-white/12">
                {p.salidas.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-fx-sm">
                    <span className="min-w-0 truncate">{s.detalle}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {s.liquidado && s.folio && <span className="text-fx-2xs text-white/60">liquidado en {s.folio}</span>}
                      <b className="font-display">{formatoSoles(s.monto)}</b>
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-fx-sm text-fx-pendiente">
                  <span>Por sustentar</span>
                  <b className="font-display">{formatoSoles(p.falta)}</b>
                </li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Link
                  prefetch={false}
                  href={`/registro/planilla?pago=${p.id}`}
                  className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-fx-sm font-semibold text-blanco"
                >
                  📝 Planilla de movilidad
                </Link>
                <Link
                  prefetch={false}
                  href={`/registro?pago=${p.id}`}
                  className="fx-btn rounded-[10px] border border-white/20 px-4 py-2.5 text-fx-sm font-semibold text-white/82"
                >
                  ＋ Factura, boleta u otro comprobante
                </Link>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-fx-md font-bold">¿Un gasto ya registrado se pagó junto con otro?</h2>
          <p className="text-fx-sm text-white/72">
            Ej.: un Yape de S/ 60 pagó un peaje de S/ 40 (ya registrado, incluso liquidado en la caja anterior) y S/ 20 de
            comida. Busca el peaje, toca «Este pago cubrió más gastos», escribe 60 y luego agrega la planilla de los 20.
          </p>
        </div>
        <GastosAnteriores gastos={gastos} />
      </section>

      <p className="text-fx-sm text-white/68">
        ¿A un gasto le falta la foto del comprobante o del pago?{" "}
        <Link prefetch={false} href="/pendientes" className="font-semibold text-fx-primary-light hover:underline">
          Ve a Pendientes →
        </Link>
      </p>
    </main>
  );
}
