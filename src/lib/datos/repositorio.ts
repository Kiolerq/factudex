import type {
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
  registrarMovimiento(m: NuevoMovimiento): Promise<{ id: string; estado: EstadoMovimiento }>;

  permisosCaja(cajaId: string): Promise<PermisosCaja>;
  listarMovimientos(f: FiltroMovimientos): Promise<PaginaMovimientos>;
  obtenerMovimiento(id: string): Promise<DetalleMovimiento | null>;
  completarMovimiento(c: CompletarMovimiento): Promise<EstadoMovimiento>;
  anularMovimiento(id: string, motivo: string): Promise<void>;

  listarLiquidaciones(cajaIds: string[]): Promise<LiquidacionResumen[]>;
  obtenerLiquidacion(id: string): Promise<DetalleLiquidacion | null>;
  cerrarLiquidacion(id: string): Promise<void>;
  revisarLiquidacion(id: string, aprobar: boolean, observaciones: string | null): Promise<void>;

  listarRecargas(cajaIds: string[]): Promise<Recarga[]>;
  registrarRecarga(r: NuevaRecarga): Promise<void>;
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
