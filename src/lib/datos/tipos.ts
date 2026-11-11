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
  ruc: string | null; // sale en el encabezado de la planilla de movilidad
  topePlanillaDia: number; // máximo por trabajador y día en planillas de movilidad (S/ 40)
}

// --- Planilla de movilidad (también para alimentación) ---

export const MOTIVOS_PLANILLA = ["MOVILIDAD", "ALIMENTACION"] as const;
export type MotivoPlanilla = (typeof MOTIVOS_PLANILLA)[number];
export const ETIQUETA_MOTIVO_PLANILLA: Record<MotivoPlanilla, string> = { MOVILIDAD: "Movilidad", ALIMENTACION: "Alimentación" };

export const TIPOS_TRANSPORTE = ["T", "B", "C", "COMBI"] as const;
export type TipoTransporte = (typeof TIPOS_TRANSPORTE)[number];
export const ETIQUETA_TRANSPORTE: Record<TipoTransporte, string> = { T: "Taxi", B: "Bus", C: "Colectivo", COMBI: "Combi" };

export interface FilaPlanilla {
  fecha: string;
  trabajador: string;
  dni: string | null;
  motivo: MotivoPlanilla;
  origen: string;
  destino: string;
  importe: number;
  tipo: TipoTransporte | null;
}

export interface NuevaPlanilla {
  movimientoId: string;
  cajaId: string;
  categoriaId: string | null;
  centroCostoId: string | null;
  solicitante: string | null;
  serie: string;
  numero: number;
  fechaEmision: string;
  pagoId: string | null; // otra salida de un pago con varias salidas
  medioPago?: MedioPago | null; // sin pago anterior: cómo se pagó (null = efectivo)
  operacionPago?: string | null;
  adjuntoPago?: AdjuntoSubido | null; // captura del Yape, voucher…
  observaciones?: string | null;
  filas: FilaPlanilla[];
}

export interface Planilla {
  id: string;
  empresaId: string;
  movimientoId: string;
  cajaId: string;
  serie: string;
  numero: number;
  fechaEmision: string;
  filas: FilaPlanilla[];
  total: number;
}

export interface Trabajador {
  nombre: string;
  dni: string | null;
}

/** Lo ya gastado por trabajador y día en planillas (para avisar antes de pasar el tope). */
export interface GastoPlanillaDia {
  clave: string; // DNI o nombre en mayúsculas (como fx_clave_trabajador)
  fecha: string;
  total: number;
}

/** Igual que fx_clave_trabajador() en la BD. */
export function claveTrabajador(nombre: string, dni: string | null): string {
  return dni?.trim() || nombre.trim().replace(/\s+/g, " ").toUpperCase();
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
  observaciones?: string | null; // para quién fue en realidad y el motivo (va al Excel)
  monto: number;
  tipoDocumento: TipoDocumento | null;
  serieNumero: string | null;
  medioPago: MedioPago | null;
  operacionPago: string | null; // N° de operación Yape/Plin/transferencia
  /** Parte de un pago con varias salidas: uno nuevo (con su monto total) o uno ya registrado. */
  pago: { id: string; monto: number; nuevo: boolean } | null;
  adjuntos: AdjuntoSubido[];
}

/** Un pago (Yape, transferencia, efectivo entregado) que se sustenta con varios documentos. */
export interface Pago {
  id: string;
  cajaId: string;
  cajaCodigo: string; // la caja donde se registró el pago (puede ser la anterior, ya cerrada)
  empresaId: string;
  monto: number;
  medioPago: MedioPago | null;
  operacion: string | null;
  fecha: string;
  sustentado: number; // suma de las salidas no anuladas
  devuelto: number; // solo lo que volvió a la caja
  liquidadoAntes: number; // lo que se rindió fuera de la app (Excel, papel) en una caja anterior
  falta: number; // monto − sustentado − devuelto (negativo: se pasó)
  tieneConstancia: boolean;
  salidas: MovimientoResumen[];
  devoluciones: Devolucion[];
  /** Salidas que ya se rindieron en otra liquidación (ej. en la caja anterior), por folio. */
  yaLiquidado: { folio: string; cajaCodigo: string; monto: number }[];
}

/** Un pago anterior al que le falta sustentar (para "Completar un registro anterior"). */
export interface PagoPorCompletar {
  id: string;
  cajaId: string;
  cajaCodigo: string;
  fecha: string;
  monto: number;
  medioPago: MedioPago | null;
  operacion: string | null;
  sustentado: number;
  falta: number;
  salidas: { detalle: string; monto: number; folio: string | null; liquidado: boolean }[];
}

/** Un gasto ya registrado que podría haber sido parte de un pago mayor. */
export interface GastoAnterior {
  id: string;
  cajaId: string;
  cajaCodigo: string;
  fecha: string;
  detalle: string;
  proveedor: string | null;
  monto: number;
  medioPago: MedioPago | null;
  folio: string | null;
  liquidado: boolean; // su liquidación ya se generó (en revisión o aprobada)
}

