import { ETIQUETA_DOCUMENTO, ETIQUETA_MEDIO_PAGO, type MovimientoResumen } from "@/lib/datos/tipos";

/** Columna "Documento": el tipo, o qué falta si está pendiente (como en el diseño aprobado). */
export function textoDocumento(m: MovimientoResumen): { texto: string; falta: boolean } {
  if (m.anulado) return { texto: "Anulado", falta: false };
  if (m.porAutorizar && !m.faltaDocumento && !m.faltaPago) return { texto: "Supera el tope · por autorizar", falta: true };
  const medio = m.medioPago ? ETIQUETA_MEDIO_PAGO[m.medioPago] : null;
  const tipo = m.tipoDocumento ? ETIQUETA_DOCUMENTO[m.tipoDocumento] : null;
  if (m.faltaDocumento) return { texto: medio ? `${medio} · sin comprobante` : "Sin documento", falta: true };
  if (m.faltaPago) return { texto: `${tipo ?? "Documento"} · falta constancia de pago`, falta: true };
  return { texto: tipo ?? "Documento", falta: false };
}

/** Qué le falta a un pendiente, en palabras. */
export function textoFalta(m: Pick<MovimientoResumen, "faltaDocumento" | "faltaPago">): string {
  if (m.faltaDocumento && m.faltaPago) return "Falta el documento y la constancia de pago";
  if (m.faltaDocumento) return "Falta el documento";
  if (m.faltaPago) return "Falta la constancia de pago";
  return "Completo";
}
