// Middleware de Cloudflare Pages Functions.
// Objetivo: eliminar el "soft 404" (rutas desconocidas que respondían 200 con la home).
//
// Cómo funciona: este middleware corre ANTES de servir assets estáticos y antes
// de las funciones de ruta (functions/api/[[path]].ts). Si la ruta es conocida,
// se delega con context.next() (asset estático o función API). Si no, se responde
// 404 real.
//
// El SPA solo usa la ruta "/" (sin react-router), así que no hay fallback de
// rutas de cliente que preservar.

// Tipo mínimo del contexto de Pages Functions (sin depender de
// @cloudflare/workers-types, que no está instalado en este proyecto).
type MiddlewareContext = {
  request: Request;
  next: () => Promise<Response>;
};

// Rutas exactas permitidas (archivos públicos y home).
const EXACT_PATHS = new Set([
  '/',
  '/index.html',
  '/sw.js',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/ai-catalog.json',
  '/favicon.ico',
]);

// Prefijos permitidos, con límite de segmento para no colar rutas parecidas
// (ej. "/privacidad-x" no debe pasar por "/privacidad/").
const PREFIX_SEGMENTS = [
  '/api', // backend Hono (functions/api/[[path]].ts); su propio notFound da 404 JSON
  '/assets', // build de Vite (JS/CSS/fuentes con hash)
  '/icons', // íconos PWA y og-cover
  '/privacidad', // página estática /privacidad/ (Pages redirige sin slash)
  '/terminos', // página estática /terminos/
  '/servicios', // páginas estáticas /servicios/<slug>/ (una URL por servicio)
];

function isKnownRoute(pathname: string): boolean {
  if (EXACT_PATHS.has(pathname)) return true;
  return PREFIX_SEGMENTS.some(
    (seg) => pathname === seg || pathname.startsWith(seg + '/'),
  );
}

const NOT_FOUND_BODY = `404 — Página no encontrada

La ruta solicitada no existe en KickoffIVA.
Home: https://www.kickoffiva.cl/
`;

export const onRequest = async (
  context: MiddlewareContext,
): Promise<Response> => {
  const { pathname } = new URL(context.request.url);

  if (isKnownRoute(pathname)) {
    return context.next();
  }

  return new Response(NOT_FOUND_BODY, {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
