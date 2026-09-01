"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type ClienteFila = {
  id: string;
  nombre: string;
  cuit: string | null;
  lotes: number;
  hectareas: number;
};

export function TablaClientes({ filas }: { filas: ClienteFila[] }) {
  const [q, setQ] = useState("");

  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const base = texto
      ? filas.filter(
          (f) =>
            f.nombre.toLowerCase().includes(texto) || f.cuit?.includes(texto)
        )
      : filas;
    return [...base].sort((a, b) => Number(b.hectareas) - Number(a.hectareas));
  }, [filas, q]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o CUIT..."
            className="w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-3 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <span className="mono text-[11px] text-[var(--color-ink-muted)]">
          {filtradas.length.toLocaleString("es-AR")} clientes
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">CUIT</th>
              <th className="px-3 py-2 text-right font-medium">Lotes</th>
              <th className="px-3 py-2 text-right font-medium">Hectáreas</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, 300).map((f) => (
              <tr
                key={f.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]"
              >
                <td className="px-3 py-1.5">{f.nombre}</td>
                <td className="mono px-3 py-1.5 text-[var(--color-ink-muted)]">
                  {f.cuit ?? "—"}
                </td>
                <td className="mono px-3 py-1.5 text-right">{f.lotes}</td>
                <td className="mono px-3 py-1.5 text-right">
                  {Math.round(Number(f.hectareas)).toLocaleString("es-AR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtradas.length > 300 && (
        <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
          Mostrando los 300 primeros por hectáreas. Refiná la búsqueda para ver otros.
        </p>
      )}
    </div>
  );
}
