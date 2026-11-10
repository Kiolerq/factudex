import { FormularioPlanilla, type EmpresaPlanilla } from "@/components/registro/FormularioPlanilla";
import { exigirModulo } from "@/lib/contexto";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { leerCajaActiva } from "@/lib/seleccion";
import { cajaParaPago } from "@/lib/datos/tipos";
import { fechaHoyLima, restarDias } from "@/lib/datos/esquemas";

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
  const cajaDelPago = pago ? cajaParaPago(pago, cajasRegistro, activa.id) : null;
  const pagoValido = cajaDelPago ? pago : null;

  const desde = restarDias(fechaHoyLima(), DIAS_TOPE);
  const empresasRegistro = [...new Set(cajasRegistro.map((c) => c.empresaId))];
  const pagosAnteriores = pagoValido
    ? []
    : (await Promise.all(empresasRegistro.map((e) => repo.listarAnteriores(e, restarDias(fechaHoyLima(), 90))))).flatMap((a) => a.pagos);
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
      cajaInicialId={(cajaDelPago ?? cajasRegistro.find((c) => c.id === activa.id) ?? cajasRegistro[0]!).id}
      empresas={datos}
      pago={pagoValido}
      pagosAnteriores={pagosAnteriores}
    />
  );
}
