// Borra del bucket los archivos que ya no tienen fila en la tabla "fotos".
//
// Quedaron de un error que ya está corregido: el borrado eliminaba la fila y
// después intentaba el archivo, pero sin la fila el archivo era invisible para
// esa sesión y nunca se borraba. Este script limpia lo que quedó de antes.
//
//   node scripts/limpiar-fotos-huerfanas.mjs [--borrar]
//
// Sin --borrar solo informa qué encontraría.
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile?.(".env.local");

const BORRAR = process.argv.includes("--borrar");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const c = new Client({
  connectionString: process.env.MIGRATION_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows } = await c.query(`
  select o.name, (o.metadata->>'size')::bigint as bytes, o.created_at
    from storage.objects o
    left join fotos f on f.storage_path = o.name
   where o.bucket_id = 'fotos' and f.id is null
   order by o.created_at`);

await c.end();

if (rows.length === 0) {
  console.log("No hay archivos huérfanos.");
  process.exit(0);
}

const total = rows.reduce((a, r) => a + Number(r.bytes), 0);
console.log(`Archivos sin fila en "fotos": ${rows.length} · ${(total / 1048576).toFixed(1)} MB`);
for (const r of rows) {
  console.log(`  ${r.name}  ${(Number(r.bytes) / 1024).toFixed(0)} KB  ${String(r.created_at).slice(0, 10)}`);
}

if (!BORRAR) {
  console.log("\nEsto es solo un informe. Volvé a correrlo con --borrar para eliminarlos.");
  process.exit(0);
}

const supabase = createClient(url, clave, { auth: { persistSession: false } });
const { data, error } = await supabase.storage.from("fotos").remove(rows.map((r) => r.name));

if (error) {
  console.error("Error al borrar:", error.message);
  process.exit(1);
}
console.log(`\nBorrados: ${data?.length ?? 0} archivos.`);
