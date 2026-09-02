// QA de: asignación que incluye lotes sin denuncia, y capas de límites.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const ADMIN = "asig.qa@gmail.com";
const PERITO = "peritoasig.qa@gmail.com";
const CLAVE = "AsigQa!2026";

async function crear(c, email, rol, nombre) {
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
  await c.query(`update public.profiles set role=$2, nombre_completo=$3 where email=$1`, [email, rol, nombre]);
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await crear(c, ADMIN, "admin", "Admin QA");
  await crear(c, PERITO, "perito", "Perito Asig");
  await c.query(`update lotes set perito_id=null, asignado_en=null`);
  await c.query(`update siniestros set perito_id=null, asignado_en=null, estado='DENUNCIADO'`);

  // Unidad con denunciados y no denunciados
  const { rows } = await c.query(`
    select cl.nombre as cliente, l.cultivo,
           count(*)::int as lotes, count(s.id)::int as denunciados
    from lotes l
    join clientes cl on cl.id = l.cliente_id
    left join siniestros s on s.lote_id = l.id
    group by cl.nombre, l.cultivo
    having count(s.id) between 1 and 3 and count(*) - count(s.id) >= 3
    order by count(*) limit 1`);
  const unidad = rows[0];
  console.log("unidad de prueba:", unidad);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', ADMIN);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  // Incluir lotes sin denuncia y filtrar por esa unidad
  await page.goto(`${BASE}/siniestros?todos=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  await page.locator('input[placeholder*="Asegurado"]').fill(unidad.cliente);
  await page.waitForTimeout(2500);

  const filas = await page.locator("tbody tr").count();
  const sinDenuncia = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("tbody tr")).filter((f) =>
        f.innerText.includes("Sin denuncia")
      ).length
  );
  console.log(`filas visibles: ${filas} · de las cuales sin denuncia: ${sinDenuncia}`);

  // Seleccionar todo y asignar
  await page.locator('thead input[type="checkbox"]').click();
  await page.waitForTimeout(500);
  const selects = page.locator("select");
  for (let i = 0; i < (await selects.count()); i++) {
    const ops = await selects.nth(i).locator("option").allTextContents();
    if (ops.some((o) => o.includes("Perito Asig"))) {
      await selects.nth(i).selectOption({ label: "Perito Asig" });
      break;
    }
  }
  await page.getByRole("button", { name: /^(Asignar|Quitar)$/ }).click();
  await page.waitForTimeout(7000);

  const aviso = await page.textContent("body");
  const m = aviso.match(/(\d+) lotes asignados \((\d+) con denuncia\)/);
  console.log("aviso:", m ? m[0] : "(no encontrado)");

  const enBase = await c.query(`
    select count(*) filter (where l.perito_id is not null) as lotes_asignados,
           count(*) filter (where l.perito_id is not null and s.id is null) as sin_denuncia_asignados,
           count(*) filter (where s.perito_id is not null) as casos_asignados
    from lotes l left join siniestros s on s.lote_id = l.id`);
  console.log("en la base:", enBase.rows[0]);
  await page.screenshot({ path: ".qa/as-gestion.png" });

  console.log(
    Number(enBase.rows[0].sin_denuncia_asignados) > 0
      ? "OK   se asignaron también los lotes sin denuncia"
      : "FALLA los lotes sin denuncia no quedaron asignados"
  );

  // El perito debe ver esos lotes
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p2.fill('input[type="email"]', PERITO);
  await p2.fill('input[type="password"]', CLAVE);
  await p2.click('button[type="submit"]');
  await p2.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
  await p2.goto(`${BASE}/siniestros?todos=1`, { waitUntil: "networkidle" });
  await p2.waitForTimeout(4000);
  console.log("filas que ve el perito:", await p2.locator("tbody tr").count());
  await ctx2.close();

  // Capas de límites
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(14000);
  await page.hover(".leaflet-control-layers");
  await page.waitForTimeout(800);
  const capas = await page.locator(".leaflet-control-layers").innerText();
  console.log("capas:", capas.replace(/\n+/g, " | "));

  const marcarCapa = async (nombre) => {
    const etiqueta = page.locator(".leaflet-control-layers label", { hasText: nombre });
    await etiqueta.locator('input[type="checkbox"]').check();
    await page.waitForTimeout(3000);
  };
  await marcarCapa("Departamentos");
  await marcarCapa("Límite de Córdoba");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: ".qa/as-limites.png" });
  console.log("capas de límites activadas");

  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");

  await c.query(`update lotes set perito_id=null, asignado_en=null, asignado_por=null`);
  await c.query(`update siniestros set perito_id=null, asignado_en=null, estado='DENUNCIADO'`);
  await c.query(`delete from public.profiles where email in ($1,$2)`, [ADMIN, PERITO]);
  await c.query(`delete from auth.users where email in ($1,$2)`, [ADMIN, PERITO]);
  await c.end();
  await browser.close();
})();
