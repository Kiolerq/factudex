"use client";

import { useSyncExternalStore } from "react";

type Estado = "servidor" | "instalada" | "iphone" | "lista" | "manual";

function leerEstado(): Estado {
  if (window.matchMedia("(display-mode: standalone)").matches) return "instalada";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "iphone";
  return window.__fxInstalar ? "lista" : "manual";
}

function suscribir(cambio: () => void) {
  window.addEventListener("fx-instalable", cambio);
  return () => window.removeEventListener("fx-instalable", cambio);
}

/**
 * Instalar Factudex en el celular. Solo instalada (no como acceso directo) aparece en el menú
 * "Compartir" de Android para recibir capturas de Yape, facturas de WhatsApp, etc.
 */
export function InstalarApp({ compacto = false }: { compacto?: boolean }) {
  const estado = useSyncExternalStore(suscribir, leerEstado, () => "servidor" as Estado);

  const instalar = async () => {
    const aviso = window.__fxInstalar;
    if (!aviso) return;
    await aviso.prompt();
    await aviso.userChoice;
    window.__fxInstalar = null;
    window.dispatchEvent(new Event("fx-instalable"));
  };

  // En la versión compacta (aviso en Registro) solo se muestra cuando Chrome ofrece instalar.
  if (compacto) {
    if (estado !== "lista") return null;
    return (
      <div className="fx-card flex items-center justify-between gap-3 px-4 py-3 text-[12.5px]">
        <span className="text-white/65">Instala Factudex para compartirle capturas de Yape y facturas.</span>
        <button type="button" onClick={instalar} className="fx-btn shrink-0 rounded-[9px] bg-fx-primary px-3 py-1.5 font-semibold text-white">
          Instalar
        </button>
      </div>
    );
  }

  return (
    <section className="fx-card flex flex-col gap-3 p-5 md:p-7">
      <div className="text-xs uppercase tracking-[1px] text-white/40">App en el celular</div>
      {estado === "instalada" && (
        <p className="text-sm text-white/65">
          <span className="text-fx-completo">●</span> Estás usando la app instalada. En Android aparece en el menú{" "}
          <strong>Compartir</strong> de Yape, WhatsApp o la galería como “Factudex”.
        </p>
      )}
      {estado === "lista" && (
        <>
          <p className="text-sm text-white/65">
            Instálala para que aparezca en el menú <strong>Compartir</strong> de Yape, WhatsApp y la galería.
          </p>
          <button type="button" onClick={instalar} className="fx-btn self-start rounded-[10px] bg-fx-primary px-5 py-2.5 text-[13px] font-semibold text-white">
            Instalar app
          </button>
        </>
      )}
      {estado === "manual" && (
        <div className="flex flex-col gap-2 text-sm text-white/65">
          <p>
            En Android, abre esta página en <strong>Chrome</strong> → menú <strong>⋮</strong> → <strong>Instalar app</strong>.
            Si solo dice “Agregar a pantalla principal”, elige <strong>Instalar</strong> (no “Crear acceso directo”).
          </p>
          <p className="text-xs text-white/45">
            ¿Ya la tenías como acceso directo? Bórralo de la pantalla de inicio y vuelve a instalarla. Un acceso directo no
            aparece en Compartir.
          </p>
        </div>
      )}
      {estado === "iphone" && (
        <p className="text-sm text-white/65">
          En iPhone: Safari → botón Compartir → <strong>Agregar a inicio</strong>. Apple no deja que las apps web reciban
          archivos desde “Compartir”; adjunta con “Tomar foto del comprobante” o eligiendo el archivo en el formulario.
        </p>
      )}
    </section>
  );
}
