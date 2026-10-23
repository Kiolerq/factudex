import { NextResponse, type NextRequest } from "next/server";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { codigoCaja, ETIQUETA_TIPO_RECARGA } from "@/lib/datos/tipos";
import { generarLiquidacionExcel, nombreArchivoLiquidacion } from "@/lib/exportar/liquidacionExcel";

// Descarga la liquidación con el formato de contabilidad. Solo entran los movimientos completos.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await obtenerRepositorio();
  if (!(await repo.usuarioActual())) return new NextResponse("Sesión expirada", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("No encontrado", { status: 404 });

  const l = await repo.obtenerLiquidacion(id); // con RLS: si no ve la caja, no existe
  if (!l) return new NextResponse("No encontrado", { status: 404 });
  const [cajas, empresas] = await Promise.all([repo.listarCajas(), repo.listarEmpresas()]);
  const caja = cajas.find((c) => c.id === l.cajaId);
  const empresa = empresas.find((e) => e.id === caja?.empresaId);
  if (!caja || !empresa) return new NextResponse("No encontrado", { status: 404 });

  const datos = {
    empresa: empresa.nombreCorto,
    cajaNombre: caja.nombre,
    cajaCodigo: codigoCaja(caja),
    folio: l.folio,
    ciudad: empresa.ciudad,
    fechaInicio: l.fechaInicio,
    fechaCierre: l.fechaCierre,
    saldoInicial: l.saldoInicial,
    folioAnterior: l.folioAnterior,
    ingresos: l.recargas.map((r) => ({
      fecha: r.fecha,
      descripcion: r.descripcion ?? ETIQUETA_TIPO_RECARGA[r.tipo],
      recibo: r.recibo,
      operacion: r.operacion,
      forma: r.forma,
      banco: r.banco,
      monto: r.monto,
    })),
    egresos: l.movimientos
      .filter((m) => m.estado === "completo")
      .map((m) => ({
        fecha: m.fecha,
        solicitante: m.solicitante,
        razonSocial: m.proveedor,
        numDoc: m.proveedorDoc,
        detalle: m.detalle,
        tipoDocumento: m.tipoDocumento,
        serieNumero: m.serieNumero,
        medioPago: m.medioPago,
        operacionPago: m.operacionPago,
        monto: m.monto,
        centroCosto: m.centroCosto,
      })),
  };
  const archivo = await generarLiquidacionExcel(datos);
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nombreArchivoLiquidacion(datos))}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
