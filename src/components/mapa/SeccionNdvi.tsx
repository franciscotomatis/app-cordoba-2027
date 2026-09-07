"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ImageOverlay, MapContainer, GeoJSON as CapaGeoJson, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Geometry } from "geojson";
import { Loader2, Satellite } from "lucide-react";
import { colorNdvi, ESCALA_NDVI, paradasDeColor } from "@/lib/ndvi";

type Punto = { fecha: string; ndvi: number; nubosidad: number | null };

type Respuesta = {
  serie: Punto[];
  resumen: {
    desde: string;
    hasta: string;
    fechas: number;
    maximo: number;
    ultimo: number;
  } | null;
  aviso: string | null;
  fuente: string;
};

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const fechaCorta = (v: string) => {
  const [a, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Extremos de la geometría, para encuadrar el mapa y recortar la imagen. */
function limites(g: Geometry): L.LatLngBoundsExpression {
  const lats: number[] = [];
  const lons: number[] = [];

  const recorrer = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      lons.push(c[0] as number);
      lats.push(c[1] as number);
      return;
    }
    if (Array.isArray(c)) c.forEach(recorrer);
  };

  recorrer((g as { coordinates: unknown }).coordinates);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}

export function SeccionNdvi({
  loteId,
  geometria,
}: {
  loteId: string;
  geometria: Geometry | null;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fechaImagen, setFechaImagen] = useState<string>("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [cargandoImagen, setCargandoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lotes/${loteId}/ndvi`)
      .then((r) => r.json())
      .then((d: Respuesta & { error?: string }) => {
        if (d.error) setError(d.error);
        else {
          setDatos(d);
          // Arranca en la última fecha disponible, que es la más útil.
          if (d.serie.length > 0) setFechaImagen(d.serie[d.serie.length - 1].fecha);
        }
      })
      .catch(() => setError("No se pudo cargar el NDVI."));
  }, [loteId]);

  const paradas = useMemo(() => paradasDeColor(datos?.serie ?? []), [datos]);
  const encuadre = useMemo(() => (geometria ? limites(geometria) : null), [geometria]);

  async function pedirImagen() {
    if (!fechaImagen) return;
    setCargandoImagen(true);
    setErrorImagen(null);
    setImagen(null);

    try {
      const r = await fetch(`/api/lotes/${loteId}/ndvi/imagen?fecha=${fechaImagen}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "No se pudo traer la imagen." }));
        setErrorImagen(d.error ?? "No se pudo traer la imagen.");
        return;
      }
      setImagen(URL.createObjectURL(await r.blob()));
    } catch {
      setErrorImagen("No se pudo traer la imagen.");
    } finally {
      setCargandoImagen(false);
    }
  }

  return (
    <>
      <section className="rounded-md border border-[var(--color-border)] p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
            Evolución del NDVI
          </p>
          {datos?.resumen && (
            <>
              <span className="text-[12px]">
                <span className="text-[var(--color-ink-faint)]">último </span>
                <span
                  className="mono font-semibold"
                  style={{ color: colorNdvi(datos.resumen.ultimo) }}
                >
                  {datos.resumen.ultimo.toFixed(2)}
                </span>
              </span>
              <span className="text-[12px]">
                <span className="text-[var(--color-ink-faint)]">máximo de campaña </span>
                <span
                  className="mono font-semibold"
                  style={{ color: colorNdvi(datos.resumen.maximo) }}
                >
                  {datos.resumen.maximo.toFixed(2)}
                </span>
              </span>
              <span className="mono text-[11.5px] text-[var(--color-ink-muted)]">
                {datos.resumen.fechas} fechas sin nubes
              </span>
            </>
          )}
        </div>

        <div className="h-52">
          {error ? (
            <p className="pt-14 text-center text-[12px] text-[var(--color-danger)]">{error}</p>
          ) : !datos ? (
            <div className="flex h-full items-center justify-center gap-2 text-[12px] text-[var(--color-ink-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Consultando Sentinel-2...
            </div>
          ) : datos.serie.length === 0 ? (
            <p className="pt-14 text-center text-[12px] text-[var(--color-ink-muted)]">
              {datos.aviso ?? "No hay fechas sin nubes en el período."}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={datos.serie}
                margin={{ top: 5, right: 8, bottom: 0, left: -22 }}
              >
                <defs>
                  {/* La línea cambia de color según el valor de cada fecha. */}
                  <linearGradient id="lineaNdvi" x1="0" y1="0" x2="1" y2="0">
                    {paradas.map((p, i) => (
                      <stop key={i} offset={p.offset} stopColor={p.color} />
                    ))}
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fontSize: 10, fill: "var(--color-ink-faint)" }}
                  stroke="var(--color-border-strong)"
                  minTickGap={35}
                  tickFormatter={(f: string) =>
                    MESES_CORTOS[Number(String(f).split("-")[1]) - 1] ?? String(f)
                  }
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                  stroke="var(--color-border-strong)"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(f) => fechaCorta(String(f))}
                  formatter={(valor) => [Number(valor).toFixed(2), "NDVI"]}
                />
                {/* 0,3 es el umbral donde un cultivo implantado ya debería estar. */}
                <ReferenceLine y={0.3} stroke="var(--color-border-strong)" strokeDasharray="4 3" />
                <Line
                  type="monotone"
                  dataKey="ndvi"
                  name="NDVI"
                  stroke="url(#lineaNdvi)"
                  strokeWidth={2.5}
                  dot={(props) => {
                    const { cx, cy, payload, index } = props as {
                      cx: number;
                      cy: number;
                      payload: Punto;
                      index: number;
                    };
                    return (
                      <circle
                        key={index}
                        cx={cx}
                        cy={cy}
                        r={2.5}
                        fill={colorNdvi(payload.ndvi)}
                        stroke="none"
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {datos && datos.serie.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {ESCALA_NDVI.map((t) => (
              <span key={t.color} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: t.color }}
                />
                <span className="text-[10px] text-[var(--color-ink-faint)]">
                  {t.etiqueta}
                </span>
              </span>
            ))}
          </div>
        )}

        {datos?.aviso && datos.serie.length > 0 && (
          <p className="mt-1 text-[10.5px] text-[var(--color-warning)]">{datos.aviso}</p>
        )}
        {datos && (
          <p className="mt-1 text-[10.5px] text-[var(--color-ink-faint)]">{datos.fuente}</p>
        )}
      </section>

      {/* Imagen NDVI del lote en una fecha */}
      <section className="rounded-md border border-[var(--color-border)] p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
            Imagen del lote
          </p>

          <div className="ml-auto flex items-center gap-1.5">
            <select
              value={fechaImagen}
              onChange={(e) => setFechaImagen(e.target.value)}
              disabled={!datos || datos.serie.length === 0}
              className="mono rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
            >
              {(datos?.serie ?? [])
                .slice()
                .reverse()
                .map((p) => (
                  <option key={p.fecha} value={p.fecha}>
                    {fechaCorta(p.fecha)} · {p.ndvi.toFixed(2)}
                  </option>
                ))}
              {(!datos || datos.serie.length === 0) && <option>Sin fechas</option>}
            </select>

            <button
              onClick={pedirImagen}
              disabled={cargandoImagen || !fechaImagen}
              className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
            >
              {cargandoImagen ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Satellite className="h-3.5 w-3.5" />
              )}
              Traer imagen
            </button>
          </div>
        </div>

        {errorImagen && (
          <p className="mb-2 text-[11.5px] text-[var(--color-danger)]">{errorImagen}</p>
        )}

        <div className="h-72 overflow-hidden rounded-md border border-[var(--color-border)]">
          {encuadre ? (
            <MapContainer
              bounds={encuadre}
              className="h-full w-full"
              scrollWheelZoom={false}
              attributionControl={false}
            >
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              {imagen && <ImageOverlay url={imagen} bounds={encuadre} opacity={0.92} />}
              {geometria && (
                <CapaGeoJson
                  data={geometria}
                  style={{ color: "#ffffff", weight: 2, fill: false }}
                />
              )}
            </MapContainer>
          ) : (
            <p className="pt-28 text-center text-[12px] text-[var(--color-ink-muted)]">
              Sin geometría del lote.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
