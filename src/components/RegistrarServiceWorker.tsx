"use client";

import { useEffect } from "react";

/** Registra public/sw.js (necesario para recibir archivos con "Compartir" en Android). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
