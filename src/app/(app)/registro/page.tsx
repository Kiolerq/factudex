import { FormularioRegistro } from "@/components/registro/FormularioRegistro";
import { modoDemo, obtenerRepositorio } from "@/lib/datos/repositorio";
import { leerCajaActiva } from "@/lib/seleccion";

export const metadata = { title: "Registro · Factudex" };

export default async function PaginaRegistro() {
  const repo = await obtenerRepositorio();
  const [empresas, cajas] = await Promise.all([repo.listarEmpresas(), repo.listarCajas()]);
  const caja = await leerCajaActiva(cajas);
  if (!caja) return null; // el layout ya muestra el aviso de "sin cajas asignadas"

  const [categorias, centrosCosto, vehiculos] = await Promise.all([
    repo.listarCategorias(caja.empresaId),
    repo.listarCentrosCosto(caja.empresaId),
    repo.listarVehiculos(caja.empresaId),
  ]);

  return (
    <FormularioRegistro
      // Al cambiar de caja el formulario se reinicia (centros de costo y placas dependen de la empresa).
      key={caja.id}
      caja={caja}
      empresaNombre={empresas.find((e) => e.id === caja.empresaId)?.nombreCorto ?? ""}
      categorias={categorias}
      centrosCosto={centrosCosto}
      vehiculos={vehiculos}
      demo={modoDemo()}
    />
  );
}
