"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  GeoJSON,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { Crosshair, Layers, X } from "lucide-react";
import { COLOR_CAUSA, COLOR_CAUSA_DEFAULT, colorPorCultivo } from "@/lib/colores";
import { FiltroMulti } from "./mapa/FiltroMulti";
import "leaflet/dist/leaflet.css";

type Siniestro = { causa: string; fecha: string | null; danio_estimado: number | null };

export type LoteProps = {
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
  sumaAsegurada: number | null;
  fechaSiembra: string | null;
  estado: string | null;
  cliente: string | null;
  cuit: string | null;
  zona: string | null;
  siniestros: Siniestro[];
  fill: string;
  borde: string;
};

type Filtros = {
  texto: string;
  cuit: string;
  cultivos: string[];
  causas: string[];
  zonas: string[];
  departamentos: string[];
};

const FILTROS_VACIOS: Filtros = {
  texto: "",
  cuit: "",
  cultivos: [],
  causas: [],
  zonas: [],
  departamentos: [],
};

const num = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fecha = (v: string | null) => {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : v;
};

const escapar = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function colorCausa(causa?: string | null) {
  const clave = causa?.trim().toLowerCase();
  return (clave && COLOR_CAUSA[clave]) || COLOR_CAUSA_DEFAULT;
}

/** Ajusta el encuadre del mapa a los lotes filtrados. */
function AjustarEncuadre({ datos }: { datos: FeatureCollection | null }) {
  const map = useMap();
  useEffect(() => {
    if (!datos || datos.features.length === 0) return;
    const bounds = L.geoJSON(datos).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true });
    }
  }, [datos, map]);
  return null;
}

function GpsControl() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: true }),
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [map]);
  return null;
}

function fila(etiqueta: string, valor: string, resaltar = false) {
  return `<div style="display:flex;justify-content:space-between;gap:12px;padding:2.5px 0">
    <span style="color:var(--color-ink-faint);font-size:11.5px">${etiqueta}</span>
    <span style="font-family:var(--font-jetbrains),monospace;font-size:11.5px;font-variant-numeric:tabular-nums;${
      resaltar ? "color:var(--color-accent);font-weight:600" : ""
    }">${valor}</span>
  </div>`;
}

function contenidoPopup(p: LoteProps) {
  const color = colorPorCultivo(p.cultivo);
  const ubicacion = [p.campo, p.localidad, p.departamento].filter(Boolean).join(" · ");
  const pct = p.porcentajeAsegurado != null ? ` (${num(p.porcentajeAsegurado)}%)` : "";

  const siniestros = p.siniestros?.length
    ? `<div style="border-top:1px solid var(--color-border);padding:8px 12px;background:var(--color-surface-muted)">
        ${p.siniestros
          .map((s) => {
            const c = colorCausa(s.causa);
            return `<div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
              <span style="width:8px;height:8px;border-radius:2px;background:${c.fill};border:1px solid ${c.borde};flex-shrink:0"></span>
              <span style="font-weight:600;font-size:11.5px">${escapar(s.causa)}</span>
              <span style="color:var(--color-ink-faint);font-size:11px;margin-left:auto;font-family:var(--font-jetbrains),monospace">${fecha(s.fecha)}</span>
            </div>
            ${
              s.danio_estimado != null
                ? `<div style="color:var(--color-ink-muted);font-size:11px;padding-left:15px">Daño estimado: <span style="font-family:var(--font-jetbrains),monospace">${num(s.danio_estimado)}</span></div>`
                : ""
            }`;
          })
          .join("")}
      </div>`
    : "";

  return `<div style="min-width:260px;max-width:300px">
    <div style="padding:10px 12px 8px;border-bottom:1px solid var(--color-border)">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="width:9px;height:9px;border-radius:2px;background:${color.fill};border:1px solid ${color.borde};flex-shrink:0"></span>
        <span style="font-weight:600;font-size:13px">${escapar(p.lote || `Lote ${p.loteId}`)}</span>
        <span style="margin-left:auto;font-family:var(--font-jetbrains),monospace;font-size:10px;color:var(--color-ink-faint)">#${escapar(p.loteId)}</span>
      </div>
      ${ubicacion ? `<div style="color:var(--color-ink-muted);font-size:11.5px;margin-top:2px">${escapar(ubicacion)}</div>` : ""}
    </div>

    <div style="padding:8px 12px;border-bottom:1px solid var(--color-border)">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-ink-faint);margin-bottom:2px">Asegurado</div>
      <div style="font-size:12.5px;font-weight:500;line-height:1.35">${escapar(p.cliente ?? "Sin asignar")}</div>
      ${p.cuit ? `<div style="font-family:var(--font-jetbrains),monospace;font-size:11px;color:var(--color-ink-muted);margin-top:1px">${escapar(p.cuit)}</div>` : ""}
    </div>

    <div style="padding:8px 12px">
      ${fila("Cultivo", escapar(p.cultivo ?? "—"))}
      ${fila("Hectáreas aseg.", num(p.hectareas, 1), true)}
      ${fila("Hectáreas decl.", num(p.hectareasDeclaradas, 1) + pct)}
      ${fila("Rinde asegurado", num(p.rendimientoAsegurado))}
      ${fila("Suma asegurada", num(p.sumaAsegurada))}
      ${fila("Siembra", fecha(p.fechaSiembra))}
      ${p.cultivoAnterior ? fila("Cultivo anterior", escapar(p.cultivoAnterior)) : ""}
      ${fila("Zona", escapar(p.zona ?? "—"))}
      ${fila("Estado", escapar(p.estado ?? "—"))}
    </div>
    ${siniestros}
  </div>`;
}

