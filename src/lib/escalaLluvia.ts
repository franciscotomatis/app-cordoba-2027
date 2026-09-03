// Escala de color para la lluvia acumulada: azules de claro a oscuro.
// Es una variable cuantitativa secuencial, así que corresponde una rampa de un
// solo tono; el corte se calcula sobre los datos del período elegido para que
// la escala sirva tanto para 7 días como para 6 meses.
// Los tonos arrancan saturados y no en casi blanco: sobre la imagen satelital
// un azul muy claro se pierde y el lote parece sin dato.
export const AZULES = [
  "#bfe3f7",
  "#87c9ef",
  "#4da8e0",
  "#2380c4",
  "#1259a0",
  "#0b3a75",
] as const;

export const SIN_DATO = "#8d857b";

export type EscalaLluvia = {
  cortes: number[];
  color: (mm: number | undefined) => string;
  maximo: number;
  minimo: number;
};

/** Construye la escala a partir de los valores del recorte (cuantiles). */
export function crearEscalaLluvia(valores: number[]): EscalaLluvia {
  const ordenados = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);

  if (ordenados.length === 0) {
    return { cortes: [], color: () => SIN_DATO, maximo: 0, minimo: 0 };
  }

  const maximo = ordenados[ordenados.length - 1];
  const minimo = ordenados[0];
  const cortes: number[] = [];

  // Cinco cortes por cuantil, redondeados para que la leyenda se lea bien.
  for (let i = 1; i < AZULES.length; i++) {
    const pos = Math.floor((ordenados.length - 1) * (i / AZULES.length));
    const valor = Math.round(ordenados[pos]);
    if (cortes[cortes.length - 1] !== valor) cortes.push(valor);
  }

  return {
    cortes,
    maximo,
    minimo: Math.round(minimo),
    color: (mm) => {
      if (mm === undefined || mm === null) return SIN_DATO;
      let i = 0;
      while (i < cortes.length && mm >= cortes[i]) i++;
      return AZULES[Math.min(i, AZULES.length - 1)];
    },
  };
}
