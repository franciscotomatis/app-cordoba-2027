// Verifica el alcance del rol perito: solo sus casos asignados, más todos los
// lotes de esos mismos asegurados. Consulta la API real con el token del perito.
import { Client } from "pg";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://fjjqkzpzdaoaytibhfpn.supabase.co";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_XcQNQ0RkEaWv8rhwXaNfvg_kejeZ24_";
const EMAIL = "perito.rls@gmail.com";
const CLAVE = "PeritoRls!2026";

const c = new Client({
  connectionString: process.env.MIGRATION_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// 1. Perito de prueba
await c.query(`create extension if not exists pgcrypto with schema extensions`);
await c.query(`delete from auth.users where email = $1`, [EMAIL]);
const { rows: creado } = await c.query(
  `insert into auth.users (
     instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token
   ) values (
     '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
     $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
     now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     '', '', '', '', '', '', '', ''
   ) returning id`,
  [EMAIL, CLAVE]
);
const peritoId = creado[0].id;
await c.query(`update public.profiles set role = 'perito', nombre_completo = 'Perito RLS' where id = $1`, [peritoId]);

// 2. Le asigno 3 casos de 2 asegurados distintos
const { rows: casos } = await c.query(`
  select s.id, l.cliente_id
  from siniestros s join lotes l on l.id = s.lote_id
  where l.cliente_id is not null
  order by l.cliente_id
  limit 3`);
await c.query(`update siniestros set perito_id = $1, estado = 'PENDIENTE_INSPECCION' where id = any($2::uuid[])`, [
  peritoId,
  casos.map((x) => x.id),
]);

const clientes = [...new Set(casos.map((x) => x.cliente_id))];

// 3. Números esperados
const { rows: esp } = await c.query(
  `select
     (select count(*) from siniestros where perito_id = $1) as casos_asignados,
     (select count(*) from lotes where cliente_id = any($2::uuid[])) as lotes_de_esos_cuits,
     (select count(*) from siniestros s join lotes l on l.id = s.lote_id
        where l.cliente_id = any($2::uuid[])) as siniestros_totales_de_esos_cuits,
     (select count(*) from lotes) as lotes_totales,
     (select count(*) from siniestros) as siniestros_totales`,
  [peritoId, clientes]
);
console.log("esperado:", esp[0]);

// 4. Consultas con el token del perito
const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: CLAVE }),
}).then((r) => r.json());

if (!login.access_token) {
  console.error("no se pudo iniciar sesión como perito:", login);
  process.exit(1);
}

async function contar(tabla) {
  const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${login.access_token}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const rango = r.headers.get("content-range") ?? "";
  return parseInt(rango.split("/")[1] ?? "0", 10);
}

const visto = {
  lotes: await contar("lotes"),
  siniestros: await contar("siniestros"),
  clientes: await contar("clientes"),
  lotes_mapa: await contar("lotes_mapa"),
  siniestros_gestion: await contar("siniestros_gestion"),
};
console.log("ve el perito:", visto);

const e = esp[0];
const ok = [
  ["ve solo sus casos asignados", visto.siniestros === Number(e.casos_asignados)],
  ["ve todos los lotes de esos CUIT", visto.lotes === Number(e.lotes_de_esos_cuits)],
  ["no ve el resto de los lotes", visto.lotes < Number(e.lotes_totales)],
  ["no ve el resto de los siniestros", visto.siniestros < Number(e.siniestros_totales)],
  ["ve solo esos asegurados", visto.clientes === clientes.length],
  ["la vista del mapa respeta el alcance", visto.lotes_mapa === Number(e.lotes_de_esos_cuits)],
  ["la gestión respeta el alcance", visto.siniestros_gestion === Number(e.casos_asignados)],
];
for (const [texto, paso] of ok) console.log(`${paso ? "OK  " : "FALLA"} ${texto}`);

// 5. Limpieza
await c.query(`update siniestros set perito_id = null, estado = 'DENUNCIADO' where perito_id = $1`, [peritoId]);
await c.query(`delete from public.profiles where id = $1`, [peritoId]);
await c.query(`delete from auth.users where id = $1`, [peritoId]);
await c.end();
console.log("\nusuario de prueba eliminado y casos restaurados.");
