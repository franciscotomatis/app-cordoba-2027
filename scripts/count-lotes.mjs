import { Client } from "pg";
const client = new Client({ connectionString: process.env.MIGRATION_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const lotes = await client.query("select count(*) from lotes");
const clientes = await client.query("select count(*) from clientes");
const siniestros = await client.query("select count(*) from siniestros");
console.log("lotes:", lotes.rows[0].count, "clientes:", clientes.rows[0].count, "siniestros:", siniestros.rows[0].count);
await client.end();
