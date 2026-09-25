import type {
  CajaSaldo,
  Empresa,
  EstadoMovimiento,
  NuevoMovimiento,
  NuevoProveedor,
  Opcion,
  Proveedor,
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
  listarVehiculos(empresaId: string): Promise<Opcion[]>;
  buscarProveedores(texto: string): Promise<Proveedor[]>;
  crearProveedor(p: NuevoProveedor): Promise<Proveedor>;
  registrarMovimiento(m: NuevoMovimiento): Promise<{ id: string; estado: EstadoMovimiento }>;
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
