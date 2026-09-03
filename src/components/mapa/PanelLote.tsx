"use client";

import { useEffect, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Camera, Loader2, Maximize2, Minimize2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { colorPorCultivo, COLOR_CAUSA, COLOR_CAUSA_DEFAULT } from "@/lib/colores";
import { ETIQUETA_ESTADO } from "@/lib/siniestros";

export type LoteDetalle = {
  id: string;
  loteId: string;
  lote: string | null;
  campo: string | null;
  departamento: string | null;
  localidad: string | null;
  cultivo: string | null;
  cultivoAnterior: string | null;
  hectareas: number | null;
  hectareasDeclaradas: number | null;
  porcentajeAsegurado: number | null;
  rendimientoAsegurado: number | null;
  rendimientoAnterior: number | null;
  rindeEstimado: number | null;
  sumaAsegurada: number | null;
  fechaSiembra: string | null;
  estado: string | null;
  cliente: string | null;
  cuit: string | null;
  zona: string | null;
  siniestros: {
    causa: string;
    fecha: string | null;
    danio_estimado: number | null;
    estado: string | null;
  }[];
};

type Clima = {
  anio: number;
  serie: { mes: string; historico: number | null; actual: number | null }[];
  temperatura: {
    mes: string;
    min: number | null;
    med: number | null;
    max: number | null;
    rango: [number, number] | null;
  }[];
  totalHistorico: number;
  totalActual: number;
  historicoALaFecha: number;
  fuente: string;
};

type Foto = {
  id: string;
  url: string | null;
  nombre_original: string | null;
  created_at: string;
  subido_por_nombre: string | null;
};

const num = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("es-AR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

const fecha = (v: string | null) => {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : v;
};

function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] py-1.5 last:border-0">
      <span className="text-[11.5px] text-[var(--color-ink-faint)]">{etiqueta}</span>
      <span
        className={`mono text-[12px] ${destacado ? "font-semibold text-[var(--color-accent)]" : ""}`}
      >
        {valor}
      </span>
    </div>
  );
}

