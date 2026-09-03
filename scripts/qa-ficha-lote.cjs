// QA de: etiquetas de departamento, leyenda compacta, ficha ampliada del lote
// con gráfico de precipitación, y carga de foto desde el popup.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "ficha.qa@gmail.com";
const CLAVE = "FichaQa!2026";

async function puntoDelPoligono(page) {
  return page.evaluate(() => {
    const cv = document.querySelector(".leaflet-overlay-pane canvas");
    if (!cv) return null;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const { width, height } = cv;
    const img = ctx.getImageData(0, 0, width, height).data;
    const r = cv.getBoundingClientRect();
    const e = r.width / width;
    const op = (x, y) => img[(y * width + x) * 4 + 3] > 100;
    for (let y = 8; y < height - 8; y += 2)
      for (let x = 8; x < width - 8; x += 2)
        if (op(x, y) && op(x - 6, y) && op(x + 6, y) && op(x, y - 6) && op(x, y + 6))
          return { x: r.left + x * e, y: r.top + y * e };
    return null;
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

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(15000);

  // 1. Etiquetas de departamento
  await page.hover(".leaflet-control-layers");
  await page.waitForTimeout(600);
  await page
    .locator(".leaflet-control-layers label", { hasText: "Departamentos" })
    .locator('input[type="checkbox"]')
    .check();
  await page.waitForTimeout(3000);
  const etiquetas = await page.locator(".etiqueta-departamento").count();
  console.log("etiquetas fijas de departamento:", etiquetas);
  await page.screenshot({ path: ".qa/fi-departamentos.png" });

  // 2. Leyenda compacta
  const leyenda = await page
    .locator("text=Hectáreas por cultivo")
    .locator("xpath=..")
    .boundingBox();
  console.log("ancho de la leyenda:", Math.round(leyenda?.width ?? 0), "px");

  // 3. Abrir un lote y su ficha ampliada
  await page.locator('input[placeholder*="Asegurado"]').fill("ARIEL FRARESSO");
  await page.waitForTimeout(5000);
  const punto = await puntoDelPoligono(page);
  if (punto) {
    await page.mouse.click(punto.x, punto.y);
    await page.waitForTimeout(1500);
  }
  const hayPopup = await page.locator(".leaflet-popup-content").count();
  console.log("popup abierto:", hayPopup > 0);
  console.log("botón de foto en el popup:", await page.locator("[data-foto-lote]").count());

  await page.locator("[data-ampliar-lote]").click();
  await page.waitForTimeout(9000);
  const enPanel = await page.textContent("body");
  console.log("ficha abierta:", enPanel.includes("Precipitación mensual"));
  console.log("gráfico dibujado:", (await page.locator(".recharts-line").count()) >= 2);

  const resumenClima = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, " ");
    const i = t.indexOf("Precipitación mensual");
    return i >= 0 ? t.slice(i, i + 150) : "(no encontrado)";
  });
  console.log("resumen de clima:", resumenClima);
  await page.screenshot({ path: ".qa/fi-panel.png" });

  // Pantalla completa
  await page.getByTitle("Pantalla completa").click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: ".qa/fi-panel-completo.png" });
  console.log("modo pantalla completa: ok");

  const enCache = await c.query(`select count(*) from clima_celda`);
  console.log("filas de clima en caché:", enCache.rows[0].count);

  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");

  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end();
  await browser.close();
})();
