"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

type Opcion = { valor: string; etiqueta: string; color?: string; cantidad?: number };

export function FiltroMulti({
  titulo,
  opciones,
  seleccion,
  onChange,
  ancho = "w-44",
}: {
  titulo: string;
  opciones: Opcion[];
  seleccion: string[];
  onChange: (valores: string[]) => void;
  ancho?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alClickear(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickear);
    return () => document.removeEventListener("mousedown", alClickear);
  }, [abierto]);

  function alternar(valor: string) {
    onChange(
      seleccion.includes(valor)
        ? seleccion.filter((v) => v !== valor)
        : [...seleccion, valor]
    );
  }

  const resumen =
    seleccion.length === 0
      ? "Todos"
      : seleccion.length === 1
        ? (opciones.find((o) => o.valor === seleccion[0])?.etiqueta ?? seleccion[0])
        : `${seleccion.length} seleccionados`;

  return (
    <div className={`relative ${ancho}`} ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex w-full items-center justify-between gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
          seleccion.length > 0
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-border-strong)]"
        }`}
      >
        <span className="min-w-0 truncate">
          <span className="text-[var(--color-ink-faint)]">{titulo}: </span>
          {resumen}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {abierto && (
        <div className="absolute z-[1200] mt-1 max-h-72 w-full min-w-max overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {seleccion.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mb-1 w-full border-b border-[var(--color-border)] px-2.5 pb-1.5 text-left text-[11px] text-[var(--color-ink-faint)] hover:text-[var(--color-accent)]"
            >
              Limpiar selección
            </button>
          )}
          {opciones.map((o) => {
            const activo = seleccion.includes(o.valor);
            return (
              <button
                key={o.valor}
                onClick={() => alternar(o.valor)}
                className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[12.5px] hover:bg-[var(--color-surface-muted)]"
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                    activo
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                      : "border-[var(--color-border-strong)]"
                  }`}
                >
                  {activo && <Check className="h-2.5 w-2.5 text-white" />}
                </span>
                {o.color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: o.color }}
                  />
                )}
                <span className="flex-1 whitespace-nowrap">{o.etiqueta}</span>
                {o.cantidad !== undefined && (
                  <span className="mono text-[10.5px] text-[var(--color-ink-faint)]">
                    {o.cantidad.toLocaleString("es-AR")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
