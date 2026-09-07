"use client";

import { colorNdvi } from "./ndvi";
import { graficoNdvi, graficoPrecipitacion, graficoTemperaturas } from "./graficos";
import { ETIQUETA_ESTADO } from "./siniestros";

/**
 * Informe de campaña en PDF: una ficha por lote con los datos de cobertura,
 * el clima del período y la evolución del índice verde.
 *
 * Se arma en el navegador porque los datos ya están a mano y las imágenes de
 * NDVI salen de las mismas rutas que usa la pantalla del lote.
 */

/** Más que esto tarda demasiado y consume cuota de imágenes sin sentido. */
export const MAXIMO_LOTES = 15;

export type LoteInforme = {
  lote_id: string;
  id_lote_externo: string;
  lote_nombre: string | null;
  campo: string | null;
  cliente_nombre: string | null;
  cliente_cuit: string | null;
  cultivo: string | null;
  zona_nombre: string | null;
  departamento: string | null;
  localidad: string | null;
  hectareas_aseguradas: number | null;
  hectareas_declaradas: number | null;
  suma_asegurada: number | null;
  rendimiento_asegurado: number | null;
  rinde_estimado: number | null;
  fecha_siembra: string | null;
  causa: string | null;
  fecha: string | null;
  estado: string | null;
  perito_nombre: string | null;
  perito_email: string | null;
  fotos: number;
};

type Clima = {
  anio: number;
  serie: { mes: string; actual: number | null; historico: number | null }[];
  temperatura: { fecha: string; min: number; max: number }[];
  resumenTemperatura: {
    desde: string;
    hasta: string;
    minima: number;
    maxima: number;
    heladas: number;
    diasCalor: number;
  } | null;
  totalActual: number;
  historicoALaFecha: number;
  fuente: string;
};

type Ndvi = {
  serie: { fecha: string; ndvi: number }[];
  fuente: string;
};

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const num = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fechaCorta = (v: string | null | undefined) => {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : v;
};

/** El sistema trae el rinde asegurado como total; a campo se habla en qq/ha. */
function rindeAseguradoPorHa(l: LoteInforme) {
  const ha = Number(l.hectareas_aseguradas ?? 0);
  const total = Number(l.rendimiento_asegurado ?? 0);
  if (!ha || !total) return null;
  return Math.round(total / ha);
}

async function comoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
    lector.readAsDataURL(blob);
  });
}

/**
 * Candidatas de cada mes, ordenadas por cercanía al día 15: es la que mejor
 * representa el mes, pero si esa sale nublada hay que poder probar la siguiente.
 */
function fechasMensuales(serie: { fecha: string }[]) {
  const porMes = new Map<string, string[]>();
  for (const p of serie) {
    const mes = p.fecha.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), p.fecha]);
  }
  const distanciaAlMedio = (f: string) => Math.abs(Number(f.slice(8, 10)) - 15);
  return [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([mes, fechas]) =>
        [mes, fechas.sort((a, b) => distanciaAlMedio(a) - distanciaAlMedio(b))] as const
    );
}

// El guion de imagen pinta de gris claro los píxeles que el satélite marca como
// nube o sombra. Contarlos dice, sin adivinar, si la imagen sirve o no.
const GRIS_NUBE = { r: 217, g: 217, b: 224 };
const TOLERANCIA = 18;
const NUBE_ACEPTABLE = 0.3;

/** Proporción del lote tapada por nubes en una imagen ya descargada. */
function medirNubes(imagen: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = imagen.naturalWidth;
  canvas.height = imagen.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width === 0) return 0;

  ctx.drawImage(imagen, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let delLote = 0;
  let nubladas = 0;
  // De a 4 píxeles alcanza para una proporción y evita recorrer millones.
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 40) continue; // fuera del lote
    delLote++;
    if (
      Math.abs(data[i] - GRIS_NUBE.r) < TOLERANCIA &&
      Math.abs(data[i + 1] - GRIS_NUBE.g) < TOLERANCIA &&
      Math.abs(data[i + 2] - GRIS_NUBE.b) < TOLERANCIA
    ) {
      nubladas++;
    }
  }
  return delLote === 0 ? 1 : nubladas / delLote;
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
    img.src = src;
  });
}

