// Estados del caso de siniestro, compartidos entre el mapa y la gestión.
export const ESTADOS = [
  "DENUNCIADO",
  "PENDIENTE_INSPECCION",
  "CERRADO",
  "PAGADO",
] as const;

export type EstadoSiniestro = (typeof ESTADOS)[number];

export const ETIQUETA_ESTADO: Record<string, string> = {
  DENUNCIADO: "Denunciado",
  PENDIENTE_INSPECCION: "Pendiente de inspección",
  CERRADO: "Cerrado",
  PAGADO: "Pagado",
};

export const COLOR_ESTADO: Record<string, string> = {
  DENUNCIADO: "var(--color-ink-muted)",
  PENDIENTE_INSPECCION: "var(--color-warning)",
  CERRADO: "var(--color-positive)",
  PAGADO: "var(--color-accent)",
};

/** Color del punto en los filtros, con valores fijos para que se vea en ambos temas. */
export const PUNTO_ESTADO: Record<string, string> = {
  DENUNCIADO: "#8d857b",
  PENDIENTE_INSPECCION: "#c98a2e",
  CERRADO: "#4f7c4a",
  PAGADO: "#d97757",
};
