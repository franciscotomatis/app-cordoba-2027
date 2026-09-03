// Carga la lluvia diaria de Open-Meteo (ERA5-Land) en la grilla de 0,1° que
// cubre la provincia de Córdoba. Se corre a mano o desde una tarea programada.
//
//   node scripts/cargar-lluvia.mjs [desde] [hasta]
//   (por defecto: los últimos 12 meses)
//
// El producto tiene unos 5 días de demora, así que pedir hasta "hoy" devuelve
// los últimos días vacíos; por eso el valor por defecto corta antes.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const ZONA = "America/Argentina/Cordoba";
const PUNTOS_POR_CONSULTA = 100;
const DEMORA_DIAS = 6;
const PASO = 0.1;

// Open-Meteo limita las consultas por minuto: se espera entre pedidos y se
// reintenta con más pausa si contesta 429.
const PAUSA_MS = 6000;
const REINTENTOS = 5;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedirConReintento(url) {
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    const r = await fetch(url);
    if (r.ok) return r;
    if (r.status !== 429) throw new Error(`Open-Meteo respondió ${r.status}`);
    const pausa = PAUSA_MS * intento * 2;
    console.log(`    límite alcanzado, esperando ${pausa / 1000}s...`);
    await esperar(pausa);
  }
  throw new Error("Open-Meteo sigue rechazando por límite de consultas");
}

/** Punto dentro de polígono (ray casting), en [lon, lat]. */
function dentro(punto, anillo) {
  let adentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (
      yi > punto[1] !== yj > punto[1] &&
      punto[0] < ((xj - xi) * (punto[1] - yi)) / (yj - yi) + xi
    ) {
      adentro = !adentro;
    }
  }
  return adentro;
}

/** Celdas de 0,1° cuyo centro cae dentro de la provincia. */
function celdasDeLaProvincia() {
  const geo = JSON.parse(
    readFileSync("public/capas/cordoba-provincia.json", "utf-8")
  );
  const g = geo.features[0].geometry;
  const poligonos = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  const anillos = poligonos.map((p) => p[0]);

  const lats = [];
  const lons = [];
  for (const anillo of anillos) {
    for (const [lon, lat] of anillo) {
      lats.push(lat);
      lons.push(lon);
    }
  }

  const redondear = (v) => Math.round(v / PASO) * PASO;
  const celdas = [];

  for (let lat = redondear(Math.min(...lats)); lat <= Math.max(...lats); lat += PASO) {
    for (let lon = redondear(Math.min(...lons)); lon <= Math.max(...lons); lon += PASO) {
      const la = Math.round(lat * 10) / 10;
      const lo = Math.round(lon * 10) / 10;
      if (anillos.some((a) => dentro([lo, la], a))) celdas.push({ lat: la, lon: lo });
    }
  }
  return celdas;
}

function fechaISO(d) {
  return d.toISOString().slice(0, 10);
}

const hoy = new Date();
const finPorDefecto = new Date(hoy);
finPorDefecto.setDate(finPorDefecto.getDate() - DEMORA_DIAS);
const inicioPorDefecto = new Date(finPorDefecto);
inicioPorDefecto.setFullYear(inicioPorDefecto.getFullYear() - 1);

const DESDE = process.argv[2] ?? fechaISO(inicioPorDefecto);
const HASTA = process.argv[3] ?? fechaISO(finPorDefecto);

const c = new Client({
  connectionString: process.env.MIGRATION_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const celdas = celdasDeLaProvincia();
console.log(`Celdas dentro de Córdoba: ${celdas.length}`);
console.log(`Período: ${DESDE} a ${HASTA}\n`);

let guardadas = 0;

for (let i = 0; i < celdas.length; i += PUNTOS_POR_CONSULTA) {
  const grupo = celdas.slice(i, i + PUNTOS_POR_CONSULTA);
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${grupo.map((g) => g.lat).join(",")}` +
    `&longitude=${grupo.map((g) => g.lon).join(",")}` +
    `&start_date=${DESDE}&end_date=${HASTA}&daily=precipitation_sum` +
    `&timezone=${encodeURIComponent(ZONA)}`;

  let respuesta;
  try {
    respuesta = await pedirConReintento(url);
  } catch (e) {
    console.error(`  ${e.message}; se corta acá.`);
    break;
  }

  const datos = await respuesta.json();
  const lista = Array.isArray(datos) ? datos : [datos];

  const filas = [];
  lista.forEach((punto, indice) => {
    const celda = grupo[indice];
    const dias = punto?.daily?.time ?? [];
    const mm = punto?.daily?.precipitation_sum ?? [];
    dias.forEach((dia, j) => {
      const valor = mm[j];
      if (valor === null || valor === undefined) return;
      filas.push([celda.lat, celda.lon, dia, Math.round(valor * 10) / 10]);
    });
  });

  const TANDA = 2000;
  for (let k = 0; k < filas.length; k += TANDA) {
    const trozo = filas.slice(k, k + TANDA);
    let n = 0;
    const sql = trozo.map(() => `($${++n}, $${++n}, $${++n}, $${++n}, true)`).join(",");
    await c.query(
      `insert into clima_dia (lat_celda, lon_celda, fecha, pp_mm, en_provincia)
       values ${sql}
       on conflict (lat_celda, lon_celda, fecha)
       do update set pp_mm = excluded.pp_mm, en_provincia = true`,
      trozo.flat()
    );
    guardadas += trozo.length;
  }

  console.log(
    `  celdas ${i + 1}-${Math.min(i + PUNTOS_POR_CONSULTA, celdas.length)} · ${guardadas} días guardados`
  );

  if (i + PUNTOS_POR_CONSULTA < celdas.length) await esperar(PAUSA_MS);
}

const total = await c.query(
  `select count(*) as filas,
          count(distinct (lat_celda, lon_celda)) as celdas,
          min(fecha) as desde, max(fecha) as hasta
   from clima_dia`
);
console.log("\nEn la base:", total.rows[0]);
await c.end();
