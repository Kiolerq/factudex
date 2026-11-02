import { FormularioPlanilla, type EmpresaPlanilla } from "@/components/registro/FormularioPlanilla";
import { exigirModulo } from "@/lib/contexto";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { leerCajaActiva } from "@/lib/seleccion";
import { fechaHoyLima } from "@/lib/datos/esquemas";

const restarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};

export const metadata = { title: "Planilla de movilidad · Factudex" };

/** Días hacia atrás para avisar del tope por trabajador y día antes de guardar. */
const DIAS_TOPE = 45;

export default async function PaginaPlanilla({ searchParams }: PageProps<"/registro/planilla">) {
  await exigirModulo("registro");
  const { pago: pagoParam } = await searchParams;
  const repo = await obtenerRepositorio();
  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const activa = await leerCajaActiva(cajas);
  if (!activa) return null;
  const permisos = await Promise.all(cajas.map((c) => repo.permisosCaja(c.id)));
  const cajasRegistro = cajas.filter((_, i) => permisos[i]!.registrar);
  if (!cajasRegistro.length) {
    return <div className="fx-card px-5 py-8 text-center text-sm text-white/75">No tienes cajas donde registrar gastos.</div>;
  }
  const pago =
    typeof pagoParam === "string" && /^[0-9a-f-]{36}$/i.test(pagoParam) ? await repo.obtenerPago(pagoParam) : null;
  const pagoValido = pago && cajasRegistro.some((c) => c.id === pago.cajaId) ? pago : null;

  const desde = restarDias(fechaHoyLima(), DIAS_TOPE);
  const datos: EmpresaPlanilla[] = await Promise.all(
    empresas
      .filter((e) => cajasRegistro.some((c) => c.empresaId === e.id))
      .map(async (e) => {
        const [categorias, centrosCosto, solicitantes, trabajadores, siguiente, gastos] = await Promise.all([
          repo.listarCategorias(e.id),
          repo.listarCentrosCosto(e.id),
          repo.listarSolicitantes(e.id),
          repo.listarTrabajadores(e.id),
          repo.siguientePlanilla(e.id),
          repo.gastosPlanillaDia(e.id, desde),
        ]);
        return {
          empresaId: e.id,
          nombre: e.nombreCorto,
          topeDia: e.topePlanillaDia,
          // San Lorenzo viene de la serie 10 (la última en papel fue la 156); SIPE pone la suya.
          siguiente: siguiente ?? (e.codigo === "SL" ? { serie: "10", numero: 157 } : null),
          categorias,
          centrosCosto,
          solicitantes,
          trabajadores,
          gastos,
        };
      }),
  );

  return (
    <FormularioPlanilla
      key={pagoValido?.id ?? activa.id}
      cajas={cajasRegistro}
      cajaInicialId={(cajasRegistro.find((c) => c.id === (pagoValido?.cajaId ?? activa.id)) ?? cajasRegistro[0]!).id}
      empresas={datos}
      pago={pagoValido}
    />
  );
}