/** devolucion: el dinero volvió a la caja · liquidado_antes: esa parte ya se rindió fuera de la app. */
export type TipoDevolucion = "devolucion" | "liquidado_antes";

export interface Devolucion {
  id: string;
  pagoId: string;
  tipo: TipoDevolucion;
  monto: number;
  motivo: string; // en liquidado_antes: la referencia (ej. "Caja 4 · planilla 10-150")
  fecha: string;
  conFoto: boolean; // se ve en /api/devoluciones/<id>/foto
}

export interface NuevaDevolucion {
  pagoId: string;
  tipo: TipoDevolucion;
  monto: number;
  motivo: string;
  comprobantePath: string | null;
  comprobanteMime: string | null;
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
  faltaPago: boolean; // en efectivo nunca falta; en un pago con varias salidas basta una constancia
  porAutorizar: boolean; // supera el tope de la empresa y tesorería aún no lo autoriza
  pagoId: string | null; // parte de un pago con varias salidas
  pagoFalta: number; // lo que falta cuadrar de ese pago (0 = cuadrado o sin pago)
  observaciones: string | null; // para quién fue y el motivo
  corrigeId: string | null; // línea de corrección de un gasto ya liquidado (el original)
}

/** Corrección de un gasto ya liquidado (la hace tesorería). */
export interface NuevaCorreccion {
  id: string; // de la línea nueva (el archivo ya se subió con este id)
  originalId: string;
  cajaId: string; // caja abierta donde entra
  montoCorrecto: number;
  serieNumero: string | null;
  motivo: string;
}

export interface Correccion {
  id: string;
  monto: number; // diferencia (negativa si bajó)
  detalle: string;
  folio: string; // liquidación donde entra
  anulado: boolean;
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
  conFoto: boolean; // foto del depósito: se ve en /api/recargas/<id>/comprobante
}

/** Área de una caja: la sigla va en el código (SL-CAJA-MT-01). */
export interface Area {
  codigo: string; // MT
  nombre: string; // Mantenimiento
  descripcion: string | null;
}

/** Si aún no se corrió la migración de áreas. */
export const AREAS_BASE: Area[] = [
  { codigo: "MT", nombre: "Mantenimiento", descripcion: null },
  { codigo: "AD", nombre: "Administración", descripcion: null },
  { codigo: "OP", nombre: "Operaciones", descripcion: null },
];

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
/** "Solo consulta": ve Pendientes, Historial y Liquidaciones (con archivos y Excel) sin tocar nada. */
export const MODULOS_CONSULTA: Modulo[] = ["pendientes", "historial", "liquidaciones"];
export const esSoloConsulta = (u: { esAdmin: boolean; esTesoreria: boolean; modulos: Modulo[] | null }) =>
  !u.esAdmin && !u.esTesoreria && !!u.modulos && !u.modulos.includes("registro");

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

/**
 * Caja donde se registra otra salida de un pago: la del pago si el usuario registra ahí; si el pago
 * quedó en una caja anterior (ya cerrada), la preferida o la primera de la misma empresa.
 */
export function cajaParaPago<C extends { id: string; empresaId: string }>(
  pago: Pick<Pago, "cajaId" | "empresaId">,
  cajas: C[],
  preferidaId: string,
): C | null {
  return (
    cajas.find((c) => c.id === pago.cajaId) ??
    cajas.find((c) => c.id === preferidaId && c.empresaId === pago.empresaId) ??
    cajas.find((c) => c.empresaId === pago.empresaId) ??
    null
  );
}

/**
 * v_pagos suma devoluciones y "liquidado antes" juntos (los dos cuentan para el cuadre); aquí se
 * separan, y lo liquidado antes se suma a `yaLiquidado` con su referencia.
 */
export function separarLiquidadoAntes(p: Omit<Pago, "liquidadoAntes">): Pago {
  const antes = p.devoluciones.filter((d) => d.tipo === "liquidado_antes");
  const liquidadoAntes = Math.round(antes.reduce((t, d) => t + d.monto, 0) * 100) / 100;
  return {
    ...p,
    devuelto: Math.round((p.devuelto - liquidadoAntes) * 100) / 100,
    liquidadoAntes,
    yaLiquidado: [...p.yaLiquidado, ...antes.map((d) => ({ folio: d.motivo, cajaCodigo: "", monto: d.monto }))],
  };
}

/**
 * Ajuste que solo mueve plata entre una caja y la que la reemplazó (traspaso de saldo o corrección de
 * una observada): no es un ingreso nuevo, así que no se suma en el Panel.
 */
export const esTraspaso = (r: Pick<Recarga, "tipo" | "descripcion">) =>
  r.tipo === "ajuste" &&
  /^(Saldo de |Saldo pasado a |Corrección pasada a |Corrección de liquidación observada de )/.test(r.descripcion ?? "");