export function PanelLote({
  lote,
  puedeEditar,
  onCerrar,
  onRindeGuardado,
}: {
  lote: LoteDetalle;
  puedeEditar: boolean;
  onCerrar: () => void;
  onRindeGuardado: (loteId: string, valor: number | null) => void;
}) {
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [clima, setClima] = useState<Clima | null>(null);
  const [errorClima, setErrorClima] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [rinde, setRinde] = useState(
    lote.rindeEstimado === null || lote.rindeEstimado === undefined
      ? ""
      : String(lote.rindeEstimado)
  );
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const rindeAsegPorHa =
    lote.hectareas && lote.rendimientoAsegurado
      ? Math.round(Number(lote.rendimientoAsegurado) / Number(lote.hectareas))
      : null;

  useEffect(() => {
    fetch(`/api/lotes/${lote.id}/clima`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErrorClima(d.error) : setClima(d)))
      .catch(() => setErrorClima("No se pudo cargar la precipitación."));
  }, [lote.id]);

  const cargarFotos = () =>
    fetch(`/api/fotos/${lote.id}`)
      .then((r) => r.json())
      .then((d) => setFotos(d.fotos ?? []))
      .catch(() => setFotos([]));

  useEffect(() => {
    cargarFotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote.id]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  async function guardarRinde() {
    const limpio = rinde.trim().replace(",", ".");
    const valor = limpio === "" ? null : Number(limpio);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      setAviso("Ingresá un rinde válido en qq/ha.");
      return;
    }

    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("lotes")
      .update({
        rinde_estimado: valor,
        rinde_estimado_en: valor === null ? null : new Date().toISOString(),
      })
      .eq("id", lote.id);
    setGuardando(false);

    if (error) {
      setAviso(`No se pudo guardar: ${error.message}`);
      return;
    }
    setAviso("Rinde guardado.");
    onRindeGuardado(lote.id, valor);
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setGuardando(true);
    setAviso("Subiendo foto...");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setGuardando(false);
      setAviso("Sesión vencida, volvé a entrar.");
      return;
    }

    const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
    const ruta = `${user.id}/${Date.now()}.${extension}`;

    const { error: errorSubida } = await supabase.storage
      .from("fotos")
      .upload(ruta, archivo, { contentType: archivo.type || "image/jpeg" });

    if (errorSubida) {
      setGuardando(false);
      setAviso(`No se pudo subir: ${errorSubida.message}`);
      return;
    }

    // La ubicación del lote alcanza para georreferenciar la foto; si el
    // dispositivo da su posición, se usa esa, que es más precisa.
    const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p.coords),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });

    const { error: errorFila } = await supabase.from("fotos").insert({
      lote_id: lote.id,
      storage_path: ruta,
      nombre_original: archivo.name,
      subido_por: user.id,
      geom: coords
        ? `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`
        : null,
    });

    setGuardando(false);

    if (errorFila) {
      setAviso(`Se subió la imagen pero no se registró: ${errorFila.message}`);
      return;
    }

    setAviso("Foto agregada al lote.");
    if (inputFoto.current) inputFoto.current.value = "";
    cargarFotos();
  }

  const color = colorPorCultivo(lote.cultivo);
  const diferencia = clima ? clima.totalActual - clima.historicoALaFecha : 0;

  return (
    <div
      className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 p-0 sm:p-6"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl ${
          pantallaCompleta
            ? "h-full w-full rounded-none"
            : "h-full w-full sm:h-[88vh] sm:max-w-5xl sm:rounded-lg"
        }`}
      >
        {/* Encabezado */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
          <span
            className="h-3 w-3 shrink-0 rounded-sm"
            style={{ background: color.fill, border: `1px solid ${color.borde}` }}
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="truncate text-[14px] font-semibold">
                {lote.lote || `Lote ${lote.loteId}`}
              </h2>
              <span className="mono text-[10.5px] text-[var(--color-ink-faint)]">
                #{lote.loteId}
              </span>
            </div>
            <p className="truncate text-[11.5px] text-[var(--color-ink-muted)]">
              {[lote.campo, lote.localidad, lote.departamento].filter(Boolean).join(" · ")}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setPantallaCompleta((v) => !v)}
              title={pantallaCompleta ? "Reducir" : "Pantalla completa"}
              className="hidden rounded p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)] sm:block"
            >
              {pantallaCompleta ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={onCerrar}
              title="Cerrar"
              className="rounded p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {aviso && (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-4 py-1.5 text-[12px] text-[var(--color-accent)]">
            {aviso}
            <button onClick={() => setAviso(null)} className="ml-auto">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Contenido */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            {/* Columna de datos */}
            <div className="space-y-4">
              <section>
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                  Asegurado
                </p>
                <p className="text-[13px] font-medium">{lote.cliente ?? "Sin asignar"}</p>
                {lote.cuit && (
                  <p className="mono text-[11.5px] text-[var(--color-ink-muted)]">{lote.cuit}</p>
                )}
              </section>

              <section className="rounded-md border border-[var(--color-border)] px-3 py-1">
                <Dato etiqueta="Cultivo" valor={lote.cultivo ?? "—"} />
                <Dato etiqueta="Hectáreas aseguradas" valor={num(lote.hectareas, 1)} destacado />
                <Dato
                  etiqueta="Hectáreas declaradas"
                  valor={
                    num(lote.hectareasDeclaradas, 1) +
                    (lote.porcentajeAsegurado != null
                      ? ` (${num(lote.porcentajeAsegurado)}%)`
                      : "")
                  }
                />
                <Dato
                  etiqueta="Rinde asegurado"
                  valor={rindeAsegPorHa === null ? "—" : `${rindeAsegPorHa} qq/ha`}
                />
                <Dato etiqueta="Quintales asegurados" valor={num(lote.rendimientoAsegurado)} />
                <Dato etiqueta="Suma asegurada" valor={num(lote.sumaAsegurada)} />
                <Dato etiqueta="Siembra" valor={fecha(lote.fechaSiembra)} />
                <Dato etiqueta="Cultivo anterior" valor={lote.cultivoAnterior ?? "—"} />
                <Dato etiqueta="Rinde anterior" valor={num(lote.rendimientoAnterior)} />
                <Dato etiqueta="Zona" valor={lote.zona ?? "—"} />
                <Dato etiqueta="Estado del lote" valor={lote.estado ?? "—"} />
              </section>

              {lote.siniestros?.length > 0 && (
                <section>
                  <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                    Siniestros
                  </p>
                  {lote.siniestros.map((s, i) => {
                    const c =
                      COLOR_CAUSA[s.causa?.trim().toLowerCase() ?? ""] ?? COLOR_CAUSA_DEFAULT;
                    return (
                      <div
                        key={i}
                        className="mb-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ background: c.fill, border: `1px solid ${c.borde}` }}
                          />
                          <span className="text-[12.5px] font-medium">{s.causa}</span>
                          <span className="mono ml-auto text-[11px] text-[var(--color-ink-faint)]">
                            {fecha(s.fecha)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11.5px] text-[var(--color-ink-muted)]">
                          {s.estado ? ETIQUETA_ESTADO[s.estado] ?? s.estado : "—"}
                          {s.danio_estimado != null && ` · Daño ${num(s.danio_estimado)}`}
                        </p>
                      </div>
                    );
                  })}
                </section>
              )}

              {puedeEditar && (
                <section className="rounded-md border border-[var(--color-border)] p-3">
                  <p className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                    Rinde estimado
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      value={rinde}
                      onChange={(e) => setRinde(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && guardarRinde()}
                      inputMode="decimal"
                      placeholder="qq/ha"
                      className="mono w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-2 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
                    />
                    <button
                      onClick={guardarRinde}
                      disabled={guardando}
                      className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                    >
                      Guardar
                    </button>
                  </div>
                </section>
              )}
            </div>

            {/* Columna de clima y fotos */}
            <div className="space-y-4">
              <section className="rounded-md border border-[var(--color-border)] p-3">
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                    Precipitación mensual
                  </p>
                  {clima && (
                    <>
                      <span className="mono text-[12px]">
                        <span className="font-semibold">{clima.totalActual}</span>
                        <span className="text-[var(--color-ink-faint)]"> mm en {clima.anio}</span>
                      </span>
                      <span className="mono text-[12px] text-[var(--color-ink-muted)]">
                        vs {clima.historicoALaFecha} mm normales a la fecha
                      </span>
                      <span
                        className={`mono text-[12px] font-semibold ${
                          diferencia >= 0
                            ? "text-[var(--color-positive)]"
                            : "text-[var(--color-danger)]"
                        }`}
                      >
                        {diferencia >= 0 ? "+" : ""}
                        {Math.round(diferencia)} mm
                      </span>
                    </>
                  )}
                </div>

                <div className="h-56">
                  {errorClima ? (
                    <p className="pt-16 text-center text-[12px] text-[var(--color-ink-muted)]">
                      {errorClima}
                    </p>
                  ) : !clima ? (
                    <div className="flex h-full items-center justify-center gap-2 text-[12px] text-[var(--color-ink-muted)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando precipitación...
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={clima.serie} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                          stroke="var(--color-border-strong)"
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                          stroke="var(--color-border-strong)"
                          unit=""
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "var(--color-ink)" }}
                          formatter={(valor, nombre) => [
                            valor === null || valor === undefined ? "—" : `${valor} mm`,
                            String(nombre),
                          ]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line
                          type="monotone"
                          dataKey="historico"
                          name="Promedio histórico"
                          stroke="var(--color-ink-faint)"
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="actual"
                          name={`Campaña ${clima.anio}`}
                          stroke="#2979ff"
                          strokeWidth={2.5}
                          dot={{ r: 2.5 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {clima && (
                  <p className="mt-1 text-[10.5px] text-[var(--color-ink-faint)]">
                    {clima.fuente}
                  </p>
                )}
              </section>

              {clima?.temperatura && (
                <section className="rounded-md border border-[var(--color-border)] p-3">
                  <p className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                    Temperatura media mensual
                  </p>

                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={clima.temperatura}
                        margin={{ top: 5, right: 8, bottom: 0, left: -18 }}
                      >
                        <defs>
                          {/* De rojo arriba (máxima) a azul abajo (mínima). */}
                          <linearGradient id="bandaTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#c0392b" stopOpacity={0.42} />
                            <stop offset="50%" stopColor="#b9a37e" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#2979ff" stopOpacity={0.42} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                          stroke="var(--color-border-strong)"
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                          stroke="var(--color-border-strong)"
                          unit="°"
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "var(--color-ink)" }}
                          formatter={(valor, nombre) => {
                            if (Array.isArray(valor)) {
                              return [`${valor[0]}° a ${valor[1]}°`, "Mínima y máxima"];
                            }
                            return [`${valor}°`, String(nombre)];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area
                          dataKey="rango"
                          name="Mínima y máxima"
                          stroke="none"
                          fill="url(#bandaTemp)"
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="med"
                          name="Media"
                          stroke="var(--color-ink)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              <section className="rounded-md border border-[var(--color-border)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                    Fotos del lote
                  </p>
                  {puedeEditar && (
                    <>
                      <input
                        ref={inputFoto}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={subirFoto}
                        className="hidden"
                      />
                      <button
                        onClick={() => inputFoto.current?.click()}
                        disabled={guardando}
                        className="ml-auto flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                      >
                        {guardando ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        Agregar foto
                      </button>
                    </>
                  )}
                </div>

                {!fotos ? (
                  <p className="py-6 text-center text-[12px] text-[var(--color-ink-muted)]">
                    Cargando fotos...
                  </p>
                ) : fotos.length === 0 ? (
                  <p className="flex items-center justify-center gap-2 py-6 text-center text-[12px] text-[var(--color-ink-muted)]">
                    <Camera className="h-4 w-4" />
                    Este lote todavía no tiene fotos.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {fotos.map((f) => (
                      <figure
                        key={f.id}
                        className="overflow-hidden rounded-md border border-[var(--color-border)]"
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
                        <figcaption className="px-2 py-1">
                          <p className="mono text-[10px] text-[var(--color-ink-faint)]">
                            {new Date(f.created_at).toLocaleDateString("es-AR")}
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
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
