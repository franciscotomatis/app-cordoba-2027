"use client";

/**
 * Achica una foto antes de guardarla o subirla.
 *
 * Una foto de celular pesa 3 o 4 MB y no aporta nada a esa resolución para lo
 * que se usa acá: mirar un lote granizado. A 1600 px de ancho queda en unos
 * 300 KB, se sigue viendo el detalle del daño, y hace que entren diez veces
 * más fotos en el mismo espacio — y que suban con señal de campo.
 */

const ANCHO_MAXIMO = 1600;
const CALIDAD = 0.72;

export async function comprimirFoto(archivo: File): Promise<Blob> {
  // Si no es una imagen que el navegador sepa dibujar, se sube tal cual.
  if (!archivo.type.startsWith("image/")) return archivo;

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, ANCHO_MAXIMO / Math.max(bitmap.width, bitmap.height));

    // Ya es chica: comprimirla de nuevo solo la empeora.
    if (escala === 1 && archivo.size < 500_000) {
      bitmap.close();
      return archivo;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);

    const ctx = canvas.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD)
    );

    // Si comprimir no ganó nada, se queda el original.
    return blob && blob.size < archivo.size ? blob : archivo;
  } catch {
    return archivo;
  }
}
