import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad.
 *
 * Son lo primero que mira un escáner de seguridad corporativo, y su ausencia
 * aparece en rojo aunque la aplicación esté bien hecha por dentro. Van acá y no
 * en el middleware para que valgan también para los archivos estáticos.
 */

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co";

const csp = [
  "default-src 'self'",
  // Next inserta un script de arranque en línea, y hay uno propio que aplica el
  // tema antes del primer pintado para que no parpadee. Por eso hace falta
  // 'unsafe-inline'; lo que sí queda bloqueado es cargar scripts de otro sitio,
  // que es por donde entra un ataque de inyección real.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind y Leaflet escriben estilos en línea.
  "style-src 'self' 'unsafe-inline'",
  // data: y blob: para las fotos y las imágenes de NDVI que se arman en el
  // navegador; los dos servidores de mapas para el fondo satelital.
  "img-src 'self' data: blob: https://server.arcgisonline.com https://mt1.google.com",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} https://*.supabase.co`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // Nada de plugins, ni de que otro sitio nos meta en un marco.
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const cabeceras = [
  { key: "Content-Security-Policy", value: csp },
  // Redundante con frame-ancestors, pero los escáneres viejos buscan esta.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No se filtra a qué lote se estaba mirando al salir hacia otro sitio.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app usa cámara y ubicación; todo lo demás queda apagado.
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Oculta la versión de Next, que le ahorra trabajo a quien busca fallas
  // conocidas de una versión puntual.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: cabeceras }];
  },
};

export default nextConfig;
