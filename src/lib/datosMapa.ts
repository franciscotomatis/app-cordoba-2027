import type { FeatureCollection } from "geojson";

// Caché a nivel de módulo: sobrevive a la navegación entre secciones, así que
// volver al mapa no vuelve a descargar los ~5700 polígonos.
let cache: FeatureCollection | null = null;
let enVuelo: Promise<FeatureCollection> | null = null;

export function lotesEnCache() {
  return cache;
}

export function cargarLotes(): Promise<FeatureCollection> {
  if (cache) return Promise.resolve(cache);
  if (enVuelo) return enVuelo;

  enVuelo = fetch("/api/lotes")
    .then((r) => {
      if (!r.ok) throw new Error("No se pudieron cargar los lotes");
      return r.json();
    })
    .then((datos: FeatureCollection) => {
      cache = datos;
      enVuelo = null;
      return datos;
    })
    .catch((e) => {
      enVuelo = null;
      throw e;
    });

  return enVuelo;
}

export function invalidarLotes() {
  cache = null;
}
