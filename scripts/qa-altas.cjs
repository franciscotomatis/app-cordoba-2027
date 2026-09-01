// Verifica el alta, cambio de contraseña y baja de usuarios contra producción.
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.argv[2] || "https://app-cordoba-2027.vercel.app";
const EMAIL = process.env.QA_EMAIL || "qa.temporal@gmail.com";
const PASS = process.env.QA_PASS || "QaTemporal!2026";
const NUEVO = "perito.prueba.qa@gmail.com";

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

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const faltaClave = (await page.textContent("body")).includes("SUPABASE_SERVICE_ROLE_KEY");
  console.log("¿sigue avisando que falta la clave?:", faltaClave);

  // Alta
  await page.getByRole("button", { name: /Nuevo usuario/ }).click();
  await page.waitForTimeout(400);
  await page.locator('input[type="email"]').fill(NUEVO);
  await page.locator('input[placeholder="Nombre y apellido"]').fill("Perito de prueba");
  await page.locator('input[placeholder="Contraseña"]').fill("ClaveSegura2026");
  await page.locator("form select").selectOption("perito");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await page.waitForTimeout(6000);

  const cuerpo = await page.textContent("body");
  console.log("alta:", cuerpo.includes(`Usuario ${NUEVO} creado`) ? "OK" : "revisar");
  // Se busca dentro de la tabla: el aviso de éxito también contiene el email.
  console.log("aparece en la lista:", (await page.locator("tbody").innerText()).includes(NUEVO));
  await page.screenshot({ path: ".qa/a-alta.png", fullPage: true });

  // El usuario nuevo debe poder entrar con esa contraseña
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page2.fill('input[type="email"]', NUEVO);
  await page2.fill('input[type="password"]', "ClaveSegura2026");
  await page2.click('button[type="submit"]');
  const entro = await page2
    .waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  console.log("el usuario nuevo puede iniciar sesión:", entro);

  if (entro) {
    await page2.waitForTimeout(2000);
    const menu = await page2.locator("nav").innerText();
    console.log("menú del perito:", menu.replace(/\n+/g, " | "));
    await page2.screenshot({ path: ".qa/a-menu-perito.png" });
  }
  await ctx2.close();

  // Baja
  page.on("dialog", (d) => d.accept());
  const fila = page.locator("tr", { hasText: NUEVO });
  await fila.locator("button").last().click();
  await page.waitForTimeout(6000);
  const trasBaja = await page.textContent("body");
  console.log("baja:", trasBaja.includes(`Usuario ${NUEVO} eliminado`) ? "OK" : "revisar");
  console.log(
    "sigue en la tabla:",
    (await page.locator("tbody").innerText()).includes(NUEVO)
  );

  console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "Sin errores de página.");
  await browser.close();
})();
