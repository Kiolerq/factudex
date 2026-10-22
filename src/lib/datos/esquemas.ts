import { z } from "zod";
import { MEDIOS_PAGO, MIME_PERMITIDOS, MODULOS, TIPOS_DOCUMENTO } from "./tipos";

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
  nombreArchivo: z.string().max(200).nullish(),
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

export const EsquemaCompletarMovimiento = z.object({
  id: z.uuid(),
  proveedorId: z.uuid().nullable(),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO).nullable(),
  serieNumero: textoOpcional(40),
  medioPago: z.enum(MEDIOS_PAGO).nullable(),
  operacionPago: textoOpcional(40),
  adjuntos: z.array(EsquemaAdjunto).max(4),
});
export type EntradaCompletar = z.input<typeof EsquemaCompletarMovimiento>;

/** Archivo compartido desde otra app que se junta a un gasto pendiente. */
export const EsquemaAdjuntarCompartido = z
  .object({
    id: z.uuid(),
    tipo: z.enum(["documento", "pago"]),
    subtipo: z.string(), // tipo de documento o medio de pago elegido
    adjunto: EsquemaAdjunto,
    leido: z
      .object({
        serieNumero: z.string().max(40).nullable(),
        numDoc: z.string().max(20).nullable(),
        operacion: z.string().max(40).nullable(),
      })
      .nullable(),
  })
  .refine(
    (a) =>
      a.adjunto.tipo === a.tipo &&
      (a.tipo === "documento"
        ? (TIPOS_DOCUMENTO as readonly string[]).includes(a.subtipo)
        : (MEDIOS_PAGO as readonly string[]).includes(a.subtipo) && a.subtipo !== "efectivo"),
    "Tipo de archivo inválido",
  );
export type EntradaAdjuntarCompartido = z.input<typeof EsquemaAdjuntarCompartido>;

export const EsquemaAnular = z.object({
  id: z.uuid(),
  motivo: z.string().trim().min(3, "Escribe el motivo de la anulación").max(300),
});

export const EsquemaRevision = z
  .object({
    id: z.uuid(),
    aprobar: z.boolean(),
    observaciones: textoOpcional(500),
  })
  .refine((r) => r.aprobar || r.observaciones, {
    path: ["observaciones"],
    message: "Escribe qué hay que corregir",
  });

export const EsquemaNuevaRecarga = z
  .object({
    cajaId: z.uuid(),
    tipo: z.enum(["apertura", "reposicion", "extraordinaria", "ajuste"]),
    liquidacionRepuestaId: z.uuid().nullable(),
    monto: z
      .number("Ingresa el monto")
      .refine((m) => m !== 0, "El monto no puede ser 0")
      .refine((m) => Math.abs(m) <= 1000000, "Monto demasiado alto")
      .refine((m) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-6, "Máximo 2 decimales"),
    fecha: z.iso.date("Fecha inválida"),
    descripcion: textoOpcional(200),
    forma: z.enum(["banco", "efectivo", "otros"]),
    banco: textoOpcional(60),
    operacion: textoOpcional(40),
    recibo: textoOpcional(40),
    nota: textoOpcional(300),
  })
  .superRefine((r, ctx) => {
    if (r.tipo !== "ajuste" && r.monto < 0)
      ctx.addIssue({ code: "custom", path: ["monto"], message: "El monto debe ser mayor a 0" });
    if ((r.tipo === "reposicion") !== !!r.liquidacionRepuestaId)
      ctx.addIssue({ code: "custom", path: ["tipo"], message: "La reposición va con la liquidación que repone" });
    if (r.fecha > fechaHoyLima())
      ctx.addIssue({ code: "custom", path: ["fecha"], message: "La fecha no puede ser futura" });
  });
export type EntradaRecarga = z.input<typeof EsquemaNuevaRecarga>;

const EsquemaDatosUsuario = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  esAdmin: z.boolean(),
  modulos: z.array(z.enum(MODULOS)).min(1, "Elige al menos un módulo").nullable(), // null = todos
  accesos: z.array(z.object({ cajaId: z.uuid(), rol: z.enum(["lector", "registrador", "aprobador"]) })).max(100),
});

export const EsquemaContrasena = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(72, "Máximo 72 caracteres");

export const EsquemaNuevoUsuario = EsquemaDatosUsuario.extend({
  email: z.string().trim().toLowerCase().pipe(z.email("Correo inválido")),
  password: EsquemaContrasena,
});
export type EntradaNuevoUsuario = z.input<typeof EsquemaNuevoUsuario>;

export const EsquemaCambiosUsuario = EsquemaDatosUsuario.extend({ id: z.uuid().or(z.literal("demo")), activo: z.boolean() });
export type EntradaCambiosUsuario = z.input<typeof EsquemaCambiosUsuario>;

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
