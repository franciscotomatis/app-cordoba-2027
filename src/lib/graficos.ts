"use client";

/**
 * Gráficos dibujados sobre un canvas para meterlos en el PDF.
 *
 * No se reutilizan los de la pantalla (Recharts) porque esos viven en el DOM
 * como SVG y pasarlos a imagen es frágil. Acá se dibujan a mano con los mismos
 * colores y la misma lectura, pero con control total de la resolución.
 */

const ESCALA = 2; // sin esto el gráfico sale pixelado en el PDF

const TINTA = "#2a2724";
const TENUE = "#8d857b";
const LINEA = "#d8d2c8";

type Caja = { izq: number; der: number; arriba: number; abajo: number };

function lienzo(ancho: number, alto: number) {
  const canvas = document.createElement("canvas");
  canvas.width = ancho * ESCALA;
  canvas.height = alto * ESCALA;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.textBaseline = "middle";
  return { canvas, ctx };
}

function fuente(ctx: CanvasRenderingContext2D, px: number, negrita = false) {
  ctx.font = `${negrita ? "600 " : ""}${px}px Inter, system-ui, sans-serif`;
}

/** Rejilla horizontal con las etiquetas del eje vertical. */
function rejilla(
  ctx: CanvasRenderingContext2D,
  caja: Caja,
  min: number,
  max: number,
  pasos: number,
  formato: (v: number) => string
) {
  fuente(ctx, 10);
  ctx.textAlign = "right";
  for (let i = 0; i <= pasos; i++) {
    const valor = min + ((max - min) * i) / pasos;
    const y = caja.abajo - ((valor - min) / (max - min)) * (caja.abajo - caja.arriba);
    ctx.strokeStyle = LINEA;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(caja.izq, y);
    ctx.lineTo(caja.der, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = TENUE;
    ctx.fillText(formato(valor), caja.izq - 6, y);
  }
}

/** Un paso de eje que caiga en números redondos y deje entre 4 y 8 marcas. */
function pasoLindo(rango: number) {
  for (const paso of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500]) {
    if (rango / paso <= 8) return paso;
  }
  return Math.ceil(rango / 8);
}

function titulo(ctx: CanvasRenderingContext2D, texto: string, ancho: number) {
  fuente(ctx, 13, true);
  ctx.fillStyle = TINTA;
  ctx.textAlign = "center";
  ctx.fillText(texto, ancho / 2, 16);
}

function ejeInferior(ctx: CanvasRenderingContext2D, caja: Caja) {
  ctx.strokeStyle = LINEA;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(caja.izq, caja.abajo);
  ctx.lineTo(caja.der, caja.abajo);
  ctx.stroke();
}

