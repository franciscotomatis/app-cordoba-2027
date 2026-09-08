// Íconos de la app para la pantalla de inicio del celular.
// Se dibujan con el mismo criterio que la marca de la aplicación: "SS" en el
// magenta institucional. Correr solo si cambia la marca.
import { chromium } from "playwright";

const html = (lado) => `
<html><body style="margin:0">
<div style="width:${lado}px;height:${lado}px;background:#e5007d;display:flex;
     align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;
     font-weight:700;color:#fff;font-size:${lado * 0.42}px;letter-spacing:${-lado * 0.02}px">SS</div>
</body></html>`;

const navegador = await chromium.launch();
for (const lado of [192, 512, 180]) {
  const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } });
  await pagina.setContent(html(lado));
  const nombre = lado === 180 ? "public/apple-touch-icon.png" : `public/icono-${lado}.png`;
  await pagina.screenshot({ path: nombre });
  console.log("generado:", nombre);
  await pagina.close();
}
await navegador.close();
