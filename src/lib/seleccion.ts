import { cookies } from "next/headers";
import type { CajaSaldo } from "./datos/tipos";

// La caja activa del HUD se recuerda en una cookie. Es solo una preferencia de UI:
// qué cajas puede ver/operar el usuario lo decide el RLS.
export const COOKIE_CAJA = "fx_caja";

export async function leerCajaActiva<T extends Pick<CajaSaldo, "id">>(cajas: T[]): Promise<T | null> {
  const id = (await cookies()).get(COOKIE_CAJA)?.value;
  return cajas.find((c) => c.id === id) ?? cajas[0] ?? null;
}

