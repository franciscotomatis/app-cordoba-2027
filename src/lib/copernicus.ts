import "server-only";
import type { Geometry } from "geojson";

/**
 * Acceso a Sentinel-2 por el Copernicus Data Space Ecosystem.
 *
 * Se usa CDSE y no Google Earth Engine porque el uso acá es comercial (una
 * aseguradora liquidando siniestros) y la cuenta gratuita de Earth Engine
 * está reservada a investigación, educación y ONGs.
 *
 * Para la serie histórica se usa la API estadística, que devuelve todas las
 * fechas de una campaña en UN pedido. Pedir imagen por lote y por fecha serían
 * decenas de miles de pedidos y agotaría la cuota mensual enseguida.
 */

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const ESTADISTICA_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";
const PROCESO_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

// Nubes: se descartan las fechas con poca superficie válida.
const COBERTURA_MINIMA = 0.6;

// Con las geometrías en EPSG:4326 la resolución que espera Copernicus va en
// GRADOS, no en metros. 0,0001° son unos 11 m en latitud y ~9 m en longitud a
// la altura de Córdoba, es decir la resolución nativa de Sentinel-2.
const RESOLUCION_GRADOS = 0.0001;
const METROS_POR_GRADO = 111320;
const RESOLUCION_OBJETIVO_M = 10;
// Límites de la API de procesado.
const PIXELES_MIN = 64;
const PIXELES_MAX = 2500;

let tokenCache: { valor: string; vence: number } | null = null;

export function hayCredenciales() {
  return Boolean(
    process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET
  );
}

async function obtenerToken() {
  if (tokenCache && Date.now() < tokenCache.vence) return tokenCache.valor;

  const id = process.env.COPERNICUS_CLIENT_ID;
  const secreto = process.env.COPERNICUS_CLIENT_SECRET;
  if (!id || !secreto) throw new Error("Faltan las credenciales de Copernicus.");

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secreto,
    }),
  });

  if (!r.ok) {
    throw new Error(`Copernicus rechazó las credenciales (${r.status}).`);
  }

  const datos = (await r.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    valor: datos.access_token,
    // Se renueva un minuto antes de que venza.
    vence: Date.now() + (datos.expires_in - 60) * 1000,
  };
  return tokenCache.valor;
}

/**
 * NDVI medio del lote en cada pasada de Sentinel-2 del período.
 * dataMask permite saber qué proporción del lote quedó sin nubes.
 */
