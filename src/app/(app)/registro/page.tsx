import { InstalarApp } from "@/components/InstalarApp";
import { FormularioRegistro } from "@/components/registro/FormularioRegistro";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { almacenActivo } from "@/lib/drive/estado";
import { ocrConfigurado } from "@/lib/ocr/leer";
import { leerCajaActiva } from "@/lib/seleccion";

export const metadata = { title: "Registro · Factudex" };

export default async function PaginaRegistro({ searchParams }: PageProps<"/registro">) {
  const { compartido } = await searchParams;
  const repo = await obtenerRepositorio();
  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const caja = await leerCajaActiva(cajas);
  if (!caja) return null; // el layout ya muestra el aviso de "sin cajas asignadas"

  const [categorias, centrosCosto, solicitantes, almacen] = await Promise.all([
    repo.listarCategorias(caja.empresaId),
    repo.listarCentrosCosto(caja.empresaId),
    repo.listarSolicitantes(caja.empresaId),
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
      // Al cambiar de caja el formulario se reinicia (centros de costo y solicitantes dependen de la empresa).
      key={caja.id}
      caja={caja}
      empresaNombre={empresas.find((e) => e.id === caja.empresaId)?.nombreCorto ?? ""}
      categorias={categorias}
      centrosCosto={centrosCosto}
      solicitantes={solicitantes}
      almacen={almacen}
      ocr={ocrConfigurado()}
      compartido={compartido === "1"}
      />
    </>
  );
}
