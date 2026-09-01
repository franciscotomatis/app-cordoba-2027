// QA de: lotes sin denuncia en Gestión, carga de rinde desde el popup del mapa
// y filtro por fecha de siniestro.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "admin.qa2@gmail.com";
const CLAVE = "AdminQa2!2026";

async function crearAdmin(c) {
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
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await crearAdmin(c);
  await c.query(`update lotes set rinde_estimado = null, rinde_estimado_en = null`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  // --- 1. Gestión: solo denunciados vs todos ---
  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const soloCasos = await page.locator("tbody tr").count();
  const resumen1 = (await page.textContent("body")).match(/(\d[\d.]*)\s*casos/);
  console.log("solo denunciados · filas:", soloCasos, "· resumen:", resumen1?.[1]);

  await page.getByRole("link", { name: /Incluir lotes sin denuncia/ }).click();
  await page.waitForURL((u) => u.search.includes("todos=1"), { timeout: 20000 });
  await page.waitForTimeout(6000);
  const cuerpo = await page.textContent("body");
  const conTodos = cuerpo.match(/(\d[\d.]*)\s*casos/);
  console.log("incluyendo sin denuncia · resumen:", conTodos?.[1]);
  console.log("marca 'Sin denuncia' visible:", cuerpo.includes("Sin denuncia"));
  await page.screenshot({ path: ".qa/sd-gestion.png" });

  const enBase = await c.query(
    `select count(*) as lotes, count(s.id) as con_denuncia
     from lotes l left join siniestros s on s.lote_id = l.id`
  );
  console.log("en la base:", enBase.rows[0]);

  // Cargar rinde en un lote SIN denuncia desde la tabla
  const filaSinDenuncia = page.locator("tbody tr").filter({ hasText: "Sin denuncia" }).first();
  await filaSinDenuncia.locator('input[inputmode="decimal"]').fill("31");
  await filaSinDenuncia.locator('input[inputmode="decimal"]').press("Enter");
  await page.waitForTimeout(4000);
  const guardo = await c.query(`select count(*) from lotes where rinde_estimado = 31`);
  console.log("rinde cargado en lote sin denuncia:", guardo.rows[0].count === "1" ? "OK" : "revisar");

  // --- 2. Rinde desde el popup del mapa ---
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(15000);
  await page.locator('input[placeholder*="Asegurado"]').fill("ARIEL FRARESSO");
  await page.waitForTimeout(5000);

  const punto = await page.evaluate(() => {
    const cv = document.querySelector(".leaflet-overlay-pane canvas");
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const { width, height } = cv;
    const img = ctx.getImageData(0, 0, width, height).data;
    const r = cv.getBoundingClientRect();
    const e = r.width / width;
    for (let y = 0; y < height; y += 3)
      for (let x = 0; x < width; x += 3)
        if (img[(y * width + x) * 4 + 3] > 100)
          return { x: r.left + x * e, y: r.top + y * e };
    return null;
  });
  if (punto) {
    await page.mouse.click(punto.x, punto.y);
    await page.waitForTimeout(1500);
  }

  const hayPopup = await page.locator(".leaflet-popup-content").count();
  console.log("popup abierto:", hayPopup > 0);
  if (hayPopup) {
    const campo = page.locator("[data-rinde-input]");
    console.log("campo de rinde en el popup:", (await campo.count()) > 0);
    await campo.fill("27");
    await page.locator("[data-rinde-guardar]").click();
    await page.waitForTimeout(3500);
    const aviso = await page.locator("[data-rinde-estado]").textContent();
    console.log("respuesta del popup:", aviso);
    const bb = await page.locator(".leaflet-popup").boundingBox();
    await page.screenshot({
      path: ".qa/sd-popup.png",
      clip: { x: Math.max(0, bb.x - 8), y: Math.max(0, bb.y - 8), width: bb.width + 16, height: bb.height + 16 },
    });
    const guardado = await c.query(`select count(*) from lotes where rinde_estimado = 27`);
    console.log("guardado en la base:", guardado.rows[0].count === "1" ? "OK" : "revisar");
  }

  // --- 3. Filtro por fecha de siniestro ---
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(15000);
  const antes = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, " ");
    const i = t.indexOf("c/siniestro");
    return t.slice(Math.max(0, i - 60), i + 12);
  });
  console.log("sin filtro de fecha:", antes);

  await page.getByRole("button", { name: /Fecha stro\.:/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: ".qa/sd-calendario.png" });
  await page.locator('input[type="date"]').first().fill("2026-01-01");
  await page.locator('input[type="date"]').nth(1).fill("2026-03-31");
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");
  await page.mouse.click(760, 640);
  await page.waitForTimeout(2500);
  const despues = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, " ");
    const i = t.indexOf("c/siniestro");
    return t.slice(Math.max(0, i - 60), i + 12);
  });
  console.log("con fecha 01/01/2026–31/03/2026:", despues);

  const esperado = await c.query(
    `select count(*) from siniestros where fecha between '2026-01-01' and '2026-03-31'`
  );
  console.log("siniestros en ese rango según la base:", esperado.rows[0].count);
  await page.screenshot({ path: ".qa/sd-filtro-fecha.png" });

  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");

  await c.query(`update lotes set rinde_estimado = null, rinde_estimado_en = null`);
  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end();
  await browser.close();
})();
