// Cambia el estado de unos casos en Gestión y verifica que el filtro del mapa
// lo refleje sin necesidad de recargar a mano.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "admin.estado@gmail.com";
const CLAVE = "AdminEstado!2026";

async function conteosDelFiltro(page) {
  await page.getByRole("button", { name: /Estado:/ }).click();
  await page.waitForTimeout(700);
  const datos = await page.evaluate(() => {
    const salida = {};
    for (const b of Array.from(document.querySelectorAll("button"))) {
      const t = (b.textContent || "").trim();
      const m = t.match(
        /^(Denunciado|Pendiente de inspección|Cerrado|Pagado)\s*([\d.]+)$/
      );
      if (m) salida[m[1]] = m[2];
    }
    return salida;
  });
  await page.keyboard.press("Escape");
  await page.mouse.click(700, 620);
  await page.waitForTimeout(500);
  return datos;
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await c.query(`delete from auth.users where email = $1`, [EMAIL]);
  await c.query(
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
     )`,
    [EMAIL, CLAVE]
  );
  await c.query(`update public.profiles set role='admin' where email=$1`, [EMAIL]);
  await c.query(`update siniestros set estado='DENUNCIADO', perito_id=null`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1450, height: 900 } });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  // 1. Estado inicial del filtro del mapa
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(15000);
  console.log("filtro del mapa ANTES:", await conteosDelFiltro(page));

  // 2. Cambiar el estado de los primeros 3 casos en Gestión
  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) {
    await page.locator("tbody tr").nth(i).locator("select").selectOption("PENDIENTE_INSPECCION");
    await page.waitForTimeout(2500);
  }
  console.log("3 casos pasados a Pendiente de inspección");

  // 3. Volver al mapa: el filtro tiene que reflejarlo
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(15000);
  const despues = await conteosDelFiltro(page);
  console.log("filtro del mapa DESPUÉS:", despues);
  await page.screenshot({ path: ".qa/e-filtro-estado.png" });

  const enBase = await c.query(
    `select estado, count(*) from siniestros group by estado order by 1`
  );
  console.log("en la base:", enBase.rows);

  console.log(
    despues["Pendiente de inspección"] === "3"
      ? "OK   el filtro del mapa quedó sincronizado"
      : "FALLA el filtro del mapa sigue desactualizado"
  );

  await c.query(`update siniestros set estado='DENUNCIADO', perito_id=null`);
  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end();
  await browser.close();
})();
