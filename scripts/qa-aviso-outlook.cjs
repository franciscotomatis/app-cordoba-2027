// Asigna lotes a un perito y verifica que aparezca el aviso con el mensaje
// listo para Outlook, con destinatario, asunto y cuerpo bien armados.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

process.loadEnvFile?.(".env.local");

const BASE = process.argv[2] || "http://localhost:3100";
const ADMIN = "qa.outlook.admin@gmail.com";
const PERITO = "qa.outlook.perito@gmail.com";
const CLAVE = "QaOutlook!2026";

const crearUsuario = (c, email, rol) =>
  c
    .query(`delete from auth.users where email = $1`, [email])
    .then(() =>
      c.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
           email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), now(), now(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '')`,
        [email, CLAVE]
      )
    )
    .then(() =>
      c.query(
        `update public.profiles set role=$2, nombre_completo=$3 where email=$1`,
        [email, rol, rol === "perito" ? "Perito De Prueba" : "Admin De Prueba"]
      )
    );

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const c = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query(`create extension if not exists pgcrypto with schema extensions`);
  await crearUsuario(c, ADMIN, "admin");
  await crearUsuario(c, PERITO, "perito");

  // Se guarda el estado previo de los lotes que se van a tocar.
  const previos = await c.query(
    `select lote_id, perito_id, estado, siniestro_id
       from gestion_lotes where siniestro_id is not null order by fecha desc limit 3`
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on("pageerror", (e) => console.log("ERROR DE PAGINA:", e.message));
  let salida = 1;

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', ADMIN);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

    await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);

    // Se tildan las tres primeras filas y se asigna al perito de prueba.
    for (let i = 0; i < 3; i++) {
      await page.locator("tbody tr").nth(i).locator('input[type="checkbox"]').check();
    }
    await page.waitForTimeout(400);

    await page.locator("select").filter({ hasText: "Asignar a perito" }).first()
      .selectOption({ label: "Perito De Prueba" });
    await page.getByRole("button", { name: /^Asignar$/ }).click();
    await page.waitForTimeout(6000);

    const enlace = await page.getByRole("link", { name: /Abrir en Outlook/ }).getAttribute("href");
    if (!enlace) throw new Error("No apareció el botón de Outlook");

    const url = new URL(enlace);
    const para = decodeURIComponent(url.pathname);
    const asunto = url.searchParams.get("subject") ?? "";
    const cuerpo = url.searchParams.get("body") ?? "";

    console.log("destinatario:", para);
    console.log("asunto:", asunto);
    console.log("largo del enlace:", enlace.length, "caracteres");
    console.log("--- cuerpo ---");
    console.log(cuerpo);
    console.log("--------------");

    await page.screenshot({ path: ".qa/aviso-outlook.png" });

    const ok =
      para === PERITO &&
      /3 lotes asignados para inspección/.test(asunto) &&
      /Tenés 3 lotes para inspeccionar/.test(cuerpo) &&
      cuerpo.split("\n").filter((l) => l.startsWith("#")).length === 3 &&
      enlace.length < 2000;

    console.log(ok ? "\nOK: el mensaje se arma completo y entra en un mailto." : "\nFALLA");
    salida = ok ? 0 : 1;
  } catch (e) {
    console.error("error:", e.message);
    await page.screenshot({ path: ".qa/aviso-outlook-error.png" }).catch(() => {});
  } finally {
    await browser.close();
    // Se devuelve todo como estaba.
    for (const p of previos.rows) {
      await c.query(`update lotes set perito_id=null, asignado_en=null, asignado_por=null where id=$1`, [p.lote_id]);
      await c.query(`update siniestros set perito_id=$2, estado=$3, asignado_en=null where id=$1`, [
        p.siniestro_id,
        p.perito_id,
        p.estado,
      ]);
    }
    await c.query(`delete from auth.users where email in ($1,$2)`, [ADMIN, PERITO]);
    console.log("estado de los lotes revertido, usuarios de prueba borrados");
    await c.end();
    process.exit(salida);
  }
})();
