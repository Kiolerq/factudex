// Tipos de dominio compartidos por servidor y cliente (camelCase; la BD usa snake_case).

export type CodigoEmpresa = "SL" | "SIPE";

export const TIPOS_DOCUMENTO = [
  "factura",
  "boleta",
  "rxh",
  "planilla_movilidad",
  "comprobante_egreso",
  "otro",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ETIQUETA_DOCUMENTO: Record<TipoDocumento, string> = {
  factura: "Factura",
  boleta: "Boleta de venta",
  rxh: "Recibo x honorarios",
  planilla_movilidad: "Planilla de movilidad",
  comprobante_egreso: "Comprobante de egreso",
  otro: "Otro",
};

export const MEDIOS_PAGO = ["efectivo", "yape", "plin", "transferencia", "otro"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  otro: "Otro",
};

export const MIME_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
export type MimePermitido = (typeof MIME_PERMITIDOS)[number];

export type TipoAdjunto = "documento" | "pago" | "otro";
export type EstadoMovimiento = "pendiente" | "completo";
export type TipoDocIdentidad = "RUC" | "DNI" | "CE" | "OTRO";

export interface Usuario {
  id: string;
  nombre: string;
  email: string | null;
}

export interface Empresa {
  id: string;
  codigo: CodigoEmpresa;
  sigla: string;
  nombreCorto: string;
  razonSocial: string;
}

export interface CajaSaldo {
  id: string;
  empresaId: string;
  empresaCodigo: CodigoEmpresa;
  numero: number;
  area: string;
  nombre: string;
  umbralAlerta: number;
  saldo: number;
  bajoUmbral: boolean;
  pendientes: number;
}

export interface Opcion {
  id: string;
  nombre: string;
  codigo?: string;
}

export interface Proveedor {
  id: string;
  tipoDoc: TipoDocIdentidad;
  numDoc: string;
  razonSocial: string;
  nombreComercial: string | null;
}

export interface AdjuntoSubido {
  tipo: TipoAdjunto;
  storagePath: string;
  mimeType: MimePermitido;
  tamanoBytes: number;
}

export interface NuevoMovimiento {
  id: string;
  cajaId: string;
  fecha: string; // YYYY-MM-DD
  solicitante: string | null;
  proveedorId: string | null;
  categoriaId: string;
  centroCostoId: string | null;
  detalle: string;
  monto: number;
  tipoDocumento: TipoDocumento | null;
  serieNumero: string | null;
  medioPago: MedioPago | null;
  operacionPago: string | null; // N° de operación Yape/Plin/transferencia
  adjuntos: AdjuntoSubido[];
}

export interface NuevoProveedor {
  tipoDoc: TipoDocIdentidad;
  numDoc: string;
  razonSocial: string;
}

/** Misma regla que fx_estado_movimiento() en la BD; en el cliente solo se usa para la vista previa. */
export function estadoEsperado(
  tieneDocumento: boolean,
  tienePago: boolean,
  medioPago: MedioPago | null,
): EstadoMovimiento {
  return tieneDocumento && (medioPago === "efectivo" || tienePago) ? "completo" : "pendiente";
}

export function nombreCaja(caja: Pick<CajaSaldo, "numero" | "nombre">) {
  return `Caja ${String(caja.numero).padStart(2, "0")} · ${caja.nombre}`;
}
