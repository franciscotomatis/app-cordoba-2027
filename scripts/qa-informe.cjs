// Genera el informe PDF de un lote y guarda el archivo para revisarlo a ojo.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

process.loadEnvFile?.(".env.local");

const BASE = process.argv[2] || "http://localhost:3100";
const LOTE = process.argv[3] || "1699";
const EMAIL = "qa.informe@gmail.com";
const CLAVE = "QaInforme!2026";

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
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on("pageerror", (e) => console.log("ERROR DE PAGINA:", e.message));
  let salida = 1;

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

    await page.goto(`${BASE}/siniestros?alcance=todos`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);

    // Se busca el lote por su número para tildar esa fila.
    await page.fill('input[placeholder*="Asegurado"]', LOTE);
    await page.waitForTimeout(2500);

    const filas = await page.locator("tbody tr").count();
    console.log("filas visibles tras buscar", LOTE + ":", filas);
    if (filas === 0) throw new Error("No apareció ninguna fila con ese lote");

    await page.locator("tbody tr").first().locator('input[type="checkbox"]').check();
    await page.waitForTimeout(500);

    const descarga = page.waitForEvent("download", { timeout: 240000 });
    await page.getByRole("button", { name: /^Informe$/ }).click();

    // Se va mostrando en qué anda mientras arma el PDF.
    for (let i = 0; i < 24; i++) {
      const txt = await page.evaluate(() => document.body.innerText);
      const m = txt.match(/Lote \d+ de \d+[^\n]*/);
      if (m) console.log("  ", m[0]);
      const listo = await Promise.race([
        descarga.then(() => true),
        page.waitForTimeout(5000).then(() => false),
      ]);
      if (listo) break;
    }

    const archivo = await descarga;
    const destino = ".qa/informe.pdf";
    await archivo.saveAs(destino);
    const tam = fs.statSync(destino).size;
    console.log("PDF guardado:", destino, Math.round(tam / 1024), "KB");

    if (tam > 20000) {
      console.log("OK: el informe se generó.");
      salida = 0;
    } else {
      console.log("FALLA: el PDF salió sospechosamente chico.");
    }
  } catch (e) {
    console.error("Error en la prueba:", e.message);
    await page.screenshot({ path: ".qa/informe-error.png" }).catch(() => {});
  } finally {
    await browser.close();
    await c.query(`delete from auth.users where email = $1`, [EMAIL]);
    console.log("usuario de prueba borrado");
    await c.end();
    process.exit(salida);
  }
})();
