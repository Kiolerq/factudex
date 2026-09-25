import { z } from "zod";
import { MEDIOS_PAGO, MIME_PERMITIDOS, TIPOS_DOCUMENTO } from "./tipos";

export const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB, igual que el bucket

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const EsquemaAdjunto = z.object({
  tipo: z.enum(["documento", "pago", "otro"]),
  storagePath: z.string().min(1).max(300),
  mimeType: z.enum(MIME_PERMITIDOS),
  tamanoBytes: z.number().int().positive().max(TAMANO_MAXIMO),
});

export const EsquemaNuevoMovimiento = z
  .object({
    id: z.uuid(),
    cajaId: z.uuid(),
    fecha: z.iso.date("Fecha inválida"),
    solicitante: textoOpcional(120),
    proveedorId: z.uuid().nullable(),
    categoriaId: z.uuid("Elige una categoría"),
    centroCostoId: z.uuid().nullable(),
    detalle: z.string().trim().min(3, "Describe el gasto").max(300),
    monto: z
      .number("Ingresa el monto")
      .positive("El monto debe ser mayor a 0")
      .max(100000, "Monto demasiado alto para caja chica")
      .refine((m) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-6, "Máximo 2 decimales"),
    tipoDocumento: z.enum(TIPOS_DOCUMENTO).nullable(),
    serieNumero: textoOpcional(40),
    medioPago: z.enum(MEDIOS_PAGO).nullable(),
    operacionPago: textoOpcional(40),
    sinDocumento: z.boolean(),
    adjuntos: z.array(EsquemaAdjunto).max(6),
  })
  .superRefine((m, ctx) => {
    if (!m.sinDocumento) {
      if (!m.proveedorId)
        ctx.addIssue({ code: "custom", path: ["proveedorId"], message: "Elige un proveedor" });
      if (!m.tipoDocumento)
        ctx.addIssue({ code: "custom", path: ["tipoDocumento"], message: "Elige el tipo de documento" });
    }
    if (m.fecha > fechaHoyLima())
      ctx.addIssue({ code: "custom", path: ["fecha"], message: "La fecha no puede ser futura" });
  }, {
    // Por defecto zod no corre esta regla si otro campo ya falló; así se muestran todos los errores juntos.
    when: (p) => {
      const v = p.value as Record<string, unknown> | undefined;
      return typeof v?.sinDocumento === "boolean" && typeof v?.fecha === "string";
    },
  });

export type EntradaMovimiento = z.input<typeof EsquemaNuevoMovimiento>;

export const EsquemaNuevoProveedor = z
  .object({
    tipoDoc: z.enum(["RUC", "DNI", "CE", "OTRO"]),
    numDoc: z.string().trim().toUpperCase().min(1, "Ingresa el número de documento").max(20),
    razonSocial: z.string().trim().min(2, "Ingresa la razón social o nombre").max(200),
  })
  .superRefine((p, ctx) => {
    if (p.tipoDoc === "RUC" && !/^(10|15|17|20)\d{9}$/.test(p.numDoc))
      ctx.addIssue({ code: "custom", path: ["numDoc"], message: "RUC inválido (11 dígitos)" });
    if (p.tipoDoc === "DNI" && !/^\d{8}$/.test(p.numDoc))
      ctx.addIssue({ code: "custom", path: ["numDoc"], message: "DNI inválido (8 dígitos)" });
  });

/** Fecha de hoy en Lima, formato YYYY-MM-DD. */
export function fechaHoyLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

/** Convierte errores de zod a { campo: mensaje } para mostrarlos junto a cada input. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "_");
    salida[campo] ??= issue.message;
  }
  return salida;
}
