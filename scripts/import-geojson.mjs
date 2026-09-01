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
  const t = String(value).trim();
  // Formato argentino ("1.234,56"): el punto separa miles y la coma decimales.
  // Si no hay coma, el punto ya es el separador decimal ("100.5").
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const num = Number(normalizado);
  return Number.isFinite(num) ? num : null;
}

function parseFecha(value) {
  if (!value) return null;
  const texto = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function texto(value) {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  return t === "" || t.toLowerCase() === "nan" ? null : t;
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

// 2. Clientes: dedupe por CUIT (o nombre), insertando solo los que faltan.
const clienteIdByKey = new Map();
const existentes = await client.query("select id, nombre, cuit from clientes");
for (const row of existentes.rows) {
  clienteIdByKey.set(row.cuit || `nombre:${row.nombre}`, row.id);
}

const nuevos = new Map();
for (const f of features) {
  const p = f.properties;
  const nombre = texto(p.CLIENTE);
  if (!nombre) continue;
  const cuit = texto(p.CUIT);
  const key = cuit || `nombre:${nombre}`;
  if (!clienteIdByKey.has(key) && !nuevos.has(key)) nuevos.set(key, { nombre, cuit });
}
console.log(`Clientes existentes: ${clienteIdByKey.size} · nuevos a insertar: ${nuevos.size}`);

for (const batch of chunk([...nuevos.values()], 200)) {
  const values = [];
  const params = [];
  batch.forEach((c, i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(c.nombre, c.cuit);
  });
  const res = await client.query(
    `insert into clientes (nombre, cuit) values ${values.join(",")} returning id, nombre, cuit`,
    params
  );
  for (const row of res.rows) clienteIdByKey.set(row.cuit || `nombre:${row.nombre}`, row.id);
}

// 3. Lotes con todos los atributos (upsert por id_lote_externo).
const CAMPOS = [
  "id_lote_externo", "cliente_id", "zona_id", "cultivo", "hectareas_aseguradas",
  "hectareas_declaradas", "porcentaje_asegurado", "rendimiento_asegurado", "suma_asegurada",
  "cultivo_anterior", "rendimiento_anterior", "fecha_siembra", "fecha_creacion", "estado",
  "lote_nombre", "campo", "campo_id", "departamento", "localidad", "origen",
];

const loteIdByExterno = new Map();
let procesados = 0;

for (const batch of chunk(features, 200)) {
  const values = [];
  const params = [];
  batch.forEach((f, i) => {
    const p = f.properties;
    const nombre = texto(p.CLIENTE);
    const cuit = texto(p.CUIT);
    const clienteId = nombre ? clienteIdByKey.get(cuit || `nombre:${nombre}`) ?? null : null;
    const base = i * 21;
    const ph = (n) => `$${base + n}`;
    values.push(
      `(${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}, ${ph(7)}, ${ph(8)}, ${ph(9)}, ` +
        `${ph(10)}, ${ph(11)}, ${ph(12)}, ${ph(13)}, ${ph(14)}, ${ph(15)}, ${ph(16)}, ${ph(17)}, ` +
        `${ph(18)}, ${ph(19)}, ${ph(20)}, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(${ph(21)})), 4326))`
    );
    params.push(
      String(p.LOTE_ID),
      clienteId,
      zonaIdByNumero.get(Number(p.ZONA_CZ4)) ?? null,
      texto(p.CULTIVO),
      parseNumero(p.HECTAREAS_ASEGURADAS),
      parseNumero(p.HECTAREAS_DECLARADAS),
      parseNumero(p.PORCENTAJE_ASEGURADO),
      parseNumero(p.RENDIMIENTO_ASEGURADO),
      parseNumero(p.SUMA_ASEGURADA),
      texto(p.CULTIVO_ANTERIOR),
      parseNumero(p.RENDIMIENTO_ANTERIOR),
      parseFecha(p.FECHA_SIEMBRA),
      parseFecha(p.FECHA_CREACION),
      texto(p.ESTADO),
      texto(p.LOTE),
      texto(p.CAMPO),
      texto(p.CAMPO_ID),
      texto(p.DEPARTAMENTO),
      texto(p.LOCALIDAD),
      "import_manual",
      JSON.stringify(f.geometry)
    );
  });

  const asignaciones = CAMPOS.filter((c) => c !== "id_lote_externo")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  const res = await client.query(
    `insert into lotes (${CAMPOS.join(", ")}, geom)
     values ${values.join(",")}
     on conflict (id_lote_externo) do update set
       ${asignaciones}, geom = excluded.geom, actualizado_en = now()
     returning id, id_lote_externo`,
    params
  );
  for (const row of res.rows) loteIdByExterno.set(row.id_lote_externo, row.id);
  procesados += res.rows.length;
  console.log(`  lotes: ${procesados}/${features.length}`);
}

// 4. Siniestros: se reemplazan los de los lotes del archivo para no duplicar.
const siniestros = features
  .filter((f) => texto(f.properties.CAUSA_STRO))
  .map((f) => ({
    lote_id: loteIdByExterno.get(String(f.properties.LOTE_ID)),
    causa: texto(f.properties.CAUSA_STRO),
    fecha: parseFecha(f.properties.FECHA_STRO),
    danio: parseNumero(f.properties["DAÑO_ESTIMADO"]),
  }))
  .filter((s) => s.lote_id);

const idsAfectados = [...new Set(siniestros.map((s) => s.lote_id))];
for (const batch of chunk(idsAfectados, 500)) {
  await client.query("delete from siniestros where lote_id = any($1::uuid[])", [batch]);
}

let insertados = 0;
for (const batch of chunk(siniestros, 200)) {
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
  insertados += batch.length;
}

console.log(`Listo. Lotes: ${procesados}, siniestros: ${insertados}, clientes: ${clienteIdByKey.size}`);
await client.end();
