const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export function formatoSoles(monto: number): string {
  return soles.format(monto);
}

/** "2026-09-23" → "23/09/2026" (o "23/09" con corta = true). */
export function formatoFecha(iso: string, corta = false): string {
  const [a, m, d] = iso.split("-");
  return corta ? `${d}/${m}` : `${d}/${m}/${a}`;
}

/** Acepta "30.70", "30,70" o "1,240.50" → número; NaN si no es válido. */
export function leerMonto(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return NaN;
  const normalizado = /,\d{1,2}$/.test(limpio) && !limpio.includes(".")
    ? limpio.replace(",", ".")
    : limpio.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
