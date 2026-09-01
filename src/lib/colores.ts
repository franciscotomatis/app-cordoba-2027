// Colores por cultivo y por causa de siniestro, heredados de la app anterior.
export const COLOR_CULTIVO: Record<string, { fill: string; borde: string }> = {
  soja: { fill: "#4CAF50", borde: "#2E7D32" },
  soya: { fill: "#4CAF50", borde: "#2E7D32" },
  maiz: { fill: "#FFC107", borde: "#FF8F00" },
  maíz: { fill: "#FFC107", borde: "#FF8F00" },
  trigo: { fill: "#795548", borde: "#5D4037" },
  girasol: { fill: "#FF9800", borde: "#EF6C00" },
  algodon: { fill: "#2196F3", borde: "#1976D2" },
  algodón: { fill: "#2196F3", borde: "#1976D2" },
  sorgo: { fill: "#E91E63", borde: "#C2185B" },
};

export const COLOR_CULTIVO_DEFAULT = { fill: "#9C27B0", borde: "#7B1FA2" };

export function colorPorCultivo(cultivo: string | null) {
  if (!cultivo) return COLOR_CULTIVO_DEFAULT;
  return COLOR_CULTIVO[cultivo.trim().toLowerCase()] ?? COLOR_CULTIVO_DEFAULT;
}

export const COLOR_CAUSA: Record<string, { fill: string; borde: string }> = {
  granizo: { fill: "#00BCD4", borde: "#0097A7" },
  sequia: { fill: "#FF5252", borde: "#D50000" },
  sequía: { fill: "#FF5252", borde: "#D50000" },
  inundacion: { fill: "#448AFF", borde: "#2979FF" },
  inundación: { fill: "#448AFF", borde: "#2979FF" },
  viento: { fill: "#7C4DFF", borde: "#651FFF" },
  incendio: { fill: "#795548", borde: "#5D4037" },
  helada: { fill: "#FFFFFF", borde: "#E0E0E0" },
};

export const COLOR_CAUSA_DEFAULT = { fill: "#9C27B0", borde: "#7B1FA2" };
