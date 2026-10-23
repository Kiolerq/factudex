import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Pestañas precargadas (Link prefetch={true}): se reutilizan 60 s y luego se vuelven a pedir.
    // Guardar algo (Server Action con revalidatePath) las invalida al momento.
    staleTimes: { dynamic: 30, static: 60 },
  },
  async headers() {
    return [
      {
        // El service worker siempre se revisa (si no, el celular podría quedarse con uno viejo).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
