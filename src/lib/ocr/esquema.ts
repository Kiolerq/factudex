import { z } from "zod";
import { MEDIOS_PAGO, TIPOS_DOCUMENTO } from "@/lib/datos/tipos";

// Contrato de la lectura automática de comprobantes (fase 2).
// SOLO pre-llena el formulario: nunca se guarda un movimiento sin que el usuario lo confirme.

/**
 * Lo que se le pide al modelo (salida estructurada). Sin regex ni rangos: la salida estructurada
 * no los admite todos; se validan después en `normalizarExtraccion`.
 */
export const RespuestaModeloOcr = z.object({
  es_comprobante: z.boolean(), // false si la imagen no es un comprobante ni una constancia de pago
  es_captura_yape: z.boolean(), // captura de Yape/Plin/transferencia (constancia de pago)
  tipo_documento: z.enum(TIPOS_DOCUMENTO).nullable(),
  serie_numero: z.string().nullable(),
  fecha: z.string().nullable(),
  monto: z.number().nullable(),
  proveedor_num_doc: z.string().nullable(),
  proveedor_razon_social: z.string().nullable(),
  concepto: z.string().nullable(),
  medio_pago: z.enum(MEDIOS_PAGO).nullable(),
  numero_operacion: z.string().nullable(),
  categoria: z.string().nullable(), // de la lista de categorías que se le pasa
  centro_costo: z.string().nullable(), // de la lista de centros, o la placa/área tal como aparece
  confianza: z.number(),
});

export const ExtraccionComprobante = z.object({
  es_comprobante: z.boolean(),
  es_captura_yape: z.boolean(),
  tipo_documento: z.enum(TIPOS_DOCUMENTO).nullable(),
  serie_numero: z.string().max(40).nullable(), // ej. F001-00012345
  fecha: z.iso.date().nullable(), // YYYY-MM-DD
  monto: z.number().positive().max(100000).nullable(),
  proveedor_num_doc: z.string().regex(/^(\d{8}|\d{11})$/).nullable(), // DNI (8) o RUC (11)
  proveedor_razon_social: z.string().max(200).nullable(),
  concepto: z.string().max(300).nullable(),
  medio_pago: z.enum(MEDIOS_PAGO).nullable(),
  numero_operacion: z.string().max(40).nullable(),
  categoria: z.string().max(80).nullable(),
  centro_costo: z.string().max(60).nullable(),
  confianza: z.number().min(0).max(1), // autoevaluación del modelo, para avisar si hay que revisar
});

export type ExtraccionComprobante = z.infer<typeof ExtraccionComprobante>;

const limpio = (s: string | null, max: number) => {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Deja en null lo que no cumpla el formato, en vez de rechazar toda la lectura. */
export function normalizarExtraccion(r: z.infer<typeof RespuestaModeloOcr>): ExtraccionComprobante {
  const doc = r.proveedor_num_doc?.replace(/\D/g, "") ?? "";
  const monto = r.monto !== null ? Math.round(r.monto * 100) / 100 : null;
  return {
    // Una constancia de pago también cuenta (algunos modelos la marcan como "no comprobante").
    es_comprobante: r.es_comprobante || r.es_captura_yape,
    es_captura_yape: r.es_captura_yape,
    tipo_documento: r.tipo_documento,
    serie_numero: limpio(r.serie_numero, 40)?.toUpperCase() ?? null,
    fecha: r.fecha && z.iso.date().safeParse(r.fecha).success ? r.fecha : null,
    monto: monto !== null && monto > 0 && monto <= 100000 ? monto : null,
    proveedor_num_doc: /^(\d{8}|\d{11})$/.test(doc) ? doc : null,
    proveedor_razon_social: limpio(r.proveedor_razon_social, 200),
    concepto: limpio(r.concepto, 300),
    medio_pago: r.medio_pago,
    numero_operacion: limpio(r.numero_operacion, 40),
    categoria: limpio(r.categoria, 80),
    centro_costo: limpio(r.centro_costo, 60),
    confianza: Math.min(1, Math.max(0, r.confianza)),
  };
}

/**
 * Lo que el servidor deduce de la lectura con los datos de la app (proveedores, listas de la
 * empresa, movimientos). Todo es sugerencia: el formulario solo llena campos vacíos.
 */
export interface SugerenciasLectura {
  proveedor: { id: string; tipoDoc: "RUC" | "DNI" | "CE" | "OTRO"; numDoc: string; razonSocial: string; nombreComercial: string | null } | null;
  proveedorPorNombre: boolean; // encontrado por parecido de nombre (sin RUC): revisar
  categoriaId: string | null;
  centroCostoId: string | null;
  centroCostoNuevo: string | null; // placa/área leída que no está en la lista: se ofrece agregarla
  duplicado: { id: string; detalle: string; fecha: string; monto: number } | null; // mismo RUC y N° ya registrado
}

/** Formatos que el modelo puede leer (HEIC no). */
export const MIME_LEGIBLES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
/** Tope del cuerpo de la petición en Vercel: ~4.5 MB. */
export const TAMANO_MAXIMO_OCR = 4 * 1024 * 1024;
