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

// Módulos que se pueden dar a cada usuario. El Panel lo ven todos; Tesorería va por rol (es_tesoreria).
export const MODULOS = ["registro", "pendientes", "historial", "liquidaciones"] as const;
export type Modulo = (typeof MODULOS)[number];

export const ETIQUETA_MODULO: Record<Modulo, string> = {
  registro: "Registro",
  pendientes: "Pendientes",
  historial: "Historial",
  liquidaciones: "Liquidaciones",
};

export interface Usuario {
  id: string;
  nombre: string;
  email: string | null;
  esAdmin: boolean;
  esTesoreria: boolean; // tesorería o admin: todas las cajas, ingresos, aprobación, autorizaciones
  activo: boolean;
  modulos: Modulo[]; // los que ve en la app (admin: todos)
}

export type RolCaja = "lector" | "registrador" | "aprobador";

export const ETIQUETA_ROL_CAJA: Record<RolCaja, string> = {
  lector: "Lector (solo ve)",
  registrador: "Registrador",
  aprobador: "Aprobador",
};

/** Usuario tal como lo ve el administrador. */
export interface UsuarioAdmin {
  id: string;
  nombre: string;
  email: string | null;
  esAdmin: boolean;
  esTesoreria: boolean;
  activo: boolean;
  modulos: Modulo[] | null; // null = todos
  accesos: { cajaId: string; rol: RolCaja }[];
  creado: string;
}

export interface DatosUsuario {
  nombre: string;
  esAdmin: boolean;
  esTesoreria: boolean;
  modulos: Modulo[] | null;
  accesos: { cajaId: string; rol: RolCaja }[];
}

export interface NuevoUsuario extends DatosUsuario {
  email: string;
  password: string;
}

export interface CambiosUsuario extends DatosUsuario {
  id: string;
  activo: boolean;
}

