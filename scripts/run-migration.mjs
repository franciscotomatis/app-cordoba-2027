import { readFileSync } from "node:fs";
import { Client } from "pg";

// La conexión vive en .env.local (fuera del repo), así no hay que pasarla a mano.
process.loadEnvFile?.(".env.local");

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/run-migration.mjs <archivo.sql>");
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DB_URL;
if (!connectionString) {
  console.error("Falta MIGRATION_DB_URL en el entorno.");
  process.exit(1);
}

const sql = readFileSync(file, "utf-8");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log(`Migración aplicada: ${file}`);
} catch (err) {
  console.error("Error aplicando migración:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