export default function MapaLotes() {
  const [datos, setDatos] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [verSiniestros, setVerSiniestros] = useState(false);

  useEffect(() => {
    fetch("/api/lotes")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los lotes");
        return r.json();
      })
      .then(setDatos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const props = useMemo(
    () => (datos?.features ?? []).map((f) => f.properties as LoteProps),
    [datos]
  );

  // Opciones de los filtros, con cantidad de lotes por valor.
  const opciones = useMemo(() => {
    const contar = (fn: (p: LoteProps) => string | null | undefined) => {
      const mapa = new Map<string, number>();
      for (const p of props) {
        const v = fn(p)?.trim();
        if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
      }
      return [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, cantidad]) => ({ valor, etiqueta: valor, cantidad }));
    };

    const causas = new Map<string, number>();
    for (const p of props) {
      for (const s of p.siniestros ?? []) {
        const c = s.causa?.trim();
        if (c) causas.set(c, (causas.get(c) ?? 0) + 1);
      }
    }

    return {
      cultivos: contar((p) => p.cultivo).map((o) => ({
        ...o,
        color: colorPorCultivo(o.valor).fill,
      })),
      zonas: contar((p) => p.zona).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)),
      departamentos: contar((p) => p.departamento).sort((a, b) =>
        a.etiqueta.localeCompare(b.etiqueta)
      ),
      causas: [...causas.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, cantidad]) => ({
          valor,
          etiqueta: valor,
          cantidad,
          color: colorCausa(valor).fill,
        })),
      clientes: [...new Set(props.map((p) => p.cliente).filter(Boolean))].sort() as string[],
    };
  }, [props]);

  const hayFiltros =
    filtros.texto.trim() !== "" ||
    filtros.cuit.trim() !== "" ||
    filtros.cultivos.length > 0 ||
    filtros.causas.length > 0 ||
    filtros.zonas.length > 0 ||
    filtros.departamentos.length > 0;

  const filtrados = useMemo(() => {
    if (!datos) return null;
    if (!hayFiltros) return datos;

    const texto = filtros.texto.trim().toLowerCase();
    const cuit = filtros.cuit.trim().toLowerCase().replace(/[-\s]/g, "");

    const features = datos.features.filter((f) => {
      const p = f.properties as LoteProps;

      if (texto) {
        const busca = [p.cliente, p.campo, p.lote, p.localidad, p.departamento, p.loteId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!busca.includes(texto)) return false;
      }
      if (cuit && !(p.cuit ?? "").toLowerCase().replace(/[-\s]/g, "").includes(cuit)) return false;
      if (filtros.cultivos.length && !filtros.cultivos.includes(p.cultivo?.trim() ?? ""))
        return false;
      if (filtros.zonas.length && !filtros.zonas.includes(p.zona?.trim() ?? "")) return false;
      if (
        filtros.departamentos.length &&
        !filtros.departamentos.includes(p.departamento?.trim() ?? "")
      )
        return false;
      if (filtros.causas.length) {
        const causas = (p.siniestros ?? []).map((s) => s.causa?.trim() ?? "");
        if (!causas.some((c) => filtros.causas.includes(c))) return false;
      }
      return true;
    });

    return { ...datos, features } as FeatureCollection;
  }, [datos, filtros, hayFiltros]);

  const soloSiniestros = useMemo(() => {
    if (!filtrados) return null;
    return {
      ...filtrados,
      features: filtrados.features.filter(
        (f) => ((f.properties as LoteProps).siniestros?.length ?? 0) > 0
      ),
    } as FeatureCollection;
  }, [filtrados]);

  const resumen = useMemo(() => {
    const lista = (filtrados?.features ?? []).map((f) => f.properties as LoteProps);
    const hectareas = lista.reduce((acc, p) => acc + (p.hectareas ?? 0), 0);
    const conSiniestro = lista.filter((p) => (p.siniestros?.length ?? 0) > 0).length;
    const porCultivo = new Map<string, number>();
    for (const p of lista) {
      const c = p.cultivo?.trim() || "Sin especificar";
      porCultivo.set(c, (porCultivo.get(c) ?? 0) + (p.hectareas ?? 0));
    }
    return { lotes: lista.length, hectareas, conSiniestro, porCultivo };
  }, [filtrados]);

  const estiloLote = (feature?: Feature): PathOptions => {
    const p = feature?.properties as LoteProps | undefined;
    return {
      color: p?.borde ?? "#7B1FA2",
      fillColor: p?.fill ?? "#9C27B0",
      weight: 1.5,
      fillOpacity: 0.55,
    };
  };

  const estiloSiniestro = (feature?: Feature): PathOptions => {
    const p = feature?.properties as LoteProps | undefined;
    const c = colorCausa(p?.siniestros?.[0]?.causa);
    return { color: c.borde, fillColor: c.fill, weight: 2.5, fillOpacity: 0.6, dashArray: "3,3" };
  };

  function alCrearCapa(feature: Feature, layer: Layer) {
    const p = feature.properties as LoteProps;
    layer.bindPopup(contenidoPopup(p), { maxWidth: 320, closeButton: true });
    layer.on("mouseover", (e: LeafletMouseEvent) =>
      (e.target as L.Path).setStyle({ fillOpacity: 0.85, weight: 3 })
    );
    layer.on("mouseout", (e: LeafletMouseEvent) =>
      (e.target as L.Path).setStyle(estiloLote(feature))
    );
  }

  // La clave fuerza a Leaflet a redibujar la capa cuando cambian los filtros.
  const claveCapa = useMemo(
    () => JSON.stringify(filtros) + (filtrados?.features.length ?? 0),
    [filtros, filtrados]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior de filtros */}
      <div className="z-[1100] shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              list="lista-clientes"
              value={filtros.texto}
              onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))}
              placeholder="Asegurado, campo, lote o localidad..."
              className="w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
            />
            <datalist id="lista-clientes">
              {opciones.clientes.slice(0, 1000).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <input
            value={filtros.cuit}
            onChange={(e) => setFiltros((f) => ({ ...f, cuit: e.target.value }))}
            placeholder="CUIT"
            className="mono w-36 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] outline-none placeholder:font-sans placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
          />

          <FiltroMulti
            titulo="Cultivo"
            opciones={opciones.cultivos}
            seleccion={filtros.cultivos}
            onChange={(v) => setFiltros((f) => ({ ...f, cultivos: v }))}
          />
          <FiltroMulti
            titulo="Siniestro"
            opciones={opciones.causas}
            seleccion={filtros.causas}
            onChange={(v) => setFiltros((f) => ({ ...f, causas: v }))}
          />
          <FiltroMulti
            titulo="Zona"
            opciones={opciones.zonas}
            seleccion={filtros.zonas}
            onChange={(v) => setFiltros((f) => ({ ...f, zonas: v }))}
            ancho="w-36"
          />
          <FiltroMulti
            titulo="Depto."
            opciones={opciones.departamentos}
            seleccion={filtros.departamentos}
            onChange={(v) => setFiltros((f) => ({ ...f, departamentos: v }))}
            ancho="w-40"
          />

          {hayFiltros && (
            <button
              onClick={() => setFiltros(FILTROS_VACIOS)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </button>
          )}

          <div className="ml-auto flex items-center gap-3 text-[12px]">
            <button
              onClick={() => setVerSiniestros((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors ${
                verSiniestros
                  ? "border-[var(--color-danger)] text-[var(--color-danger)]"
                  : "border-[var(--color-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Resaltar siniestros
            </button>

            <div className="flex items-baseline gap-1.5 border-l border-[var(--color-border)] pl-3">
              <span className="mono text-[13px] font-semibold">
                {resumen.lotes.toLocaleString("es-AR")}
              </span>
              <span className="text-[var(--color-ink-faint)]">lotes</span>
              <span className="mono ml-2 text-[13px] font-semibold">
                {Math.round(resumen.hectareas).toLocaleString("es-AR")}
              </span>
              <span className="text-[var(--color-ink-faint)]">ha</span>
              {resumen.conSiniestro > 0 && (
                <>
                  <span className="mono ml-2 text-[13px] font-semibold text-[var(--color-danger)]">
                    {resumen.conSiniestro.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[var(--color-ink-faint)]">c/siniestro</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="relative min-h-0 flex-1">
        {error && (
          <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-danger)]">
            {error}
          </div>
        )}
        {cargando && (
          <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)]">
            Cargando lotes...
          </div>
        )}
        {!cargando && resumen.lotes === 0 && (
          <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)]">
            Ningún lote coincide con los filtros
          </div>
        )}

        {/* Leyenda de hectáreas del recorte actual */}
        <div className="absolute right-3 bottom-8 z-[1000] max-h-64 w-52 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-2.5 shadow-sm backdrop-blur">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
            Hectáreas por cultivo
          </p>
          <ul className="space-y-0.5">
            {[...resumen.porCultivo.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([cultivo, ha]) => (
                <li key={cultivo} className="flex items-center gap-1.5 text-[11.5px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: colorPorCultivo(cultivo).fill }}
                  />
                  <span className="truncate">{cultivo}</span>
                  <span className="mono ml-auto text-[var(--color-ink-muted)]">
                    {Math.round(ha).toLocaleString("es-AR")}
                  </span>
                </li>
              ))}
          </ul>
        </div>

        <button
          onClick={() => setGpsActivo((v) => !v)}
          title="Seguir mi ubicación"
          className={`absolute bottom-8 left-3 z-[1000] flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] shadow-sm transition-colors ${
            gpsActivo
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          <Crosshair className="h-3.5 w-3.5" />
          GPS
        </button>

        <MapContainer
          center={[-32.2, -63.5]}
          zoom={8}
          className="h-full w-full"
          preferCanvas
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Satélite">
              <TileLayer
                attribution="Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Híbrido">
              <TileLayer
                attribution="Google"
                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Gris">
              <TileLayer
                attribution="Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Calles">
              <TileLayer
                attribution="Esri"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {filtrados && (
            <GeoJSON
              key={`lotes-${claveCapa}`}
              data={filtrados}
              style={estiloLote}
              onEachFeature={alCrearCapa}
            />
          )}

          {verSiniestros && soloSiniestros && soloSiniestros.features.length > 0 && (
            <GeoJSON
              key={`stro-${claveCapa}`}
              data={soloSiniestros}
              style={estiloSiniestro}
              onEachFeature={alCrearCapa}
            />
          )}

          {hayFiltros && <AjustarEncuadre datos={filtrados} />}
          {gpsActivo && <GpsControl />}
        </MapContainer>
      </div>
    </div>
  );
}
