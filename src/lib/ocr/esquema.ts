import { z } from "zod";

// Fase 2 — contrato de la lectura automática de comprobantes.
// El modelo de IA con visión devuelve este JSON; SOLO se usa para pre-llenar el formulario.
// Nunca se guarda un movimiento sin confirmación explícita del usuario.
export const ExtraccionComprobante = z.object({
  monto: z.number().positive().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), // ISO YYYY-MM-DD
  proveedor_razon_social: z.string().nullable(),
  proveedor_num_doc: z.string().regex(/^(\d{8}|\d{11})$/).nullable(), // DNI (8) o RUC (11)
  tipo_documento: z
    .enum(["factura", "boleta", "rxh", "planilla_movilidad", "comprobante_egreso", "otro"])
    .nullable(),
  serie_numero: z.string().nullable(), // ej. F001-00012345
  concepto: z.string().nullable(),
  es_captura_yape: z.boolean(),
  confianza: z.number().min(0).max(1), // autoevaluación del modelo, para resaltar campos dudosos
});

export type ExtraccionComprobante = z.infer<typeof ExtraccionComprobante>;
