import { NextResponse, type NextRequest } from "next/server";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { planillaPdf } from "@/lib/exportar/planillaPdf";

// La planilla de movilidad en PDF, para imprimir y firmar. Con RLS: si no ve la caja, no existe.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await obtenerRepositorio();
  if (!(await repo.usuarioActual())) return new NextResponse("Sesión expirada", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const p = await repo.obtenerPlanilla(id);
  if (!p) return new NextResponse("No encontrado", { status: 404 });
  const empresa = (await repo.listarEmpresas()).find((e) => e.id === p.empresaId);
  if (!empresa) return new NextResponse("No encontrado", { status: 404 });
  const bytes = await planillaPdf(p, empresa);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Planilla-movilidad-${p.serie}-${p.numero}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
