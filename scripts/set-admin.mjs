import { Client } from "pg";

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/set-admin.mjs <email>");
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DB_URL;
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

await client.connect();

const { rows } = await client.query(
  `select id, email from auth.users where email = $1`,
  [email]
);

if (rows.length === 0) {
  console.error(`No se encontró ningún usuario con email ${email}`);
  process.exit(1);
}

const userId = rows[0].id;

await client.query(
  `insert into public.profiles (id, role, nombre_completo)
   values ($1, 'admin', $2)
   on conflict (id) do update set role = 'admin'`,
  [userId, email]
);

console.log(`Usuario ${email} (${userId}) marcado como admin.`);
await client.end();
