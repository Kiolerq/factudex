import { randomUUID } from "node:crypto";
import { ErrorDeNegocio, type Repositorio } from "./repositorio";
import { fechaHoyLima } from "./esquemas";
import {
  estadoEsperado,
  type AdjuntoSubido,
  type CajaSaldo,
  type DetalleLiquidacion,
  type Empresa,
  type EstadoLiquidacion,
  type EstadoMovimiento,
  type LiquidacionResumen,
  type MovimientoResumen,
  type NuevoMovimiento,
  type Opcion,
  type Proveedor,
  type Recarga,
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
  liquidacionId: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  creado: number;
  adjuntos: (AdjuntoSubido & { id: string })[];
}
interface LiquidacionDemo {
  id: string;
  cajaId: string;
  correlativo: number;
  folio: string;
  estado: EstadoLiquidacion;
  fechaInicio: string;
  fechaCierre: string | null;
  saldoInicial: number;
  // Snapshot al cerrar (como cerrar_liquidacion() en la BD).
  totalIngresos: number | null;
  totalGastado: number | null;
  saldoFinal: number | null;
  observaciones: string | null;
}
interface RecargaDemo extends Omit<Recarga, "folioRepuesto"> {
  liquidacionIngresoId: string;
  liquidacionRepuestaId: string | null;
}
interface Almacen {
  empresas: Empresa[];
  cajas: CajaDemo[];
  categorias: Opcion[];
  centrosCosto: (Opcion & { empresaId: string })[];
  solicitantes: { empresaId: string; nombre: string }[];
  proveedores: Proveedor[];
  movimientos: MovimientoDemo[];
  liquidaciones: LiquidacionDemo[];
  recargas: RecargaDemo[];
}

