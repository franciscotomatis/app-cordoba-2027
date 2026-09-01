import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const EMAIL = "test-visual@ejemplo.local";
const PASSWORD = "PruebaVisual123!";

mkdirSync("capturas", { recursive: true });

// PNG mínimo válido (1x1 rojo) para probar la subida.
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const rutaTmp = "capturas/foto-prueba.png";
writeFileSync(rutaTmp, Buffer.from(pngBase64, "base64"));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["geolocation"],
  geolocation: { latitude: -31.42, longitude: -64.18 },
});
const page = await context.newPage();

const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 20000 });

await page.goto(`${BASE}/fotos`, { waitUntil: "networkidle" });
await page.setInputFiles("#foto-input", rutaTmp);

// Esperar el mensaje de resultado de la subida.
await page.waitForTimeout(8000);
await page.screenshot({ path: "capturas/08-fotos-subida.png" });

const texto = await page.locator("body").innerText();
const exito = /Foto subida/.test(texto);
const falla = /No se pudo subir|no se registró/.test(texto);

console.log(exito ? "SUBIDA OK" : falla ? "SUBIDA FALLÓ" : "SIN MENSAJE CLARO");
const linea = texto.split("\n").find((l) => /Foto subida|No se pudo|no se registró/.test(l));
if (linea) console.log("mensaje:", linea.trim());
if (errores.length) console.log("errores:", [...new Set(errores)]);

await browser.close();
