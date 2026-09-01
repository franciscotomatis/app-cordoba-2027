import { Client } from "pg";

const email = process.argv[2] ?? "test-visual@ejemplo.local";
const password = process.argv[3] ?? "PruebaVisual123!";
const accion = process.argv[4] ?? "crear"; // crear | borrar

const client = new Client({
  connectionString: process.env.MIGRATION_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

if (accion === "borrar") {
  await client.query("delete from auth.users where email = $1", [email]);
  console.log(`Usuario de prueba ${email} eliminado.`);
} else {
  await client.query("delete from auth.users where email = $1", [email]);
  const res = await client.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at,
       raw_app_meta_data, raw_user_meta_data
       , confirmation_token, recovery_token, email_change, email_change_token_new,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token
     ) values (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       $1, crypt($2, gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}',
       '', '', '', '', '', '', '', ''
     ) returning id`,
    [email, password]
  );
  const id = res.rows[0].id;
  await client.query(
    `insert into profiles (id, email, role, nombre_completo)
     values ($1, $2, 'admin', 'Usuario de prueba visual')
     on conflict (id) do update set role = 'admin'`,
    [id, email]
  );
  console.log(`Usuario de prueba creado: ${email} (${id})`);
}

await client.end();
