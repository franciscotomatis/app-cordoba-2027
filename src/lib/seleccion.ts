"use client";

import { useCallback, useEffect, useState } from "react";

// Selección de lotes compartida entre el mapa y la gestión de siniestros.
// Se guarda en localStorage para que sobreviva a la navegación y al refresco.
const CLAVE = "seleccion-lotes";
const EVENTO = "seleccion-lotes-cambio";

export function leerSeleccion(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    const datos = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function guardarSeleccion(ids: string[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ids));
  } catch {
    // storage bloqueado: la selección solo vive en memoria
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: ids }));
}

export function useSeleccion() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(leerSeleccion());
    const alCambiar = () => setIds(leerSeleccion());
    window.addEventListener(EVENTO, alCambiar);
    window.addEventListener("storage", alCambiar);
    return () => {
      window.removeEventListener(EVENTO, alCambiar);
      window.removeEventListener("storage", alCambiar);
    };
  }, []);

  const actualizar = useCallback((nuevos: string[]) => {
    setIds(nuevos);
    guardarSeleccion(nuevos);
  }, []);

  return [ids, actualizar] as const;
}

/** Punto dentro de polígono (ray casting). Coordenadas en [lng, lat]. */
export function dentroDePoligono(
  punto: [number, number],
  poligono: [number, number][]
) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    const cruza =
      yi > punto[1] !== yj > punto[1] &&
      punto[0] < ((xj - xi) * (punto[1] - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}