function sembrar(): Almacen {
  const sl: Empresa = {
    id: randomUUID(),
    codigo: "SL",
    sigla: "SL",
    nombreCorto: "San Lorenzo",
    razonSocial: "Compañía San Lorenzo S.A.C.",
    ciudad: "TRUJILLO",
  };
  const sipe: Empresa = {
    id: randomUUID(),
    codigo: "SIPE",
    sigla: "SP",
    nombreCorto: "SIPE",
    razonSocial: "SIPE",
    ciudad: "TRUJILLO",
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
    liquidacionId: "", // se asigna abajo
    anulado: false,
    motivoAnulacion: null,
    creado: Date.now(),
    fecha,
    detalle,
    monto,
    solicitante: null,
    proveedorId: null,
    categoriaId: cat("Otros"),
    centroCostoId: null,
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

  // Una liquidación abierta por caja con sus gastos y la recarga de apertura.
  const empresasDemo = [sl, sipe];
  const cajasDemo = [mant, oper, gen];
  const liquidaciones = cajasDemo.map((c) => nuevaLiquidacion(c, empresasDemo, 1, "2026-09-01", 0));
  const liqDe = (cajaId: string) => liquidaciones.find((l) => l.cajaId === cajaId)!.id;
  for (const m of movimientos) {
    m.liquidacionId = liqDe(m.cajaId);
    // Los completos de ejemplo traen sus comprobantes (sin archivo real en modo demo).
    if (m.estado === "completo") {
      m.adjuntos.push(adjuntoDemo("documento"));
      if (m.medioPago !== "efectivo") m.adjuntos.push(adjuntoDemo("pago"));
    }
  }
  const apertura = (cajaId: string, monto: number): RecargaDemo => ({
    id: randomUUID(),
    cajaId,
    tipo: "apertura",
    monto,
    fecha: "2026-09-01",
    descripcion: "Fondo inicial",
    forma: "banco",
    banco: "BCP",
    operacion: null,
    recibo: null,
    nota: null,
    liquidacionIngresoId: liqDe(cajaId),
    liquidacionRepuestaId: null,
  });

  return {
    empresas: empresasDemo,
    cajas: cajasDemo,
    categorias,
    centrosCosto: [
      // Placas, áreas o cualquier destino del gasto: todo es centro de costo.
      ...opciones(sl.id, [["GEN", "General"], ["PLA", "Planta"], ["TRA", "Transporte"], ["ADM", "Administración"],
        ["T1Y-461", "T1Y-461"], ["BZL-893", "BZL-893"], ["CAE-899", "CAE-899"]]),
      ...opciones(sipe.id, [["GEN", "General"], ["OPE", "Operaciones"], ["ADM", "Administración"], ["T1P-831", "T1P-831"]]),
    ],
    solicitantes: [
      { empresaId: sl.id, nombre: "Carlos Ramírez" },
      { empresaId: sl.id, nombre: "Johan Mesa" },
      { empresaId: sipe.id, nombre: "María Torres" },
    ],
    proveedores,
    movimientos,
    liquidaciones,
    recargas: [apertura(mant.id, 2000), apertura(oper.id, 1000), apertura(gen.id, 1000)],
  };
}

function nuevaLiquidacion(
  caja: CajaDemo,
  empresas: Empresa[],
  correlativo: number,
  fechaInicio: string,
  saldoInicial: number,
): LiquidacionDemo {
  const sigla = empresas.find((e) => e.id === caja.empresaId)!.sigla;
  return {
    id: randomUUID(),
    cajaId: caja.id,
    correlativo,
    folio: `${sigla}LQ${String(caja.numero).padStart(2, "0")}-${caja.area}-${String(correlativo).padStart(4, "0")}`,
    estado: "abierta",
    fechaInicio,
    fechaCierre: null,
    saldoInicial,
    totalIngresos: null,
    totalGastado: null,
    saldoFinal: null,
    observaciones: null,
  };
}

function adjuntoDemo(tipo: "documento" | "pago"): AdjuntoSubido & { id: string } {
  return { id: randomUUID(), tipo, storagePath: `demo/${randomUUID()}.jpg`, mimeType: "image/jpeg", tamanoBytes: 1, nombreArchivo: null };
}

// globalThis para sobrevivir a la recarga en caliente de `next dev`.
const g = globalThis as unknown as { __factudexDemo?: Almacen };
const db = (g.__factudexDemo ??= sembrar());

const sinOrigen = ({ empresaId: _, ...o }: Opcion & { empresaId: string }): Opcion => o;
const redondear = (n: number) => Math.round(n * 100) / 100;
const suma = <T>(xs: T[], f: (x: T) => number) => redondear(xs.reduce((s, x) => s + f(x), 0));

/** Liquidación abierta de la caja; la crea si no hay (como fx_liquidacion_abierta). */
function liquidacionAbierta(cajaId: string): LiquidacionDemo {
  const abierta = db.liquidaciones.find((l) => l.cajaId === cajaId && l.estado === "abierta");
  if (abierta) return abierta;
  const caja = db.cajas.find((c) => c.id === cajaId)!;
  const correlativo = Math.max(0, ...db.liquidaciones.filter((l) => l.cajaId === cajaId).map((l) => l.correlativo)) + 1;
  const nueva = nuevaLiquidacion(caja, db.empresas, correlativo, fechaHoyLima(), 0);
  db.liquidaciones.push(nueva);
  return nueva;
}

const estadoDe = (m: MovimientoDemo) =>
  estadoEsperado(
    m.adjuntos.some((a) => a.tipo === "documento"),
    m.adjuntos.some((a) => a.tipo === "pago"),
    m.medioPago,
  );

function resumen(m: MovimientoDemo): MovimientoResumen {
  const prov = db.proveedores.find((p) => p.id === m.proveedorId);
  return {
    id: m.id,
    cajaId: m.cajaId,
    liquidacionId: m.liquidacionId,
    fecha: m.fecha,
    detalle: m.detalle,
    monto: m.monto,
    solicitante: m.solicitante,
    proveedor: prov?.razonSocial ?? null,
    proveedorDoc: prov?.numDoc ?? null,
    categoria: db.categorias.find((c) => c.id === m.categoriaId)?.nombre ?? null,
    centroCosto: db.centrosCosto.find((c) => c.id === m.centroCostoId)?.nombre ?? null,
    tipoDocumento: m.tipoDocumento,
    serieNumero: m.serieNumero,
    medioPago: m.medioPago,
    operacionPago: m.operacionPago,
    estado: m.estado,
    anulado: m.anulado,
    faltaDocumento: !m.adjuntos.some((a) => a.tipo === "documento"),
    faltaPago: m.medioPago !== "efectivo" && !m.adjuntos.some((a) => a.tipo === "pago"),
  };
}

const ordenMovimientos = (a: MovimientoDemo, b: MovimientoDemo) =>
  b.fecha.localeCompare(a.fecha) || b.creado - a.creado;

function resumenLiquidacion(l: LiquidacionDemo): LiquidacionResumen {
  const movs = db.movimientos.filter((m) => m.liquidacionId === l.id && !m.anulado);
  const completos = movs.filter((m) => m.estado === "completo");
  const pendientes = movs.filter((m) => m.estado === "pendiente");
  const ingresos = suma(db.recargas.filter((r) => r.liquidacionIngresoId === l.id), (r) => r.monto);
  const egresos = suma(completos, (m) => m.monto);
  const vivo = l.estado === "abierta" || l.estado === "observada";
  return {
    id: l.id,
    cajaId: l.cajaId,
    folio: l.folio,
    correlativo: l.correlativo,
    estado: l.estado,
    fechaInicio: l.fechaInicio,
    fechaCierre: l.fechaCierre,
    saldoInicial: l.saldoInicial,
    ingresos: vivo ? ingresos : (l.totalIngresos ?? ingresos),
    egresos: vivo ? egresos : (l.totalGastado ?? egresos),
    porReembolsar: vivo ? redondear(l.saldoInicial + ingresos - egresos) : (l.saldoFinal ?? 0),
    numMovimientos: movs.length,
    numIncompletos: pendientes.length,
    montoIncompletos: suma(pendientes, (m) => m.monto),
    observaciones: l.observaciones,
  };
}

function aRecarga(r: RecargaDemo): Recarga {
  const { liquidacionIngresoId: _, liquidacionRepuestaId, ...resto } = r;
  return { ...resto, folioRepuesto: db.liquidaciones.find((l) => l.id === liquidacionRepuestaId)?.folio ?? null };
}

/** Como tg_movimiento_bloqueo: solo se edita en una liquidación abierta u observada. */
function editable(m: MovimientoDemo) {
  const estado = db.liquidaciones.find((l) => l.id === m.liquidacionId)?.estado;
  if (estado !== "abierta" && estado !== "observada")
    throw new ErrorDeNegocio(`La liquidación está ${estado} y el movimiento ya no puede modificarse`);
}

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
      const recargado = suma(db.recargas.filter((r) => r.cajaId === c.id), (r) => r.monto);
      const movs = db.movimientos.filter((m) => m.cajaId === c.id && !m.anulado);
      const saldo = redondear(recargado - suma(movs, (m) => m.monto));
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

  async listarSolicitantes(empresaId) {
    return db.solicitantes.filter((x) => x.empresaId === empresaId).map((x) => x.nombre);
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
    if (db.movimientos.some((x) => x.id === m.id)) throw new ErrorDeNegocio("Movimiento duplicado");

    const nuevo: MovimientoDemo = {
      ...m,
      adjuntos: m.adjuntos.map((a) => ({ ...a, id: randomUUID() })),
      estado: "pendiente",
      liquidacionId: liquidacionAbierta(m.cajaId).id,
      anulado: false,
      motivoAnulacion: null,
      creado: Date.now(),
    };
    nuevo.estado = estadoDe(nuevo);
    db.movimientos.push(nuevo);
    return { id: m.id, estado: nuevo.estado };
  },

  async permisosCaja() {
    return { registrar: true, aprobar: true };
  },

  async listarMovimientos(f) {
    const texto = f.texto.trim().toLowerCase();
    const filtrados = db.movimientos
      .filter((m) => f.cajaIds.includes(m.cajaId))
      .filter((m) => (f.estado === "anulado" ? m.anulado : !m.anulado))
      .filter((m) => (f.estado !== "pendiente" && f.estado !== "completo") || m.estado === f.estado)
      .map(resumen)
      .filter(
        (m) =>
          !texto ||
          [m.detalle, m.serieNumero, m.solicitante, m.proveedor, m.proveedorDoc]
            .some((x) => x?.toLowerCase().includes(texto)),
      );
    const orden = new Map(db.movimientos.map((m) => [m.id, m]));
    filtrados.sort((a, b) => ordenMovimientos(orden.get(a.id)!, orden.get(b.id)!));
    return { movimientos: filtrados.slice(0, f.limite), total: filtrados.length };
  },

  async obtenerMovimiento(id) {
    const m = db.movimientos.find((x) => x.id === id);
    if (!m) return null;
    const l = db.liquidaciones.find((x) => x.id === m.liquidacionId)!;
    return {
      ...resumen(m),
      proveedorId: m.proveedorId,
      motivoAnulacion: m.motivoAnulacion,
      liquidacion: { id: l.id, folio: l.folio, estado: l.estado },
      adjuntos: m.adjuntos.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        mimeType: a.mimeType,
        nombreArchivo: a.nombreArchivo ?? null,
        url: null, // en demo no se guarda el archivo
      })),
    };
  },

  async completarMovimiento(c) {
    const m = db.movimientos.find((x) => x.id === c.id);
    if (!m) throw new ErrorDeNegocio("El movimiento no existe");
    if (m.medioPago !== c.medioPago) editable(m);
    Object.assign(m, {
      proveedorId: c.proveedorId,
      tipoDocumento: c.tipoDocumento,
      serieNumero: c.serieNumero,
      medioPago: c.medioPago,
      operacionPago: c.operacionPago,
    });
    m.adjuntos.push(...c.adjuntos.map((a) => ({ ...a, id: randomUUID() })));
    m.estado = estadoDe(m);
    return m.estado;
  },

  async anularMovimiento(id, motivo) {
    const m = db.movimientos.find((x) => x.id === id);
    if (!m || m.anulado) throw new ErrorDeNegocio("No se pudo anular: ya está anulado o no existe");
    editable(m);
    m.anulado = true;
    m.motivoAnulacion = motivo;
  },

  async listarLiquidaciones(cajaIds) {
    return db.liquidaciones
      .filter((l) => cajaIds.includes(l.cajaId))
      .sort((a, b) => b.correlativo - a.correlativo)
      .map(resumenLiquidacion);
  },

  async obtenerLiquidacion(id): Promise<DetalleLiquidacion | null> {
    const l = db.liquidaciones.find((x) => x.id === id);
    if (!l) return null;
    const anterior = db.liquidaciones.find((x) => x.cajaId === l.cajaId && x.correlativo === l.correlativo - 1);
    return {
      ...resumenLiquidacion(l),
      folioAnterior: anterior?.folio ?? null,
      movimientos: db.movimientos
        .filter((m) => m.liquidacionId === id && !m.anulado)
        .sort((a, b) => -ordenMovimientos(a, b))
        .map(resumen),
      recargas: db.recargas.filter((r) => r.liquidacionIngresoId === id).map(aRecarga),
    };
  },

  async cerrarLiquidacion(id) {
    const l = db.liquidaciones.find((x) => x.id === id);
    if (!l) throw new ErrorDeNegocio("La liquidación no existe");
    if (l.estado !== "abierta" && l.estado !== "observada")
      throw new ErrorDeNegocio(`La liquidación ${l.folio} está ${l.estado}`);
    const movs = db.movimientos.filter((m) => m.liquidacionId === id && !m.anulado);
    if (!movs.some((m) => m.estado === "completo"))
      throw new ErrorDeNegocio(`La liquidación ${l.folio} no tiene movimientos completos para liquidar`);

    l.estado = "en_revision";
    l.fechaCierre = fechaHoyLima();
    const siguiente = liquidacionAbierta(l.cajaId);
    if (siguiente.fechaInicio > l.fechaCierre) siguiente.fechaInicio = l.fechaCierre;
    for (const m of movs) if (m.estado === "pendiente") m.liquidacionId = siguiente.id;

    l.totalIngresos = suma(db.recargas.filter((r) => r.liquidacionIngresoId === id), (r) => r.monto);
    l.totalGastado = suma(movs.filter((m) => m.estado === "completo"), (m) => m.monto);
    l.saldoFinal = redondear(l.saldoInicial + l.totalIngresos - l.totalGastado);
    const proxima = db.liquidaciones.find((x) => x.cajaId === l.cajaId && x.correlativo === l.correlativo + 1);
    if (proxima) proxima.saldoInicial = l.saldoFinal;
  },

  async revisarLiquidacion(id, aprobar, observaciones) {
    const l = db.liquidaciones.find((x) => x.id === id);
    if (!l || l.estado !== "en_revision") throw new ErrorDeNegocio("La liquidación no está en revisión");
    l.estado = aprobar ? "aprobada" : "observada";
    l.observaciones = observaciones;
  },

  async listarRecargas(cajaIds) {
    return db.recargas
      .filter((r) => cajaIds.includes(r.cajaId))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map(aRecarga);
  },

  async registrarRecarga(r) {
    if (r.liquidacionRepuestaId) {
      const l = db.liquidaciones.find((x) => x.id === r.liquidacionRepuestaId);
      if (!l || l.cajaId !== r.cajaId || l.estado !== "aprobada")
        throw new ErrorDeNegocio("Solo se puede reponer una liquidación aprobada de la misma caja");
      l.estado = "repuesta";
    }
    const { liquidacionRepuestaId, ...resto } = r;
    db.recargas.push({
      ...resto,
      id: randomUUID(),
      liquidacionIngresoId: liquidacionAbierta(r.cajaId).id,
      liquidacionRepuestaId,
    });
  },
};