function referencias(
  ctx: CanvasRenderingContext2D,
  items: { color: string; etiqueta: string; guiones?: boolean }[],
  caja: Caja,
  alto: number
) {
  fuente(ctx, 10);
  ctx.textAlign = "left";
  let x = caja.izq;
  const y = alto - 10;
  for (const it of items) {
    ctx.strokeStyle = it.color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(it.guiones ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 16, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = TENUE;
    ctx.fillText(it.etiqueta, x + 21, y);
    x += 26 + ctx.measureText(it.etiqueta).width + 16;
  }
}

const MES_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** Máximas y mínimas día a día, con los umbrales de helada y golpe de calor. */
export function graficoTemperaturas(
  serie: { fecha: string; min: number; max: number }[]
) {
  const ancho = 1000;
  const alto = 340;
  const { canvas, ctx } = lienzo(ancho, alto);
  titulo(ctx, "Evolución de temperaturas", ancho);
  if (serie.length < 2) return canvas.toDataURL("image/png");

  const caja: Caja = { izq: 46, der: ancho - 14, arriba: 32, abajo: alto - 44 };
  const paso = pasoLindo(
    Math.max(...serie.map((d) => d.max)) - Math.min(...serie.map((d) => d.min)) + 10
  );
  const min = Math.floor((Math.min(...serie.map((d) => d.min)) - 2) / paso) * paso;
  const max = Math.ceil((Math.max(...serie.map((d) => d.max)) + 2) / paso) * paso;

  rejilla(ctx, caja, min, max, (max - min) / paso, (v) => `${Math.round(v)}`);

  const x = (i: number) => caja.izq + (i / (serie.length - 1)) * (caja.der - caja.izq);
  const y = (v: number) => caja.abajo - ((v - min) / (max - min)) * (caja.abajo - caja.arriba);

  // Umbrales agronómicos: 0 °C helada, 35 °C golpe de calor.
  for (const [valor, color] of [
    [0, "#2979ff"],
    [35, "#c0503f"],
  ] as [number, string][]) {
    if (valor <= min || valor >= max) continue;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(caja.izq, y(valor));
    ctx.lineTo(caja.der, y(valor));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  const trazar = (clave: "min" | "max", color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    serie.forEach((d, i) =>
      i ? ctx.lineTo(x(i), y(d[clave])) : ctx.moveTo(x(i), y(d[clave]))
    );
    ctx.stroke();
  };
  trazar("max", "#c0503f");
  trazar("min", "#2979ff");

  // Eje horizontal: una marca por mes.
  fuente(ctx, 10);
  ctx.fillStyle = TENUE;
  ctx.textAlign = "center";
  serie.forEach((d, i) => {
    if (d.fecha.slice(8, 10) !== "01") return;
    ctx.fillText(MES_CORTO[Number(d.fecha.slice(5, 7)) - 1], x(i), caja.abajo + 14);
  });

  ejeInferior(ctx, caja);
  referencias(
    ctx,
    [
      { color: "#c0503f", etiqueta: "Máxima" },
      { color: "#2979ff", etiqueta: "Mínima" },
    ],
    caja,
    alto
  );

  return canvas.toDataURL("image/png");
}

/** Precipitación mensual: la campaña contra el promedio histórico. */
export function graficoPrecipitacion(
  serie: { mes: string; actual: number | null; historico: number | null }[],
  anio: number
) {
  const ancho = 1000;
  const alto = 340;
  const { canvas, ctx } = lienzo(ancho, alto);
  titulo(ctx, "Precipitación mensual", ancho);
  if (serie.length < 2) return canvas.toDataURL("image/png");

  const caja: Caja = { izq: 46, der: ancho - 14, arriba: 32, abajo: alto - 44 };
  const valores = serie.flatMap((m) =>
    [m.actual, m.historico].filter((v): v is number => v !== null)
  );
  const paso = pasoLindo(Math.max(...valores, 20));
  const max = Math.max(paso, Math.ceil(Math.max(...valores, 0) / paso) * paso);

  rejilla(ctx, caja, 0, max, max / paso, (v) => `${Math.round(v)}`);

  const x = (i: number) => caja.izq + (i / (serie.length - 1)) * (caja.der - caja.izq);
  const y = (v: number) => caja.abajo - (v / max) * (caja.abajo - caja.arriba);

  const trazar = (
    clave: "actual" | "historico",
    color: string,
    grosor: number,
    guiones: boolean,
    puntos: boolean
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    ctx.setLineDash(guiones ? [6, 4] : []);
    ctx.beginPath();
    let arrancado = false;
    serie.forEach((m, i) => {
      const v = m[clave];
      if (v === null) return;
      if (arrancado) ctx.lineTo(x(i), y(v));
      else {
        ctx.moveTo(x(i), y(v));
        arrancado = true;
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);

    if (!puntos) return;
    ctx.fillStyle = color;
    serie.forEach((m, i) => {
      const v = m[clave];
      if (v === null) return;
      ctx.beginPath();
      ctx.arc(x(i), y(v), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  trazar("historico", TENUE, 2, true, false);
  trazar("actual", "#2979ff", 2.5, false, true);

  fuente(ctx, 10);
  ctx.fillStyle = TENUE;
  ctx.textAlign = "center";
  serie.forEach((m, i) => ctx.fillText(m.mes, x(i), caja.abajo + 14));

  ejeInferior(ctx, caja);
  referencias(
    ctx,
    [
      { color: "#2979ff", etiqueta: `Campaña ${anio}` },
      { color: TENUE, etiqueta: "Promedio histórico", guiones: true },
    ],
    caja,
    alto
  );

  return canvas.toDataURL("image/png");
}

/** Índice verde: la línea cambia de color según el valor, como en pantalla. */
export function graficoNdvi(
  serie: { fecha: string; ndvi: number }[],
  colorDe: (v: number) => string
) {
  const ancho = 1000;
  const alto = 300;
  const { canvas, ctx } = lienzo(ancho, alto);
  titulo(ctx, "Evolución del índice verde (NDVI)", ancho);
  if (serie.length < 2) return canvas.toDataURL("image/png");

  const caja: Caja = { izq: 46, der: ancho - 14, arriba: 32, abajo: alto - 40 };
  rejilla(ctx, caja, 0, 1, 5, (v) => v.toFixed(1));

  const x = (i: number) => caja.izq + (i / (serie.length - 1)) * (caja.der - caja.izq);
  const y = (v: number) => caja.abajo - v * (caja.abajo - caja.arriba);

  // 0,3 es el umbral donde un cultivo implantado ya debería estar.
  ctx.strokeStyle = TENUE;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(caja.izq, y(0.3));
  ctx.lineTo(caja.der, y(0.3));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (let i = 1; i < serie.length; i++) {
    ctx.strokeStyle = colorDe(serie[i].ndvi);
    ctx.beginPath();
    ctx.moveTo(x(i - 1), y(serie[i - 1].ndvi));
    ctx.lineTo(x(i), y(serie[i].ndvi));
    ctx.stroke();
  }

  fuente(ctx, 10);
  ctx.fillStyle = TENUE;
  ctx.textAlign = "center";
  let mesPrevio = "";
  serie.forEach((p, i) => {
    const mes = p.fecha.slice(0, 7);
    if (mes === mesPrevio) return;
    mesPrevio = mes;
    ctx.fillText(MES_CORTO[Number(p.fecha.slice(5, 7)) - 1], x(i), caja.abajo + 14);
  });

  ejeInferior(ctx, caja);
  return canvas.toDataURL("image/png");
}
