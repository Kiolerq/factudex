"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { actualizarUsuario, cambiarContrasenaUsuario, crearUsuario } from "@/app/acciones";
import type { UsuarioAdmin } from "@/lib/datos/tipos";

interface EmpresaCajas {
  id: string;
  nombre: string;
  cajas: { id: string; codigo: string; nombre: string }[];
}

interface Props {
  usuarios: UsuarioAdmin[];
  miId: string;
  /** El admin gestiona a todos; tesorería, solo a los registradores. */
  soyAdmin: boolean;
  empresas: EmpresaCajas[];
}

type Tipo = "registrador" | "tesoreria" | "admin";
const TIPOS: { id: Tipo; texto: string; ayuda: string }[] = [
  { id: "registrador", texto: "Registrador", ayuda: "Registra gastos y liquida solo sus cajas" },
  { id: "tesoreria", texto: "Tesorería", ayuda: "Todas las cajas: ingresos, aprobación, autorizaciones, cajas y registradores" },
  { id: "admin", texto: "Administrador", ayuda: "Todo, más gestionar a cualquier usuario" },
];
const tipoDe = (u: UsuarioAdmin): Tipo => (u.esAdmin ? "admin" : u.esTesoreria ? "tesoreria" : "registrador");

type Edicion = { modo: "nuevo" } | { modo: "editar"; usuario: UsuarioAdmin };

/** Contraseña temporal fácil de dictar (sin 0/O ni 1/l). */
function generarContrasena(): string {
  const letras = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const n = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(n, (x) => letras[x % letras.length]).join("");
}

