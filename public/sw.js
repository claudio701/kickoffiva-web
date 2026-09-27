/* KickoffIVA service worker — instalable + shell offline.
   Estrategia:
   - Navegaciones: network-first SIN cachear HTML. El HTML cacheado servía
     CSP y precios viejos tras un redespliegue; ahora el HTML siempre viene
     de red y offline se devuelve un fallback generado por este SW (siempre
     de la versión actual, sin headers viejos).
   - Shell estático inmutable (/assets/* con hash de Vite, /icons/*):
     cache-first; son inmutables por nombre, así que nunca quedan obsoletos.
   - /api/ nunca se cachea: los datos del cierre deben venir del servidor.

   El nombre de caché lleva la versión del build: scripts/prerender.mjs
   reemplaza __BUILD_VERSION__ al final de cada build. Cada deploy crea una
   caché nueva y `activate` borra la anterior automáticamente. */
const CACHE = "kickoffiva-__BUILD_VERSION__";

// Rutas inmutables: Vite emite /assets/index-<hash>.js|css; los iconos del
// manifiesto son binarios versionados por contenido en el repo.
const INMUTABLE = /^\/(assets|icons)\//;

self.addEventListener("install", (e) => {
  // Sin precaché de HTML: el shell se llena bajo demanda en el primer uso.
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fallback de navegación offline: lo genera el SW vigente, nunca es HTML
// cacheado de un deploy anterior.
const OFFLINE_HTML =
  '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>KickoffIVA — sin conexión</title>" +
  "<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;" +
  "min-height:100vh;margin:0;background:#0b0f14;color:#e6edf3;text-align:center}" +
  "a{color:#58a6ff}</style></head><body><main><h1>Sin conexión</h1>" +
  "<p>KickoffIVA necesita red para cargar. Revisa tu conexión y reintenta.</p>" +
  '<p><a href="/">Reintentar</a></p></main></body></html>';

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // El API nunca se cachea: los datos del cierre deben venir del servidor.
  if (url.pathname.startsWith("/api/")) return;

  if (e.request.mode === "navigate") {
    // Network-first sin guardar la respuesta: el HTML nunca se cachea.
    e.respondWith(
      fetch(e.request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
      )
    );
    return;
  }

  // Shell estático inmutable: cache-first (el hash del nombre garantiza versión).
  if (
    e.request.method === "GET" &&
    url.origin === self.location.origin &&
    INMUTABLE.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return res;
        });
      })
    );
  }
  // Resto (manifest, etc.): pasa directo a red, sin caché.
});
