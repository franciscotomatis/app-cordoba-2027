"use client";

import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { FeatureCollection } from "geojson";

type Tipo = "provincia" | "departamentos";

const ARCHIVO: Record<Tipo, string> = {
  provincia: "/capas/cordoba-provincia.json",
  departamentos: "/capas/cordoba-departamentos.json",
};

// Se guardan una sola vez: son archivos estáticos que no cambian.
const cache = new Map<Tipo, FeatureCollection>();

/** Límites oficiales del IGN: provincia de Córdoba y sus departamentos. */
export function CapaLimites({ tipo }: { tipo: Tipo }) {
  const [datos, setDatos] = useState<FeatureCollection | null>(
    cache.get(tipo) ?? null
  );

  useEffect(() => {
    if (cache.has(tipo)) return;
    fetch(ARCHIVO[tipo])
      .then((r) => r.json())
      .then((d: FeatureCollection) => {
        cache.set(tipo, d);
        setDatos(d);
      })
      .catch(() => {});
  }, [tipo]);

  if (!datos) return null;

  const esProvincia = tipo === "provincia";

  return (
    <GeoJSON
      data={datos}
      interactive={!esProvincia}
      style={{
        color: esProvincia ? "#d97757" : "#f0ece6",
        weight: esProvincia ? 2.5 : 1,
        opacity: esProvincia ? 0.95 : 0.75,
        fill: false,
        dashArray: esProvincia ? undefined : "4,3",
      }}
      onEachFeature={(feature, layer) => {
        const nombre = (feature.properties as { nam?: string })?.nam;
        if (!nombre || esProvincia) return;
        layer.bindTooltip(nombre, { sticky: true, direction: "top" });
      }}
    />
  );
}