/**
 * Trae la imagen del mes probando las fechas en orden hasta dar con una
 * despejada. Si ninguna lo está, se queda con la menos nublada de las probadas.
 */
async function imagenDelMes(loteId: string, fechas: readonly string[]) {
  let mejor:
    | { url: string; nubes: number; fecha: string; ancho: number; alto: number }
    | null = null;

  for (const fecha of fechas.slice(0, 3)) {
    try {
      const r = await fetch(`/api/lotes/${loteId}/ndvi/imagen?fecha=${fecha}`);
      if (!r.ok) continue;
      const url = await comoDataUrl(await r.blob());
      const img = await cargarImagen(url);
      const nubes = medirNubes(img);
      if (!mejor || nubes < mejor.nubes) {
        mejor = {
          url,
          nubes,
          fecha,
          ancho: img.naturalWidth,
          alto: img.naturalHeight,
        };
      }
      if (nubes <= NUBE_ACEPTABLE) break;
    } catch {
      // Se prueba la fecha siguiente del mismo mes.
    }
  }
  return mejor;
}

export async function generarInforme(
  lotes: LoteInforme[],
  onProgreso?: (hecho: number, total: number, detalle: string) => void
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const MARGEN = 40;
  const UTIL = ANCHO - MARGEN * 2;

  const acento: [number, number, number] = [217, 119, 87];
  const tinta: [number, number, number] = [42, 39, 36];
  const tenue: [number, number, number] = [141, 133, 123];

  for (let i = 0; i < lotes.length; i++) {
    const l = lotes[i];
    const etiqueta = `#${l.id_lote_externo} · ${l.cliente_nombre ?? ""}`.trim();
    onProgreso?.(i, lotes.length, etiqueta);

    if (i > 0) doc.addPage();

    // --- Datos del clima y del índice verde -------------------------------
    let clima: Clima | null = null;
    let ndvi: Ndvi | null = null;
    try {
      const r = await fetch(`/api/lotes/${l.lote_id}/clima`);
      const d = await r.json();
      if (!d.error) clima = d as Clima;
    } catch {
      // Sin clima el informe igual sale, con los datos de cobertura.
    }
    try {
      const r = await fetch(`/api/lotes/${l.lote_id}/ndvi`);
      const d = await r.json();
      if (!d.error) ndvi = d as Ndvi;
    } catch {
      // Ídem: la ficha vale aunque Copernicus no conteste.
    }

    // --- Encabezado --------------------------------------------------------
    let y = MARGEN + 6;
    doc.setTextColor(...tinta);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.text("Informe de campaña 25/26", MARGEN, y);

    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...tenue);
    const encabezado = [
      `Campo: ${l.campo ?? "—"}`,
      `Lote: ${l.lote_nombre || l.id_lote_externo}`,
      `Superficie: ${num(l.hectareas_aseguradas, 1)} ha`,
      `Cultivo: ${l.cultivo ?? "—"}`,
    ].join("     ");
    doc.text(encabezado, MARGEN, y);

    y += 15;
    doc.text(`Asegurado: ${l.cliente_nombre ?? "—"}     CUIT: ${l.cliente_cuit ?? "—"}`, MARGEN, y);

    if (clima?.resumenTemperatura) {
      y += 15;
      // "a" y no una flecha: las fuentes base del PDF no tienen ese carácter y
      // salían un par de símbolos sueltos en el medio de las fechas.
      doc.text(
        `Período analizado: ${fechaCorta(clima.resumenTemperatura.desde)} a ${fechaCorta(clima.resumenTemperatura.hasta)}`,
        MARGEN,
        y
      );
    }

    y += 14;
    doc.setDrawColor(...acento);
    doc.setLineWidth(1.5);
    doc.line(MARGEN, y, ANCHO - MARGEN, y);

    // --- Cobertura ---------------------------------------------------------
    const qqAsegurados = l.rendimiento_asegurado;
    const qqEstimados =
      l.rinde_estimado != null && l.hectareas_aseguradas != null
        ? l.rinde_estimado * l.hectareas_aseguradas
        : null;
    const diferencia =
      qqAsegurados != null && qqEstimados != null ? qqAsegurados - qqEstimados : null;

    const datos: [string, string, string, string][] = [
      ["Zona", l.zona_nombre ?? "—", "Ha aseguradas", `${num(l.hectareas_aseguradas, 1)} ha`],
      ["Departamento", l.departamento ?? "—", "Ha declaradas", `${num(l.hectareas_declaradas, 1)} ha`],
      ["Localidad", l.localidad ?? "—", "Suma asegurada", `$ ${num(l.suma_asegurada)}`],
      [
        "Fecha de siembra",
        fechaCorta(l.fecha_siembra),
        "Rinde asegurado",
        `${num(rindeAseguradoPorHa(l))} qq/ha`,
      ],
      [
        "Causa del siniestro",
        l.causa ?? "Sin denuncia",
        "Quintales asegurados",
        `${num(qqAsegurados)} qq`,
      ],
      [
        "Fecha del siniestro",
        fechaCorta(l.fecha),
        "Rinde estimado",
        l.rinde_estimado == null ? "sin cargar" : `${num(l.rinde_estimado)} qq/ha`,
      ],
      [
        "Estado",
        l.estado ? (ETIQUETA_ESTADO[l.estado] ?? l.estado) : "—",
        "Quintales estimados",
        qqEstimados == null ? "sin cargar" : `${num(qqEstimados)} qq`,
      ],
      [
        "Perito asignado",
        l.perito_nombre || l.perito_email || "sin asignar",
        "Diferencia a indemnizar",
        diferencia == null ? "sin cargar" : `${num(diferencia)} qq`,
      ],
    ];

    autoTable(doc, {
      startY: y + 20,
      body: datos,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: { top: 5, bottom: 5, left: 5, right: 5 } },
      columnStyles: {
        0: { textColor: tenue, cellWidth: UTIL * 0.19 },
        1: { textColor: tinta, fontStyle: "bold", cellWidth: UTIL * 0.31 },
        2: { textColor: tenue, cellWidth: UTIL * 0.22 },
        3: { textColor: tinta, fontStyle: "bold", cellWidth: UTIL * 0.28 },
      },
      alternateRowStyles: { fillColor: [247, 245, 242] },
      margin: { left: MARGEN, right: MARGEN },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 34;

    // --- Resumen del clima -------------------------------------------------
    if (clima?.resumenTemperatura) {
      const r = clima.resumenTemperatura;
      const tarjetas: [string, string, [number, number, number]][] = [
        ["Temp. máxima registrada", `${r.maxima.toFixed(1)} °C`, [192, 80, 63]],
        ["Temp. mínima registrada", `${r.minima.toFixed(1)} °C`, [41, 121, 255]],
        ["Precipitación acumulada", `${num(clima.totalActual)} mm`, [41, 121, 255]],
        ["Días con helada", `${r.heladas}`, tinta],
      ];
      const anchoTarjeta = UTIL / tarjetas.length;
      tarjetas.forEach(([rotulo, valor, color], j) => {
        const x = MARGEN + anchoTarjeta * j;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...tenue);
        doc.text(rotulo, x, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        doc.setTextColor(...color);
        doc.text(valor, x, y + 19);
      });
      y += 42;
    }

    // --- Gráficos de clima -------------------------------------------------
    const ALTO_GRAFICO = (UTIL * 340) / 1000;

    if (clima && clima.temperatura.length > 1) {
      doc.addImage(graficoTemperaturas(clima.temperatura), "PNG", MARGEN, y, UTIL, ALTO_GRAFICO);
      y += ALTO_GRAFICO + 20;
    }
    if (clima && clima.serie.length > 1) {
      doc.addImage(
        graficoPrecipitacion(clima.serie, clima.anio),
        "PNG",
        MARGEN,
        y,
        UTIL,
        ALTO_GRAFICO
      );
      y += ALTO_GRAFICO + 16;
    }

    if (clima) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...tenue);
      doc.text(clima.fuente, MARGEN, y);
    }

    // --- Página del índice verde ------------------------------------------
    doc.addPage();
    y = MARGEN + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...tinta);
    doc.text(`Índice verde · ${etiqueta}`, MARGEN, y);
    y += 22;

    if (!ndvi || ndvi.serie.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...tenue);
      doc.text("Sin fechas de Sentinel-2 sin nubes para este lote.", MARGEN, y + 10);
      continue;
    }

    const altoNdvi = (UTIL * 300) / 1000;
    doc.addImage(graficoNdvi(ndvi.serie, colorNdvi), "PNG", MARGEN, y, UTIL, altoNdvi);
    y += altoNdvi + 32;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...tinta);
    doc.text("Evolución mes a mes", MARGEN, y);
    y += 22;

    // Una imagen por mes, en fila, para leer la evolución de un vistazo.
    const meses = fechasMensuales(ndvi.serie).slice(-12);
    const PORFILA = 4;
    const separacion = 10;
    const ladoImagen = (UTIL - separacion * (PORFILA - 1)) / PORFILA;

    for (let m = 0; m < meses.length; m++) {
      const [mes, fechas] = meses[m];
      const columna = m % PORFILA;
      const fila = Math.floor(m / PORFILA);
      const x = MARGEN + columna * (ladoImagen + separacion);
      const yImg = y + fila * (ladoImagen + 30);

      onProgreso?.(i, lotes.length, `${etiqueta} · NDVI ${mes}`);

      const elegida = await imagenDelMes(l.lote_id, fechas);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...tenue);
      doc.text(
        `${MESES_LARGOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`,
        x,
        yImg - 6
      );

      if (elegida) {
        // El hueco es cuadrado pero el lote no tiene por qué serlo: se encaja
        // respetando la proporción, si no sale estirado.
        const escala = Math.min(
          ladoImagen / elegida.ancho,
          ladoImagen / elegida.alto
        );
        const anchoDibujo = elegida.ancho * escala;
        const altoDibujo = elegida.alto * escala;
        doc.addImage(
          elegida.url,
          "PNG",
          x + (ladoImagen - anchoDibujo) / 2,
          yImg + (ladoImagen - altoDibujo) / 2,
          anchoDibujo,
          altoDibujo
        );
        // Si ni la mejor del mes estaba despejada, se avisa en vez de dejar que
        // alguien lea una mancha gris como si fuera el estado del cultivo.
        if (elegida.nubes > NUBE_ACEPTABLE) {
          doc.setFontSize(7.5);
          doc.setTextColor(...tenue);
          doc.text(
            `nubosidad ${Math.round(elegida.nubes * 100)}%`,
            x,
            yImg + ladoImagen + 9
          );
        }
      } else {
        doc.setDrawColor(216, 210, 200);
        doc.setLineWidth(0.5);
        doc.rect(x, yImg, ladoImagen, ladoImagen);
        doc.setFontSize(8);
        doc.text("sin imagen", x + 5, yImg + 14);
      }
    }

    const filas = Math.ceil(meses.length / PORFILA);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...tenue);
    doc.text(ndvi.fuente, MARGEN, y + filas * (ladoImagen + 30) + 6);
  }

  // Pie de página con la numeración, ya sabiendo cuántas quedaron.
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...tenue);
    doc.text(
      `Multirriesgo Córdoba · generado el ${new Date().toLocaleDateString("es-AR")}`,
      MARGEN,
      doc.internal.pageSize.getHeight() - 20
    );
    doc.text(
      `${p} / ${paginas}`,
      ANCHO - MARGEN,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" }
    );
  }

  onProgreso?.(lotes.length, lotes.length, "");
  doc.save(`informe-campaña-${new Date().toISOString().slice(0, 10)}.pdf`);
}
