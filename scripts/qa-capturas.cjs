// Script de QA visual: entra con un usuario de prueba y saca capturas de cada sección.
// Uso: node scripts/qa-capturas.cjs [baseUrl]
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
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  const secciones = [
    ["resumen", "/"],
    ["mapa", "/mapa"],
    ["siniestros", "/siniestros"],
    ["clientes", "/clientes"],
    ["fotos", "/fotos"],
    ["peritos", "/peritos"],
    ["admin", "/admin"],
  ];

  for (const [nombre, ruta] of secciones) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    // El mapa necesita tiempo extra: baja ~5700 polígonos y los dibuja.
    await page.waitForTimeout(nombre === "mapa" ? 12000 : 2000);
    await page.screenshot({ path: `${DIR}/${nombre}.png` });
    console.log(`captura: ${nombre}`);
  }

  // Modo claro sobre el mapa, para verificar la paleta en ambos temas.
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("tema", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${DIR}/mapa-claro.png` });
  console.log("captura: mapa-claro");

  // Prueba de filtros: elige un cultivo y verifica que el resumen cambie.
  const antes = await page.textContent("body");
  await page.getByRole("button", { name: /Cultivo:/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/filtro-abierto.png` });
  const opcion = page.locator("button", { hasText: /^Soja/ }).first();
  if (await opcion.count()) {
    await opcion.click();
    await page.waitForTimeout(4000);
    await page.keyboard.press("Escape");
    await page.mouse.click(700, 600);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${DIR}/filtro-aplicado.png` });
    console.log("captura: filtro-aplicado");
  }
  void antes;

  if (errores.length) {
    console.log("\nERRORES DE CONSOLA:");
    for (const e of errores.slice(0, 15)) console.log(" - " + e.slice(0, 300));
  } else {
    console.log("\nSin errores de consola.");
  }

  await browser.close();
})();
