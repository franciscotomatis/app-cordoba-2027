import type { MetadataRoute } from "next";

/**
 * Herramienta interna: no tiene por qué aparecer en Google.
 *
 * No es una medida de seguridad —quien tenga el enlace igual entra a la
 * pantalla de acceso— pero evita que la dirección de la aplicación de una
 * aseguradora quede indexada y a la vista de cualquiera que busque.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
