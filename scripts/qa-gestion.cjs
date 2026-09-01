// QA de la gestión de siniestros y del rendimiento de los filtros del mapa.
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = process.env.QA_EMAIL || "qa.temporal@gmail.com";
const PASS = process.env.QA_PASS || "QaTemporal!2026";
const DIR = ".qa";

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
  const errores = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  // --- Gestión de siniestros ---
  const t0 = Date.now();
  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log("carga gestión (ms):", Date.now() - t0);
  await page.screenshot({ path: `${DIR}/g-siniestros.png` });

  const filas = await page.locator("tbody tr").count();
  console.log("filas en la tabla:", filas);

  // Selección múltiple + cambio de estado en tanda
  await page.locator('thead input[type="checkbox"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/g-seleccion.png` });

  // --- Rendimiento del mapa ---
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(14000);

  // Tiempo de tipeo: mide el retardo entre teclas
  const inicioTipeo = Date.now();
  const buscador = page.locator('input[placeholder*="Asegurado"]');
  await buscador.click();
  await buscador.type("Gioara", { delay: 40 });
  const msTipeo = Date.now() - inicioTipeo;
  console.log("tipear 6 letras (ms):", msTipeo);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${DIR}/g-mapa-busqueda.png` });

  // Tiempo de aplicar un filtro de cultivo
  await buscador.fill("");
  await page.waitForTimeout(2500);
  const t2 = Date.now();
  await page.getByRole("button", { name: /Cultivo:/ }).click();
  await page.locator("button", { hasText: /^Soja/ }).first().click();
  await page.waitForTimeout(100);
  console.log("aplicar filtro cultivo (ms):", Date.now() - t2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);

  // Selección por clic en el mapa
  await page.getByRole("button", { name: /Seleccionar con clic/ }).click();
  const caja = await page.locator(".leaflet-container").boundingBox();
  for (const [dx, dy] of [[0, 0], [30, 20], [-30, -20], [60, 40]]) {
    await page.mouse.click(caja.x + caja.width / 2 + dx, caja.y + caja.height / 2 + dy);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/g-mapa-seleccion.png` });
  const textoSel = await page.locator("text=seleccionados").first().textContent();
  console.log("estado de selección:", textoSel?.trim());

  console.log(errores.length ? "ERRORES:\n" + errores.slice(0, 10).join("\n") : "Sin errores de consola.");
  await browser.close();
})();
