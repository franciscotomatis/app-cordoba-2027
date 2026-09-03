const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "capa.qa@gmail.com", CLAVE = "CapaQa!2026";
(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({ connectionString: process.env.MIGRATION_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token) values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,extensions.crypt($2,extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,'','','','','','','','')`, [EMAIL, CLAVE]);
  await c.query(`update public.profiles set role='admin' where email=$1`, [EMAIL]);

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1450, height: 920 } });
  const errores = [];
  p.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', CLAVE);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
  await p.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await p.waitForTimeout(15000);

  console.log("filtro 'Color: lluvia' ya no está:", (await p.getByRole("button", { name: "Color: lluvia" }).count()) === 0);

  await p.hover(".leaflet-control-layers");
  await p.waitForTimeout(700);
  const capas = await p.locator(".leaflet-control-layers").innerText();
  console.log("capas:", capas.replace(/\n+/g, " | "));

  await p.locator(".leaflet-control-layers label", { hasText: "Lluvia acumulada" }).locator('input[type="checkbox"]').check();
  await p.waitForTimeout(2000);
  console.log("panel de lluvia visible:", (await p.getByRole("button", { name: /Período:/ }).count()) > 0);

  await p.getByRole("button", { name: /Período:/ }).click();
  await p.waitForTimeout(500);
  const f = p.locator('input[type="date"]');
  await f.first().fill("2026-06-01");
  await f.nth(1).fill("2026-08-27");
  await p.waitForTimeout(8000);
  await p.keyboard.press("Escape");
  await p.mouse.click(760, 640);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: ".qa/cc-capa-lluvia.png" });
  const leyenda = await p.evaluate(() => { const t = document.body.innerText.replace(/\n+/g," "); const i = t.indexOf("LLUVIA ACUMULADA"); return i>=0 ? t.slice(i, i+120) : "(no)"; });
  console.log("leyenda:", leyenda);

  // Popup sin milímetros + ficha con temperatura
  await p.hover(".leaflet-control-layers");
  await p.waitForTimeout(700);
  await p.locator(".leaflet-control-layers label", { hasText: "Lluvia acumulada" }).locator('input[type="checkbox"]').uncheck();
  await p.waitForTimeout(1500);
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
  const popup = await p.locator(".leaflet-popup-content").innerText().catch(() => "");
  console.log("popup menciona mm:", /\d+\s*mm/.test(popup));

  await p.locator("[data-ampliar-lote]").click();
  await p.waitForTimeout(20000);
  const cuerpo = await p.textContent("body");
  console.log("ficha con temperatura:", cuerpo.includes("Temperatura media mensual"));
  console.log("gráficos dibujados:", await p.locator(".recharts-responsive-container").count());
  await p.screenshot({ path: ".qa/cc-ficha.png" });

  console.log(errores.length ? "ERRORES:\n" + errores.slice(0,5).join("\n") : "Sin errores de página.");
  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end(); await b.close();
})();
