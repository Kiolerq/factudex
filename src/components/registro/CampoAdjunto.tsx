"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  etiqueta: string;
  ayuda: string;
  archivo: File | null;
  onElegir: (archivo: File) => void;
  onQuitar: () => void;
  error?: string;
  resaltarPendiente?: boolean;
}

const ACEPTA = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

/** Zona para adjuntar un archivo: arrastrar/soltar, elegir de galería o tomar foto. */
export function CampoAdjunto({ etiqueta, ayuda, archivo, onElegir, onQuitar, error, resaltarPendiente }: Props) {
  const galeria = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const vista = useMemo(
    () => (archivo && archivo.type.startsWith("image/") && archivo.type !== "image/heic" ? URL.createObjectURL(archivo) : null),
    [archivo],
  );
  useEffect(() => () => void (vista && URL.revokeObjectURL(vista)), [vista]);

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onElegir(f);
    e.target.value = "";
  };

  const borde = error
    ? "border-fx-error"
    : arrastrando
      ? "border-fx-primary"
      : resaltarPendiente
        ? "border-fx-pendiente/60"
        : "border-white/18";

  return (
    <div>
      <span className="fx-label">{etiqueta}</span>
      <input ref={galeria} type="file" accept={ACEPTA} hidden onChange={alElegir} />
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={alElegir} />

      {archivo ? (
        <div className="flex items-center gap-3 rounded-xl border border-fx-completo/40 bg-fx-completo/8 p-2.5">
          {vista ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
            <img src={vista} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/8 text-fx-2xs font-bold text-white/75">
              {archivo.type === "application/pdf" ? "PDF" : "IMG"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-fx-sm">{archivo.name}</div>
            <div className="text-fx-2xs text-white/68">{(archivo.size / 1024).toFixed(0)} KB</div>
          </div>
          <button
            type="button"
            onClick={onQuitar}
            className="fx-btn shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/8 hover:text-white"
          >
            Quitar
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => galeria.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && galeria.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onElegir(f);
          }}
          className={`cursor-pointer rounded-xl border-[1.5px] border-dashed bg-white/3 px-4 py-5 text-center transition-colors hover:bg-white/5 ${borde}`}
        >
          <div className="mb-1 text-fx-sm text-white/75">{ayuda}</div>
          <div className="text-fx-2xs text-white/60">JPG, PNG o PDF · máx. 10 MB</div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              camara.current?.click();
            }}
            className="fx-btn mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/14 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/82 md:hidden"
          >
            <span aria-hidden>📷</span> Tomar foto
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-fx-error">{error}</p>}
    </div>
  );
}
