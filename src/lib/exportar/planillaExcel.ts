import ExcelJS from "exceljs";
import type { Empresa, Planilla } from "@/lib/datos/tipos";

// La misma planilla en Excel, celda por celda como PLANILLAS_MOVILIDAD_SL.xlsx (B7 razón social,
// I3/K3 serie y correlativo, filas desde la 13, total con fórmula).

const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

function aFecha(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!));
}

export async function planillaExcel(p: Planilla, empresa: Pick<Empresa, "razonSocial" | "ruc">): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(`${p.numero}`, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
  const anchos: Record<string, number> = { A: 0.7, B: 15.4, C: 1.7, D: 28.4, E: 12.6, F: 24.7, G: 21.9, H: 22, I: 11.3, J: 1.1, K: 14.4, L: 5.3, M: 1.4 };
  for (const [c, w] of Object.entries(anchos)) hoja.getColumn(c).width = w;
  const celda = (ref: string, valor: ExcelJS.CellValue, o: { negrita?: boolean; tam?: number; formato?: string; borde?: boolean; centro?: boolean } = {}) => {
    const c = hoja.getCell(ref);
    c.value = valor;
    c.font = { name: "Arial", size: o.tam ?? 10, bold: o.negrita };
    if (o.formato) c.numFmt = o.formato;
    if (o.borde) c.border = BORDE;
    if (o.centro) c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    return c;
  };

  celda("I2", "SERIE", { negrita: true, centro: true });
  celda("K2", "CORRELATIVO", { negrita: true, centro: true });
  celda("E3", "PLANILLA POR GASTO DE MOVILIDAD", { negrita: true, tam: 14 });
  celda("I3", /^\d+$/.test(p.serie) ? Number(p.serie) : p.serie, { negrita: true, centro: true });
  celda("J3", ":", { negrita: true });
  celda("K3", p.numero, { negrita: true, centro: true });
  celda("I5", "TIPO", { negrita: true });
  ["T: Taxi", "B: Bus", "C: Colectivo", "Combi"].forEach((t, i) => celda(`I${6 + i}`, t));
  celda("B7", "RAZÓN SOCIAL", { negrita: true });
  celda("C7", ":");
  hoja.mergeCells("D7:E7");
  celda("D7", empresa.razonSocial.toUpperCase());
  celda("G7", "FECHA DE EMISIÓN :", { negrita: true });
  celda("H7", aFecha(p.fechaEmision), { formato: "dd/mm/yyyy" });
  celda("B8", "RUC ", { negrita: true });
  celda("C8", ":");
  hoja.mergeCells("D8:E8");
  celda("D8", empresa.ruc ? Number(empresa.ruc) : null, { formato: "0" });
  celda("B9", "PERIODO", { negrita: true });
  celda("C9", ":");
  hoja.mergeCells("D9:E9");
  celda("D9", `${Number(p.fechaEmision.slice(5, 7))}  - ${p.fechaEmision.slice(0, 4)}`);

  // Cabecera de la tabla.
  for (const r of ["B11:B12", "C11:D12", "E11:E12", "F11:H11", "I11:I12", "J11:K12", "L11:L12"]) hoja.mergeCells(r);
  const cab: [string, string][] = [
    ["B11", "FECHA DE GASTO"], ["C11", "TRABAJADOR"], ["E11", "NRO DE DNI"], ["F11", "DESPLAZAMIENTO"],
    ["I11", "IMPORTE"], ["J11", "FIRMA"], ["L11", "TIPO"], ["F12", "MOTIVO"], ["G12", "ORIGEN"], ["H12", "DESTINO"],
  ];
  for (const [ref, t] of cab) celda(ref, t, { negrita: true, borde: true, centro: true });
  for (const ref of ["B12", "C12", "D11", "D12", "E12", "G11", "H11", "I12", "K11", "J12", "K12", "L12"]) hoja.getCell(ref).border = BORDE;

  // Filas.
  let fila = 13;
  for (const f of p.filas) {
    hoja.mergeCells(`C${fila}:D${fila}`);
    hoja.mergeCells(`J${fila}:K${fila}`);
    celda(`B${fila}`, aFecha(f.fecha), { formato: "dd/mm/yyyy", borde: true, centro: true });
    celda(`C${fila}`, f.trabajador.toUpperCase(), { borde: true });
    celda(`E${fila}`, f.dni, { borde: true, centro: true });
    celda(`F${fila}`, f.motivo === "ALIMENTACION" ? "ALIMENTACIÓN" : "MOVILIDAD", { borde: true });
    celda(`G${fila}`, f.origen.toUpperCase(), { borde: true });
    celda(`H${fila}`, f.destino.toUpperCase(), { borde: true });
    celda(`I${fila}`, f.importe, { formato: "#,##0.00", borde: true });
    celda(`J${fila}`, null, { borde: true });
    celda(`L${fila}`, f.tipo, { borde: true, centro: true });
    fila++;
  }
  celda(`H${fila}`, "TOTAL", { negrita: true });
  celda(`I${fila}`, { formula: `SUM(I13:I${fila - 1})`, result: p.total }, { negrita: true, formato: "#,##0.00", borde: true });
  celda(`B${fila + 1}`, "BASE LEGAL", { negrita: true });
  celda(`A${fila + 2}`, "-");
  celda(`B${fila + 2}`, "Inciso a1) del articulo 37° del TUO de la Ley del impuesto a la Renta");
  celda(`A${fila + 3}`, "-");
  celda(`B${fila + 3}`, "Inciso v) del articulo 21° del Reglamento del TUO de la Ley del Impuesto a la Renta");

  return Buffer.from(await libro.xlsx.writeBuffer());
}
