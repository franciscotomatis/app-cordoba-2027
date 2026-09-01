import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const EMAIL = "test-visual@ejemplo.local";
const PASSWORD = "PruebaVisual123!";
const OUT = process.env.OUT_DIR ?? "capturas";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errores = [];
page.on("console", (m) => {
  if (m.type() === "error") errores.push(m.text());
});
page.on("pageerror", (e) => errores.push(String(e)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/00-login.png` });

await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 20000 });
await page.waitForLoadState("networkidle");

const rutas = [
  ["01-resumen", "/"],
  ["02-mapa", "/mapa"],
  ["03-lotes", "/lotes"],
  ["04-clientes", "/clientes"],
  ["05-fotos", "/fotos"],
  ["06-peritos", "/peritos"],
  ["07-admin", "/admin"],
];

for (const [nombre, ruta] of rutas) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(ruta === "/mapa" ? 6000 : 1200);
  await page.screenshot({ path: `${OUT}/${nombre}.png` });
  console.log(`captura: ${nombre} (${ruta})`);
}

await browser.close();

if (errores.length) {
  console.log("\nERRORES DE CONSOLA:");
  for (const e of [...new Set(errores)]) console.log(" -", e);
} else {
  console.log("\nSin errores de consola.");
}
