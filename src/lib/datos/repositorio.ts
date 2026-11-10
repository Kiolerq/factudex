import { cache } from "react";
import type {
  Area,
  TipoAdjunto,
  AdjuntoSubido,
  GastoPlanillaDia,
  NuevaPlanilla,
  Planilla,
  Trabajador,
  NuevaDevolucion,
  Pago,
  PagoPorCompletar,
  GastoAnterior,
  CajaAdmin,
  DatosCaja,
  CambiosUsuario,
  NuevoUsuario,
  UsuarioAdmin,
  CajaSaldo,
  CompletarMovimiento,
  DetalleLiquidacion,
  DetalleMovimiento,
  Empresa,
  EstadoMovimiento,
  FiltroMovimientos,
  LiquidacionResumen,
  NuevaRecarga,
  NuevoMovimiento,
  NuevoProveedor,
  Opcion,
  PaginaMovimientos,
  PermisosCaja,
  Proveedor,
  Recarga,
  Usuario,
} from "./tipos";

/**
 * Acceso a datos. Dos implementaciones:
 *  - Supabase (producción): RLS decide qué ve cada usuario.
 *  - Demo (sin variables de Supabase): datos de ejemplo en memoria del servidor.
 * Solo se usa desde el servidor (Server Components y Server Actions).
 */
export interface ArchivosExcel {
  adjuntos: { id: string; movimientoId: string; pagoId: string | null; tipo: TipoAdjunto; storagePath: string }[];
  recargas: { id: string; storagePath: string }[];
}

export interface Repositorio {
  usuarioActual(): Promise<Usuario | null>;
  listarEmpresas(): Promise<Empresa[]>;
  listarCajas(): Promise<CajaSaldo[]>;
  listarCategorias(empresaId: string): Promise<Opcion[]>;
  listarCentrosCosto(empresaId: string): Promise<Opcion[]>;
  listarSolicitantes(empresaId: string): Promise<string[]>;
  buscarProveedores(texto: string): Promise<Proveedor[]>;
  crearProveedor(p: NuevoProveedor): Promise<Proveedor>;
  /** Agrega un centro de costo a la lista de la empresa (o devuelve el que ya existe igual). */
  crearCentroCosto(empresaId: string, nombre: string): Promise<Opcion>;
  registrarMovimiento(m: NuevoMovimiento): Promise<{ id: string; estado: EstadoMovimiento }>;

  permisosCaja(cajaId: string): Promise<PermisosCaja>;
  listarMovimientos(f: FiltroMovimientos): Promise<PaginaMovimientos>;
  obtenerMovimiento(id: string): Promise<DetalleMovimiento | null>;
  completarMovimiento(c: CompletarMovimiento): Promise<EstadoMovimiento>;
  anularMovimiento(id: string, motivo: string): Promise<void>;

  listarLiquidaciones(cajaIds: string[]): Promise<LiquidacionResumen[]>;
  obtenerLiquidacion(id: string): Promise<DetalleLiquidacion | null>;
  cerrarLiquidacion(id: string): Promise<void>;
  /** Liquida los gastos completos de la caja entre esas fechas (menos los excluidos); devuelve el folio. */
  generarLiquidacion(cajaId: string, desde: string, hasta: string, excluir: string[]): Promise<string>;
  revisarLiquidacion(id: string, aprobar: boolean, observaciones: string | null): Promise<void>;

  listarRecargas(cajaIds: string[], desde?: string): Promise<Recarga[]>;
  /** Devuelve el id del ingreso (para adjuntarle la foto del depósito). */
  registrarRecarga(r: NuevaRecarga): Promise<string>;
  adjuntarComprobanteRecarga(id: string, path: string, mime: string): Promise<void>;
  listarAreas(): Promise<Area[]>;
  /** Pago con varias salidas: sus salidas, devoluciones y cuánto falta cuadrar. */
  obtenerPago(id: string): Promise<Pago | null>;
  registrarDevolucion(d: NuevaDevolucion): Promise<void>;
  /** Un gasto ya registrado (aunque esté liquidado) pasa a ser la primera salida de un pago de `monto`. */
  convertirEnPago(movimientoId: string, monto: number): Promise<string>;
  /** Junta al pago un gasto ya registrado (aunque esté liquidado en otra caja de la empresa). */
  vincularAPago(pagoId: string, movimientoId: string): Promise<void>;
  /** Pagos de la empresa a los que les falta sustentar y gastos recientes que podrían ser parte de uno. */
  listarAnteriores(empresaId: string, desde: string): Promise<{ pagos: PagoPorCompletar[]; gastos: GastoAnterior[] }>;
  // Planillas de movilidad
  listarTrabajadores(empresaId: string): Promise<Trabajador[]>;
  /** La siguiente serie y número de planilla de la empresa (null si aún no hay ninguna). */
  siguientePlanilla(empresaId: string): Promise<{ serie: string; numero: number } | null>;
  gastosPlanillaDia(empresaId: string, desde: string): Promise<GastoPlanillaDia[]>;
  /** Crea el gasto, la planilla y sus filas de una vez (falla entera si alguien pasa el tope). */
  crearPlanilla(p: NuevaPlanilla): Promise<string>;
  obtenerPlanilla(id: string): Promise<Planilla | null>;
  obtenerPlanillaDeMovimiento(movimientoId: string): Promise<Planilla | null>;
  /** Adjunta archivos ya subidos a un gasto (ej. el PDF de la planilla). */
  agregarAdjuntos(movimientoId: string, adjuntos: AdjuntoSubido[]): Promise<void>;
  /** Rutas de los archivos de unos gastos (y de las constancias de sus pagos) e ingresos, para el Excel. */
  archivosParaExcel(movimientoIds: string[], recargaIds: string[]): Promise<ArchivosExcel>;
  /** Pasa el saldo y los gastos sin liquidar de una caja a la nueva (misma empresa y área) y cierra la anterior. */
  traspasarCaja(anteriorId: string, nuevaId: string): Promise<number>;
  crearArea(a: Area): Promise<void>;

  // Tesorería (quien llama ya fue verificado como tesorería o admin).
  autorizarMovimiento(id: string): Promise<void>;
  listarCajasAdmin(): Promise<CajaAdmin[]>;
  /** Crea o edita una caja; devuelve su id. */
  guardarCaja(c: DatosCaja): Promise<string>;
  actualizarTope(empresaId: string, tope: number): Promise<void>;

  // Administración de usuarios: solo admin (quien llama ya fue verificado como admin).
  listarUsuarios(): Promise<UsuarioAdmin[]>;
  crearUsuario(u: NuevoUsuario): Promise<string>;
  actualizarUsuario(u: CambiosUsuario): Promise<void>;
  cambiarContrasena(id: string, password: string): Promise<void>;
}

export class ErrorDeNegocio extends Error {}

export function modoDemo(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * Uno por petición (React cache): el layout y la página comparten el mismo repositorio y, con él,
 * las consultas que se repiten (usuario, empresas, cajas, accesos), que se hacen una sola vez.
 */
export const obtenerRepositorio = cache(async (): Promise<Repositorio> => crearRepositorio());

async function crearRepositorio(): Promise<Repositorio> {
  if (modoDemo()) {
    const { repositorioDemo } = await import("./demo");
    return repositorioDemo;
  }
  const { crearRepositorioSupabase } = await import("./supabase");
  return crearRepositorioSupabase();
}
