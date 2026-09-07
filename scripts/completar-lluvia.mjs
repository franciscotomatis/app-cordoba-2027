// Completa los huecos de la grilla de lluvia provincial.
//
// La carga masiva puede cortarse a la mitad (se cae la conexión, Open-Meteo
// devuelve 429 demasiadas veces) y deja celdas sin parte del período. Rehacer
// todo son treinta minutos de pedidos al pedo; esto busca qué falta y pide
// solo eso.
//
//   node scripts/completar-lluvia.mjs <desde> <hasta>
import { Client } from "pg";

process.loadEnvFile?.(".env.local");

const ZONA = "America/Argentina/Cordoba";
const PUNTOS_POR_CONSULTA = 100;
const PAUSA_MS = 4000;
const REINTENTOS = 5;

const DESDE = process.argv[2];
const HASTA = process.argv[3];
if (!DESDE || !HASTA) {
  console.error("Uso: node scripts/completar-lluvia.mjs <aaaa-mm-dd> <aaaa-mm-dd>");
  process.exit(1);
}

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

const c = new Client({
  connectionString: process.env.MIGRATION_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const diasEsperados =
  Math.round((new Date(HASTA) - new Date(DESDE)) / 86400000) + 1;

// Celdas de la provincia a las que les falta al menos un día del período.
const { rows: incompletas } = await c.query(
  `select lat_celda, lon_celda, count(*) filter (where fecha between $1 and $2) as tiene
     from clima_dia
    where en_provincia
    group by lat_celda, lon_celda
   having count(*) filter (where fecha between $1 and $2) < $3
    order by 1, 2`,
  [DESDE, HASTA, diasEsperados]
);

console.log(`Período ${DESDE} a ${HASTA} (${diasEsperados} días)`);
console.log(`Celdas incompletas: ${incompletas.length}`);

if (incompletas.length === 0) {
  console.log("No falta nada.");
  await c.end();
  process.exit(0);
}

const celdas = incompletas.map((r) => ({
  lat: Number(r.lat_celda),
  lon: Number(r.lon_celda),
}));

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
    console.error(`  ${e.message}; se corta acá, volvé a correrlo para seguir.`);
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

const { rows } = await c.query(
  `select count(distinct (lat_celda, lon_celda))::int celdas
     from clima_dia
    where en_provincia and fecha between $1 and $2`,
  [DESDE, HASTA]
);
console.log(`\nCeldas con datos en el período: ${rows[0].celdas}`);
await c.end();
