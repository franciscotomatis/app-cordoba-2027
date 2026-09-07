// Verifica que el clima del lote venga por campaña (julio a junio) y con el
// día a día de la lluvia para poder abrir un mes puntual.
const { chromium } = require("playwright");
const { Client } = require("pg");
process.loadEnvFile?.(".env.local");
const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "qa.clima@gmail.com";
const CLAVE = "QaClima!2026";
(async () => {
  const c = new Client({ connectionString: process.env.MIGRATION_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await c.query(`delete from auth.users where email = $1`, [EMAIL]);
  await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
       email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '')`,
    [EMAIL, CLAVE]
  );
  await c.query(`update public.profiles set role='admin' where email=$1`, [EMAIL]);
  const g = await c.query(`select lote_id from gestion_lotes where id_lote_externo='1699' limit 1`);
  const loteId = g.rows[0].lote_id;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let salida = 1;
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
    await page.goto(`${BASE}/mapa`, { waitUntil: "domcontentloaded" });
    const d = await page.evaluate(async (id) => {
      const r = await fetch(`/api/lotes/${id}/clima`);
      return r.json();
    }, loteId);
    if (d.error) throw new Error(d.error);
    console.log("campaña:", d.campania, "·", d.desde, "a", d.hasta);
    console.log("meses:", d.serie.map((m) => `${m.mes}${m.actual === null ? "(sin dato)" : ""}`).join(" "));
    console.log("mm campaña:", d.totalActual, "· normales a la fecha:", d.historicoALaFecha);
    console.log("días de temperatura:", d.temperatura.length, "· días de lluvia:", d.lluviaDiaria.length);
    const feb = d.lluviaDiaria.filter((x) => x.fecha.slice(0, 7) === "2026-02");
    console.log("febrero 2026:", feb.length, "días ·", Math.round(feb.reduce((a, x) => a + x.mm, 0)), "mm");
    console.log("fuente:", d.fuente);
    const ok =
      d.serie.length === 12 &&
      d.serie[0].mes === "Jul" &&
      d.serie[11].mes === "Jun" &&
      d.lluviaDiaria.length > 300 &&
      d.temperatura.length > 300;
    console.log(ok ? "OK: campaña completa de julio a junio, con día a día." : "FALLA");
    salida = ok ? 0 : 1;
  } catch (e) {
    console.error("error:", e.message);
  } finally {
    await browser.close();
    await c.query(`delete from auth.users where email = $1`, [EMAIL]);
    await c.end();
    process.exit(salida);
  }
})();
