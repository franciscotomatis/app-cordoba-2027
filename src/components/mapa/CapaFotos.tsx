"use client";

import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection, Point } from "geojson";

type FotoProps = {
  id: string;
  url: string | null;
  nombre: string | null;
  fecha: string;
  autor: string | null;
  loteId: string | null;
  cliente: string | null;
};

const escapar = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function popupFoto(p: FotoProps) {
  const fecha = new Date(p.fecha).toLocaleString("es-AR");
  return `<div style="width:220px">
    ${
      p.url
        ? `<a href="${p.url}" target="_blank" rel="noreferrer">
             <img src="${p.url}" alt="Foto de campo"
                  style="width:100%;height:150px;object-fit:cover;display:block;border-radius:8px 8px 0 0"/>
           </a>`
        : `<div style="height:80px;display:flex;align-items:center;justify-content:center;color:var(--color-ink-faint);font-size:11px">Sin vista previa</div>`
    }
    <div style="padding:8px 10px">
      ${
        p.loteId
          ? `<div style="font-weight:600;font-size:12px">Lote #${escapar(p.loteId)}</div>`
          : ""
      }
      ${
        p.cliente
          ? `<div style="font-size:11.5px;color:var(--color-ink-muted)">${escapar(p.cliente)}</div>`
          : ""
      }
      <div style="font-family:var(--font-jetbrains),monospace;font-size:10.5px;color:var(--color-ink-faint);margin-top:3px">${fecha}</div>
      ${
        p.autor
          ? `<div style="font-size:11px;color:var(--color-ink-muted)">${escapar(p.autor)}</div>`
          : ""
      }
    </div>
  </div>`;
}

/** Capa de puntos con las fotos que sacaron los peritos en el campo. */
export function CapaFotos() {
  const [datos, setDatos] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/api/fotos/mapa")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setDatos(d);
      })
      .catch(() => {});
  }, []);

  if (!datos) return null;

  return (
    <GeoJSON
      data={datos}
      pointToLayer={(_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: "#d97757",
          fillOpacity: 1,
        })
      }
      onEachFeature={(feature: Feature<Point>, layer) => {
        layer.bindPopup(popupFoto(feature.properties as FotoProps), { maxWidth: 240 });
      }}
    />
  );
}
