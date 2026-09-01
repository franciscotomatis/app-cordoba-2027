// Verifica qué ve un perito antes y después de tener un caso asignado.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "perito.vista@gmail.com";
const CLAVE = "PeritoVista!2026";

async function db() {
  const c = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
}

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = await db();

  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await c.query(`delete from auth.users where email = $1`, [EMAIL]);
  const { rows } = await c.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token
     ) values (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', '', '', '', '', ''
     ) returning id`,
    [EMAIL, CLAVE]
  );
  const peritoId = rows[0].id;
  await c.query(`update public.profiles set role='perito', nombre_completo='Perito Vista' where id=$1`, [peritoId]);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 880 } });

  // --- Sin casos asignados ---
  await entrar(page);
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(7000);
  const mapaVacio = await page.textContent("body");
  console.log(
    "mapa sin asignaciones:",
    mapaVacio.includes("Todavía no tenés casos asignados") ? "muestra el aviso" : "PANTALLA VACÍA"
  );
  await page.screenshot({ path: ".qa/v-mapa-sin-casos.png" });

  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const gestionVacia = await page.textContent("body");
  console.log(
    "gestión sin asignaciones:",
    gestionVacia.includes("Todavía no tenés casos asignados") ? "muestra el aviso" : "PANTALLA VACÍA"
  );
  await page.screenshot({ path: ".qa/v-gestion-sin-casos.png" });

  // --- Con un caso asignado ---
  const { rows: caso } = await c.query(`
    select s.id, l.cliente_id, cl.nombre,
      (select count(*) from lotes l2 where l2.cliente_id = l.cliente_id) as lotes_del_cuit
    from siniestros s
    join lotes l on l.id = s.lote_id
    join clientes cl on cl.id = l.cliente_id
    limit 1`);
  await c.query(`update siniestros set perito_id=$1, estado='PENDIENTE_INSPECCION' where id=$2`, [
    peritoId,
    caso[0].id,
  ]);
  console.log(
    `\nasignado 1 caso de "${caso[0].nombre}" (ese asegurado tiene ${caso[0].lotes_del_cuit} lotes)`
  );

  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(9000);
  const conCasos = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, " ");
    const i = t.indexOf("lotes");
    return t.slice(Math.max(0, i - 12), i + 60);
  });
  console.log("mapa con 1 caso asignado:", conCasos);
  await page.screenshot({ path: ".qa/v-mapa-con-caso.png" });

  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  console.log("casos visibles en gestión:", await page.locator("tbody tr").count());
  await page.screenshot({ path: ".qa/v-gestion-con-caso.png" });

  // Limpieza
  await c.query(`update siniestros set perito_id=null, estado='DENUNCIADO' where perito_id=$1`, [peritoId]);
  await c.query(`delete from public.profiles where id=$1`, [peritoId]);
  await c.query(`delete from auth.users where id=$1`, [peritoId]);
  await c.end();
  await browser.close();
  console.log("\nlimpieza hecha.");
})();
