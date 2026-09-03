// Escala de color del NDVI: del marrón del suelo desnudo al verde oscuro del
// cultivo en pleno desarrollo. Es la paleta habitual del índice, así que se
// lee sin necesidad de explicar la referencia.
export const ESCALA_NDVI: { hasta: number; color: string; etiqueta: string }[] = [
  { hasta: 0.1, color: "#a89478", etiqueta: "Suelo desnudo" },
  { hasta: 0.2, color: "#ccb87a", etiqueta: "Muy bajo" },
  { hasta: 0.3, color: "#d9cc6b", etiqueta: "Bajo" },
  { hasta: 0.4, color: "#bfcc59", etiqueta: "Incipiente" },
  { hasta: 0.5, color: "#99c24d", etiqueta: "En desarrollo" },
  { hasta: 0.6, color: "#6bad42", etiqueta: "Bueno" },
  { hasta: 0.7, color: "#458f38", etiqueta: "Muy bueno" },
  { hasta: 1.01, color: "#20701e", etiqueta: "Máximo" },
];

export function colorNdvi(v: number | null | undefined) {
  if (v === null || v === undefined) return "#8d857b";
  for (const tramo of ESCALA_NDVI) {
    if (v < tramo.hasta) return tramo.color;
  }
  return ESCALA_NDVI[ESCALA_NDVI.length - 1].color;
}

/**
 * Paradas de degradado para que la línea del gráfico cambie de color según el
 * valor, al estilo de OneSoil: el color dice el estado sin mirar el eje.
 */
export function paradasDeColor(serie: { ndvi: number }[]) {
  if (serie.length === 0) return [];
  if (serie.length === 1) return [{ offset: "0%", color: colorNdvi(serie[0].ndvi) }];

  return serie.map((p, i) => ({
    offset: `${(i / (serie.length - 1)) * 100}%`,
    color: colorNdvi(p.ndvi),
  }));
}
