import { InstalarApp } from "@/components/InstalarApp";
import { FormularioRegistro } from "@/components/registro/FormularioRegistro";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { almacenActivo } from "@/lib/drive/estado";
import { ocrConfigurado } from "@/lib/ocr/leer";
import { exigirModulo } from "@/lib/contexto";
import { leerCajaActiva } from "@/lib/seleccion";

export const metadata = { title: "Registro · Factudex" };

export default async function PaginaRegistro({ searchParams }: PageProps<"/registro">) {
  await exigirModulo("registro");
  const { compartido } = await searchParams;
  const repo = await obtenerRepositorio();
  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const activa = await leerCajaActiva(cajas);
  if (!activa) return null; // el layout ya muestra el aviso de "sin cajas asignadas"

  // Solo las cajas donde puede registrar (registrador, aprobador o admin).
  const permisos = await Promise.all(cajas.map((c) => repo.permisosCaja(c.id)));
  const cajasRegistro = cajas.filter((_, i) => permisos[i]!.registrar);
  if (!cajasRegistro.length) {
    return (
      <div className="fx-card px-5 py-8 text-center text-sm text-white/55">
        Tu usuario solo puede ver estas cajas. Pide a un administrador acceso de registrador para registrar gastos.
      </div>
    );
  }
  const cajaInicial = cajasRegistro.find((c) => c.id === activa.id) ?? cajasRegistro[0]!;

  const empresasConCajas = empresas.filter((e) => cajasRegistro.some((c) => c.empresaId === e.id));
  const [listas, almacen] = await Promise.all([
    Promise.all(
      empresasConCajas.map(async (e) => {
        const [categorias, centrosCosto, solicitantes] = await Promise.all([
          repo.listarCategorias(e.id),
          repo.listarCentrosCosto(e.id),
          repo.listarSolicitantes(e.id),
        ]);
        return { empresaId: e.id, nombre: e.nombreCorto, categorias, centrosCosto, solicitantes };
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
        <p role="status" className="fx-card mb-4 px-4 py-3 text-[12.5px] text-white/70">
          La app terminó de instalarse. Vuelve a compartir la imagen para adjuntarla.
        </p>
      )}
      <FormularioRegistro
        // Al cambiar la caja activa del HUD el formulario se reinicia con esa caja.
        key={activa.id}
        cajas={cajasRegistro}
        cajaInicialId={cajaInicial.id}
        listas={listas}
        almacen={almacen}
        ocr={ocrConfigurado()}
        compartido={compartido === "1"}
      />
    </>
  );
}
