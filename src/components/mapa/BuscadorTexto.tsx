"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Autocompletado liviano: en vez de volcar cientos de opciones en un <datalist>
 * (que hace que el navegador se trabe en cada tecla), solo calcula y dibuja
 * las primeras coincidencias.
 */
export function BuscadorTexto({
  valor,
  onChange,
  sugerencias,
  placeholder,
  ancho = "w-72",
  maxSugerencias = 12,
}: {
  valor: string;
  onChange: (v: string) => void;
  sugerencias: string[];
  placeholder?: string;
  ancho?: string;
  maxSugerencias?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alClickear = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", alClickear);
    return () => document.removeEventListener("mousedown", alClickear);
  }, [abierto]);

  const coincidencias = useMemo(() => {
    const q = valor.trim().toLowerCase();
    if (q.length < 2) return [];
    const salida: string[] = [];
    for (const s of sugerencias) {
      if (s.toLowerCase().includes(q)) {
        salida.push(s);
        if (salida.length >= maxSugerencias) break;
      }
    }
    return salida;
  }, [valor, sugerencias, maxSugerencias]);

  return (
    <div className={`relative ${ancho}`} ref={ref}>
      <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]" />
      <input
        value={valor}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pr-7 pl-8 text-[12.5px] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
      />
      {valor && (
        <button
          onClick={() => {
            onChange("");
            setAbierto(false);
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label="Limpiar búsqueda"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {abierto && coincidencias.length > 0 && (
        <ul className="absolute z-[1200] mt-1 max-h-64 w-full min-w-max overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {coincidencias.map((s) => (
            <li key={s}>
              <button
                onClick={() => {
                  onChange(s);
                  setAbierto(false);
                }}
                className="block w-full truncate px-2.5 py-1 text-left text-[12.5px] hover:bg-[var(--color-surface-muted)]"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
