"use client";

import { useState } from "react";
import { BotonBorrarFoto } from "./BotonBorrarFoto";

export type FotoGaleria = {
  id: string;
  url: string | null;
  nombre_original: string | null;
  created_at: string;
  puede_borrar: boolean;
};

export function GaleriaFotos({ fotos: iniciales }: { fotos: FotoGaleria[] }) {
  const [fotos, setFotos] = useState(iniciales);
  const [aviso, setAviso] = useState<string | null>(null);

  if (fotos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-10 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          No quedan fotos cargadas.
        </p>
      </div>
    );
  }

  return (
    <>
      {aviso && (
        <p className="mb-2 text-[12px] text-[var(--color-warning)]">{aviso}</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {fotos.map((f) => (
          <figure
            key={f.id}
            className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            {f.url ? (
              <a href={f.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={f.nombre_original ?? "Foto de campo"}
                  className="aspect-4/3 w-full object-cover transition-opacity hover:opacity-90"
                />
              </a>
            ) : (
              <div className="flex aspect-4/3 items-center justify-center bg-[var(--color-surface-muted)] text-[11px] text-[var(--color-ink-faint)]">
                Sin vista previa
              </div>
            )}
            <figcaption className="flex items-start gap-1 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px]">{f.nombre_original ?? "—"}</p>
                <p className="mono text-[10px] text-[var(--color-ink-faint)]">
                  {new Date(f.created_at).toLocaleString("es-AR")}
                </p>
              </div>
              {f.puede_borrar && (
                <BotonBorrarFoto
                  fotoId={f.id}
                  onBorrada={(msg) => {
                    setFotos((prev) => prev.filter((x) => x.id !== f.id));
                    setAviso(msg);
                  }}
                />
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
