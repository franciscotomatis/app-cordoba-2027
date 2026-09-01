// Reproduce el caso reportado: entrar como perito (sin casos), cerrar sesión y
// entrar como admin en la misma pestaña. El admin tiene que ver todos los lotes.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const PERITO = { email: "perito.cambio@gmail.com", clave: "PeritoCambio!2026", rol: "perito" };
const ADMIN = { email: "admin.cambio@gmail.com", clave: "AdminCambio!2026", rol: "admin" };

async function crear(c, u) {
  await c.query(`delete from auth.users where email = $1`, [u.email]);
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
    [u.email, u.clave]
  );
  await c.query(`update public.profiles set role = $2 where email = $1`, [u.email, u.rol]);
}

async function entrar(page, u) {
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.clave);
  await page.click('button[type="submit"]');
  await page.waitForURL((u2) => !u2.pathname.includes("login"), { timeout: 30000 });
}

async function loteYHa(page) {
  return page.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, " ");
    const i = t.indexOf("lotes");
    return t.slice(Math.max(0, i - 12), i + 40).trim();
  });
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await crear(c, PERITO);
  await crear(c, ADMIN);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 880 } });

  // 1. Perito sin casos
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await entrar(page, PERITO);
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(7000);
  console.log("como perito:", await loteYHa(page));

  // 2. Cerrar sesión y entrar como admin en la MISMA pestaña
  await page.getByRole("button", { name: /Salir/ }).click();
  await page.waitForURL((u) => u.pathname.includes("login"), { timeout: 20000 });
  await page.waitForTimeout(1500);
  await entrar(page, ADMIN);
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(16000);
  const comoAdmin = await loteYHa(page);
  console.log("como admin (misma pestaña):", comoAdmin);
  await page.screenshot({ path: ".qa/cambio-admin.png" });

  const ok = /5\.701|5701/.test(comoAdmin);
  console.log(ok ? "OK   el admin ve todos los lotes" : "FALLA el admin sigue viendo la vista del perito");

  await c.query(`delete from public.profiles where email in ($1,$2)`, [PERITO.email, ADMIN.email]);
  await c.query(`delete from auth.users where email in ($1,$2)`, [PERITO.email, ADMIN.email]);
  await c.end();
  await browser.close();
})();
