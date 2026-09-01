"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, AlertTriangle } from "lucide-react";

export type LoteFila = {
  id: string;
  id_lote_externo: string;
  cultivo: string | null;
  hectareas_aseguradas: number | null;
  cliente_nombre: string | null;
  zona_nombre: string | null;
  lat: number | null;
  lon: number | null;
  tiene_siniestro: boolean;
};

const POR_PAGINA = 50;

export function TablaLotes({ filas }: { filas: LoteFila[] }) {
  const [q, setQ] = useState("");
  const [cultivo, setCultivo] = useState("");
  const [pagina, setPagina] = useState(0);

  const cultivos = useMemo(
    () => [...new Set(filas.map((f) => f.cultivo).filter(Boolean))].sort() as string[],
    [filas]
  );

  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return filas.filter((f) => {
      if (cultivo && f.cultivo !== cultivo) return false;
      if (!texto) return true;
      return (
        f.cliente_nombre?.toLowerCase().includes(texto) ||
        f.id_lote_externo?.toLowerCase().includes(texto)
      );
    });
  }, [filas, q, cultivo]);

  const paginadas = filtradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const totalPaginas = Math.ceil(filtradas.length / POR_PAGINA);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPagina(0);
            }}
            placeholder="Buscar cliente o ID de lote..."
            className="w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-3 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <select
          value={cultivo}
          onChange={(e) => {
            setCultivo(e.target.value);
            setPagina(0);
          }}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="">Todos los cultivos</option>
          {cultivos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="mono text-[11px] text-[var(--color-ink-muted)]">
          {filtradas.length.toLocaleString("es-AR")} lotes
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-faint)]">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Cultivo</th>
              <th className="px-3 py-2 text-right font-medium">Hectáreas</th>
              <th className="px-3 py-2 font-medium">Zona</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {paginadas.map((f) => (
              <tr
                key={f.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]"
              >
                <td className="mono px-3 py-1.5 text-[var(--color-ink-muted)]">
                  {f.lat && f.lon ? (
                    <Link
                      href={`/mapa?lat=${f.lat}&lon=${f.lon}`}
                      className="hover:text-[var(--color-accent)] hover:underline"
                    >
                      {f.id_lote_externo}
                    </Link>
                  ) : (
                    f.id_lote_externo
                  )}
                </td>
                <td className="px-3 py-1.5">{f.cliente_nombre ?? "—"}</td>
                <td className="px-3 py-1.5">{f.cultivo ?? "—"}</td>
                <td className="mono px-3 py-1.5 text-right">
                  {f.hectareas_aseguradas
                    ? Math.round(Number(f.hectareas_aseguradas)).toLocaleString("es-AR")
                    : "—"}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-ink-muted)]">
                  {f.zona_nombre ?? "—"}
                </td>
                <td className="px-3 py-1.5">
                  {f.tiene_siniestro ? (
                    <span className="inline-flex items-center gap-1 text-[var(--color-danger)]">
                      <AlertTriangle className="h-3 w-3" />
                      Siniestro
                    </span>
                  ) : (
                    <span className="text-[var(--color-ink-faint)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="mt-3 flex items-center justify-between text-[12px]">
          <button
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="mono text-[var(--color-ink-muted)]">
            {pagina + 1} / {totalPaginas}
          </span>
          <button
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            disabled={pagina >= totalPaginas - 1}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
