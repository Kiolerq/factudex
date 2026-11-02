import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import "./globals.css";

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Factudex",
  description: "Control de cajas chicas — San Lorenzo y SIPE",
  applicationName: "Factudex",
};

export const viewport: Viewport = {
  themeColor: "#F3F5F9",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      data-empresa="SL"
      className={`${grotesk.variable} ${plex.variable} h-full antialiased`}
      suppressHydrationWarning // data-letra y data-tema los pone el script de abajo
    >
      <head>
        {/* "Letra extra grande" y "Tema oscuro" (Mi cuenta): se aplican antes de pintar para que no salte. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement.dataset;if(localStorage.getItem("fx_letra")==="grande")d.letra="grande";if(localStorage.getItem("fx_tema")==="oscuro")d.tema="oscuro"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
