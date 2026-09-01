"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { colorPorCultivo } from "@/lib/colores";
import { exportarCsv, exportarExcel, exportarPdf, type Columna } from "@/lib/exportar";
import { FiltroMulti } from "@/components/mapa/FiltroMulti";
import { BuscadorTexto } from "@/components/mapa/BuscadorTexto";

// Una fila por CUIT + cultivo: el multirriesgo se liquida por esa combinación.
export type ClienteCultivo = {
  cliente_id: string;
  cliente_nombre: string;
  cliente_cuit: string | null;
  cultivo: string;
  lotes: number;
  lotes_con_rinde: number;
  lotes_con_siniestro: number;
  hectareas: number;
  qq_asegurados: number;
  qq_estimados: number;
  indemnizacion_qq: number;
  porcentaje_indemnizacion: number;
};

const POR_PAGINA = 60;

const n = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("es-AR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

const soloDigitos = (v: string) => v.replace(/[^0-9]/g, "");

const COLUMNAS: Columna<ClienteCultivo>[] = [
  { clave: "cliente_nombre", titulo: "Asegurado", ancho: 34 },
  { clave: "cliente_cuit", titulo: "CUIT", ancho: 16 },
  { clave: "cultivo", titulo: "Cultivo", ancho: 12 },
  { clave: "lotes", titulo: "Lotes", ancho: 8 },
  { clave: "lotes_con_rinde", titulo: "Lotes con rinde cargado", ancho: 20 },
  { clave: "lotes_con_siniestro", titulo: "Lotes con siniestro", ancho: 18 },
  {
    clave: "hectareas",
    titulo: "Hectáreas",
    ancho: 12,
    valor: (f) => Math.round(Number(f.hectareas)),
  },
  {
    clave: "qq_asegurados",
    titulo: "Quintales asegurados",
    ancho: 18,
    valor: (f) => Math.round(Number(f.qq_asegurados)),
  },
  {
    clave: "qq_estimados",
    titulo: "Quintales estimados",
    ancho: 18,
    valor: (f) => Math.round(Number(f.qq_estimados)),
  },
  {
    clave: "indemnizacion_qq",
    titulo: "Indemnización (qq)",
    ancho: 17,
    valor: (f) => Math.round(Number(f.indemnizacion_qq)),
  },
  {
    clave: "porcentaje_indemnizacion",
    titulo: "% bajo lo asegurado",
    ancho: 18,
    valor: (f) => Number(f.porcentaje_indemnizacion),
  },
  {
    clave: "completo",
    titulo: "Cálculo",
    ancho: 14,
    valor: (f) =>
      f.lotes_con_rinde === 0
        ? "Sin rindes cargados"
        : f.lotes_con_rinde === f.lotes
          ? "Completo"
          : `Provisorio (faltan ${f.lotes - f.lotes_con_rinde} lotes)`,
  },
];

export function TablaClientes({ filas }: { filas: ClienteCultivo[] }) {
  const [texto, setTexto] = useState("");
  const [cultivos, setCultivos] = useState<string[]>([]);
  const [soloConIndemnizacion, setSoloConIndemnizacion] = useState(false);
  const [pagina, setPagina] = useState(0);

  const textoDif = useDeferredValue(texto);

  const opciones = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const f of filas) mapa.set(f.cultivo, (mapa.get(f.cultivo) ?? 0) + 1);
    return {
      cultivos: [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, cantidad]) => ({
          valor,
          etiqueta: valor,
          cantidad,
          color: colorPorCultivo(valor).fill,
        })),
      asegurados: [...new Set(filas.map((f) => f.cliente_nombre))].sort(),
    };
  }, [filas]);

  const filtradas = useMemo(() => {
    const q = textoDif.trim().toLowerCase();
    const cuit = soloDigitos(textoDif);
    const setCultivos = new Set(cultivos);

    return filas
      .filter((f) => {
        if (setCultivos.size && !setCultivos.has(f.cultivo)) return false;
        if (soloConIndemnizacion && Number(f.indemnizacion_qq) <= 0) return false;
        if (!q) return true;
        return (
          f.cliente_nombre.toLowerCase().includes(q) ||
          (cuit.length >= 3 && soloDigitos(f.cliente_cuit ?? "").includes(cuit))
        );
      })
      .sort((a, b) => Number(b.indemnizacion_qq) - Number(a.indemnizacion_qq) || Number(b.hectareas) - Number(a.hectareas));
  }, [filas, textoDif, cultivos, soloConIndemnizacion]);

  const totales = useMemo(
    () => ({
      hectareas: filtradas.reduce((a, f) => a + Number(f.hectareas), 0),
      asegurados: filtradas.reduce((a, f) => a + Number(f.qq_asegurados), 0),
      estimados: filtradas.reduce((a, f) => a + Number(f.qq_estimados), 0),
      // Solo se suman los cálculos completos: en los parciales faltan quintales
      // estimados y la indemnización daría mucho más alta de lo real.
      indemnizacion: filtradas
        .filter((f) => f.lotes > 0 && f.lotes_con_rinde === f.lotes)
        .reduce((a, f) => a + Number(f.indemnizacion_qq), 0),
      completas: filtradas.filter((f) => f.lotes > 0 && f.lotes_con_rinde === f.lotes).length,
      parciales: filtradas.filter((f) => f.lotes_con_rinde > 0 && f.lotes_con_rinde < f.lotes).length,
      sinRinde: filtradas.filter((f) => f.lotes_con_rinde === 0).length,
    }),
    [filtradas]
  );

  const paginadas = filtradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const nombreArchivo = `clientes-cultivo-${new Date().toISOString().slice(0, 10)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5 sm:px-5">
        <BuscadorTexto
          valor={texto}
          onChange={(v) => {
            setTexto(v);
            setPagina(0);
          }}
          sugerencias={opciones.asegurados}
          placeholder="Asegurado o CUIT..."
          ancho="w-full sm:w-64"
        />
        <FiltroMulti
          titulo="Cultivo"
          opciones={opciones.cultivos}
          seleccion={cultivos}
          onChange={(v) => {
            setCultivos(v);
            setPagina(0);
          }}
          ancho="w-40"
        />
        <button
          onClick={() => {
            setSoloConIndemnizacion((v) => !v);
            setPagina(0);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
            soloConIndemnizacion
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-strong)]"
          }`}
        >
          Solo con indemnización
        </button>

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden text-[11px] text-[var(--color-ink-faint)] sm:inline">
            Exportar {filtradas.length}:
          </span>
          <button
            onClick={() => exportarCsv(filtradas, COLUMNAS, nombreArchivo)}
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <FileText className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() =>
              exportarExcel(filtradas, COLUMNAS, nombreArchivo, "Clientes por cultivo")
            }
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>
          <button
            onClick={() =>
              exportarPdf(filtradas, COLUMNAS, nombreArchivo, "Clientes por cultivo")
            }
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* Totales del recorte */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-[12px] sm:px-5">
        <span>
          <span className="mono font-semibold">{n(filtradas.length)}</span>{" "}
          <span className="text-[var(--color-ink-faint)]">combinaciones CUIT+cultivo</span>
        </span>
        <span>
          <span className="mono font-semibold">{n(totales.hectareas)}</span>{" "}
          <span className="text-[var(--color-ink-faint)]">ha</span>
        </span>
        <span>
          <span className="mono font-semibold">{n(totales.asegurados)}</span>{" "}
          <span className="text-[var(--color-ink-faint)]">qq asegurados</span>
        </span>
        <span>
          <span className="mono font-semibold">{n(totales.estimados)}</span>{" "}
          <span className="text-[var(--color-ink-faint)]">qq estimados</span>
        </span>
        <span>
          <span className="mono font-semibold text-[var(--color-accent)]">
            {n(totales.indemnizacion)}
          </span>{" "}
          <span className="text-[var(--color-ink-faint)]">
            qq a indemnizar ({n(totales.completas)} cálculos completos)
          </span>
        </span>
        {(totales.parciales > 0 || totales.sinRinde > 0) && (
          <span
            className="flex items-center gap-1 text-[var(--color-warning)]"
            title="Mientras falten rindes por cargar, la indemnización de esas filas no es definitiva y no se suma al total."
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {n(totales.parciales)} parciales · {n(totales.sinRinde)} sin rinde
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
            <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] tracking-wide text-[var(--color-ink-faint)] uppercase">
              <th className="px-4 py-2 font-medium">Asegurado</th>
              <th className="px-2 py-2 font-medium">Cultivo</th>
              <th className="px-2 py-2 text-right font-medium">Lotes</th>
              <th className="px-2 py-2 text-right font-medium">Ha</th>
              <th className="px-2 py-2 text-right font-medium">qq aseg.</th>
              <th className="px-2 py-2 text-right font-medium">qq estim.</th>
              <th className="px-2 py-2 text-right font-medium">Indemniz.</th>
              <th className="px-2 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {paginadas.map((f) => {
              const parcial = f.lotes_con_rinde < f.lotes;
              const hayIndemnizacion = Number(f.indemnizacion_qq) > 0;
              return (
                <tr
                  key={`${f.cliente_id}-${f.cultivo}`}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]"
                >
                  <td className="max-w-64 px-4 py-1.5">
                    <div className="truncate">{f.cliente_nombre}</div>
                    <div className="mono text-[10.5px] text-[var(--color-ink-faint)]">
                      {f.cliente_cuit ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: colorPorCultivo(f.cultivo).fill }}
                      />
                      {f.cultivo}
                    </span>
                  </td>
                  <td className="mono px-2 py-1.5 text-right">
                    {f.lotes}
                    <span
                      className={
                        parcial
                          ? "text-[var(--color-warning)]"
                          : "text-[var(--color-ink-faint)]"
                      }
                      title={
                        parcial
                          ? "Faltan lotes con rinde estimado cargado"
                          : "Todos los lotes tienen rinde cargado"
                      }
                    >
                      {" "}
                      ({f.lotes_con_rinde})
                    </span>
                  </td>
                  <td className="mono px-2 py-1.5 text-right">{n(f.hectareas)}</td>
                  <td className="mono px-2 py-1.5 text-right">{n(f.qq_asegurados)}</td>
                  <td className="mono px-2 py-1.5 text-right">
                    {f.lotes_con_rinde === 0 ? "—" : n(f.qq_estimados)}
                  </td>
                  <td
                    className={`mono px-2 py-1.5 text-right font-semibold ${
                      parcial
                        ? "text-[var(--color-warning)]"
                        : hayIndemnizacion
                          ? "text-[var(--color-accent)]"
                          : ""
                    }`}
                    title={
                      parcial
                        ? `Provisorio: faltan ${f.lotes - f.lotes_con_rinde} lotes por cargar`
                        : undefined
                    }
                  >
                    {f.lotes_con_rinde === 0 ? "—" : n(f.indemnizacion_qq)}
                    {parcial && f.lotes_con_rinde > 0 && " *"}
                  </td>
                  <td className="mono px-2 py-1.5 text-right">
                    {f.lotes_con_rinde === 0
                      ? "—"
                      : `${n(f.porcentaje_indemnizacion, 1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtradas.length === 0 && (
          <p className="p-8 text-center text-[12px] text-[var(--color-ink-muted)]">
            No hay resultados con esos filtros.
          </p>
        )}

        {totales.parciales > 0 && (
          <p className="px-4 py-3 text-[11px] text-[var(--color-ink-faint)] sm:px-5">
            * Cálculo provisorio: todavía faltan lotes con el rinde estimado cargado, así
            que la indemnización va a bajar a medida que se completen.
          </p>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2 text-[12px] sm:px-5">
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
