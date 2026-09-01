"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

export type RangoFecha = { desde: string; hasta: string };

export const RANGO_VACIO: RangoFecha = { desde: "", hasta: "" };

const formatear = (iso: string) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/** Devuelve la fecha de hoy menos N días, en formato ISO (yyyy-mm-dd). */
function haceDias(dias: number) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return f.toISOString().slice(0, 10);
}

const hoy = () => new Date().toISOString().slice(0, 10);

export function FiltroFecha({
  titulo = "Fecha",
  rango,
  onChange,
  ancho = "w-44",
}: {
  titulo?: string;
  rango: RangoFecha;
  onChange: (r: RangoFecha) => void;
  ancho?: string;
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

  const activo = Boolean(rango.desde || rango.hasta);

  const resumen = !activo
    ? "Todas"
    : rango.desde && rango.hasta
      ? rango.desde === rango.hasta
        ? formatear(rango.desde)
        : `${formatear(rango.desde)} – ${formatear(rango.hasta)}`
      : rango.desde
        ? `desde ${formatear(rango.desde)}`
        : `hasta ${formatear(rango.hasta)}`;

  const atajos: { etiqueta: string; rango: RangoFecha }[] = [
    { etiqueta: "Últimos 7 días", rango: { desde: haceDias(7), hasta: hoy() } },
    { etiqueta: "Últimos 30 días", rango: { desde: haceDias(30), hasta: hoy() } },
    { etiqueta: "Últimos 90 días", rango: { desde: haceDias(90), hasta: hoy() } },
    { etiqueta: "Campaña 25/26", rango: { desde: "2025-07-01", hasta: "2026-06-30" } },
  ];

  return (
    <div className={`relative ${ancho}`} ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex w-full items-center justify-between gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
          activo
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-border-strong)]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">
            <span className="text-[var(--color-ink-faint)]">{titulo}: </span>
            {resumen}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {abierto && (
        <div className="absolute z-[1200] mt-1 w-60 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-lg">
          <div className="mb-2 flex flex-col gap-1">
            {atajos.map((a) => (
              <button
                key={a.etiqueta}
                onClick={() => {
                  onChange(a.rango);
                  setAbierto(false);
                }}
                className="rounded px-2 py-1 text-left text-[12px] hover:bg-[var(--color-surface-muted)]"
              >
                {a.etiqueta}
              </button>
            ))}
          </div>

          <div className="border-t border-[var(--color-border)] pt-2">
            <label className="mb-1.5 block">
              <span className="mb-0.5 block text-[10.5px] tracking-wide text-[var(--color-ink-faint)] uppercase">
                Desde
              </span>
              <input
                type="date"
                value={rango.desde}
                max={rango.hasta || undefined}
                onChange={(e) => onChange({ ...rango, desde: e.target.value })}
                className="mono w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10.5px] tracking-wide text-[var(--color-ink-faint)] uppercase">
                Hasta
              </span>
              <input
                type="date"
                value={rango.hasta}
                min={rango.desde || undefined}
                onChange={(e) => onChange({ ...rango, hasta: e.target.value })}
                className="mono w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          </div>

          {activo && (
            <button
              onClick={() => {
                onChange(RANGO_VACIO);
                setAbierto(false);
              }}
              className="mt-2 w-full rounded px-2 py-1 text-[11.5px] text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
            >
              Limpiar fecha
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** ¿Alguna de las fechas cae dentro del rango? Rango vacío = no filtra. */
export function dentroDelRango(fechas: (string | null)[], rango: RangoFecha) {
  if (!rango.desde && !rango.hasta) return true;
  return fechas.some((f) => {
    if (!f) return false;
    const dia = f.slice(0, 10);
    if (rango.desde && dia < rango.desde) return false;
    if (rango.hasta && dia > rango.hasta) return false;
    return true;
  });
}
