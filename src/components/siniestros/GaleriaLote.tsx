"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

type Foto = {
  id: string;
  url: string | null;
  nombre_original: string | null;
  created_at: string;
  subido_por_nombre: string | null;
};

export function GaleriaLote({
  loteId,
  titulo,
  onCerrar,
}: {
  loteId: string;
  titulo: string;
  onCerrar: () => void;
}) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/fotos/${loteId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setFotos(d.fotos ?? []);
      })
      .catch(() => setError("No se pudieron cargar las fotos."));
  }, [loteId]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-6"
      onClick={onCerrar}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <div>
            <p className="text-[13px] font-semibold">Fotos del lote</p>
            <p className="text-[11.5px] text-[var(--color-ink-muted)]">{titulo}</p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}

          {!fotos && !error && (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[var(--color-ink-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando fotos...
            </div>
          )}

          {fotos && fotos.length === 0 && (
            <p className="py-10 text-center text-[12px] text-[var(--color-ink-muted)]">
              Este lote todavía no tiene fotos cargadas.
            </p>
          )}

          {fotos && fotos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {fotos.map((f) => (
                <figure
                  key={f.id}
                  className="overflow-hidden rounded-lg border border-[var(--color-border)]"
                >
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.nombre_original ?? "Foto del lote"}
                        className="aspect-4/3 w-full object-cover transition-opacity hover:opacity-90"
                      />
                    </a>
                  ) : (
                    <div className="flex aspect-4/3 items-center justify-center bg-[var(--color-surface-muted)] text-[11px] text-[var(--color-ink-faint)]">
                      Sin vista previa
                    </div>
                  )}
                  <figcaption className="px-2 py-1.5">
                    <p className="mono text-[10px] text-[var(--color-ink-faint)]">
                      {new Date(f.created_at).toLocaleString("es-AR")}
                    </p>
                    {f.subido_por_nombre && (
                      <p className="truncate text-[10.5px] text-[var(--color-ink-muted)]">
                        {f.subido_por_nombre}
                      </p>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
