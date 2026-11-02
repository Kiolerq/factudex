import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Empresa, Planilla } from "@/lib/datos/tipos";

// Planilla por gasto de movilidad en PDF, con el formato que usa la empresa
// (docs/plantillas: PLANILLAS_MOVILIDAD_SL.xlsx): serie y correlativo, razón social, RUC, periodo,
// la tabla con firma por fila, el total y la base legal. Se imprime y se firma; sin firma igual vale
// para la liquidación.

const A4 = { ancho: 842, alto: 595 }; // horizontal
const MARGEN = 30;
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.92, 0.92, 0.92);

// Anchos relativos de las columnas (los del Excel original).
const COLUMNAS = [
  { clave: "fecha", titulo: "FECHA DE GASTO", ancho: 15.4 },
  { clave: "trabajador", titulo: "TRABAJADOR", ancho: 30 },
  { clave: "dni", titulo: "NRO DE DNI", ancho: 12.6 },
  { clave: "motivo", titulo: "MOTIVO", ancho: 20 },
  { clave: "origen", titulo: "ORIGEN", ancho: 22 },
  { clave: "destino", titulo: "DESTINO", ancho: 22 },
  { clave: "importe", titulo: "IMPORTE", ancho: 11.3 },
  { clave: "firma", titulo: "FIRMA", ancho: 17 },
  { clave: "tipo", titulo: "TIPO", ancho: 7 },
] as const;

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");
const importe = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Recorta el texto para que entre en el ancho (con "…"). */
function ajustar(texto: string, fuente: PDFFont, tam: number, ancho: number): string {
  if (fuente.widthOfTextAtSize(texto, tam) <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}…`, tam) > ancho) t = t.slice(0, -1);
  return `${t}…`;
}

function texto(
  pag: PDFPage,
  t: string,
  x: number,
  y: number,
  o: { fuente: PDFFont; tam?: number; ancho?: number; alinear?: "izq" | "centro" | "der" },
) {
  const tam = o.tam ?? 9;
  const valor = o.ancho ? ajustar(t, o.fuente, tam, o.ancho - 6) : t;
  const w = o.fuente.widthOfTextAtSize(valor, tam);
  const dx = !o.ancho ? 0 : o.alinear === "centro" ? (o.ancho - w) / 2 : o.alinear === "der" ? o.ancho - w - 3 : 3;
  pag.drawText(valor, { x: x + dx, y, size: tam, font: o.fuente, color: NEGRO });
}

function caja(pag: PDFPage, x: number, y: number, w: number, h: number, relleno?: boolean) {
  pag.drawRectangle({ x, y, width: w, height: h, borderColor: NEGRO, borderWidth: 0.6, color: relleno ? GRIS : undefined });
}

export async function planillaPdf(p: Planilla, empresa: Pick<Empresa, "razonSocial" | "ruc">): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Planilla de movilidad ${p.serie}-${p.numero}`);
  doc.setCreator("Factudex");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

  const util = A4.ancho - 2 * MARGEN;
  const total = COLUMNAS.reduce((t, c) => t + c.ancho, 0);
  const anchos = COLUMNAS.map((c) => (c.ancho / total) * util);
  const xs = anchos.reduce<number[]>((acc, w, i) => [...acc, (acc[i] ?? MARGEN) + w], [MARGEN]);

  const FILA = 20;
  const porPagina = 14;
  const paginas = Math.max(1, Math.ceil(p.filas.length / porPagina));

  for (let n = 0; n < paginas; n++) {
    const pag = doc.addPage([A4.ancho, A4.alto]);
    let y = A4.alto - MARGEN;

    // Serie y correlativo (arriba a la derecha).
    const xSerie = MARGEN + util - 190;
    caja(pag, xSerie, y - 18, 95, 18, true);
    caja(pag, xSerie + 95, y - 18, 95, 18, true);
    texto(pag, "SERIE", xSerie, y - 13, { fuente: negrita, ancho: 95, alinear: "centro" });
    texto(pag, "CORRELATIVO", xSerie + 95, y - 13, { fuente: negrita, ancho: 95, alinear: "centro" });
    caja(pag, xSerie, y - 40, 95, 22);
    caja(pag, xSerie + 95, y - 40, 95, 22);
    texto(pag, p.serie, xSerie, y - 33, { fuente: negrita, tam: 12, ancho: 95, alinear: "centro" });
    texto(pag, String(p.numero), xSerie + 95, y - 33, { fuente: negrita, tam: 12, ancho: 95, alinear: "centro" });

    // Título.
    texto(pag, "PLANILLA POR GASTO DE MOVILIDAD", MARGEN, y - 33, { fuente: negrita, tam: 15 });

    // Tipo de transporte (leyenda).
    const xTipo = xSerie;
    y -= 58;
    texto(pag, "TIPO", xTipo, y, { fuente: negrita, tam: 8 });
    ["T: Taxi", "B: Bus", "C: Colectivo", "Combi"].forEach((t, i) => texto(pag, t, xTipo, y - 11 * (i + 1), { fuente: normal, tam: 8 }));

    // Datos de la empresa.
    const filasCab: [string, string][] = [
      ["RAZÓN SOCIAL", empresa.razonSocial.toUpperCase()],
      ["RUC", empresa.ruc ?? ""],
      ["PERIODO", `${Number(p.fechaEmision.slice(5, 7))} - ${p.fechaEmision.slice(0, 4)}`],
    ];
    filasCab.forEach(([k, v], i) => {
      const yy = y - 13 * i;
      texto(pag, k, MARGEN, yy, { fuente: negrita, tam: 9 });
      texto(pag, ":", MARGEN + 82, yy, { fuente: negrita, tam: 9 });
      texto(pag, v, MARGEN + 92, yy, { fuente: normal, tam: 9 });
    });
    texto(pag, "FECHA DE EMISIÓN :", MARGEN + 330, y, { fuente: negrita, tam: 9 });
    texto(pag, fechaCorta(p.fechaEmision), MARGEN + 425, y, { fuente: normal, tam: 9 });

    // Cabecera de la tabla (dos filas: DESPLAZAMIENTO agrupa motivo, origen y destino).
    y -= 62;
    const yCab = y;
    const altoCab = 30;
    COLUMNAS.forEach((c, i) => {
      const esDesplazamiento = c.clave === "motivo" || c.clave === "origen" || c.clave === "destino";
      if (esDesplazamiento) {
        caja(pag, xs[i]!, yCab - altoCab, anchos[i]!, altoCab / 2, true);
        texto(pag, c.titulo, xs[i]!, yCab - altoCab + 5, { fuente: negrita, tam: 8, ancho: anchos[i]!, alinear: "centro" });
      } else {
        caja(pag, xs[i]!, yCab - altoCab, anchos[i]!, altoCab, true);
        // Si no entra en una línea, va en dos (ej. "FECHA DE / GASTO").
        const enDos = negrita.widthOfTextAtSize(c.titulo, 8) > anchos[i]! - 6 && c.titulo.includes(" ");
        if (enDos) {
          const corte = c.titulo.lastIndexOf(" ");
          texto(pag, c.titulo.slice(0, corte), xs[i]!, yCab - altoCab / 2 + 2, { fuente: negrita, tam: 8, ancho: anchos[i]!, alinear: "centro" });
          texto(pag, c.titulo.slice(corte + 1), xs[i]!, yCab - altoCab / 2 - 8, { fuente: negrita, tam: 8, ancho: anchos[i]!, alinear: "centro" });
        } else {
          texto(pag, c.titulo, xs[i]!, yCab - altoCab / 2 - 3, { fuente: negrita, tam: 8, ancho: anchos[i]!, alinear: "centro" });
        }
      }
    });
    const xDesp = xs[3]!;
    const wDesp = anchos[3]! + anchos[4]! + anchos[5]!;
    caja(pag, xDesp, yCab - altoCab / 2, wDesp, altoCab / 2, true);
    texto(pag, "DESPLAZAMIENTO", xDesp, yCab - altoCab / 2 + 5, { fuente: negrita, tam: 8, ancho: wDesp, alinear: "centro" });

    // Filas.
    y = yCab - altoCab;
    for (const f of p.filas.slice(n * porPagina, (n + 1) * porPagina)) {
      const valores: Record<(typeof COLUMNAS)[number]["clave"], string> = {
        fecha: fechaCorta(f.fecha),
        trabajador: f.trabajador.toUpperCase(),
        dni: f.dni ?? "",
        motivo: f.motivo === "ALIMENTACION" ? "ALIMENTACIÓN" : "MOVILIDAD",
        origen: f.origen.toUpperCase(),
        destino: f.destino.toUpperCase(),
        importe: importe(f.importe),
        firma: "",
        tipo: f.tipo ?? "",
      };
      COLUMNAS.forEach((c, i) => {
        caja(pag, xs[i]!, y - FILA, anchos[i]!, FILA);
        texto(pag, valores[c.clave], xs[i]!, y - FILA + 7, {
          fuente: normal,
          tam: 8.5,
          ancho: anchos[i]!,
          alinear: c.clave === "importe" ? "der" : c.clave === "trabajador" || c.clave === "origen" || c.clave === "destino" ? "izq" : "centro",
        });
      });
      y -= FILA;
    }

    // Total (solo en la última hoja).
    if (n === paginas - 1) {
      caja(pag, xs[5]!, y - FILA, anchos[5]!, FILA, true);
      texto(pag, "TOTAL", xs[5]!, y - FILA + 7, { fuente: negrita, tam: 9, ancho: anchos[5]!, alinear: "der" });
      caja(pag, xs[6]!, y - FILA, anchos[6]!, FILA, true);
      texto(pag, importe(p.total), xs[6]!, y - FILA + 7, { fuente: negrita, tam: 9, ancho: anchos[6]!, alinear: "der" });
      y -= FILA + 26;
      texto(pag, "BASE LEGAL", MARGEN, y, { fuente: negrita, tam: 9 });
      texto(pag, "-  Inciso a1) del artículo 37° del TUO de la Ley del Impuesto a la Renta", MARGEN, y - 13, { fuente: normal, tam: 8.5 });
      texto(pag, "-  Inciso v) del artículo 21° del Reglamento del TUO de la Ley del Impuesto a la Renta", MARGEN, y - 25, {
        fuente: normal,
        tam: 8.5,
      });
    }
    if (paginas > 1) texto(pag, `Hoja ${n + 1} de ${paginas}`, MARGEN + util - 60, MARGEN - 12, { fuente: normal, tam: 8 });
  }
  return doc.save();
}
