// Verifica el filtro por estado del caso y que los desplegables no queden tapados.
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = process.env.QA_EMAIL || "qa.temporal@gmail.com";
const PASS = process.env.QA_PASS || "QaTemporal!2026";

async function resumen(page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("lotes");
    return t.slice(Math.max(0, i - 12), i + 60).replace(/\n+/g, " ");
  });
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(14000);

  // 1) Desplegable visible por encima de la barra de selección
  await page.getByRole("button", { name: /Estado:/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: ".qa/z-desplegable.png" });

  const tapado = await page.evaluate(() => {
    const opcion = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Pendiente de inspección")
    );
    if (!opcion) return "no se encontró la opción";
    const r = opcion.getBoundingClientRect();
    const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return opcion.contains(arriba) || arriba === opcion ? "visible" : "TAPADO por: " + arriba?.className;
  });
  console.log("opción del desplegable:", tapado);

  // 2) Filtrar por estado
  console.log("antes del filtro:", await resumen(page));
  await page.locator("button", { hasText: "Denunciado" }).first().click();
  await page.waitForTimeout(3500);
  await page.keyboard.press("Escape");
  await page.mouse.click(750, 600);
  await page.waitForTimeout(2500);
  console.log("solo denunciados:", await resumen(page));
  await page.screenshot({ path: ".qa/z-filtro-estado.png" });

  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");
  await browser.close();
})();
