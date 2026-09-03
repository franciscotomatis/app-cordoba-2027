"use client";

import { useEffect, useState } from "react";
import { Rectangle, useMap } from "react-leaflet";
import { crearEscalaLluvia, type EscalaLluvia } from "@/lib/escalaLluvia";
import type { RangoFecha } from "./FiltroFecha";

type Celda = { lat: number; lon: number; mm: number };

// Media celda: los valores están referidos al centro de cada punto de grilla.
const MEDIA = 0.05;

export function CapaLluvia({
  rango,
  onEstado,
}: {
  rango: RangoFecha;
  onEstado: (e: {
    cargando: boolean;
    escala: EscalaLluvia | null;
    disponible: { desde: string | null; hasta: string | null } | null;
    celdas: number;
  }) => void;
}) {
  const map = useMap();
  const [celdas, setCeldas] = useState<Celda[]>([]);
  const [escala, setEscala] = useState<EscalaLluvia | null>(null);

  useEffect(() => {
    if (!rango.desde || !rango.hasta) {
      setCeldas([]);
      setEscala(null);
      onEstado({ cargando: false, escala: null, disponible: null, celdas: 0 });
      return;
    }

    let vigente = true;
    onEstado({ cargando: true, escala: null, disponible: null, celdas: 0 });

    fetch(`/api/clima/grilla?desde=${rango.desde}&hasta=${rango.hasta}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vigente) return;
        const lista: Celda[] = d.celdas ?? [];
        const nueva = crearEscalaLluvia(lista.map((c) => Number(c.mm)));
        setCeldas(lista);
        setEscala(nueva);
        onEstado({
          cargando: false,
          escala: nueva,
          disponible: d.disponible ?? null,
          celdas: lista.length,
        });
      })
      .catch(() => {
        if (!vigente) return;
        onEstado({ cargando: false, escala: null, disponible: null, celdas: 0 });
      });

    return () => {
      vigente = false;
    };
    // onEstado se deja fuera a propósito: cambia de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango.desde, rango.hasta]);

  // La grilla se dibuja debajo de los lotes para no taparlos.
  useEffect(() => {
    map.getPane("overlayPane");
  }, [map]);

  if (!escala || celdas.length === 0) return null;

  return (
    <>
      {celdas.map((c) => (
        <Rectangle
          key={`${c.lat},${c.lon}`}
          bounds={[
            [c.lat - MEDIA, c.lon - MEDIA],
            [c.lat + MEDIA, c.lon + MEDIA],
          ]}
          interactive={false}
          pathOptions={{
            stroke: false,
            fillColor: escala.color(Number(c.mm)),
            fillOpacity: 0.55,
          }}
        />
      ))}
    </>
  );
}
