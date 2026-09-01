// QA puntual del mapa: zoom al filtrar por cliente, ficha del lote y modo oscuro.
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = process.env.QA_EMAIL || "qa.temporal@gmail.com";
const PASS = process.env.QA_PASS || "QaTemporal!2026";
const DIR = ".qa";

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errores = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  // Modo oscuro explícito
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("tema", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${DIR}/m-oscuro.png` });
  console.log("captura: modo oscuro");

  // Filtro por un cliente concreto -> debe hacer zoom a sus lotes
  const input = page.locator('input[list="lista-clientes"]');
  await input.fill("Gioara");
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${DIR}/m-zoom-cliente.png` });
  console.log("captura: zoom por cliente");

  // Abrir la ficha de un lote (clic en el centro del mapa)
  const box = await page.locator(".leaflet-container").boundingBox();
  for (const [dx, dy] of [[0, 0], [40, 30], [-40, -30], [80, -60], [-80, 60]]) {
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await page.waitForTimeout(900);
    if (await page.locator(".leaflet-popup").count()) break;
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/m-ficha.png` });
  const popup = await page.locator(".leaflet-popup-content").count();
  console.log("ficha visible:", popup > 0);

  if (popup > 0) {
    const caja = await page.locator(".leaflet-popup").boundingBox();
    await page.screenshot({
      path: `${DIR}/m-ficha-zoom.png`,
      clip: {
        x: Math.max(0, caja.x - 10),
        y: Math.max(0, caja.y - 10),
        width: Math.min(caja.width + 20, 1440),
        height: Math.min(caja.height + 20, 900),
      },
    });
  }

  console.log(errores.length ? "ERRORES: " + errores.slice(0, 8).join(" | ") : "Sin errores de consola.");
  await browser.close();
})();
