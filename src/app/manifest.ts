import type { MetadataRoute } from "next";

// Web Share Target (Android): al compartir una captura desde Yape / BCP, el sistema
// hace POST multipart a /compartir. Esa ruta se implementa en fase 1 (ver docs/roadmap.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Factudex — Cajas chicas",
    short_name: "Factudex",
    description: "Registro y liquidación de cajas chicas de San Lorenzo y SIPE",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0E1A",
    theme_color: "#0A0E1A",
    lang: "es-PE",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    share_target: {
      action: "/compartir",
      method: "post",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        files: [{ name: "archivo", accept: ["image/*", "application/pdf"] }],
      },
    },
  };
}
