// Verifica que la selección a mano alzada funcione con el dedo en un celular.
// Usa toques reales (CDP Input.dispatchTouchEvent), no eventos inventados.
const { chromium, devices } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

process.loadEnvFile?.(".env.local");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "qa.lazo@gmail.com";
const CLAVE = "QaLazo!2026";

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
  const contexto = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await contexto.newPage();
  let salida = 1;

  page.on("pageerror", (e) => console.log("ERROR DE PAGINA:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLA:", m.text().slice(0, 300));
  });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

    await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
    await page.waitForTimeout(18000);

    const leerSeleccionados = () =>
      page.evaluate(() => {
        const m = document.body.innerText.match(/(\d+)\s+seleccionados/);
        return m ? Number(m[1]) : null;
      });

    await page.screenshot({ path: ".qa/lazo-antes.png", fullPage: true });
    console.log("seleccionados antes:", await leerSeleccionados());
    const txt = await page.evaluate(() => document.body.innerText);
    console.log("texto visible:", txt.slice(0, 400).replace(new RegExp("\n", "g"), " | "));

    await page.getByRole("button", { name: /mano alzada/i }).tap();
    await page.waitForTimeout(500);

    const caja = await page.locator(".leaflet-container").boundingBox();
    if (!caja) throw new Error("No se encontró el mapa");
    console.log("mapa:", Math.round(caja.width), "x", Math.round(caja.height));

    // Un lazo amplio, en el centro del mapa.
    const cx = caja.x + caja.width / 2;
    const cy = caja.y + caja.height / 2;
    const r = Math.min(caja.width, caja.height) * 0.33;
    const puntos = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      puntos.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }

    const cdp = await contexto.newCDPSession(page);
    const toque = (tipo, p) =>
      cdp.send("Input.dispatchTouchEvent", {
        type: tipo,
        touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
      });

    await toque("touchStart", puntos[0]);
    for (const p of puntos.slice(1)) {
      await toque("touchMove", p);
      await page.waitForTimeout(25);
    }
    await toque("touchEnd", null);
    await page.waitForTimeout(2500);

    const despues = await leerSeleccionados();
    console.log("seleccionados después del lazo con el dedo:", despues);
    await page.screenshot({ path: ".qa/lazo-tactil.png" });

    if (despues && despues > 0) {
      console.log("OK: el lazo táctil seleccionó lotes.");
      salida = 0;
    } else {
      console.log("FALLA: el lazo con el dedo no seleccionó nada.");
    }
  } catch (e) {
    console.error("Error en la prueba:", e.message);
    await page.screenshot({ path: ".qa/lazo-tactil-error.png" }).catch(() => {});
  } finally {
    await browser.close();
    await c.query(`delete from auth.users where email = $1`, [EMAIL]);
    console.log("usuario de prueba borrado");
    await c.end();
    process.exit(salida);
  }
})();
