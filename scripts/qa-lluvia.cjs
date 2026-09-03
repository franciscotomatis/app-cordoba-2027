const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "lluvia.qa@gmail.com", CLAVE = "LluviaQa!2026";
(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({ connectionString: process.env.MIGRATION_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token) values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,extensions.crypt($2,extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,'','','','','','','','')`, [EMAIL, CLAVE]);
  await c.query(`update public.profiles set role='admin' where email=$1`, [EMAIL]);

  const esperado = await c.query(`select round(min(t.mm)) as minimo, round(max(t.mm)) as maximo, round(avg(t.mm)) as promedio from lluvia_por_lote('2026-06-01','2026-08-27') t(id, mm)`);
  console.log("lluvia por lote según la base:", esperado.rows[0]);

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errores = [];
  p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', CLAVE);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
  await p.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await p.waitForTimeout(15000);

  await p.getByRole("button", { name: "Color: lluvia" }).click();
  await p.waitForTimeout(1200);
  console.log("filtro de lluvia visible:", await p.getByRole("button", { name: /Lluvia:/ }).count());
  await p.getByRole("button", { name: /Lluvia:/ }).click();
  await p.waitForTimeout(600);
  const fechas = p.locator('input[type="date"]');
  await fechas.first().fill("2026-06-01");
  await fechas.nth(1).fill("2026-08-27");
  await p.waitForTimeout(6000);
  await p.keyboard.press("Escape");
  await p.mouse.click(760, 640);
  await p.waitForTimeout(3000);

  await p.locator('input[placeholder*="Asegurado"]').fill("TECNOCAMPO");
  await p.waitForTimeout(5000);

  const leyenda = await p.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, " ");
    const i = t.indexOf("LLUVIA ACUMULADA");
    return i >= 0 ? t.slice(i, i + 140) : "(no encontrada)";
  });
  console.log("leyenda:", leyenda);
  await p.screenshot({ path: ".qa/ll-mapa.png" });
  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");
  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end(); await b.close();
})();
