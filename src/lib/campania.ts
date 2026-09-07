/**
 * La campaña de referencia de la aplicación.
 *
 * Todo lo que dice "25/26" —el clima del lote, el informe, el filtro de
 * fechas— sale de acá. Cuando arranque la campaña siguiente se cambia en este
 * único lugar en vez de ir a buscar el año pegado en diez archivos.
 */
export const CAMPANIA = {
  desde: "2025-07-01",
  hasta: "2026-06-30",
  etiqueta: "25/26",
} as const;

/** Meses de la campaña en orden: julio a junio. */
export const MESES_CAMPANIA = [
  { anio: 2025, mes: 7, etiqueta: "Jul" },
  { anio: 2025, mes: 8, etiqueta: "Ago" },
  { anio: 2025, mes: 9, etiqueta: "Sep" },
  { anio: 2025, mes: 10, etiqueta: "Oct" },
  { anio: 2025, mes: 11, etiqueta: "Nov" },
  { anio: 2025, mes: 12, etiqueta: "Dic" },
  { anio: 2026, mes: 1, etiqueta: "Ene" },
  { anio: 2026, mes: 2, etiqueta: "Feb" },
  { anio: 2026, mes: 3, etiqueta: "Mar" },
  { anio: 2026, mes: 4, etiqueta: "Abr" },
  { anio: 2026, mes: 5, etiqueta: "May" },
  { anio: 2026, mes: 6, etiqueta: "Jun" },
] as const;

/** Años calendario que toca la campaña. */
export const ANIOS_CAMPANIA = [...new Set(MESES_CAMPANIA.map((m) => m.anio))];
