import { randomUUID } from "node:crypto";
import { ErrorDeNegocio, type Repositorio } from "./repositorio";
import {
  estadoEsperado,
  type AdjuntoSubido,
  type CajaSaldo,
  type Empresa,
  type EstadoMovimiento,
  type NuevoMovimiento,
  type Opcion,
  type Proveedor,
} from "./tipos";

// Modo demo: réplica en memoria de supabase/seed.sql + algunos movimientos para que los
// saldos se vean reales. Se reinicia al reiniciar el servidor. Datos de EJEMPLO.

interface CajaDemo {
  id: string;
  empresaId: string;
  numero: number;
  area: string;
  nombre: string;
  umbralAlerta: number;
}
interface MovimientoDemo extends Omit<NuevoMovimiento, "adjuntos"> {
  estado: EstadoMovimiento;
  adjuntos: AdjuntoSubido[];
}
interface Almacen {
  empresas: Empresa[];
  cajas: CajaDemo[];
  categorias: Opcion[];
  centrosCosto: (Opcion & { empresaId: string })[];
  vehiculos: (Opcion & { empresaId: string })[];
  proveedores: Proveedor[];
  movimientos: MovimientoDemo[];
  recargas: { cajaId: string; monto: number }[];
}

function sembrar(): Almacen {
  const sl: Empresa = {
    id: randomUUID(),
    codigo: "SL",
    sigla: "SL",
    nombreCorto: "San Lorenzo",
    razonSocial: "Compañía San Lorenzo S.A.C.",
  };
  const sipe: Empresa = {
    id: randomUUID(),
    codigo: "SIPE",
    sigla: "SP",
    nombreCorto: "SIPE",
    razonSocial: "SIPE",
  };
  const caja = (empresaId: string, numero: number, area: string, nombre: string): CajaDemo => ({
    id: randomUUID(),
    empresaId,
    numero,
    area,
    nombre,
    umbralAlerta: 200,
  });
  const mant = caja(sl.id, 1, "MT", "Mantenimiento");
  const oper = caja(sl.id, 2, "OP", "Operaciones");
  const gen = caja(sipe.id, 1, "GE", "General");

  const opciones = (empresaId: string, filas: [string, string][]) =>
    filas.map(([codigo, nombre]) => ({ id: randomUUID(), empresaId, codigo, nombre }));

  const categorias = [
    "Peajes",
    "Combustible",
    "Repuestos y ferretería",
    "Llantas",
    "Alimentación",
    "Movilidad",
    "Útiles de oficina",
    "Servicios",
    "Otros",
  ].map((nombre) => ({ id: randomUUID(), nombre }));
  const cat = (n: string) => categorias.find((c) => c.nombre === n)!.id;

  const proveedores: Proveedor[] = [
    ["RUC", "20522547957", "COVISOL - Peaje Chicama"],
    ["RUC", "20522598102", "COVISOL Ventas Corporativas"],
    ["DNI", "45872136", "Johan Yarlin Mesa Rios"],
    ["RUC", "20601234571", "Inversiones y Servicios Tiara"],
    ["RUC", "20487654329", "Estación de Servicios SR"],
  ].map(([tipoDoc, numDoc, razonSocial]) => ({
    id: randomUUID(),
    tipoDoc: tipoDoc as Proveedor["tipoDoc"],
    numDoc,
    razonSocial,
    nombreComercial: null,
  }));
  const prov = (n: string) => proveedores.find((p) => p.razonSocial === n)!.id;

  const mov = (
    cajaId: string,
    fecha: string,
    detalle: string,
    monto: number,
    extra: Partial<MovimientoDemo>,
  ): MovimientoDemo => ({
    id: randomUUID(),
    cajaId,
    fecha,
    detalle,
    monto,
    solicitante: null,
    proveedorId: null,
    categoriaId: cat("Otros"),
    centroCostoId: null,
    vehiculoId: null,
    tipoDocumento: null,
    serieNumero: null,
    medioPago: null,
    operacionPago: null,
    estado: "pendiente",
    adjuntos: [],
    ...extra,
  });

  // Caja 01 MT queda en S/ 560.00 (como el prototipo); SIPE 01 GE queda bajo el umbral.
  const movimientos: MovimientoDemo[] = [
    mov(mant.id, "2026-09-21", "Peaje pesado 4 ejes", 40.9, {
      proveedorId: prov("COVISOL - Peaje Chicama"), categoriaId: cat("Peajes"),
      tipoDocumento: "factura", medioPago: "efectivo", estado: "completo",
    }),
    mov(mant.id, "2026-09-19", "Parchado de llantas CAE899", 60, {
      proveedorId: prov("Johan Yarlin Mesa Rios"), categoriaId: cat("Llantas"),
      tipoDocumento: "boleta", medioPago: "yape", estado: "completo",
    }),
    mov(mant.id, "2026-09-18", "Bomba manual", 135, {
      categoriaId: cat("Repuestos y ferretería"), medioPago: "yape",
    }),
    mov(mant.id, "2026-09-17", "Pernos acerados x50", 135, {
      proveedorId: prov("Inversiones y Servicios Tiara"), categoriaId: cat("Repuestos y ferretería"),
      tipoDocumento: "factura", medioPago: "transferencia", estado: "completo",
    }),
    mov(mant.id, "2026-09-10", "Equipos para planta / muestra", 50, {}),
    mov(mant.id, "2026-09-08", "Combustible camioneta", 1019.1, {
      proveedorId: prov("Estación de Servicios SR"), categoriaId: cat("Combustible"),
      tipoDocumento: "factura", medioPago: "efectivo", estado: "completo",
    }),
    mov(oper.id, "2026-09-20", "Útiles de oficina", 150, {
      categoriaId: cat("Útiles de oficina"), tipoDocumento: "boleta", medioPago: "efectivo", estado: "completo",
    }),
    mov(gen.id, "2026-09-15", "Movilidad personal", 880, {
      categoriaId: cat("Movilidad"), tipoDocumento: "planilla_movilidad", medioPago: "efectivo", estado: "completo",
    }),
  ];

  return {
    empresas: [sl, sipe],
    cajas: [mant, oper, gen],
    categorias,
    centrosCosto: [
      ...opciones(sl.id, [["GEN", "General"], ["PLA", "Planta"], ["TRA", "Transporte"], ["ADM", "Administración"]]),
      ...opciones(sipe.id, [["GEN", "General"], ["OPE", "Operaciones"], ["ADM", "Administración"]]),
    ],
    vehiculos: [
      ...opciones(sl.id, [["T1Y-461", "T1Y-461"], ["BZL-893", "BZL-893"], ["CAE-899", "CAE-899"]]),
      ...opciones(sipe.id, [["T1P-831", "T1P-831"]]),
    ],
    proveedores,
    movimientos,
    recargas: [
      { cajaId: mant.id, monto: 2000 },
      { cajaId: oper.id, monto: 1000 },
      { cajaId: gen.id, monto: 1000 },
    ],
  };
}

