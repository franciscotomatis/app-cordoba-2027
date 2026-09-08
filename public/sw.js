// Service worker: hace que la app abra sin señal.
//
// Los archivos de la app (JavaScript, estilos, fuentes) se guardan la primera
// vez y después salen del teléfono. Lo que son datos —consultas al servidor—
// nunca se cachea: mostrar un rinde viejo como si fuera el actual sería peor
// que no mostrar nada.

const CACHE = "cba-v1";

// Se instala al toque, sin esperar a que se cierren las pestañas viejas.
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

const esEstatico = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/capas/") ||
  /\.(css|js|woff2?|png|svg|ico|json)$/.test(url.pathname);

self.addEventListener("fetch", (e) => {
  const pedido = e.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Nada de datos en la caché: ni la API ni la sesión.
  if (url.pathname.startsWith("/api/")) return;

  // Archivos de la app: del teléfono primero, que es instantáneo y funciona sin
  // señal. Llevan huella en el nombre, así que no hay riesgo de servir viejo.
  if (esEstatico(url)) {
    e.respondWith(
      caches.match(pedido).then(
        (guardado) =>
          guardado ||
          fetch(pedido).then((r) => {
            if (r.ok) {
              const copia = r.clone();
              caches.open(CACHE).then((c) => c.put(pedido, copia));
            }
            return r;
          })
      )
    );
    return;
  }

  // Páginas: se intenta la red y, si no hay, se sirve la última que se vio.
  if (pedido.mode === "navigate") {
    e.respondWith(
      fetch(pedido)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(pedido, copia));
          }
          return r;
        })
        .catch(async () => {
          const guardado = await caches.match(pedido);
          if (guardado) return guardado;
          const inicio = await caches.match("/mapa");
          if (inicio) return inicio;
          return new Response(
            "<meta charset='utf-8'><body style='font-family:system-ui;padding:2rem'>" +
              "<h2>Sin señal</h2><p>Abrí esta pantalla al menos una vez con datos " +
              "para poder usarla después sin conexión.</p></body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
  }
});
