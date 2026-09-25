// Paleta por empresa (diseno/LEEME.md). Fondo y estilo glass no cambian; solo la marca.
export const TEMAS_EMPRESA = {
  SL: {
    nombre: "San Lorenzo",
    primario: "#2E75B6",
    acento: "#D3453A",
    primarioSuave: "rgba(46,117,182,0.16)",
  },
  SIPE: {
    nombre: "SIPE",
    primario: "#1FA2C9",
    acento: "#2FAE60",
    primarioSuave: "rgba(31,162,201,0.16)",
  },
} as const;

export type CodigoEmpresa = keyof typeof TEMAS_EMPRESA;

// Estados neutrales: no cambian con la empresa.
export const COLORES_ESTADO = {
  pendiente: "#D9A441",
  completo: "#3FBE72",
} as const;
