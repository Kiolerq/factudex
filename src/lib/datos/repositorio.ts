import type {
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
  registrarRecarga(r: NuevaRecarga): Promise<void>;

  // Tesorería (quien llama ya fue verificado como tesorería o admin).
  autorizarMovimiento(id: string): Promise<void>;
  listarCajasAdmin(): Promise<CajaAdmin[]>;
  guardarCaja(c: DatosCaja): Promise<void>;
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

export async function obtenerRepositorio(): Promise<Repositorio> {
  if (modoDemo()) {
    const { repositorioDemo } = await import("./demo");
    return repositorioDemo;
  }
  const { crearRepositorioSupabase } = await import("./supabase");
  return crearRepositorioSupabase();
}
