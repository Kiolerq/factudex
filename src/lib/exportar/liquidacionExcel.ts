import ExcelJS from "exceljs";
import type { MedioPago, TipoDocumento } from "@/lib/datos/tipos";

// Exporta una liquidación con el formato que usa contabilidad (ver docs/modelo-datos.md,
// "Formato de exportación"): INGRESOS (saldo anterior + depósitos), EGRESOS (solo movimientos
// completos) y el cuadro INGRESO / EGRESO / POR REEMBOLSAR. Los totales son fórmulas de Excel.

export interface IngresoExcel {
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  recibo: string | null;
  operacion: string | null;
  forma: "banco" | "efectivo" | "otros";
  banco: string | null;
  monto: number;
}

export interface EgresoExcel {
  fecha: string; // YYYY-MM-DD
  solicitante: string | null;
  razonSocial: string | null;
  numDoc: string | null;
  detalle: string;
  tipoDocumento: TipoDocumento | null;
  serieNumero: string | null;
  medioPago: MedioPago | null;
  operacionPago: string | null;
  monto: number;
  centroCosto: string | null;
}

export interface DatosLiquidacionExcel {
  empresa: string; // "SIPE", "San Lorenzo"
  cajaNombre: string; // "Mantenimiento"
  folio: string;
  ciudad: string; // "TRUJILLO"
  fechaInicio: string;
  fechaCierre: string | null;
  saldoInicial: number;
  folioAnterior: string | null;
  ingresos: IngresoExcel[];
  egresos: EgresoExcel[];
}

const FUENTE = "Arial Narrow";
const CONTABLE = '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * "-"??_ ;_ @_ ';
const FECHA = "dd/mm/yyyy";
const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const CABECERA: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };

// Columna del Excel donde va el N° de documento según su tipo.
const COLUMNA_DOCUMENTO: Record<TipoDocumento, "G" | "H" | "I" | "J"> = {
  factura: "G",
  boleta: "H",
  rxh: "I",
  planilla_movilidad: "J",
  comprobante_egreso: "J",
  otro: "J",
};
const PREFIJO_OTROS: Partial<Record<TipoDocumento, string>> = {
  planilla_movilidad: "Planilla mov.",
  comprobante_egreso: "Comp. egreso",
};

function aFecha(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!)); // Excel guarda fechas sin zona horaria
}