const GUION_ESTADISTICA = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  // SCL: 3 sombra de nube, 8/9/10 nubes, 11 nieve. Se descartan.
  var valido = s.dataMask;
  if (s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11) {
    valido = 0;
  }
  var ndvi = (s.B08 + s.B04) === 0 ? 0 : (s.B08 - s.B04) / (s.B08 + s.B04);
  return { ndvi: [ndvi], dataMask: [valido] };
}`;

export type PuntoNdvi = { fecha: string; ndvi: number; cobertura: number };

export type ResultadoNdvi = {
  puntos: PuntoNdvi[];
  /** Para saber por qué una serie sale vacía en vez de quedarse sin explicación. */
  diagnostico: {
    intervalos: number;
    conError: number;
    motivos: string[];
    descartadosPorNubes: number;
    sinDatos: number;
    /** Muestra de coberturas, para entender si el filtro de nubes es el problema. */
    coberturas: number[];
  };
};

export async function serieNdvi(
  geometria: Geometry,
  desde: string,
  hasta: string
): Promise<ResultadoNdvi> {
  const token = await obtenerToken();

  const r = await fetch(ESTADISTICA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input: {
        bounds: { geometry: geometria, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: { mosaickingOrder: "leastCC" },
          },
        ],
      },
      aggregation: {
        timeRange: { from: `${desde}T00:00:00Z`, to: `${hasta}T23:59:59Z` },
        // Una medición cada 5 días: es la frecuencia de paso de Sentinel-2.
        aggregationInterval: { of: "P5D" },
        evalscript: GUION_ESTADISTICA,
        resx: RESOLUCION_GRADOS,
        resy: RESOLUCION_GRADOS,
      },
      calculations: { ndvi: { statistics: { default: {} } } },
    }),
  });

  if (!r.ok) {
    const detalle = await r.text();
    throw new Error(`Copernicus respondió ${r.status}: ${detalle.slice(0, 200)}`);
  }

  const datos = (await r.json()) as {
    data?: {
      interval: { from: string };
      error?: { type?: string; message?: string };
      outputs?: {
        ndvi?: {
          bands?: { B0?: { stats?: { mean?: number; sampleCount?: number; noDataCount?: number } } };
        };
      };
    }[];
  };

  const puntos: PuntoNdvi[] = [];
  const motivos = new Set<string>();
  let conError = 0;
  let descartadosPorNubes = 0;
  let sinDatos = 0;
  const coberturas: number[] = [];

  for (const tramo of datos.data ?? []) {
    if (tramo.error) {
      conError++;
      motivos.add(tramo.error.type ?? tramo.error.message ?? "error sin detalle");
      continue;
    }

    const stats = tramo.outputs?.ndvi?.bands?.B0?.stats;
    if (!stats || stats.mean === undefined || stats.mean === null) {
      sinDatos++;
      continue;
    }

    const total = stats.sampleCount ?? 0;
    const sinDato = stats.noDataCount ?? 0;
    const cobertura = total > 0 ? (total - sinDato) / total : 0;
    if (coberturas.length < 6) {
      coberturas.push(Math.round(cobertura * 100) / 100);
    }

    // Con muchas nubes el promedio no representa al lote.
    if (cobertura < COBERTURA_MINIMA) {
      descartadosPorNubes++;
      continue;
    }

    puntos.push({
      fecha: tramo.interval.from.slice(0, 10),
      ndvi: Math.round(stats.mean * 1000) / 1000,
      cobertura: Math.round(cobertura * 100) / 100,
    });
  }

  return {
    puntos: puntos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    diagnostico: {
      intervalos: datos.data?.length ?? 0,
      conError,
      motivos: [...motivos],
      descartadosPorNubes,
      sinDatos,
      coberturas,
    },
  };
}

/** Imagen NDVI del lote en una fecha, en la paleta habitual marrón a verde. */
const GUION_IMAGEN = `
//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "SCL", "dataMask"],
    output: { bands: 4 }
  };
}
function color(v) {
  if (v < 0.0) return [0.55, 0.55, 0.6];
  if (v < 0.1) return [0.68, 0.6, 0.48];
  if (v < 0.2) return [0.8, 0.72, 0.48];
  if (v < 0.3) return [0.85, 0.8, 0.42];
  if (v < 0.4) return [0.75, 0.8, 0.35];
  if (v < 0.5) return [0.6, 0.76, 0.3];
  if (v < 0.6) return [0.42, 0.68, 0.26];
  if (v < 0.7) return [0.27, 0.58, 0.22];
  if (v < 0.8) return [0.15, 0.47, 0.17];
  return [0.05, 0.35, 0.12];
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [0, 0, 0, 0];
  if (s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11) {
    return [0.85, 0.85, 0.88, 0.7];
  }
  var ndvi = (s.B08 + s.B04) === 0 ? 0 : (s.B08 - s.B04) / (s.B08 + s.B04);
  var c = color(ndvi);
  return [c[0], c[1], c[2], 1];
}`;

/** Extremos de la geometría, en grados. */
function extremos(g: Geometry) {
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
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}

export async function imagenNdvi(
  geometria: Geometry,
  fecha: string
): Promise<ArrayBuffer> {
  const token = await obtenerToken();

  // El tamaño en píxeles se calcula según el tamaño real del lote para quedar
  // cerca de los 10 m por píxel de Sentinel-2. Un tamaño fijo hace que en un
  // lote grande la resolución pedida supere el límite de la colección.
  const e = extremos(geometria);
  const latMedia = ((e.minLat + e.maxLat) / 2) * (Math.PI / 180);
  const anchoM = (e.maxLon - e.minLon) * METROS_POR_GRADO * Math.cos(latMedia);
  const altoM = (e.maxLat - e.minLat) * METROS_POR_GRADO;

  const enRango = (v: number) =>
    Math.max(PIXELES_MIN, Math.min(PIXELES_MAX, Math.round(v)));
  const ancho = enRango(anchoM / RESOLUCION_OBJETIVO_M);
  const alto = enRango(altoM / RESOLUCION_OBJETIVO_M);

  // Ventana de 5 días alrededor de la fecha: es el ciclo de paso del satélite.
  const centro = new Date(`${fecha}T00:00:00Z`);
  const desde = new Date(centro);
  desde.setDate(desde.getDate() - 2);
  const hasta = new Date(centro);
  hasta.setDate(hasta.getDate() + 2);

  const r = await fetch(PROCESO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      input: {
        bounds: {
          geometry: geometria,
          properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
        },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: {
                from: `${desde.toISOString().slice(0, 10)}T00:00:00Z`,
                to: `${hasta.toISOString().slice(0, 10)}T23:59:59Z`,
              },
              mosaickingOrder: "leastCC",
            },
          },
        ],
      },
      output: {
        width: ancho,
        height: alto,
        responses: [{ identifier: "default", format: { type: "image/png" } }],
      },
      evalscript: GUION_IMAGEN,
    }),
  });

  if (!r.ok) {
    const detalle = await r.text();
    throw new Error(`Copernicus respondió ${r.status}: ${detalle.slice(0, 200)}`);
  }

  return r.arrayBuffer();
}
