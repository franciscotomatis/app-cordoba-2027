// Verifica que al incluir lotes sin denuncia solo aparezcan los del mismo
// CUIT + cultivo con casos, y no el resto del programa ni otros cultivos.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = "unidad.qa@gmail.com";
const CLAVE = "UnidadQa!2026";

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

  // Números esperados
  const esperado = await c.query(`
    with unidades as (
      select distinct l.cliente_id, coalesce(nullif(trim(l.cultivo),''),'') as cultivo
      from siniestros s join lotes l on l.id = s.lote_id
    )
    select
      (select count(*) from siniestros) as denunciados,
      (select count(*) from lotes l join unidades u
         on u.cliente_id = l.cliente_id
        and u.cultivo = coalesce(nullif(trim(l.cultivo),''),'')) as de_unidades_con_caso,
      (select count(*) from lotes) as todos_los_lotes`);
  console.log("esperado:", esperado.rows[0]);

  // Un cliente con dos cultivos, denuncias en uno solo (el caso del ejemplo)
  const ejemplo = await c.query(`
    with porUnidad as (
      select l.cliente_id, cl.nombre, coalesce(nullif(trim(l.cultivo),''),'') as cultivo,
             count(*) as lotes, count(s.id) as denunciados
      from lotes l
      join clientes cl on cl.id = l.cliente_id
      left join siniestros s on s.lote_id = l.id
      group by 1,2,3
    )
    select nombre,
      sum(lotes) filter (where denunciados > 0) as lotes_del_cultivo_con_caso,
      sum(denunciados) as denunciados,
      sum(lotes) filter (where denunciados = 0) as lotes_de_otros_cultivos
    from porUnidad
    group by nombre
    having count(*) filter (where denunciados > 0) = 1
       and count(*) filter (where denunciados = 0) >= 1
    order by 4 desc limit 1`);
  const caso = ejemplo.rows[0];
  console.log("cliente de ejemplo:", caso);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', CLAVE);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  const leerResumen = async () => {
    const t = await page.textContent("body");
    const m = t.match(/([\d.]+)\s*casos/);
    return m ? m[1] : "?";
  };

  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  console.log("solo denunciados:", await leerResumen());

  await page.goto(`${BASE}/siniestros?todos=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const conTodos = await leerResumen();
  console.log("incluyendo sin denuncia:", conTodos);
  await page.screenshot({ path: ".qa/u-gestion.png" });

  // Prueba puntual: filtrar por el cliente del ejemplo
  await page.locator('input[placeholder*="Asegurado"]').fill(caso.nombre);
  await page.waitForTimeout(3000);
  const filasCliente = await page.locator("tbody tr").count();
  console.log(
    `filas de "${caso.nombre}":`,
    filasCliente,
    `· esperado ${caso.lotes_del_cultivo_con_caso} (sus ${caso.lotes_de_otros_cultivos} lotes de otro cultivo NO deben aparecer)`
  );
  const cultivos = await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll("tbody tr").forEach((f) => {
      const t = f.innerText;
      if (t.includes("Soja")) set.add("Soja");
      if (t.includes("Maíz")) set.add("Maíz");
    });
    return [...set];
  });
  console.log("cultivos presentes en esas filas:", cultivos);
  await page.screenshot({ path: ".qa/u-cliente.png" });

  const ok =
    conTodos.replace(/\./g, "") === String(esperado.rows[0].de_unidades_con_caso) &&
    String(filasCliente) === String(caso.lotes_del_cultivo_con_caso) &&
    cultivos.length === 1;
  console.log(ok ? "OK   el alcance respeta CUIT + cultivo" : "FALLA revisar el alcance");

  await c.query(`delete from public.profiles where email=$1`, [EMAIL]);
  await c.query(`delete from auth.users where email=$1`, [EMAIL]);
  await c.end();
  await browser.close();
})();
