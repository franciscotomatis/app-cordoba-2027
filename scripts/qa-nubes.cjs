// Mide, mes a mes, cuánto del lote tapan las nubes en la imagen NDVI que
// entraría al informe. Sirve para confirmar que la elección de fecha funciona.
const { chromium } = require("playwright");
const { Client } = require("pg");

process.loadEnvFile?.(".env.local");

const BASE = process.argv[2] || "http://localhost:3100";
const LOTE_EXTERNO = process.argv[3] || "1699";
const EMAIL = "qa.nubes@gmail.com";
const CLAVE = "QaNubes!2026";

(async () => {
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
    `select lote_id from gestion_lotes where id_lote_externo=$1 limit 1`,
    [LOTE_EXTERNO]
  );
  const loteId = g.rows[0].lote_id;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => console.log("[navegador]", m.text().slice(0, 250)));

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', CLAVE);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
    await page.goto(`${BASE}/mapa`, { waitUntil: "domcontentloaded" });

    const filas = await page.evaluate(async (id) => {
      const medir = (img) => {
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const cx = cv.getContext("2d", { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const { data } = cx.getImageData(0, 0, cv.width, cv.height);
        let lote = 0;
        let nube = 0;
        for (let i = 0; i < data.length; i += 16) {
          if (data[i + 3] < 40) continue;
          lote++;
          if (
            Math.abs(data[i] - 217) < 18 &&
            Math.abs(data[i + 1] - 217) < 18 &&
            Math.abs(data[i + 2] - 224) < 18
          )
            nube++;
        }
        return lote === 0 ? 1 : nube / lote;
      };

      const traer = async (fecha) => {
        const r = await fetch(`/api/lotes/${id}/ndvi/imagen?fecha=${fecha}`);
        if (!r.ok) {
          console.log("FALLO", fecha, r.status, (await r.text()).slice(0, 200));
          return null;
        }
        const url = URL.createObjectURL(await r.blob());
        const img = new Image();
        await new Promise((ok, mal) => {
          img.onload = ok;
          img.onerror = mal;
          img.src = url;
        });
        return medir(img);
      };

      const d = await (await fetch(`/api/lotes/${id}/ndvi`)).json();
      const porMes = new Map();
      for (const p of d.serie ?? []) {
        const mes = p.fecha.slice(0, 7);
        porMes.set(mes, [...(porMes.get(mes) ?? []), p.fecha]);
      }

      const salida = [];
      const meses = [...porMes.entries()].sort().slice(-6);
      for (const [mes, fechas] of meses) {
        const orden = fechas.sort(
          (a, b) =>
            Math.abs(Number(a.slice(8, 10)) - 15) - Math.abs(Number(b.slice(8, 10)) - 15)
        );
        const primera = await traer(orden[0]);
        let elegida = { fecha: orden[0], nubes: primera };
        for (const f of orden.slice(0, 3)) {
          const n = await traer(f);
          if (n !== null && (elegida.nubes === null || n < elegida.nubes))
            elegida = { fecha: f, nubes: n };
          if (n !== null && n <= 0.3) break;
        }
        salida.push({
          mes,
          candidatas: orden.length,
          primera: orden[0],
          nubesPrimera: primera === null ? null : Math.round(primera * 100),
          elegida: elegida.fecha,
          nubesElegida: elegida.nubes === null ? null : Math.round(elegida.nubes * 100),
        });
      }
      return salida;
    }, loteId);

    console.table(filas);
    const malas = filas.filter((f) => f.nubesElegida === null || f.nubesElegida > 30);
    console.log(
      malas.length === 0
        ? "OK: todos los meses quedaron con una imagen despejada."
        : `Quedan ${malas.length} mes(es) sin imagen despejada: ${malas.map((m) => m.mes).join(", ")}`
    );
  } catch (e) {
    console.error("error:", e.message);
  } finally {
    await browser.close();
    await c.query(`delete from auth.users where email = $1`, [EMAIL]);
    await c.end();
  }
})();
