"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  GeoJSON,
  useMap,
} from "react-leaflet";
import type { Layer, LeafletMouseEvent } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";

type LoteProps = {
  id: string;
  id_lote_externo: string;
  cultivo: string | null;
  hectareas: number | null;
  cliente: string | null;
  siniestros: { causa: string; fecha: string | null; danio_estimado: number | null }[];
  fill: string;
  borde: string;
};

const COLOR_CAUSA: Record<string, { fill: string; borde: string }> = {
  granizo: { fill: "#00BCD4", borde: "#0097A7" },
  sequia: { fill: "#FF5252", borde: "#D50000" },
  sequía: { fill: "#FF5252", borde: "#D50000" },
  inundacion: { fill: "#448AFF", borde: "#2979FF" },
  inundación: { fill: "#448AFF", borde: "#2979FF" },
  viento: { fill: "#7C4DFF", borde: "#651FFF" },
  incendio: { fill: "#795548", borde: "#5D4037" },
  helada: { fill: "#FFFFFF", borde: "#E0E0E0" },
};
const COLOR_CAUSA_DEFAULT = { fill: "#9C27B0", borde: "#7B1FA2" };

function GpsControl() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15, {
          animate: true,
        });
      },
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [map]);
  return null;
}

export default function MapaLotes() {
  const [datos, setDatos] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [gpsActivo, setGpsActivo] = useState(false);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    fetch("/api/lotes")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los lotes");
        return r.json();
      })
      .then(setDatos)
      .catch((e) => setError(e.message));
  }, []);

  const clientesUnicos = useMemo(() => {
    if (!datos) return [];
    const set = new Set<string>();
    for (const f of datos.features) {
      const cliente = (f.properties as LoteProps)?.cliente;
      if (cliente) set.add(cliente);
    }
    return [...set].sort();
  }, [datos]);

  const hectareasPorCultivo = useMemo(() => {
    const totales = new Map<string, number>();
    if (!datos) return totales;
    for (const f of datos.features) {
      const p = f.properties as LoteProps;
      const cultivo = p.cultivo?.trim() || "Sin especificar";
      const ha = p.hectareas ?? 0;
      totales.set(cultivo, (totales.get(cultivo) ?? 0) + ha);
    }
    return totales;
  }, [datos]);

  const featuresFiltrados = useMemo(() => {
    if (!datos) return null;
    if (!busqueda.trim()) return datos;
    const q = busqueda.trim().toLowerCase();
    return {
      ...datos,
      features: datos.features.filter((f) =>
        (f.properties as LoteProps)?.cliente?.toLowerCase().includes(q)
      ),
    } as FeatureCollection;
  }, [datos, busqueda]);

  const featuresSiniestros = useMemo(() => {
    if (!datos) return null;
    return {
      ...datos,
      features: datos.features.filter(
        (f) => ((f.properties as LoteProps)?.siniestros?.length ?? 0) > 0
      ),
    } as FeatureCollection;
  }, [datos]);

  function estiloLote(feature?: Feature) {
    const p = feature?.properties as LoteProps | undefined;
    return {
      color: p?.borde ?? "#7B1FA2",
      fillColor: p?.fill ?? "#9C27B0",
      weight: 2,
      fillOpacity: 0.6,
      dashArray: "5,5",
    };
  }

  function estiloSiniestro(feature?: Feature) {
    const p = feature?.properties as LoteProps | undefined;
    const causa = p?.siniestros?.[0]?.causa?.trim().toLowerCase();
    const color = (causa && COLOR_CAUSA[causa]) || COLOR_CAUSA_DEFAULT;
    return {
      color: color.borde,
      fillColor: color.fill,
      weight: 3,
      fillOpacity: 0.5,
      dashArray: "3,3",
    };
  }

  function onEachLote(feature: Feature, layer: Layer) {
    const p = feature.properties as LoteProps;
    layer.bindPopup(
      `<strong>${p.cliente ?? "Sin cliente"}</strong><br/>` +
        `Cultivo: ${p.cultivo ?? "-"}<br/>` +
        `Hectáreas: ${p.hectareas ?? "-"}<br/>` +
        (p.siniestros?.length
          ? `<span style="color:#c62828">⚠ ${p.siniestros[0].causa} (${p.siniestros[0].fecha ?? "sin fecha"})</span>`
          : "")
    );
    layer.on("mouseover", (e: LeafletMouseEvent) => {
      (e.target as L.Path).setStyle({ fillOpacity: 0.9, weight: 3 });
    });
    layer.on("mouseout", (e: LeafletMouseEvent) => {
      (e.target as L.Path).setStyle(estiloLote(feature));
    });
  }

  return (
    <div className="relative h-full w-full">
      {error && (
        <div className="absolute top-2 left-1/2 z-[1000] -translate-x-1/2 rounded bg-red-600 px-3 py-1 text-sm text-white">
          {error}
        </div>
      )}

      {/* Buscador de clientes */}
      <div className="absolute top-3 left-3 z-[1000] w-64 rounded-md bg-white/95 p-3 shadow-md">
        <label className="mb-1 block text-xs font-semibold text-zinc-600">
          Buscar cliente
        </label>
        <input
          list="clientes-datalist"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre del cliente..."
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500"
        />
        <datalist id="clientes-datalist">
          {clientesUnicos.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {busqueda && (
          <button
            onClick={() => setBusqueda("")}
            className="mt-2 text-xs text-zinc-500 underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Leyenda de hectáreas por cultivo */}
      <div className="absolute bottom-6 right-3 z-[1000] max-h-64 w-56 overflow-y-auto rounded-md bg-white/95 p-3 text-xs shadow-md">
        <p className="mb-2 font-semibold text-zinc-700">Hectáreas por cultivo</p>
        <ul className="space-y-1">
          {[...hectareasPorCultivo.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cultivo, ha]) => (
              <li key={cultivo} className="flex justify-between text-zinc-600">
                <span>{cultivo}</span>
                <span className="font-medium">{Math.round(ha).toLocaleString("es-AR")} ha</span>
              </li>
            ))}
        </ul>
      </div>

      <MapContainer
        center={[-31.42, -64.18]}
        zoom={9}
        className="h-full w-full"
        preferCanvas
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Esri Satélite">
            <TileLayer
              attribution="Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Google Híbrido">
            <TileLayer
              attribution="Google"
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Esri Gris">
            <TileLayer
              attribution="Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Esri Calles">
            <TileLayer
              attribution="Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          {featuresFiltrados && (
            <LayersControl.Overlay checked name="Lotes">
              <GeoJSON
                key={busqueda}
                data={featuresFiltrados}
                style={estiloLote}
                onEachFeature={onEachLote}
              />
            </LayersControl.Overlay>
          )}

          {featuresSiniestros && featuresSiniestros.features.length > 0 && (
            <LayersControl.Overlay name="⚠️ Siniestros">
              <GeoJSON
                data={featuresSiniestros}
                style={estiloSiniestro}
                onEachFeature={onEachLote}
              />
            </LayersControl.Overlay>
          )}
        </LayersControl>

        {gpsActivo && <GpsControl />}
      </MapContainer>

      <button
        onClick={() => setGpsActivo((v) => !v)}
        className={`absolute bottom-6 left-3 z-[1000] rounded-full px-3 py-2 text-sm font-medium shadow-md ${
          gpsActivo ? "bg-blue-600 text-white" : "bg-white text-zinc-700"
        }`}
      >
        📍 GPS
      </button>
    </div>
  );
}
