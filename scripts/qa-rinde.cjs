// QA del rinde estimado: carga individual y en tanda, impacto en Clientes,
// en el popup del mapa y en las exportaciones. Incluye vista de celular.
const { chromium, devices } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "admin.rinde@gmail.com";
const CLAVE = "AdminRinde!2026";

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
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
  await c.query(`update lotes set rinde_estimado = null, rinde_estimado_en = null`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await entrar(page);

  // ---- 1. Gestión: columnas nuevas y carga individual ----
  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const encabezados = await page.locator("thead").innerText();
  console.log("columnas:", encabezados.replace(/\n+/g, " | "));

  const fila = page.locator("tbody tr").first();
  const datosFila = await fila.innerText();
  console.log("primera fila:", datosFila.replace(/\n+/g, " | ").slice(0, 130));

  await fila.locator('input[inputmode="decimal"]').fill("28");
  await fila.locator('input[inputmode="decimal"]').press("Enter");
  await page.waitForTimeout(3500);
  console.log(
    "carga individual:",
    (await page.textContent("body")).includes("cargado en 1 lote") ? "OK" : "revisar"
  );
  await page.screenshot({ path: ".qa/r-gestion.png" });

  // ---- 2. Carga en tanda ----
  await page.locator('thead input[type="checkbox"]').click();
  await page.waitForTimeout(500);
  const campoTanda = page
    .locator('input[placeholder="Rinde qq/ha"]')
    .first();
  await campoTanda.fill("18");
  await page.getByRole("button", { name: "Cargar rinde" }).click();
  await page.waitForTimeout(5000);
  const avisoTanda = await page.textContent("body");
  const m = avisoTanda.match(/Rinde estimado de 18 qq\/ha cargado en (\d+) lotes/);
  console.log("carga en tanda:", m ? `OK (${m[1]} lotes)` : "revisar");

  const enBase = await c.query(
    `select count(*) filter (where rinde_estimado is not null) as con_rinde,
            count(*) as total from lotes`
  );
  console.log("en la base:", enBase.rows[0]);

  // ---- 3. Clientes por cultivo ----
  await page.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const cabecerasCli = await page.locator("thead").innerText();
  console.log("columnas clientes:", cabecerasCli.replace(/\n+/g, " | "));
  const primeraCli = await page.locator("tbody tr").first().innerText();
  console.log("primera fila clientes:", primeraCli.replace(/\n+/g, " | "));
  await page.screenshot({ path: ".qa/r-clientes.png" });

  // Contraste del cálculo contra SQL
  const calc = await c.query(`
    select c.nombre, l.cultivo,
      round(sum(l.rendimiento_asegurado)) as qq_aseg,
      round(sum(l.hectareas_aseguradas * l.rinde_estimado)) as qq_estim,
      round(greatest(sum(l.rendimiento_asegurado) - sum(l.hectareas_aseguradas * l.rinde_estimado), 0)) as indemniz
    from lotes l join clientes c on c.id = l.cliente_id
    where l.rinde_estimado is not null
    group by c.id, c.nombre, l.cultivo
    having count(*) > 1
    order by indemniz desc limit 3`);
  console.log("cálculo esperado (SQL):", calc.rows);

  // ---- 4. Popup del mapa ----
  const loteConRinde = await c.query(
    `select id_lote_externo, rinde_estimado, rendimiento_asegurado, hectareas_aseguradas,
            round(rendimiento_asegurado / nullif(hectareas_aseguradas,0)) as qq_ha
     from lotes where rinde_estimado is not null limit 1`
  );
  const lote = loteConRinde.rows[0];
  console.log("lote de prueba:", lote);

  await page.goto(`${BASE}/mapa?lote=${lote.id_lote_externo}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(16000);
  const caja = await page.locator(".leaflet-container").boundingBox();
  for (const [dx, dy] of [[0, 0], [30, 20], [-30, -20], [60, 40], [-60, -40]]) {
    await page.mouse.click(caja.x + caja.width / 2 + dx, caja.y + caja.height / 2 + dy);
    await page.waitForTimeout(900);
    if (await page.locator(".leaflet-popup-content").count()) break;
  }
  const popup = await page.locator(".leaflet-popup-content").innerText().catch(() => "");
  console.log("popup:", popup.replace(/\n+/g, " | "));
  if (popup) {
    const b = await page.locator(".leaflet-popup").boundingBox();
    await page.screenshot({
      path: ".qa/r-popup.png",
      clip: { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 },
    });
  }

  // ---- 5. Exportación ----
  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const [csv] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }).catch(() => null),
    page.getByRole("button", { name: "CSV", exact: true }).click(),
  ]);
  if (csv) {
    const ruta = ".qa/export.csv";
    await csv.saveAs(ruta);
    const contenido = fs.readFileSync(ruta, "utf-8").split("\n").slice(0, 2);
    console.log("encabezado del CSV:", contenido[0].slice(0, 260));
  }

  await browser.close();

  // ---- 6. Vista de celular ----
  const movil = await chromium.launch();
  const ctx = await movil.newContext(devices["iPhone 13"]);
  const cel = await ctx.newPage();
  await entrar(cel);
  for (const [nombre, ruta] of [["mapa", "/mapa"], ["siniestros", "/siniestros"], ["clientes", "/clientes"]]) {
    await cel.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    await cel.waitForTimeout(ruta === "/mapa" ? 14000 : 3000);
    await cel.screenshot({ path: `.qa/cel-${nombre}.png` });
  }
  // El menú se abre con el botón de hamburguesa
  await cel.getByRole("button", { name: /Abrir menú/ }).click();
  await cel.waitForTimeout(700);
  await cel.screenshot({ path: ".qa/cel-menu.png" });
  console.log("menú de celular:", (await cel.locator("nav").count()) > 0 ? "OK" : "revisar");
  await movil.close();

  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");

  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end();
})();
