import { NextResponse, type NextRequest } from "next/server";
import { obtenerRepositorio } from "@/lib/datos/repositorio";
import { planillaExcel } from "@/lib/exportar/planillaExcel";

// La planilla de movilidad en Excel, con el formato de la empresa.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await obtenerRepositorio();
  if (!(await repo.usuarioActual())) return new NextResponse("Sesión expirada", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const p = await repo.obtenerPlanilla(id);
  if (!p) return new NextResponse("No encontrado", { status: 404 });
  const empresa = (await repo.listarEmpresas()).find((e) => e.id === p.empresaId);
  if (!empresa) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(await planillaExcel(p, empresa)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Planilla-movilidad-${p.serie}-${p.numero}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
