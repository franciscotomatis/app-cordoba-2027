// Carga la lluvia diaria de Open-Meteo (ERA5-Land) para todas las celdas que
// cubren los lotes. Se corre a mano o desde una tarea programada.
//
//   node scripts/cargar-lluvia.mjs [desde] [hasta]
//   (por defecto: los últimos 12 meses)
//
// El producto tiene unos 5 días de demora, así que pedir hasta "hoy" devuelve
// los últimos días vacíos; por eso el valor por defecto corta antes.
import { Client } from "pg";

const ZONA = "America/Argentina/Cordoba";
const PUNTOS_POR_CONSULTA = 100;
const DEMORA_DIAS = 6;
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

const { rows: celdas } = await c.query(`
  select distinct
    round(centro_lat::numeric, 1) as lat,
    round(centro_lon::numeric, 1) as lon
  from lotes
  where centro_lat is not null
  order by 1, 2`);

console.log(`Celdas a cubrir: ${celdas.length}`);
console.log(`Período: ${DESDE} a ${HASTA}\n`);

let guardadas = 0;
let consultas = 0;

for (let i = 0; i < celdas.length; i += PUNTOS_POR_CONSULTA) {
  const grupo = celdas.slice(i, i + PUNTOS_POR_CONSULTA);
  const lats = grupo.map((g) => g.lat).join(",");
  const lons = grupo.map((g) => g.lon).join(",");

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}` +
    `&start_date=${DESDE}&end_date=${HASTA}&daily=precipitation_sum` +
    `&timezone=${encodeURIComponent(ZONA)}`;

  let respuesta;
  try {
    respuesta = await pedirConReintento(url);
  } catch (e) {
    console.error(`  ${e.message}; se corta acá.`);
    break;
  }
  consultas++;

  const datos = await respuesta.json();
  const lista = Array.isArray(datos) ? datos : [datos];

  // Se arma un solo INSERT por grupo: mucho más rápido que fila por fila.
  const valores = [];
  const parametros = [];

  lista.forEach((punto, indice) => {
    const celda = grupo[indice];
    const dias = punto?.daily?.time ?? [];
    const mm = punto?.daily?.precipitation_sum ?? [];

    dias.forEach((dia, j) => {
      const valor = mm[j];
      if (valor === null || valor === undefined) return;
      const base = parametros.length;
      valores.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      parametros.push(celda.lat, celda.lon, dia, Math.round(valor * 10) / 10);
    });
  });

  // Se inserta de a tandas para no pasarse del límite de parámetros de Postgres.
  const TANDA = 2000;
  for (let k = 0; k < valores.length; k += TANDA) {
    const trozoValores = valores.slice(k, k + TANDA);
    const trozoParams = parametros.slice(k * 4, (k + TANDA) * 4);
    // Se renumeran los marcadores del trozo.
    let n = 0;
    const sql = trozoValores
      .map(() => `($${++n}, $${++n}, $${++n}, $${++n})`)
      .join(",");

    await c.query(
      `insert into clima_dia (lat_celda, lon_celda, fecha, pp_mm)
       values ${sql}
       on conflict (lat_celda, lon_celda, fecha) do update set pp_mm = excluded.pp_mm`,
      trozoParams
    );
    guardadas += trozoValores.length;
  }

  console.log(
    `  consulta ${consultas} · celdas ${i + 1}-${Math.min(i + PUNTOS_POR_CONSULTA, celdas.length)} · ${guardadas} días guardados`
  );

  if (i + PUNTOS_POR_CONSULTA < celdas.length) await esperar(PAUSA_MS);
}

const total = await c.query(
  `select count(*) as filas, min(fecha) as desde, max(fecha) as hasta from clima_dia`
);
console.log("\nEn la base:", total.rows[0]);
await c.end();
