import { NextResponse, type NextRequest } from "next/server";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { codigoCaja, ETIQUETA_TIPO_RECARGA } from "@/lib/datos/tipos";
import { generarLiquidacionExcel, nombreArchivoLiquidacion } from "@/lib/exportar/liquidacionExcel";
import { urlPublica } from "@/lib/drive/google";
import { formatoSoles } from "@/lib/formato";

/** Link a un archivo: directo a Drive, o a la app (pide iniciar sesión) si está en Storage. */
const linkArchivo = (base: string, ruta: string, respaldo: string) =>
  ruta.startsWith("drive:") ? `https://drive.google.com/file/d/${ruta.slice(6)}/view` : `${base}${respaldo}`;

// Descarga la liquidación con el formato de contabilidad. Solo entran los movimientos completos.
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  // Links a los archivos (pedido de contabilidad) y el resumen de los pagos con varias salidas.
  const completos = l.movimientos.filter((m) => m.estado === "completo");
  const base = urlPublica(peticion.nextUrl.origin);
  const [archivos, pagos] = await Promise.all([
    repo.archivosParaExcel(
      completos.map((m) => m.id),
      l.recargas.filter((r) => r.conFoto).map((r) => r.id),
    ),
    Promise.all([...new Set(completos.flatMap((m) => (m.pagoId ? [m.pagoId] : [])))].map((id) => repo.obtenerPago(id))),
  ]);
  const linkDe = (movimientoId: string, tipo: "documento" | "pago", pagoId: string | null) => {
    const a =
      archivos.adjuntos.find((x) => x.movimientoId === movimientoId && x.tipo === tipo) ??
      (tipo === "pago" && pagoId ? archivos.adjuntos.find((x) => x.pagoId === pagoId && x.tipo === "pago") : undefined);
    return a ? linkArchivo(base, a.storagePath, `/api/archivos/${a.id}`) : null;
  };
  const notaPago = (pagoId: string | null) => {
    const p = pagos.find((x) => x?.id === pagoId);
    if (!p) return null;
    const salidas = p.salidas.filter((s) => !s.anulado).length;
    // Si parte del pago ya se rindió en otra liquidación (ej. en la caja anterior), se indica dónde.
    const enOtra = p.yaLiquidado
      .filter((x) => x.folio !== l.folio)
      .map((x) => `${formatoSoles(x.monto)} ya liquidado en ${x.folio}${x.cajaCodigo ? ` (${x.cajaCodigo})` : ""}`);
    return [`pago ${formatoSoles(p.monto)} en ${salidas} salidas`, ...enOtra, p.devuelto > 0 && `devolución ${formatoSoles(p.devuelto)}`]
      .filter(Boolean)
      .join(" · ");
  };

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
      urlFoto: (() => {
        const f = archivos.recargas.find((x) => x.id === r.id);
        return f ? linkArchivo(base, f.storagePath, `/api/recargas/${r.id}/comprobante`) : null;
      })(),
    })),
    egresos: completos.map((m) => ({
        fecha: m.fecha,
        solicitante: m.solicitante,
        // Planilla de movilidad: no hay proveedor; va el trabajador (o "Varios").
        razonSocial:
          m.proveedor ?? (m.tipoDocumento === "planilla_movilidad" ? (m.detalle.split(" · ")[1] ?? "Planilla de movilidad") : null),
        numDoc: m.proveedorDoc,
        detalle: m.detalle,
        tipoDocumento: m.tipoDocumento,
        serieNumero: m.serieNumero,
        medioPago: m.medioPago,
        operacionPago: m.operacionPago,
        monto: m.monto,
        centroCosto: m.centroCosto,
        urlDocumento: linkDe(m.id, "documento", m.pagoId),
        urlPago: m.medioPago === "efectivo" ? null : linkDe(m.id, "pago", m.pagoId),
        notaPago: notaPago(m.pagoId),
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
