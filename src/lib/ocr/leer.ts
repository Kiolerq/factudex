import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { fechaHoyLima } from "@/lib/datos/esquemas";
import { normalizarExtraccion, RespuestaModeloOcr, type ExtraccionComprobante } from "./esquema";

// Lectura de comprobantes con IA (visión). Usa Gemini si hay GEMINI_API_KEY; si no, Claude con
// ANTHROPIC_API_KEY. Las claves viven solo en el servidor.
const PROVEEDOR_OCR: "gemini" | "claude" = process.env.GEMINI_API_KEY ? "gemini" : "claude";
export const MODELO_OCR = process.env.OCR_MODELO || (PROVEEDOR_OCR === "gemini" ? "gemini-3.6-flash" : "claude-opus-5-5");
/** Si el modelo de Gemini está saturado o sin cupo, se prueba el siguiente (cada uno tiene su cupo gratis). */
const RESPALDO_GEMINI = ["gemini-3.6-flash", "gemini-3.8-flash"];

export function ocrConfigurado(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export class ErrorOcr extends Error {}

const INSTRUCCIONES = `Lees comprobantes de gastos de caja chica de empresas peruanas (soles, SUNAT) para pre-llenar un formulario que una persona revisa antes de guardar.

Puede llegarte:
- Un comprobante: factura, boleta de venta, recibo por honorarios (rxh), planilla de movilidad, comprobante de egreso, ticket u otro.
- Una constancia de pago: captura de Yape o Plin, voucher o constancia de transferencia bancaria. En ese caso es_captura_yape = true.
- Algo que no es ninguna de las dos cosas: es_comprobante = false y el resto en null.
es_comprobante = true tanto para un comprobante como para una constancia de pago (Yape, Plin, transferencia); solo es false si no es ninguna de las dos.

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
- categoria: el nombre EXACTO de una de las categorías de la lista que se te da, según lo que se compró o pagó (ej. un peaje → "Peajes", combustible → "Combustible"). Si no se te da lista o ninguna encaja, null.
- centro_costo: solo si el comprobante menciona una placa de vehículo (ej. T1Y-461, CAE899) o un área/destino del gasto. Si coincide con uno de la lista de centros de costo que se te da, devuelve su nombre EXACTO; si es una placa que no está en la lista, devuélvela tal como aparece. Si no menciona nada, null (no adivines).
- confianza: de 0 a 1, qué tan seguro estás de los datos principales (monto, fecha, proveedor). Baja si la imagen está borrosa, cortada o es manuscrita.`;

/** Listas de la empresa para que la IA elija categoría y centro de costo (texto exacto). */
export interface ContextoLectura {
  categorias: string[];
  centrosCosto: string[];
}

/** Lee una imagen o PDF y devuelve los datos para pre-llenar. Lanza ErrorOcr con un mensaje para el usuario. */
export async function leerComprobante(datos: Buffer, mime: string, contexto?: ContextoLectura): Promise<ExtraccionComprobante> {
  return PROVEEDOR_OCR === "gemini" ? leerConGemini(datos, mime, contexto) : leerConClaude(datos, mime, contexto);
}

// Las listas van en el mensaje (no en las instrucciones fijas) para no romper el caché del prompt.
const pedido = (contexto?: ContextoLectura) =>
  [
    `Fecha de hoy: ${fechaHoyLima()}.`,
    contexto?.categorias.length ? `Categorías: ${contexto.categorias.join(" | ")}` : "",
    contexto?.centrosCosto.length ? `Centros de costo: ${contexto.centrosCosto.join(" | ")}` : "",
    "Extrae los datos.",
  ]
    .filter(Boolean)
    .join("\n");

// El esquema se arma una vez; Gemini no necesita la clave "$schema".
const { $schema: _, ...ESQUEMA_JSON } = z.toJSONSchema(RespuestaModeloOcr);

async function leerConGemini(datos: Buffer, mime: string, contexto?: ContextoLectura): Promise<ExtraccionComprobante> {
  // Gemini responde 503 seguido cuando está saturado: 2 intentos por modelo y luego el de respaldo
  // (la ruta tiene 60 s).
  const cliente = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 2, httpStatusCodes: [500, 502, 503, 504] } },
  });
  const modelos = [MODELO_OCR, ...RESPALDO_GEMINI.filter((m) => m !== MODELO_OCR)];
  let respuesta;
  for (const [i, modelo] of modelos.entries()) {
    try {
      respuesta = await cliente.models.generateContent({
        model: modelo,
        contents: [
          { role: "user", parts: [{ inlineData: { mimeType: mime, data: datos.toString("base64") } }, { text: pedido(contexto) }] },
        ],
        config: {
          systemInstruction: INSTRUCCIONES,
          responseMimeType: "application/json",
          responseJsonSchema: ESQUEMA_JSON,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      break;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      const saturado = e.status === 429 || e.status >= 500;
      if (saturado && i < modelos.length - 1) continue;
      // Google responde 400 (motivo API_KEY_INVALID) cuando la clave no sirve.
      if (e.status === 401 || e.status === 403 || e.message.includes("API_KEY_INVALID")) throw new ErrorOcr("La clave de la IA no es válida. Avisa al administrador.");
      if (e.status === 429) throw new ErrorOcr("Se acabó el cupo gratis de la IA por ahora. Intenta en un rato.");
      if (e.status === 400) throw new ErrorOcr("La IA no pudo abrir este archivo.");
      if (e.status === 503) throw new ErrorOcr("La IA de Google está saturada. Intenta en un momento.");
      throw new ErrorOcr("La IA no respondió. Intenta de nuevo.");
    }
  }
  if (!respuesta) throw new ErrorOcr("La IA no respondió. Intenta de nuevo.");

  const texto = respuesta.text;
  if (!texto) throw new ErrorOcr("La IA no pudo leer este archivo.");
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErrorOcr("La IA no devolvió datos legibles.");
  }
  const leido = RespuestaModeloOcr.safeParse(json);
  if (!leido.success) throw new ErrorOcr("La IA no devolvió datos legibles.");
  return normalizarExtraccion(leido.data);
}

async function leerConClaude(datos: Buffer, mime: string, contexto?: ContextoLectura): Promise<ExtraccionComprobante> {
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
          content: [archivo, { type: "text", text: pedido(contexto) }],
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
