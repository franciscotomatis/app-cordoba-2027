// QA de: selección del mapa + lotes sin denuncia, desasignar perito,
// barra de filtros sin espacio muerto y punto de GPS.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "corr.qa@gmail.com";
const CLAVE = "CorrQa!2026";
const PERITO = "peritocorr.qa@gmail.com";

async function crearUsuario(c, email, rol) {
  await c.query(`delete from auth.users where email = $1`, [email]);
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
    [email, CLAVE]
  );
  await c.query(`update public.profiles set role=$2, nombre_completo=$3 where email=$1`, [
    email,
    rol,
    rol === "admin" ? "Admin QA" : "Perito QA",
  ]);
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await crearUsuario(c, EMAIL, "admin");
  await crearUsuario(c, PERITO, "perito");
  await c.query(`update siniestros set perito_id = null, asignado_en = null, estado = 'DENUNCIADO'`);

  // Un lote denunciado cuyo CUIT+cultivo tiene varios lotes sin denuncia
  const { rows: elegido } = await c.query(`
    with unidad as (
      select l.cliente_id, coalesce(nullif(trim(l.cultivo),''),'') as cultivo,
             count(*) as lotes, count(s.id) as denunciados
      from lotes l left join siniestros s on s.lote_id = l.id
      group by 1,2
      having count(s.id) between 1 and 2 and count(*) - count(s.id) >= 3
      order by count(*) desc limit 1
    )
    select l.id, l.id_lote_externo, cl.nombre as cliente, l.cultivo,
           u.lotes as lotes_de_la_unidad, u.denunciados
    from unidad u
    join lotes l on l.cliente_id = u.cliente_id
      and coalesce(nullif(trim(l.cultivo),''),'') = u.cultivo
    join clientes cl on cl.id = l.cliente_id
    join siniestros s on s.lote_id = l.id
    limit 1`);
  const caso = elegido[0];
  console.log("caso de prueba:", caso);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  // ---- 1. Selección desde el mapa -> gestión -> incluir sin denuncia ----
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: ".qa/c-barra-filtros.png", clip: { x: 200, y: 40, width: 1300, height: 190 } });

  await page.locator('input[placeholder*="Asegurado"]').fill(caso.cliente);
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /Seleccionar con clic/ }).click();

  const punto = await page.evaluate(() => {
    const cv = document.querySelector(".leaflet-overlay-pane canvas");
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
  if (punto) await page.mouse.click(punto.x, punto.y);
  await page.waitForTimeout(1200);

  const seleccionados = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll("span")).find((s) =>
      s.textContent?.trim().endsWith("seleccionados")
    );
    return parseInt(n?.querySelector("span")?.textContent ?? "0", 10) || 0;
  });
  console.log("lotes seleccionados en el mapa:", seleccionados);

  await page.getByRole("link", { name: /Gestionar selección/ }).click();
  await page.waitForURL((u) => u.pathname.includes("siniestros"), { timeout: 20000 });
  await page.waitForTimeout(4000);
  const filasSolo = await page.locator("tbody tr").count();
  console.log("filas con la selección (solo denunciados):", filasSolo);

  await page.getByRole("link", { name: /Incluir lotes sin denuncia/ }).click();
  await page.waitForTimeout(6000);
  const filasTodos = await page.locator("tbody tr").count();
  console.log(
    "filas al incluir sin denuncia:",
    filasTodos,
    `· esperado ${caso.lotes_de_la_unidad} (todos los del CUIT+cultivo)`
  );
  await page.screenshot({ path: ".qa/c-seleccion-unidad.png" });
  console.log(
    String(filasTodos) === String(caso.lotes_de_la_unidad)
      ? "OK   la selección del mapa trae la unidad completa"
      : "FALLA sigue sin traer los lotes sin denuncia"
  );

  // ---- 2. Asignar y desasignar perito ----
  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.locator("tbody tr").first().locator('input[type="checkbox"]').check();
  await page.waitForTimeout(400);
  const selects = page.locator("select");
  for (let i = 0; i < (await selects.count()); i++) {
    const ops = await selects.nth(i).locator("option").allTextContents();
    if (ops.some((o) => o.includes("Perito QA"))) {
      await selects.nth(i).selectOption({ label: "Perito QA" });
      break;
    }
  }
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await page.waitForTimeout(6000);
  const asignados = await c.query(`select count(*) from siniestros where perito_id is not null`);
  console.log("casos asignados:", asignados.rows[0].count);

  // Quitar la asignación con la cruz de la fila
  await page.waitForTimeout(1500);
  const cruz = page.locator('button[title="Quitar la asignación"]').first();
  console.log("botón de quitar asignación visible:", (await cruz.count()) > 0);
  if (await cruz.count()) {
    await cruz.click();
    await page.waitForTimeout(5000);
    const quedan = await c.query(`select count(*) from siniestros where perito_id is not null`);
    console.log("casos asignados después de quitar:", quedan.rows[0].count);
    await page.screenshot({ path: ".qa/c-desasignar.png" });
  }

  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");

  await c.query(`update siniestros set perito_id=null, asignado_en=null, estado='DENUNCIADO'`);
  await c.query(`delete from public.profiles where email in ($1,$2)`, [EMAIL, PERITO]);
  await c.query(`delete from auth.users where email in ($1,$2)`, [EMAIL, PERITO]);
  await c.end();
  await browser.close();
})();
