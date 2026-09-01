import type { FeatureCollection } from "geojson";

// Caché a nivel de módulo: sobrevive a la navegación entre secciones, así que
// volver al mapa no vuelve a descargar los ~5700 polígonos.
//
// Se descarta cuando cambia algo de los casos (ver invalidarLotes) y, por las
// dudas, cuando pasa el tiempo de vigencia: así el mapa nunca queda mostrando
// estados viejos aunque el cambio se haya hecho en otra pestaña.
const VIGENCIA_MS = 3 * 60 * 1000;

let cache: FeatureCollection | null = null;
let cargadoEn = 0;
let enVuelo: Promise<FeatureCollection> | null = null;

function vigente() {
  return cache !== null && Date.now() - cargadoEn < VIGENCIA_MS;
}

export function lotesEnCache() {
  return vigente() ? cache : null;
}

export function cargarLotes(): Promise<FeatureCollection> {
  if (vigente()) return Promise.resolve(cache as FeatureCollection);
  if (enVuelo) return enVuelo;

  enVuelo = fetch("/api/lotes")
    .then((r) => {
      if (!r.ok) throw new Error("No se pudieron cargar los lotes");
      return r.json();
    })
    .then((datos: FeatureCollection) => {
      cache = datos;
      cargadoEn = Date.now();
      enVuelo = null;
      return datos;
    })
    .catch((e) => {
      enVuelo = null;
      throw e;
    });

  return enVuelo;
}

/** Se llama al cambiar estados, asignar casos o cambiar de usuario. */
export function invalidarLotes() {
  cache = null;
  cargadoEn = 0;
}
