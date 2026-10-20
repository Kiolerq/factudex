import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import { normalizarExtraccion, RespuestaModeloOcr, type ExtraccionComprobante } from "./esquema";

// Lectura de comprobantes con Claude (visión). La API key vive solo en el servidor.
export const MODELO_OCR = process.env.OCR_MODELO || "claude-opus-5-5";

export function ocrConfigurado(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export class ErrorOcr extends Error {}

const INSTRUCCIONES = `Lees comprobantes de gastos de caja chica de empresas peruanas (soles, SUNAT) para pre-llenar un formulario que una persona revisa antes de guardar.

Puede llegarte:
- Un comprobante: factura, boleta de venta, recibo por honorarios (rxh), planilla de movilidad, comprobante de egreso, ticket u otro.
- Una constancia de pago: captura de Yape o Plin, voucher o constancia de transferencia bancaria. En ese caso es_captura_yape = true.
- Algo que no es ninguna de las dos cosas: es_comprobante = false y el resto en null.

Reglas:
- Nunca inventes. Si un dato no se ve o no se lee con claridad, devuelve null.
- monto: el importe TOTAL pagado (con IGV), como número sin símbolo. En una constancia de pago, el monto enviado.
- fecha: la fecha de emisión (o de la operación en una constancia) en formato AAAA-MM-DD. Los comprobantes peruanos escriben dd/mm/aaaa. Si falta el año, usa el de la fecha de hoy que se te indica.
- proveedor_num_doc: el RUC (11 dígitos) o DNI (8 dígitos) del EMISOR, solo dígitos. No el del cliente/adquiriente. En una constancia de pago, normalmente null.
- proveedor_razon_social: la razón social o nombre del emisor tal como aparece. En una constancia de pago, el nombre de quien recibe el dinero.
- serie_numero: serie y correlativo del comprobante, ej. F001-00012345, B002-123, E001-45.
- tipo_documento: "factura" (serie F/E…), "boleta" (boleta de venta, serie B), "rxh" (recibo por honorarios), "planilla_movilidad", "comprobante_egreso", u "otro". En una constancia de pago: null.
- concepto: qué se compró o pagó, breve y claro (máx. 80 caracteres), ej. "Peaje 3 ejes", "Combustible diésel 10 gal".
- medio_pago: "yape", "plin", "transferencia", "efectivo" u "otro" solo si se ve en la imagen; si no, null.
- numero_operacion: el N° de operación de Yape/Plin/transferencia, si aparece.
- confianza: de 0 a 1, qué tan seguro estás de los datos principales (monto, fecha, proveedor). Baja si la imagen está borrosa, cortada o es manuscrita.`;

/** Lee una imagen o PDF y devuelve los datos para pre-llenar. Lanza ErrorOcr con un mensaje para el usuario. */
export async function leerComprobante(datos: Buffer, mime: string): Promise<ExtraccionComprobante> {
  const base64 = datos.toString("base64");
  const archivo: Anthropic.Beta.BetaContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : {
          type: "image",
          source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp", data: base64 },
        };

  const cliente = new Anthropic();
  let respuesta;
  try {
    respuesta = await cliente.beta.messages.parse({
      model: MODELO_OCR,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // si el modelo declina, la API reintenta con el modelo de respaldo recomendado
      output_config: { effort: "low", format: betaZodOutputFormat(RespuestaModeloOcr) },
      system: INSTRUCCIONES,
      messages: [
        {
          role: "user",
          content: [archivo, { type: "text", text: `Fecha de hoy: ${fechaHoyLima()}. Extrae los datos.` }],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorOcr("La clave de la IA no es válida. Avisa al administrador.");
    if (e instanceof Anthropic.RateLimitError) throw new ErrorOcr("La IA está ocupada. Intenta en un momento.");
    if (e instanceof Anthropic.BadRequestError) throw new ErrorOcr("La IA no pudo abrir este archivo.");
    if (e instanceof Anthropic.APIError) throw new ErrorOcr("La IA no respondió. Intenta de nuevo.");
    throw e;
  }

  if (respuesta.stop_reason === "refusal") throw new ErrorOcr("La IA no pudo leer este archivo.");
  if (!respuesta.parsed_output) throw new ErrorOcr("La IA no devolvió datos legibles.");
  return normalizarExtraccion(respuesta.parsed_output);
}
