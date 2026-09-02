// Chequeo (sin tocar la app): compara los departamentos que declaran los lotes
// contra la capa WFS oficial de departamentos del IGN para Córdoba.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const ARCHIVO = process.argv[2] ?? ".tmp_wfs/cordoba.json";

/** Normaliza para comparar: sin tildes, sin mayúsculas, sin dobles espacios. */
const normalizar = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const oficiales = JSON.parse(readFileSync(ARCHIVO, "utf-8")).features.map((f) => ({
  nombre: f.properties.nam,
  codigo: f.properties.in1,
}));
const porNombre = new Map(oficiales.map((d) => [normalizar(d.nombre), d]));

const c = new Client({
  connectionString: process.env.MIGRATION_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows: enLaApp } = await c.query(`
  select departamento, count(*)::int as lotes, sum(hectareas_aseguradas)::numeric as hectareas
  from lotes
  group by departamento
  order by count(*) desc`);

await c.end();

const coinciden = [];
const noCoinciden = [];

for (const d of enLaApp) {
  const clave = normalizar(d.departamento);
  if (porNombre.has(clave)) coinciden.push({ ...d, oficial: porNombre.get(clave) });
  else noCoinciden.push(d);
}

const usados = new Set(coinciden.map((d) => normalizar(d.oficial.nombre)));
const sinLotes = oficiales.filter((o) => !usados.has(normalizar(o.nombre)));

console.log(`Departamentos oficiales (IGN, Córdoba): ${oficiales.length}`);
console.log(`Departamentos distintos en los lotes:  ${enLaApp.length}`);
console.log(`\nCoinciden exactamente: ${coinciden.length}`);
console.log(`No coinciden:          ${noCoinciden.length}`);

if (noCoinciden.length) {
  console.log("\n--- Sin correspondencia en la capa oficial ---");
  for (const d of noCoinciden) {
    // Sugerencia por parecido simple (prefijo o contención)
    const parecidos = oficiales
      .filter((o) => {
        const a = normalizar(o.nombre);
        const b = normalizar(d.departamento);
        return a.includes(b) || b.includes(a) || a.slice(0, 5) === b.slice(0, 5);
      })
      .map((o) => o.nombre);
    console.log(
      `  "${d.departamento}" · ${d.lotes} lotes · ${Math.round(Number(d.hectareas))} ha` +
        (parecidos.length ? `  → ¿${parecidos.join(" / ")}?` : "  → sin sugerencia")
    );
  }
}

if (sinLotes.length) {
  console.log("\n--- Departamentos oficiales sin lotes en la app ---");
  console.log("  " + sinLotes.map((o) => o.nombre).join(", "));
}

const lotesOk = coinciden.reduce((a, d) => a + d.lotes, 0);
const lotesMal = noCoinciden.reduce((a, d) => a + d.lotes, 0);
console.log(
  `\nLotes con departamento reconocido: ${lotesOk} de ${lotesOk + lotesMal} ` +
    `(${((lotesOk / (lotesOk + lotesMal)) * 100).toFixed(1)}%)`
);
