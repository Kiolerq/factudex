import { InstalarApp } from "@/components/InstalarApp";
import { FormularioRegistro } from "@/components/registro/FormularioRegistro";
import { InicioRegistro } from "@/components/registro/InicioRegistro";
import { fechaHoyLima, restarDias } from "@/lib/datos/esquemas";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { almacenActivo } from "@/lib/drive/estado";
import { ocrConfigurado } from "@/lib/ocr/leer";
import { exigirModulo } from "@/lib/contexto";
import { leerCajaActiva } from "@/lib/seleccion";
import { cajaParaPago } from "@/lib/datos/tipos";

export const metadata = { title: "Registro · Factudex" };

export default async function PaginaRegistro({ searchParams }: PageProps<"/registro">) {
  await exigirModulo("registro");
  const { compartido, pago: pagoParam, nuevo } = await searchParams;
  const repo = await obtenerRepositorio();
  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const activa = await leerCajaActiva(cajas);
  if (!activa) return null; // el layout ya muestra el aviso de "sin cajas asignadas"

  // Solo las cajas donde puede registrar (registrador, aprobador o admin).
  const permisos = await Promise.all(cajas.map((c) => repo.permisosCaja(c.id)));
  const cajasRegistro = cajas.filter((_, i) => permisos[i]!.registrar);
  if (!cajasRegistro.length) {
    return (
      <div className="fx-card px-5 py-8 text-center text-sm text-white/75">
        Tu usuario solo puede ver estas cajas. Pide a un administrador acceso de registrador para registrar gastos.
      </div>
    );
  }
  // Sin nada que abrir directo (compartir, otra salida, "nuevo"): primero qué quiere hacer.
  if (!compartido && !pagoParam && !nuevo) {
    const empresasRegistro = [...new Set(cajasRegistro.map((c) => c.empresaId))];
    const anteriores = await Promise.all(empresasRegistro.map((e) => repo.listarAnteriores(e, restarDias(fechaHoyLima(), 90))));
    const pagos = anteriores.flatMap((a) => a.pagos);
    return (
      <>
        <div className="mb-4 empty:hidden md:hidden">
          <InstalarApp compacto />
        </div>
        <InicioRegistro porCompletar={pagos.length} faltaTotal={pagos.reduce((t, p) => t + p.falta, 0)} />
      </>
    );
  }

  // Otra salida de un pago con varias salidas: se registra en la caja del pago.
  const pago =
    typeof pagoParam === "string" && /^[0-9a-f-]{36}$/i.test(pagoParam) ? await repo.obtenerPago(pagoParam) : null;
  const cajaDelPago = pago ? cajaParaPago(pago, cajasRegistro, activa.id) : null;
  const pagoValido = cajaDelPago ? pago : null;
  const cajaInicial = cajaDelPago ?? cajasRegistro.find((c) => c.id === activa.id) ?? cajasRegistro[0]!;

  const empresasConCajas = empresas.filter((e) => cajasRegistro.some((c) => c.empresaId === e.id));
  const [listas, almacen] = await Promise.all([
    Promise.all(
      empresasConCajas.map(async (e) => {
        const [categorias, centrosCosto, solicitantes] = await Promise.all([
          repo.listarCategorias(e.id),
          repo.listarCentrosCosto(e.id),
          repo.listarSolicitantes(e.id),
        ]);
        return { empresaId: e.id, nombre: e.nombreCorto, topeGasto: e.topeGasto, categorias, centrosCosto, solicitantes };
      }),
    ),
    almacenActivo(),
  ]);

  return (
    <>
      <div className="mb-4 empty:hidden md:hidden">
        <InstalarApp compacto />
      </div>
      {compartido === "sin-sw" && (
        <p role="status" className="fx-card mb-4 px-4 py-3 text-fx-sm text-white/82">
          La app terminó de instalarse. Vuelve a compartir la imagen para adjuntarla.
        </p>
      )}
      <FormularioRegistro
        // Al cambiar la caja activa del HUD el formulario se reinicia con esa caja.
        key={`${activa.id}-${pagoValido?.id ?? ""}`}
        cajas={cajasRegistro}
        cajaInicialId={cajaInicial.id}
        listas={listas}
        almacen={almacen}
        ocr={ocrConfigurado()}
        compartido={compartido === "1"}
        pagoInicial={pagoValido}
      />
    </>
  );
}