export interface Empresa {
  id: string;
  codigo: CodigoEmpresa;
  sigla: string;
  nombreCorto: string;
  razonSocial: string;
  ciudad: string; // pie de la liquidación: "TRUJILLO 24.09.2026"
  topeGasto: number; // máximo por gasto; más que esto queda "por autorizar" (tesorería)
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
  nombreArchivo?: string | null; // nombre legible (en Drive: el nombre del archivo)
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

// --- Historial, pendientes, liquidaciones y recargas ---

/** Qué puede hacer el usuario en una caja (accesos_caja; admin puede todo). */
export interface PermisosCaja {
  registrar: boolean; // registrar gastos, adjuntar, anular, cerrar liquidación
  aprobar: boolean; // aprobar/observar liquidaciones y registrar recargas
}

export type FiltroEstado = "todos" | "pendiente" | "completo" | "anulado" | "por_autorizar";

export interface FiltroMovimientos {
  cajaIds: string[];
  estado: FiltroEstado;
  texto: string; // proveedor, detalle, N° de documento o solicitante
  limite: number;
  desde?: string; // fecha del gasto (YYYY-MM-DD), inclusive
  hasta?: string;
}

export interface MovimientoResumen {
  id: string;
  cajaId: string;
  liquidacionId: string;
  fecha: string;
  detalle: string;
  monto: number;
  solicitante: string | null;
  proveedor: string | null; // razón social; null = "Por definir"
  proveedorDoc: string | null; // RUC / DNI
  categoria: string | null;
  centroCosto: string | null;
  tipoDocumento: TipoDocumento | null;
  serieNumero: string | null;
  medioPago: MedioPago | null;
  operacionPago: string | null;
  estado: EstadoMovimiento;
  anulado: boolean;
  faltaDocumento: boolean;
  faltaPago: boolean; // en efectivo nunca falta
  porAutorizar: boolean; // supera el tope de la empresa y tesorería aún no lo autoriza
}

export interface PaginaMovimientos {
  movimientos: MovimientoResumen[];
  total: number; // con el filtro aplicado, sin el límite
}

export interface AdjuntoGuardado {
  id: string;
  tipo: TipoAdjunto;
  mimeType: string;
  nombreArchivo: string | null;
  url: string | null; // /api/archivos/<id>; null en modo demo (no se guarda el archivo)
}

export type EstadoLiquidacion = "abierta" | "en_revision" | "observada" | "aprobada" | "repuesta";

export const ETIQUETA_LIQUIDACION: Record<EstadoLiquidacion, string> = {
  abierta: "Abierta",
  en_revision: "En revisión",
  observada: "Observada",
  aprobada: "Aprobada",
  repuesta: "Repuesta",
};

export interface DetalleMovimiento extends MovimientoResumen {
  proveedorId: string | null;
  motivoAnulacion: string | null;
  liquidacion: { id: string; folio: string; estado: EstadoLiquidacion };
  adjuntos: AdjuntoGuardado[];
}

/** Completa un movimiento pendiente: datos del documento y archivos que faltaban. */
export interface CompletarMovimiento {
  id: string;
  proveedorId: string | null;
  tipoDocumento: TipoDocumento | null;
  serieNumero: string | null;
  medioPago: MedioPago | null;
  operacionPago: string | null;
  adjuntos: AdjuntoSubido[];
}

export interface LiquidacionResumen {
  id: string;
  cajaId: string;
  folio: string;
  correlativo: number;
  estado: EstadoLiquidacion;
  fechaInicio: string;
  fechaCierre: string | null;
  saldoInicial: number;
  ingresos: number; // depósitos del periodo
  egresos: number; // solo movimientos completos (lo que se liquida)
  porReembolsar: number; // saldo inicial + ingresos − egresos
  numMovimientos: number;
  numIncompletos: number; // en la abierta: no entrarán al cierre
  montoIncompletos: number;
  observaciones: string | null;
}

export type TipoRecarga = "apertura" | "reposicion" | "extraordinaria" | "ajuste";
export type FormaIngreso = "banco" | "efectivo" | "otros";

export const ETIQUETA_TIPO_RECARGA: Record<TipoRecarga, string> = {
  apertura: "Apertura",
  reposicion: "Reposición",
  extraordinaria: "Extraordinaria",
  ajuste: "Ajuste",
};

export const ETIQUETA_FORMA_INGRESO: Record<FormaIngreso, string> = {
  banco: "Banco",
  efectivo: "Efectivo",
  otros: "Otros",
};

export interface Recarga {
  id: string;
  cajaId: string;
  tipo: TipoRecarga;
  monto: number;
  fecha: string;
  descripcion: string | null;
  forma: FormaIngreso;
  banco: string | null;
  operacion: string | null;
  recibo: string | null;
  nota: string | null;
  folioRepuesto: string | null; // liquidación que repone (solo en reposición)
}

export interface NuevaRecarga {
  cajaId: string;
  tipo: TipoRecarga;
  liquidacionRepuestaId: string | null;
  monto: number;
  fecha: string;
  descripcion: string | null;
  forma: FormaIngreso;
  banco: string | null;
  operacion: string | null;
  recibo: string | null;
  nota: string | null;
}

export interface DetalleLiquidacion extends LiquidacionResumen {
  folioAnterior: string | null;
  movimientos: MovimientoResumen[]; // en la abierta incluye los pendientes (no entrarán al cierre)
  recargas: Recarga[]; // ingresos del periodo
}

/** Clave para comparar centros de costo sin importar mayúsculas, tildes, espacios ni guiones (T1Y-461 = t1y 461). */
export function claveCentro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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

/** Código de la caja: SL-CAJA-MT-01 (empresa, área y número). */
/** Tesorería sin ser admin: ve Panel, Tesorería y Usuarios, no las pantallas del registrador. */
export const esSoloTesoreria = (u: Pick<Usuario, "esAdmin" | "esTesoreria">) => u.esTesoreria && !u.esAdmin;

export function codigoCaja(caja: Pick<CajaSaldo, "empresaCodigo" | "area" | "numero">) {
  return `${caja.empresaCodigo}-CAJA-${caja.area}-${String(caja.numero).padStart(2, "0")}`;
}

/** Caja tal como la administra tesorería (incluye las inactivas). */
export interface CajaAdmin {
  id: string;
  empresaId: string;
  empresaCodigo: CodigoEmpresa;
  numero: number;
  area: string; // sigla: MT, OP, GE…
  nombre: string;
  umbralAlerta: number;
  activa: boolean;
}

export type DatosCaja = Omit<CajaAdmin, "id" | "empresaCodigo"> & { id: string | null }; // id null = nueva
