// QA del flujo completo: selección en el mapa -> gestión -> estado, asignación y exportes.
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = process.env.QA_EMAIL || "qa.temporal@gmail.com";
const PASS = process.env.QA_PASS || "QaTemporal!2026";

// Lee el contador "N seleccionados" de la barra del mapa.
async function contarSeleccion(page) {
  return page.evaluate(() => {
    const nodos = Array.from(document.querySelectorAll("span"));
    const cont = nodos.find((n) => n.textContent?.trim().endsWith("seleccionados"));
    if (!cont) return 0;
    const numero = cont.querySelector("span");
    return parseInt(numero?.textContent ?? "0", 10) || 0;
  });
}

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 920 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });

  // 1) Selección con clic en el mapa
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(14000);
  await page.locator('input[placeholder*="Asegurado"]').fill("Gioara");
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: /Seleccionar con clic/ }).click();

  const caja = await page.locator(".leaflet-container").boundingBox();
  const cx = caja.x + caja.width / 2;
  const cy = caja.y + caja.height / 2;
  let seleccionados = 0;

  for (let r = 0; r <= 200 && seleccionados < 3; r += 25) {
    for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      await page.mouse.click(cx + dx, cy + dy);
      await page.waitForTimeout(220);
      const n = await contarSeleccion(page);
      if (n > seleccionados) seleccionados = n;
      if (seleccionados >= 3) break;
    }
  }
  console.log("lotes seleccionados con clic:", seleccionados);
  await page.screenshot({ path: ".qa/f-mapa-sel.png" });

  // 2) Lazo a mano alzada
  await page.getByRole("button", { name: /mano alzada/ }).click();
  await page.mouse.move(cx - 180, cy - 140);
  await page.mouse.down();
  for (const [dx, dy] of [[180, -140], [200, 120], [-160, 160], [-180, -140]]) {
    await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const trasLazo = await contarSeleccion(page);
  console.log("seleccionados tras el lazo:", trasLazo);
  await page.screenshot({ path: ".qa/f-mapa-lazo.png" });

  // 3) Pasar la selección a gestión de siniestros
  if (trasLazo > 0) {
    await page.getByRole("link", { name: /Gestionar selección/ }).click();
    await page.waitForURL((u) => u.pathname.includes("siniestros"), { timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: ".qa/f-gestion-sel.png" });
    console.log("casos filtrados por la selección:", await page.locator("tbody tr").count());
  }

  // 4) Estado individual
  await page.goto(`${BASE}/siniestros`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.locator("tbody tr").first().locator("select").selectOption("PENDIENTE_INSPECCION");
  await page.waitForTimeout(3500);
  const textoPagina = await page.textContent("body");
  console.log("cambio de estado confirmado:", textoPagina.includes("pasaron a"));

  // 5) Asignación en tanda a un perito
  await page.locator('thead input[type="checkbox"]').click();
  await page.waitForTimeout(400);
  const selects = page.locator("select");
  const cantidad = await selects.count();
  for (let i = 0; i < cantidad; i++) {
    const opciones = await selects.nth(i).locator("option").allTextContents();
    if (opciones.some((o) => o.includes("Perito QA"))) {
      await selects.nth(i).selectOption({ label: "Perito QA" });
      break;
    }
  }
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await page.waitForTimeout(8000);
  const cuerpo = await page.textContent("body");
  const idx = cuerpo.indexOf("casos asignados");
  console.log(
    "resultado de asignación:",
    idx > 0 ? cuerpo.slice(Math.max(0, idx - 40), idx + 120).trim() : "(sin aviso)"
  );
  await page.screenshot({ path: ".qa/f-asignacion.png" });

  // 6) Exportaciones
  for (const boton of ["CSV", "Excel", "PDF"]) {
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }).catch(() => null),
      page.getByRole("button", { name: boton, exact: true }).click(),
    ]);
    console.log(`export ${boton}:`, descarga ? descarga.suggestedFilename() : "FALLÓ");
  }

  console.log(
    errores.length ? "ERRORES:\n" + errores.slice(0, 8).join("\n") : "Sin errores de consola."
  );
  await browser.close();
})();