// globalThis para sobrevivir a la recarga en caliente de `next dev`.
const g = globalThis as unknown as { __factudexDemo?: Almacen };
const db = (g.__factudexDemo ??= sembrar());

const sinOrigen = ({ empresaId: _, ...o }: Opcion & { empresaId: string }): Opcion => o;

export const repositorioDemo: Repositorio = {
  async usuarioActual() {
    return { id: "demo", nombre: "Usuario Demo", email: null };
  },

  async listarEmpresas() {
    return db.empresas;
  },

  async listarCajas(): Promise<CajaSaldo[]> {
    return db.cajas.map((c) => {
      const empresa = db.empresas.find((e) => e.id === c.empresaId)!;
      const recargado = db.recargas.filter((r) => r.cajaId === c.id).reduce((s, r) => s + r.monto, 0);
      const movs = db.movimientos.filter((m) => m.cajaId === c.id);
      const gastado = movs.reduce((s, m) => s + m.monto, 0);
      const saldo = Math.round((recargado - gastado) * 100) / 100;
      return {
        ...c,
        empresaCodigo: empresa.codigo,
        saldo,
        bajoUmbral: saldo < c.umbralAlerta,
        pendientes: movs.filter((m) => m.estado === "pendiente").length,
      };
    });
  },

  async listarCategorias() {
    return db.categorias;
  },

  async listarCentrosCosto(empresaId) {
    return db.centrosCosto.filter((c) => c.empresaId === empresaId).map(sinOrigen);
  },

  async listarVehiculos(empresaId) {
    return db.vehiculos.filter((v) => v.empresaId === empresaId).map(sinOrigen);
  },

  async buscarProveedores(texto) {
    const q = texto.trim().toLowerCase();
    if (!q) return [];
    return db.proveedores
      .filter((p) => `${p.razonSocial} ${p.nombreComercial ?? ""} ${p.numDoc}`.toLowerCase().includes(q))
      .slice(0, 8);
  },

  async crearProveedor(p) {
    if (db.proveedores.some((x) => x.tipoDoc === p.tipoDoc && x.numDoc === p.numDoc)) {
      throw new ErrorDeNegocio(`Ya existe un proveedor con ${p.tipoDoc} ${p.numDoc}`);
    }
    const nuevo: Proveedor = { id: randomUUID(), ...p, nombreComercial: null };
    db.proveedores.push(nuevo);
    return nuevo;
  },

  async registrarMovimiento(m) {
    const caja = db.cajas.find((c) => c.id === m.cajaId);
    if (!caja) throw new ErrorDeNegocio("La caja no existe");
    const empresaId = caja.empresaId;
    if (m.centroCostoId && !db.centrosCosto.some((c) => c.id === m.centroCostoId && c.empresaId === empresaId))
      throw new ErrorDeNegocio("El centro de costo no pertenece a la empresa de la caja");
    if (m.vehiculoId && !db.vehiculos.some((v) => v.id === m.vehiculoId && v.empresaId === empresaId))
      throw new ErrorDeNegocio("La placa no pertenece a la empresa de la caja");
    if (db.movimientos.some((x) => x.id === m.id)) throw new ErrorDeNegocio("Movimiento duplicado");

    const estado = estadoEsperado(
      m.adjuntos.some((a) => a.tipo === "documento"),
      m.adjuntos.some((a) => a.tipo === "pago"),
      m.medioPago,
    );
    db.movimientos.push({ ...m, estado });
    return { id: m.id, estado };
  },
};
