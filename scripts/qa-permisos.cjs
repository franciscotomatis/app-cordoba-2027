// QA de: colores por causa en el mapa, capa de fotos y panel de administración.
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.argv[2] || "http://localhost:3100";
const EMAIL = process.env.QA_EMAIL || "qa.temporal@gmail.com";
const PASS = process.env.QA_PASS || "QaTemporal!2026";

(async () => {
  fs.mkdirSync(".qa", { recursive: true });
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

  // 1) Mapa: colorear por causa de siniestro
  await page.goto(`${BASE}/mapa`, { waitUntil: "networkidle" });
  await page.waitForTimeout(14000);
  await page.getByRole("button", { name: "Solo siniestros" }).click();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Color: siniestro" }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: ".qa/p-color-siniestro.png" });

  const leyenda = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("HECTÁREAS POR CAUSA");
    return i >= 0 ? t.slice(i, i + 220).replace(/\n+/g, " | ") : "(no se encontró la leyenda)";
  });
  console.log("leyenda por causa:", leyenda);

  // 2) Panel de capas: debe aparecer la capa de fotos
  await page.hover(".leaflet-control-layers");
  await page.waitForTimeout(800);
  const capas = await page.locator(".leaflet-control-layers").innerText();
  console.log("capas disponibles:", capas.replace(/\n+/g, " | "));
  await page.screenshot({ path: ".qa/p-panel-capas.png" });

  // 3) Administración: usuarios + matriz de permisos
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: ".qa/p-admin.png", fullPage: true });

  const avisoClave = (await page.textContent("body")).includes("SUPABASE_SERVICE_ROLE_KEY");
  console.log("avisa que falta la clave de servicio:", avisoClave);

  const checkboxes = await page.locator("table button").count();
  console.log("controles de la matriz de permisos:", checkboxes);

  // Probar el alta de usuario (debería explicar que falta la clave de servicio)
  await page.getByRole("button", { name: /Nuevo usuario/ }).click();
  await page.waitForTimeout(500);
  await page.locator('input[type="email"]').fill("prueba.perito@gmail.com");
  await page.locator('input[placeholder="Nombre y apellido"]').fill("Perito de prueba");
  await page.locator('input[placeholder="Contraseña"]').fill("ClaveSegura2026");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await page.waitForTimeout(4000);
  const cuerpo = await page.textContent("body");
  const i = cuerpo.indexOf("SUPABASE_SERVICE_ROLE_KEY");
  console.log(
    "resultado del alta:",
    i > 0 ? "avisa que falta la clave de servicio (esperado)" : "usuario creado"
  );
  await page.screenshot({ path: ".qa/p-alta-usuario.png" });

  console.log(
    errores.length ? "ERRORES:\n" + errores.slice(0, 8).join("\n") : "Sin errores de consola."
  );
  await browser.close();
})();
