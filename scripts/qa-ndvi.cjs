const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = process.env.QA_EMAIL || "ndvi.qa@gmail.com";
const CLAVE = process.env.QA_PASS || "NdviQa!2026";
(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({ connectionString: process.env.MIGRATION_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token) values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,extensions.crypt($2,extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,'','','','','','','','')`, [EMAIL, CLAVE]);
  await c.query(`update public.profiles set role='admin' where email=$1`, [EMAIL]);

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1450, height: 950 } });
  const errores = [];
  p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', CLAVE);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
  await p.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await p.waitForTimeout(16000);
  await p.locator('input[placeholder*="Asegurado"]').fill("ARIEL FRARESSO");
  await p.waitForTimeout(5000);
  const punto = await p.evaluate(() => {
    const cv = document.querySelector(".leaflet-overlay-pane canvas");
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const { width, height } = cv;
    const img = ctx.getImageData(0, 0, width, height).data;
    const r = cv.getBoundingClientRect(); const e = r.width / width;
    const op = (x,y) => img[(y*width+x)*4+3] > 100;
    for (let y=8;y<height-8;y+=2) for (let x=8;x<width-8;x+=2)
      if (op(x,y)&&op(x-6,y)&&op(x+6,y)&&op(x,y-6)&&op(x,y+6)) return { x: r.left+x*e, y: r.top+y*e };
    return null;
  });
  if (punto) { await p.mouse.click(punto.x, punto.y); await p.waitForTimeout(1500); }
  await p.locator("[data-ampliar-lote]").click();
  await p.waitForTimeout(35000);

  const cuerpo = await p.textContent("body");
  console.log("sección NDVI presente:", cuerpo.includes("EVOLUCIÓN DEL NDVI") || cuerpo.includes("Evolución del NDVI"));
  const i = cuerpo.indexOf("NDVI");
  console.log("texto:", cuerpo.slice(Math.max(0,i-30), i+180).replace(/\n+/g, " "));
  console.log("gráficos:", await p.locator(".recharts-responsive-container").count());
  console.log("mapas del panel:", await p.locator(".leaflet-container").count());
  await p.screenshot({ path: ".qa/ndvi-panel.png", fullPage: false });

  const enBase = await c.query(`select count(*) as filas from ndvi_lote`);
  const consultas = await c.query(`select fechas, error from ndvi_consulta limit 3`);
  console.log("filas de NDVI:", enBase.rows[0].filas, "· consultas:", consultas.rows);
  console.log(errores.length ? "ERRORES:\n" + errores.slice(0,4).join("\n") : "Sin errores de página.");
  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end(); await b.close();
})();