function fechaPie(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}.${m}.${a}`;
}

function textoYape(e: EgresoExcel): string | null {
  if (e.medioPago !== "yape" && e.medioPago !== "plin") return null;
  const medio = e.medioPago.toUpperCase();
  return e.operacionPago ? `${medio} ${e.operacionPago}` : medio;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export async function generarLiquidacionExcel(d: DatosLiquidacionExcel): Promise<Buffer> {
  // Valores ya calculados que acompañan a cada fórmula: los visores que no recalculan
  // (vista previa de WhatsApp o del celular) muestran el monto igual.
  const sumaIngresos = redondear(d.saldoInicial + d.ingresos.reduce((t, i) => t + i.monto, 0));
  const sumaEgresos = redondear(d.egresos.reduce((t, e) => t + e.monto, 0));
  const libro = new ExcelJS.Workbook();
  libro.creator = "Factudex";
  libro.created = new Date();

  const hoja = libro.addWorksheet(`${d.empresa} ${d.folio}`.slice(0, 31), {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ showGridLines: false }],
  });

  // Anchos de columna, fuente y posiciones copiados del formato original (pruebaliquidacion.xlsx).
  const anchos: Record<string, number> = {
    A: 4.3, B: 20, C: 20.4, D: 33.1, E: 20.3, F: 35.7, G: 23.4, H: 18.3, I: 14.3, J: 21, K: 19.9, L: 19.1, M: 23.9,
  };
  for (const [col, ancho] of Object.entries(anchos)) hoja.getColumn(col).width = ancho;

  const estilo = (celda: ExcelJS.Cell, opciones: { negrita?: boolean; tam?: number; formato?: string } = {}) => {
    celda.font = { name: FUENTE, size: opciones.tam ?? 14, bold: opciones.negrita ?? false };
    if (opciones.formato) celda.numFmt = opciones.formato;
  };
  const cabeceras = (fila: number, valores: [string, string][]) => {
    for (const [col, texto] of valores) {
      const c = hoja.getCell(`${col}${fila}`);
      c.value = texto;
      estilo(c, { negrita: true });
      c.fill = CABECERA;
      c.border = BORDE;
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    hoja.getRow(fila).height = 30;
  };

  // --- Título -----------------------------------------------------------------
  hoja.mergeCells("B4:L4");
  const titulo = hoja.getCell("B4");
  titulo.value = `LIQUIDACIÓN CAJA CHICA AREA DE ${d.cajaNombre.toUpperCase()} - ${d.empresa.toUpperCase()}`;
  titulo.font = { name: "Century Gothic", size: 16, bold: true, underline: true };
  titulo.alignment = { horizontal: "center" };

  hoja.mergeCells("B5:L5");
  const sub = hoja.getCell("B5");
  const periodo = d.fechaCierre
    ? `del ${fechaPie(d.fechaInicio).replaceAll(".", "/")} al ${fechaPie(d.fechaCierre).replaceAll(".", "/")}`
    : `desde el ${fechaPie(d.fechaInicio).replaceAll(".", "/")} (abierta)`;
  sub.value = `Folio ${d.folio} · ${periodo}`;
  estilo(sub);
  sub.alignment = { horizontal: "center" };

  // --- Ingresos ---------------------------------------------------------------
  let fila = 6;
  estilo(Object.assign(hoja.getCell(`B${fila}`), { value: " * INGRESOS" }), { negrita: true, tam: 16 });
  fila += 1;
  hoja.mergeCells(`C${fila}:D${fila}`);
  hoja.mergeCells(`E${fila}:F${fila}`);
  cabeceras(fila, [
    ["B", "FECHA DEPOSITO"], ["C", "DESCRIPCION BANCO"], ["E", "RECIBO"], ["G", "OPERACIÓN"],
    ["H", "BANCO"], ["I", "EFECTIVO"], ["J", "OTROS"], ["K", "TOTAL INGRESO"],
  ]);
  const primeraIngreso = fila + 1;

  const filaIngreso = (valores: {
    fecha: string | null; descripcion: string; recibo?: string | null; operacion?: string | null;
    banco?: number | null; efectivo?: number | null; otros?: number | null; total?: number;
  }) => {
    fila += 1;
    hoja.mergeCells(`C${fila}:D${fila}`);
    hoja.mergeCells(`E${fila}:F${fila}`);
    const set = (col: string, valor: ExcelJS.CellValue, formato?: string) => {
      const c = hoja.getCell(`${col}${fila}`);
      c.value = valor;
      estilo(c, { formato });
      c.border = BORDE;
    };
    set("B", valores.fecha ? aFecha(valores.fecha) : null, FECHA);
    set("C", valores.descripcion);
    set("E", valores.recibo ?? null);
    set("G", valores.operacion ?? null);
    set("H", valores.banco ?? null, CONTABLE);
    set("I", valores.efectivo ?? null, CONTABLE);
    set("J", valores.otros ?? null, CONTABLE);
    // Saldo anterior: solo total. Depósitos: total = suma de BANCO + EFECTIVO + OTROS.
    const suma = (valores.banco ?? 0) + (valores.efectivo ?? 0) + (valores.otros ?? 0);
    set(
      "K",
      valores.total !== undefined ? valores.total : { formula: `SUM(H${fila}:J${fila})`, result: suma },
      CONTABLE,
    );
  };

  filaIngreso({
    fecha: d.fechaInicio,
    descripcion: d.folioAnterior ? `Saldo liquidación anterior ${d.folioAnterior}` : "Saldo inicial",
    total: d.saldoInicial,
  });
  for (const i of d.ingresos) {
    filaIngreso({
      fecha: i.fecha,
      descripcion: [i.descripcion, i.banco].filter(Boolean).join(" · "),
      recibo: i.recibo,
      operacion: i.operacion,
      banco: i.forma === "banco" ? i.monto : null,
      efectivo: i.forma === "efectivo" ? i.monto : null,
      otros: i.forma === "otros" ? i.monto : null,
    });
  }
  const ultimaIngreso = fila;
  fila += 1;
  estilo(Object.assign(hoja.getCell(`B${fila}`), { value: "TOTALES" }), { negrita: true });
  const totalIngreso = hoja.getCell(`K${fila}`);
  totalIngreso.value = { formula: `SUM(K${primeraIngreso}:K${ultimaIngreso})`, result: sumaIngresos };
  estilo(totalIngreso, { negrita: true, formato: CONTABLE });
  totalIngreso.border = BORDE;
  const refTotalIngreso = `K${fila}`;

  // --- Egresos ----------------------------------------------------------------
  fila += 2;
  estilo(Object.assign(hoja.getCell(`B${fila}`), { value: "* EGRESOS" }), { negrita: true, tam: 16 });
  fila += 2;
  cabeceras(fila, [
    ["B", "FECHA"], ["C", "SOLICITANTE"], ["D", "RAZON SOCIAL"], ["E", "RUC / DNI"],
    ["F", "DETALLE COMPRA"], ["G", "FACTURA"], ["H", "BOL. VTA"], ["I", "REC X HON."],
    ["J", "OTROS"], ["K", "YAPE/PLIN"], ["L", "IMPORTE"], ["M", "CENTRO COSTO"],
  ]);
  const primeraEgreso = fila + 1;

  for (const e of d.egresos) {
    fila += 1;
    const set = (col: string, valor: ExcelJS.CellValue, formato?: string) => {
      const c = hoja.getCell(`${col}${fila}`);
      c.value = valor;
      estilo(c, { formato });
      c.border = BORDE;
      c.alignment = { vertical: "top", wrapText: col === "D" || col === "F" };
    };
    for (const col of ["G", "H", "I", "J"]) set(col, null);
    set("B", aFecha(e.fecha), FECHA);
    set("C", e.solicitante);
    set("D", e.razonSocial ?? "Por definir");
    set("E", e.numDoc); // texto: conserva ceros y evita notación científica
    set("F", e.detalle);
    if (e.tipoDocumento) {
      const prefijo = PREFIJO_OTROS[e.tipoDocumento];
      const numero = e.serieNumero ?? (e.tipoDocumento === "otro" ? "Otro" : "S/N");
      set(COLUMNA_DOCUMENTO[e.tipoDocumento], prefijo ? `${prefijo} ${numero}` : numero);
    }
    set("K", textoYape(e));
    set("L", e.monto, CONTABLE);
    set("M", e.centroCosto);
  }
  if (d.egresos.length === 0) fila += 1; // deja una fila vacía para que el SUM tenga rango
  const ultimaEgreso = fila;
  fila += 2; // una fila en blanco antes del total, como el formato original
  const totalEgreso = hoja.getCell(`L${fila}`);
  totalEgreso.value = { formula: `SUM(L${primeraEgreso}:L${ultimaEgreso})`, result: sumaEgresos };
  estilo(totalEgreso, { negrita: true, formato: CONTABLE });
  totalEgreso.border = BORDE;
  const refTotalEgreso = `L${fila}`;

  // --- Resumen ----------------------------------------------------------------
  fila += 2;
  estilo(
    Object.assign(hoja.getCell(`B${fila}`), {
      value: `${d.ciudad.toUpperCase()} ${fechaPie(d.fechaCierre ?? d.fechaInicio)}`,
    }),
  );
  const resumen: [string, string, number, boolean][] = [
    ["INGRESO", `+${refTotalIngreso}`, sumaIngresos, false],
    ["EGRESO", `+${refTotalEgreso}`, sumaEgresos, false],
    ["POR REEMBOLSAR", `+F${fila + 1}-F${fila + 2}`, redondear(sumaIngresos - sumaEgresos), true],
  ];
  for (const [etiqueta, formula, result, negrita] of resumen) {
    fila += 1;
    const et = hoja.getCell(`D${fila}`);
    et.value = etiqueta;
    estilo(et, { negrita });
    et.border = BORDE;
    const val = hoja.getCell(`F${fila}`);
    val.value = { formula, result };
    estilo(val, { negrita, formato: CONTABLE });
    val.border = BORDE;
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}

export function nombreArchivoLiquidacion(d: Pick<DatosLiquidacionExcel, "folio">): string {
  return `Liquidacion_${d.folio}.xlsx`;
}