export function GestionUsuarios({ usuarios, miId, soyAdmin, empresas }: Props) {
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const codigoDe = new Map(empresas.flatMap((e) => e.cajas.map((c) => [c.id, c.codigo] as const)));

  const abrir = (e: Edicion) => {
    setEdicion(e);
    setCreado(null);
    setTimeout(() => editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  return (
    <div className="flex flex-col gap-4">
      {creado && (
        <div role="status" className="fx-card flex flex-col gap-2 border-fx-completo/40! p-4 text-[13px]">
          <span className="font-semibold text-fx-completo">● Usuario creado.</span>
          <span className="text-white/65">
            Pásale sus datos para entrar a <strong>factudex.vercel.app</strong> (la contraseña no se vuelve a mostrar; puede
            cambiarla en Mi cuenta):
          </span>
          <code className="rounded-lg bg-white/8 px-3 py-2 text-white">
            Correo: {creado.email} · Contraseña: {creado.password}
          </code>
        </div>
      )}

      <div ref={editor} className="scroll-mt-4">
        {edicion ? (
          <EditorUsuario
            key={edicion.modo === "editar" ? edicion.usuario.id : "nuevo"}
            edicion={edicion}
            empresas={empresas}
            soyAdmin={soyAdmin}
            esYo={edicion.modo === "editar" && edicion.usuario.id === miId}
            onCerrar={() => setEdicion(null)}
            onCreado={(c) => {
              setEdicion(null);
              setCreado(c);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => abrir({ modo: "nuevo" })}
            className="fx-btn rounded-[10px] bg-fx-primary px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {usuarios.map((u) => (
          <div key={u.id} className={`fx-card flex flex-col gap-2 p-4 md:flex-row md:items-center md:gap-5 md:px-5 ${u.activo ? "" : "opacity-55"}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[14px] font-semibold">{u.nombre}</span>
                {u.esAdmin && <Etiqueta clase="border-fx-primary-line bg-fx-primary-soft text-fx-primary-light">Administrador</Etiqueta>}
                {u.esTesoreria && !u.esAdmin && (
                  <Etiqueta clase="border-fx-completo/40 bg-fx-completo/12 text-fx-completo">Tesorería</Etiqueta>
                )}
                {!u.activo && <Etiqueta clase="border-fx-error/40 bg-fx-error/12 text-fx-error">Desactivado</Etiqueta>}
                {u.id === miId && <Etiqueta clase="border-white/15 bg-white/6 text-white/55">Tú</Etiqueta>}
              </div>
              <div className="truncate text-[12px] text-white/45">{u.email ?? "sin correo"}</div>
              <div className="mt-1 text-[12px] text-white/60">
                {u.esAdmin ? (
                  "Ve y hace todo en todas las cajas"
                ) : u.esTesoreria ? (
                  "Todas las cajas: ingresos, aprobación, autorizaciones y cajas"
                ) : (
                  <>
                    Registrador ·{" "}
                    {u.accesos.some((a) => codigoDe.has(a.cajaId)) ? (
                      u.accesos.flatMap((a) => codigoDe.get(a.cajaId) ?? []).join(", ")
                    ) : (
                      <span className="text-fx-pendiente">sin cajas asignadas</span>
                    )}
                  </>
                )}
              </div>
            </div>
            {(soyAdmin || tipoDe(u) === "registrador") && (
            <button
              type="button"
              onClick={() => abrir({ modo: "editar", usuario: u })}
              className="fx-btn self-start rounded-[10px] border border-white/12 px-4 py-2 text-[13px] text-white/75 hover:text-white md:self-center"
            >
              Editar
            </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Etiqueta({ clase, children }: { clase: string; children: React.ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${clase}`}>{children}</span>;
}

function EditorUsuario({
  edicion,
  empresas,
  soyAdmin,
  esYo,
  onCerrar,
  onCreado,
}: {
  edicion: Edicion;
  empresas: EmpresaCajas[];
  soyAdmin: boolean;
  esYo: boolean;
  onCerrar: () => void;
  onCreado: (c: { email: string; password: string }) => void;
}) {
  const router = useRouter();
  const u = edicion.modo === "editar" ? edicion.usuario : null;
  const [nombre, setNombre] = useState(u?.nombre ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => (u ? "" : generarContrasena()));
  const [tipo, setTipo] = useState<Tipo>(u ? tipoDe(u) : "registrador");
  const [activo, setActivo] = useState(u?.activo ?? true);
  // Las cajas del registrador (solo las activas se muestran; las cerradas se quitan al guardar).
  const [cajas, setCajas] = useState<Set<string>>(() => new Set((u?.accesos ?? []).map((a) => a.cajaId)));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [guardando, iniciar] = useTransition();

  const activas = new Set(empresas.flatMap((e) => e.cajas.map((c) => c.id)));
  const datos = () => ({
    nombre,
    esAdmin: tipo === "admin",
    esTesoreria: tipo === "tesoreria",
    modulos: null, // el registrador ve Registro, Pendientes, Historial y Liquidaciones de sus cajas
    accesos:
      tipo === "registrador"
        ? [...cajas].filter((id) => activas.has(id)).map((cajaId) => ({ cajaId, rol: "registrador" as const }))
        : [],
  });
  const marcar = (id: string) =>
    setCajas((xs) => {
      const n = new Set(xs);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setAviso("");
    iniciar(async () => {
      if (u) {
        const r = await actualizarUsuario({ id: u.id, activo, ...datos() });
        if (r.ok) {
          router.refresh();
          onCerrar();
        } else setErrores(r.errores);
      } else {
        const r = await crearUsuario({ email, password, ...datos() });
        if (r.ok) {
          router.refresh();
          onCreado({ email: email.trim().toLowerCase(), password });
        } else setErrores(r.errores);
      }
    });
  };

  const cambiarClave = () =>
    iniciar(async () => {
      setAviso("");
      const r = await cambiarContrasenaUsuario({ id: u!.id, password });
      if (r.ok) setAviso(`Contraseña cambiada. Pásale la nueva: ${password}`);
      else setErrores(r.errores);
    });

  const sinCajas = tipo === "registrador" && ![...cajas].some((id) => activas.has(id));

  return (
    <form onSubmit={guardar} noValidate className="fx-card flex flex-col gap-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">{u ? `Editar · ${u.nombre}` : "Nuevo usuario"}</h2>
        <button type="button" onClick={onCerrar} className="fx-btn text-[13px] text-white/50 hover:text-white">
          Cerrar
        </button>
      </div>

      {errores._ && (
        <div role="alert" className="rounded-xl border border-fx-error/50 bg-fx-error/10 px-4 py-3 text-sm text-fx-error">
          {errores._}
        </div>
      )}

      <div className="grid gap-3.5 md:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre *" error={errores.nombre}>
          <input id="nombre" className="fx-input" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={!!errores.nombre} />
        </Campo>
        {u ? (
          <Campo id="correo" etiqueta="Correo">
            <input id="correo" className="fx-input opacity-60" value={u.email ?? ""} disabled />
          </Campo>
        ) : (
          <Campo id="correo" etiqueta="Correo *" error={errores.email}>
            <input
              id="correo"
              type="email"
              className="fx-input"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errores.email}
            />
          </Campo>
        )}
        <Campo id="clave" etiqueta={u ? "Nueva contraseña" : "Contraseña temporal *"} error={errores.password}>
          <div className="flex gap-2">
            <input
              id="clave"
              className="fx-input font-mono"
              autoComplete="new-password"
              placeholder={u ? "Déjala vacía para no cambiarla" : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errores.password}
            />
            <button
              type="button"
              onClick={() => setPassword(generarContrasena())}
              className="fx-btn shrink-0 rounded-[10px] border border-white/12 px-3 text-[12px] text-white/70"
            >
              Generar
            </button>
          </div>
          {u && (
            <button
              type="button"
              disabled={guardando || password.length < 8}
              onClick={cambiarClave}
              className="fx-btn mt-2 rounded-[10px] border border-white/12 px-3 py-1.5 text-[12px] text-white/75 disabled:opacity-40"
            >
              Cambiar contraseña
            </button>
          )}
          {aviso && <p className="mt-1.5 text-xs text-fx-completo">{aviso}</p>}
        </Campo>
        <div className="flex flex-col justify-end gap-2.5">
          {u && (
            <Interruptor
              activo={activo}
              onCambiar={setActivo}
              deshabilitado={esYo}
              texto="Activo"
              ayuda="Desactivado no puede entrar (se puede reactivar)"
            />
          )}
        </div>
      </div>

      {soyAdmin && (
        <fieldset className="flex flex-col gap-2">
          <legend className="fx-label">Tipo de usuario</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tipo === t.id}
                disabled={esYo && t.id !== "admin"}
                onClick={() => setTipo(t.id)}
                className={`fx-btn rounded-[12px] border px-3.5 py-2.5 text-left disabled:opacity-40 ${
                  tipo === t.id ? "border-fx-primary bg-fx-primary-soft" : "border-white/12"
                }`}
              >
                <span className={`block text-[13px] font-semibold ${tipo === t.id ? "text-fx-primary-light" : "text-white/80"}`}>{t.texto}</span>
                <span className="block text-[11.5px] text-white/45">{t.ayuda}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {tipo === "registrador" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="fx-label">Cajas que maneja</legend>
          <p className="-mt-1 text-[11.5px] text-white/45">
            Solo en estas cajas registra gastos, adjunta comprobantes y genera su liquidación. Puedes agregarle o quitarle cajas
            cuando quieras.
          </p>
          {empresas.map((e) => (
            <div key={e.id} className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.6px] text-white/40">{e.nombre}</div>
              {e.cajas.length === 0 && <p className="text-[12px] text-white/40">Sin cajas activas.</p>}
              <div className="grid gap-2 md:grid-cols-2">
                {e.cajas.map((c) => {
                  const marcada = cajas.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-[13px] ${
                        marcada ? "border-fx-primary bg-fx-primary-soft" : "border-white/12"
                      }`}
                    >
                      <input type="checkbox" checked={marcada} onChange={() => marcar(c.id)} />
                      <span className="min-w-0">
                        <span className="block font-display font-bold">{c.codigo}</span>
                        <span className="block truncate text-[11.5px] text-white/50">{c.nombre}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {sinCajas && <p className="text-xs text-fx-pendiente">Sin ninguna caja, al entrar verá “no tienes cajas asignadas”.</p>}
        </fieldset>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="fx-btn rounded-[10px] px-4 py-2 text-[13px] text-white/60">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="fx-btn rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {guardando ? "Guardando…" : u ? "Guardar cambios" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}

function Campo({ id, etiqueta, error, children }: { id: string; etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="fx-label">
        {etiqueta}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-fx-error">{error}</p>}
    </div>
  );
}

function Interruptor({
  activo,
  onCambiar,
  deshabilitado,
  texto,
  ayuda,
}: {
  activo: boolean;
  onCambiar: (v: boolean) => void;
  deshabilitado?: boolean;
  texto: string;
  ayuda: string;
}) {
  return (
    <label className={`flex items-start gap-3 text-[13px] ${deshabilitado ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        className="mt-1"
        checked={activo}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.checked)}
      />
      <span>
        <span className="font-semibold">{texto}</span>
        <span className="block text-[11.5px] text-white/45">{ayuda}</span>
      </span>
    </label>
  );
}
