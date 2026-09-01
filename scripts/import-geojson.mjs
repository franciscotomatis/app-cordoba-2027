import { readFileSync } from "node:fs";
import { Client } from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/import-geojson.mjs <archivo.geojson>");
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DB_URL;
if (!connectionString) {
  console.error("Falta MIGRATION_DB_URL en el entorno.");
  process.exit(1);
}

// Mismas metas de hectáreas que usaba la app vieja (panel de comparación por zona).
const ZONAS = [
  { numero: 1, nombre: "Zona 1", hectareas_meta: 128998 },
  { numero: 2, nombre: "Zona 2", hectareas_meta: 65245 },
  { numero: 3, nombre: "Zona 3", hectareas_meta: 187636 },
  { numero: 4, nombre: "Zona 4", hectareas_meta: 151566 },
];

function parseNumero(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const normalizado = String(value).trim().replace(",", ".");
  const num = Number(normalizado);
  return Number.isFinite(num) ? num : null;
}

function parseFecha(value) {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/;
  if (iso.test(value)) return value.slice(0, 10);
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log("Leyendo GeoJSON...");
const geojson = JSON.parse(readFileSync(file, "utf-8"));
const features = geojson.features;
console.log(`Features: ${features.length}`);

// 1. Zonas
const zonaIdByNumero = new Map();
for (const z of ZONAS) {
  const existing = await client.query("select id from zonas where nombre = $1", [z.nombre]);
  if (existing.rows.length > 0) {
    zonaIdByNumero.set(z.numero, existing.rows[0].id);
  } else {
    const res = await client.query(
      "insert into zonas (nombre, hectareas_meta) values ($1, $2) returning id",
      [z.nombre, z.hectareas_meta]
    );
    zonaIdByNumero.set(z.numero, res.rows[0].id);
  }
}
console.log("Zonas listas.");

// 2. Clientes: dedupe en JS, batch insert, mapa por CUIT (o nombre si no hay CUIT).
const clientesMap = new Map(); // key -> {nombre, cuit}
for (const f of features) {
  const p = f.properties;
  if (!p.CLIENTE) continue;
  const key = p.CUIT || `nombre:${p.CLIENTE}`;
  if (!clientesMap.has(key)) clientesMap.set(key, { nombre: p.CLIENTE, cuit: p.CUIT || null });
}
const clientesArr = [...clientesMap.entries()];
console.log(`Clientes únicos a insertar: ${clientesArr.length}`);

const clienteIdByKey = new Map();
for (const batch of chunk(clientesArr, 200)) {
  const values = [];
  const params = [];
  batch.forEach(([, c], i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(c.nombre, c.cuit);
  });
  const res = await client.query(
    `insert into clientes (nombre, cuit) values ${values.join(",")} returning id, nombre, cuit`,
    params
  );
  for (const row of res.rows) {
    const key = row.cuit || `nombre:${row.nombre}`;
    clienteIdByKey.set(key, row.id);
  }
  console.log(`  clientes: ${clienteIdByKey.size}/${clientesArr.length}`);
}

// 3. Lotes en batches, RETURNING id + id_lote_externo para mapear siniestros después.
const loteIdByExterno = new Map();
let lotesInsertados = 0;
for (const batch of chunk(features, 200)) {
  const values = [];
  const params = [];
  batch.forEach((f, i) => {
    const p = f.properties;
    const key = p.CUIT || `nombre:${p.CLIENTE}`;
    const clienteId = clienteIdByKey.get(key) ?? null;
    const zonaId = zonaIdByNumero.get(Number(p.ZONA_CZ4)) ?? null;
    const base = i * 7;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($${base + 6})), 4326), $${base + 7})`
    );
    params.push(
      String(p.LOTE_ID),
      clienteId,
      zonaId,
      p.CULTIVO ?? null,
      parseNumero(p.HECTAREAS_ASEGURADAS),
      JSON.stringify(f.geometry),
      "import_manual"
    );
  });
  const res = await client.query(
    `insert into lotes (id_lote_externo, cliente_id, zona_id, cultivo, hectareas_aseguradas, geom, origen)
     values ${values.join(",")}
     returning id, id_lote_externo`,
    params
  );
  for (const row of res.rows) loteIdByExterno.set(row.id_lote_externo, row.id);
  lotesInsertados += res.rows.length;
  console.log(`  lotes: ${lotesInsertados}/${features.length}`);
}

// 4. Siniestros (solo features con CAUSA_STRO).
const siniestrosData = features
  .filter((f) => f.properties.CAUSA_STRO)
  .map((f) => ({
    lote_id: loteIdByExterno.get(String(f.properties.LOTE_ID)),
    causa: f.properties.CAUSA_STRO,
    fecha: parseFecha(f.properties.FECHA_STRO),
    danio: parseNumero(f.properties["DAÑO_ESTIMADO"]),
  }))
  .filter((s) => s.lote_id);

let siniestrosInsertados = 0;
for (const batch of chunk(siniestrosData, 200)) {
  const values = [];
  const params = [];
  batch.forEach((s, i) => {
    const base = i * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(s.lote_id, s.causa, s.fecha, s.danio);
  });
  await client.query(
    `insert into siniestros (lote_id, causa, fecha, danio_estimado) values ${values.join(",")}`,
    params
  );
  siniestrosInsertados += batch.length;
  console.log(`  siniestros: ${siniestrosInsertados}/${siniestrosData.length}`);
}

console.log(
  `Listo. Lotes: ${lotesInsertados}, siniestros: ${siniestrosInsertados}, clientes: ${clienteIdByKey.size}`
);
await client.end();
