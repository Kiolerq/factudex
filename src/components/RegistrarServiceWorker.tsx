"use client";

import { useEffect } from "react";

/** Evento de Chrome para instalar la app (no está en los tipos del DOM). */
export interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __fxInstalar?: EventoInstalar | null;
  }
}

/**
 * Registra public/sw.js (necesario para recibir archivos con "Compartir" en Android) y guarda el
 * aviso de instalación de Chrome para el botón "Instalar app" (llega una sola vez, al cargar).
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    const alAvisar = (e: Event) => {
      e.preventDefault();
      window.__fxInstalar = e as EventoInstalar;
      window.dispatchEvent(new Event("fx-instalable"));
    };
    const alInstalar = () => {
      window.__fxInstalar = null;
      window.dispatchEvent(new Event("fx-instalable"));
    };
    window.addEventListener("beforeinstallprompt", alAvisar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alAvisar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);
  return null;
}
