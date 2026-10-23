import Link from "next/link";
import { contextoPagina, usuarioPeticion } from "@/lib/contexto";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import { codigoCaja, type MovimientoResumen } from "@/lib/datos/tipos";
import { formatoFecha, formatoSoles } from "@/lib/formato";

export const metadata = { title: "Panel · Factudex" };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const redondear = (n: number) => Math.round(n * 100) / 100;
const suma = (xs: { monto: number }[]) => redondear(xs.reduce((s, x) => s + x.monto, 0));

/** "2026-10" → los 6 meses que terminan ahí, del más antiguo al más nuevo. */
function ultimosMeses(mes: string, n = 6): string[] {
  const [a, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a!, m! - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(2, 4)}`;

/** Panel para todos: el estado de las cajas que ve cada persona (tesorería ve todas). */
export default async function PaginaPanel({ searchParams }: PageProps<"/panel">) {
  const yo = await usuarioPeticion();
  const sp = await searchParams;
  const { repo, empresas, cajas: todas } = await contextoPagina();
  const hoy = fechaHoyLima();
  const mesActual = hoy.slice(0, 7);
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) && sp.mes <= mesActual ? sp.mes : mesActual;
  const empresaFiltro = empresas.find((e) => e.codigo === sp.empresa);
  const cajas = empresaFiltro ? todas.filter((c) => c.empresaId === empresaFiltro.id) : todas;
  const ids = cajas.map((c) => c.id);
  const meses = ultimosMeses(mes);
  const desde = `${meses[0]}-01`;

  const [{ movimientos }, recargas, pendientes, porAutorizar, liquidaciones] = await Promise.all([
    repo.listarMovimientos({ cajaIds: ids, estado: "todos", texto: "", limite: 5000, desde }),
    repo.listarRecargas(ids),
    repo.listarMovimientos({ cajaIds: ids, estado: "pendiente", texto: "", limite: 1000 }),
    repo.listarMovimientos({ cajaIds: ids, estado: "por_autorizar", texto: "", limite: 1000 }),
    repo.listarLiquidaciones(ids),
  ]);

  const delMes = movimientos.filter((m) => m.fecha.startsWith(mes));
  const gastadoMes = suma(delMes);
  const ingresosMes = suma(recargas.filter((r) => r.fecha.startsWith(mes)));
  const saldoTotal = suma(cajas.map((c) => ({ monto: c.saldo })));
  const porAprobar = liquidaciones.filter((l) => l.estado === "en_revision");
  const porReponer = liquidaciones.filter((l) => l.estado === "aprobada");

  // Por caja: cuánto del fondo se usó desde el último ingreso (gastado frente a gastado + lo que queda).
  const porCaja = cajas.map((c) => {
    const ultimo = recargas.find((r) => r.cajaId === c.id && r.monto > 0); // vienen de la más nueva a la más antigua
    const gastado = ultimo ? suma(movimientos.filter((m) => m.cajaId === c.id && m.fecha >= ultimo.fecha)) : 0;
    const fondo = Math.max(c.saldo, 0) + gastado;
    return { c, ultimo, gastado, pct: fondo > 0 ? Math.min(100, Math.round((gastado / fondo) * 100)) : 0 };
  });

  const porMes = meses.map((m) => ({ mes: m, monto: suma(movimientos.filter((x) => x.fecha.startsWith(m))) }));
  const maxMes = Math.max(1, ...porMes.map((x) => x.monto));
  const ranking = (clave: (m: MovimientoResumen) => string | null, vacio: string) => {
    const totales = new Map<string, number>();
    for (const m of delMes) totales.set(clave(m) ?? vacio, (totales.get(clave(m) ?? vacio) ?? 0) + m.monto);
    return [...totales.entries()]
      .map(([nombre, monto]) => ({ nombre, monto: redondear(monto) }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 6);
  };
  const categorias = ranking((m) => m.categoria, "Sin categoría");
  const centros = ranking((m) => m.centroCosto, "Sin centro de costo");

  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (empresaFiltro) p.set("empresa", empresaFiltro.codigo);
    if (mes !== mesActual) p.set("mes", mes);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const q = p.toString();
    return q ? `/panel?${q}` : "/panel";
  };

  return (
    <main className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold md:text-xl">Panel</h1>
          <p className="text-xs text-white/45">
            {yo?.esTesoreria ? "Todas las cajas" : "Tus cajas"} · {nombreMes(mes)}
          </p>
        </div>
        {/* Filtros en una sola fila: empresa y mes */}
        <div className="fx-scroll-x -mx-5 flex max-w-full gap-1.5 overflow-x-auto px-5 md:mx-0 md:px-0">
          {empresas.length > 1 &&
            [{ codigo: null, nombre: "Todas" }, ...empresas.map((e) => ({ codigo: e.codigo, nombre: e.nombreCorto }))].map((e) => (
              <Link
                key={e.nombre}
                href={enlace({ empresa: e.codigo })}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold ${
                  (empresaFiltro?.codigo ?? null) === e.codigo ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/12 text-white/55"
                }`}
              >
                {e.nombre}
              </Link>
            ))}
          {ultimosMeses(mesActual, 4)
            .reverse()
            .map((m) => (
              <Link
                key={m}
                href={enlace({ mes: m === mesActual ? null : m })}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold capitalize ${
                  m === mes ? "border-fx-primary bg-fx-primary-soft text-fx-primary-light" : "border-white/12 text-white/55"
                }`}
              >
                {nombreMes(m)}
              </Link>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <Cifra titulo="Saldo disponible" valor={formatoSoles(saldoTotal)} detalle={`${cajas.length} caja${cajas.length === 1 ? "" : "s"}`} />
        <Cifra titulo={`Gastado en ${nombreMes(mes)}`} valor={formatoSoles(gastadoMes)} detalle={`${delMes.length} gasto${delMes.length === 1 ? "" : "s"}`} />
        <Cifra titulo={`Ingresos en ${nombreMes(mes)}`} valor={formatoSoles(ingresosMes)} />
        <Cifra
          titulo="Por sustentar"
          valor={formatoSoles(suma(pendientes.movimientos))}
          detalle={`${pendientes.total} pendiente${pendientes.total === 1 ? "" : "s"}`}
          tono={pendientes.total ? "pendiente" : undefined}
          href="/pendientes"
        />
      </div>

      {(porAutorizar.total > 0 || porAprobar.length > 0 || porReponer.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {porAutorizar.total > 0 && (
            <Aviso href={yo?.esTesoreria ? "/tesoreria?vista=autorizar" : "/historial?estado=por_autorizar&caja=todas"}>
              ● {porAutorizar.total} gasto{porAutorizar.total === 1 ? "" : "s"} por autorizar · {formatoSoles(suma(porAutorizar.movimientos))}
            </Aviso>
          )}
          {porAprobar.length > 0 && (
            <Aviso href={yo?.esTesoreria ? "/tesoreria" : "/liquidaciones"}>
              ● {porAprobar.length} liquidación{porAprobar.length === 1 ? "" : "es"} por aprobar · {formatoSoles(suma(porAprobar.map((l) => ({ monto: l.egresos }))))}
            </Aviso>
          )}
          {porReponer.length > 0 && (
            <Aviso href={yo?.esTesoreria ? "/tesoreria" : "/liquidaciones"}>
              ● {porReponer.length} por reponer · {formatoSoles(suma(porReponer.map((l) => ({ monto: l.egresos }))))}
            </Aviso>
          )}
        </div>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs uppercase tracking-[1.2px] text-white/40">Cajas</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {porCaja.map(({ c, ultimo, gastado, pct }) => (
            <div key={c.id} data-empresa={c.empresaCodigo} className="fx-card flex flex-col gap-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[12px] text-fx-primary-light">{codigoCaja(c)}</div>
                  <div className="truncate text-[13px] text-white/70">{c.nombre}</div>
                </div>
                {c.bajoUmbral && (
                  <span className="shrink-0 rounded-full border border-fx-pendiente/40 bg-fx-pendiente/16 px-2.5 py-0.5 text-[10.5px] font-semibold text-fx-pendiente">
                    ● Bajo el umbral
                  </span>
                )}
              </div>
              <div className="font-display text-2xl font-bold">{formatoSoles(c.saldo)}</div>
              {ultimo ? (
                <div className="flex flex-col gap-1">
                  <div
                    className="h-2 overflow-hidden rounded-full bg-white/8"
                    role="img"
                    aria-label={`Usado ${pct}% del fondo desde el último ingreso`}
                  >
                    <div className={`h-full rounded-full ${pct >= 85 ? "bg-fx-pendiente" : "bg-fx-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[11.5px] text-white/50">
                    Usado {pct}% · gastó {formatoSoles(gastado)} desde el último ingreso ({formatoSoles(ultimo.monto)} el{" "}
                    {formatoFecha(ultimo.fecha, true)})
                  </div>
                </div>
              ) : (
                <div className="text-[11.5px] text-white/45">Sin ingresos registrados</div>
              )}
              {c.pendientes > 0 && (
                <div className="text-[11.5px] text-fx-pendiente">
                  {c.pendientes} pendiente{c.pendientes === 1 ? "" : "s"} de sustento
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="fx-card flex flex-col gap-3 p-4 md:p-5">
          <h2 className="text-[13px] font-semibold">Gasto por mes</h2>
          <div className="flex h-44 items-end gap-2 border-b border-white/10 pb-0.5" role="list">
            {porMes.map((x) => {
              const elegido = x.mes === mes;
              return (
                <Link
                  key={x.mes}
                  href={enlace({ mes: x.mes === mesActual ? null : x.mes })}
                  role="listitem"
                  title={`${nombreMes(x.mes)}: ${formatoSoles(x.monto)}`}
                  aria-label={`${nombreMes(x.mes)}: ${formatoSoles(x.monto)}`}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className={`text-[10.5px] ${elegido ? "font-semibold text-white" : "text-transparent group-hover:text-white/70"}`}>
                    {formatoSoles(x.monto).replace(".00", "")}
                  </span>
                  <span
                    className={`w-full max-w-11 rounded-t-[4px] ${elegido ? "bg-fx-primary" : "bg-fx-primary/45 group-hover:bg-fx-primary/70"}`}
                    style={{ height: `${Math.max(x.monto > 0 ? 3 : 0, (x.monto / maxMes) * 100)}%` }}
                  />
                </Link>
              );
            })}
          </div>
          <div className="flex gap-2">
            {porMes.map((x) => (
              <span key={x.mes} className={`flex-1 text-center text-[11px] capitalize ${x.mes === mes ? "text-white" : "text-white/45"}`}>
                {nombreMes(x.mes)}
              </span>
            ))}
          </div>
        </section>

        <section className="fx-card flex flex-col gap-4 p-4 md:p-5">
          <Ranking titulo={`En qué se gastó · ${nombreMes(mes)}`} filas={categorias} />
          <Ranking titulo="Por centro de costo / placa" filas={centros} />
        </section>
      </div>
    </main>
  );
}

function Cifra({
  titulo,
  valor,
  detalle,
  tono,
  href,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  tono?: "pendiente";
  href?: string;
}) {
  const contenido = (
    <>
      <div className="text-[10.5px] uppercase tracking-[0.6px] text-white/40 md:text-[11px]">{titulo}</div>
      <div className="mt-1 font-display text-[17px] font-bold md:text-2xl">{valor}</div>
      {detalle && <div className={`text-[11.5px] ${tono === "pendiente" ? "text-fx-pendiente" : "text-white/45"}`}>{detalle}</div>}
    </>
  );
  const clase = "fx-card block rounded-[14px] px-3.5 py-3 md:px-5 md:py-4";
  return href ? (
    <Link href={href} className={`${clase} hover:bg-white/6`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

function Aviso({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-fx-pendiente/40 bg-fx-pendiente/10 px-3.5 py-1.5 text-[12.5px] font-semibold text-fx-pendiente hover:bg-fx-pendiente/16"
    >
      {children} →
    </Link>
  );
}

function Ranking({ titulo, filas }: { titulo: string; filas: { nombre: string; monto: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.monto));
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold">{titulo}</h2>
      {filas.length === 0 && <p className="text-[12.5px] text-white/45">Sin gastos en este mes.</p>}
      {filas.map((f) => (
        <div key={f.nombre} className="flex flex-col gap-1" title={`${f.nombre}: ${formatoSoles(f.monto)}`}>
          <div className="flex justify-between gap-3 text-[12.5px]">
            <span className="truncate text-white/75">{f.nombre}</span>
            <span className="shrink-0 font-semibold">{formatoSoles(f.monto)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/6">
            <div className="h-full rounded-full bg-fx-primary/80" style={{ width: `${(f.monto / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
