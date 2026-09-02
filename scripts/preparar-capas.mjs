// Descarga los límites oficiales del IGN (provincia y departamentos de Córdoba),
// los simplifica y los deja como archivos estáticos en public/capas.
// Se corre a mano cuando haga falta actualizarlos, no en cada arranque.
import { mkdirSync, writeFileSync } from "node:fs";

const IGN = "https://wms.ign.gob.ar/geoserver/ows";
const SALIDA = "public/capas";

// ~200 m de tolerancia: imperceptible mirando una provincia entera y recorta
// muchísimo el peso del archivo.
const TOLERANCIA = 0.002;
const DECIMALES = 4;

/** Distancia perpendicular de un punto a la recta que une otros dos. */
function distancia([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + tc * dx), y - (y1 + tc * dy));
}

/** Douglas-Peucker: descarta los puntos que no cambian la forma. */
function simplificar(puntos, tolerancia) {
  if (puntos.length <= 2) return puntos;

  let maxDist = 0;
  let indice = 0;
  for (let i = 1; i < puntos.length - 1; i++) {
    const d = distancia(puntos[i], puntos[0], puntos[puntos.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      indice = i;
    }
  }

  if (maxDist <= tolerancia) return [puntos[0], puntos[puntos.length - 1]];

  return [
    ...simplificar(puntos.slice(0, indice + 1), tolerancia).slice(0, -1),
    ...simplificar(puntos.slice(indice), tolerancia),
  ];
}

const redondear = (p) => p.map((v) => Number(v.toFixed(DECIMALES)));

function anillo(puntos) {
  const simple = simplificar(puntos, TOLERANCIA).map(redondear);
  // Un anillo válido necesita al menos 4 puntos y cerrar donde empezó.
  if (simple.length < 4) return puntos.map(redondear);
  const [a] = simple;
  const z = simple[simple.length - 1];
  if (a[0] !== z[0] || a[1] !== z[1]) simple.push([...a]);
  return simple;
}

function procesarGeometria(g) {
  if (g.type === "Polygon") {
    return { ...g, coordinates: g.coordinates.map(anillo) };
  }
  if (g.type === "MultiPolygon") {
    return { ...g, coordinates: g.coordinates.map((p) => p.map(anillo)) };
  }
  return g;
}

async function bajar(nombre, typeName, filtro, propiedades) {
  const url =
    `${IGN}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${typeName}&outputFormat=application/json` +
    `&CQL_FILTER=${encodeURIComponent(filtro)}`;

  console.log(`Bajando ${nombre}...`);
  const datos = await fetch(url).then((r) => r.json());

  const antes = JSON.stringify(datos).length;
  const salida = {
    type: "FeatureCollection",
    features: datos.features.map((f) => ({
      type: "Feature",
      geometry: procesarGeometria(f.geometry),
      properties: Object.fromEntries(
        propiedades.map((p) => [p, f.properties[p]])
      ),
    })),
  };

  const texto = JSON.stringify(salida);
  writeFileSync(`${SALIDA}/${nombre}.json`, texto);
  console.log(
    `  ${salida.features.length} elementos · ${(antes / 1024).toFixed(0)} kB → ` +
      `${(texto.length / 1024).toFixed(0)} kB`
  );
}

mkdirSync(SALIDA, { recursive: true });
// in1 = código INDEC; Córdoba es la provincia 14.
await bajar("cordoba-departamentos", "ign:departamento", "in1 LIKE '14%'", ["nam", "in1"]);
await bajar("cordoba-provincia", "ign:provincia", "in1 = '14'", ["nam"]);
console.log("\nListo. Fuente: capa oficial del IGN (ign:departamento / ign:provincia).");
