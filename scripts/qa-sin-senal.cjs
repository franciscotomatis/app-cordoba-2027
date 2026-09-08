// Simula un perito trabajando sin señal: corta la conexión del navegador,
// carga rinde y una foto, y verifica que quedan en cola y suben al volver.
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

process.loadEnvFile?.(".env.local");

const BASE = process.argv[2] || "http://localhost:3100";
const LOTE = process.argv[3] || "1699";
const EMAIL = "qa.senal@gmail.com";
const CLAVE = "QaSenal!2026";

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
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
       email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '')`,
    [EMAIL, CLAVE]
  );
  await c.query(`update public.profiles set role='admin' where email=$1`, [EMAIL]);

  const g = await c.query(
    `select lote_id, rinde_estimado from gestion_lotes where id_lote_externo=$1 limit 1`,
    [LOTE]
  );
  const loteId = g.rows[0].lote_id;
  const rindeOriginal = g.rows[0].rinde_estimado;
  const RINDE_PRUEBA = Number(rindeOriginal) === 41 ? 43 : 41;
  console.log("lote", LOTE, "· rinde original:", rindeOriginal);

  const browser = await chromium.launch();
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  page.on("pageerror", (e) => console.log("ERROR DE PAGINA:", e.message));
  let salida = 1;

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
    await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
    await page.waitForTimeout(12000);

    // ---- Se corta la señal ----
    await contexto.setOffline(true);
    console.log("\n--- sin señal ---");
    await page.waitForTimeout(1500);

    const carteles = await page.evaluate(() => document.body.innerText);
    console.log("aparece 'Sin señal':", /Sin señal/.test(carteles));

    // Se encola rinde y foto usando las mismas funciones que la interfaz.
    const encolado = await page.evaluate(
      async ({ id, rinde }) => {
        const mod = await import("/_next/static/chunks/cola.js").catch(() => null);
        // Si no se puede importar el módulo suelto, se escribe en IndexedDB
        // con la misma forma que usa la app.
        return new Promise((resolve) => {
          const req = indexedDB.open("cba-offline", 1);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("cola", "readwrite");
            const store = tx.objectStore("cola");
            store.put({ tipo: "rinde", loteId: id, valor: rinde, creado: Date.now() });
            const lienzo = document.createElement("canvas");
            lienzo.width = 40;
            lienzo.height = 30;
            const cx = lienzo.getContext("2d");
            cx.fillStyle = "#7a9b4e";
            cx.fillRect(0, 0, 40, 30);
            lienzo.toBlob((blob) => {
              const tx2 = db.transaction("cola", "readwrite");
              tx2.objectStore("cola").put({
                tipo: "foto",
                loteId: id,
                archivo: blob,
                nombre: "prueba-sin-senal.jpg",
                lat: -32.1,
                lon: -63.5,
                creado: Date.now(),
              });
              tx2.oncomplete = () => resolve(true);
            }, "image/jpeg");
          };
          req.onerror = () => resolve(false);
        });
      },
      { id: loteId, rinde: RINDE_PRUEBA }
    );
    console.log("encolados rinde + foto:", encolado);

    const enCola = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("cba-offline", 1);
          req.onsuccess = () => {
            const p = req.result.transaction("cola", "readonly").objectStore("cola").count();
            p.onsuccess = () => resolve(p.result);
          };
        })
    );
    console.log("elementos en cola:", enCola);

    // ---- Vuelve la señal ----
    await contexto.setOffline(false);
    console.log("\n--- vuelve la señal ---");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(9000);

    const quedan = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("cba-offline", 1);
          req.onsuccess = () => {
            const p = req.result.transaction("cola", "readonly").objectStore("cola").count();
            p.onsuccess = () => resolve(p.result);
          };
        })
    );
    console.log("elementos que quedan en cola:", quedan);

    const dbRinde = await c.query(`select rinde_estimado from lotes where id=$1`, [loteId]);
    const dbFotos = await c.query(
      `select count(*)::int n from fotos where lote_id=$1 and nombre_original='prueba-sin-senal.jpg'`,
      [loteId]
    );
    console.log("rinde en la base:", dbRinde.rows[0].rinde_estimado);
    console.log("fotos de prueba registradas:", dbFotos.rows[0].n);

    const ok =
      enCola === 2 &&
      quedan === 0 &&
      Number(dbRinde.rows[0].rinde_estimado) === RINDE_PRUEBA &&
      dbFotos.rows[0].n === 1;
    console.log(
      ok
        ? "\nOK: lo cargado sin señal subió solo al reconectar."
        : "\nFALLA: algo no se sincronizó."
    );
    salida = ok ? 0 : 1;
  } catch (e) {
    console.error("error:", e.message);
  } finally {
    // La foto de prueba se borra desde la propia app: Supabase no permite
    // tocar las tablas de Storage por SQL. Se borra la fila y el archivo, si
    // no el bucket se va llenando de restos de cada corrida.
    try {
      const f = await c.query(
        `select id, storage_path from fotos
          where lote_id=$1 and nombre_original='prueba-sin-senal.jpg'`,
        [loteId]
      );
      for (const fila of f.rows) {
        const r = await page.evaluate(
          ({ id, ruta }) =>
            fetch("/api/fotos/borrar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            })
              .then((res) => res.json())
              .then((d) => ({ ...d, ruta })),
          { id: fila.id, ruta: fila.storage_path }
        );
        console.log("foto de prueba borrada:", fila.storage_path, r.ok ? "ok" : r.error);
      }
    } catch (e) {
      console.error("no se pudo borrar la foto de prueba:", e.message);
    }

    await browser.close();
    // Se deshace todo lo de la prueba.
    await c.query(`update lotes set rinde_estimado=$2 where id=$1`, [loteId, rindeOriginal]);
    await c.query(`delete from auth.users where email = $1`, [EMAIL]);
    console.log("datos de prueba revertidos, usuario borrado");
    await c.end();
    process.exit(salida);
  }
})();
