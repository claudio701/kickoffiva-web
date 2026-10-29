// Prueba de carga y de PICO (spike) para kickoffiva.cl con k6 (https://k6.io).
// Objetivo: ver si el sitio aguanta el peak de un lanzamiento de crowdfunding con prensa.
// CORRER DESDE FUERA (k6 local o servicio gestionado), no desde Claude.
//
// IMPORTANTE:
//   - Es TU sitio, en Cloudflare Pages (tiene protección anti-DDoS). Prueba sobre un
//     deploy de PREVIEW/STAGING (URL *.pages.dev del branch) o avisa a Cloudflare.
//     Una prueba sana mide el techo; no busca tumbar el sitio.
//   - Empieza con el escenario "carga" y recién después el de "pico".
//
// Uso:
//   # 1) Carga sostenida (capacidad base):
//   ESCENARIO=carga  VUS=50  DURACION=3m  URL=https://<preview>.pages.dev  k6 run loadtest/carga-kickoffiva.js
//   # 2) Pico de lanzamiento (llegada de golpe desde prensa/redes):
//   ESCENARIO=pico   PICO=300             URL=https://<preview>.pages.dev  k6 run loadtest/carga-kickoffiva.js
//
// Interpretación: mira http_req_failed (errores) y http_req_duration p95 (latencia).
// El nivel de usuarios donde los errores suben o el p95 se dispara = tu techo de capacidad.

import http from 'k6/http';
import { check, sleep } from 'k6';

const URL = __ENV.URL || 'https://www.kickoffiva.cl';
const ESCENARIO = (__ENV.ESCENARIO || 'carga').toLowerCase();
const VUS = parseInt(__ENV.VUS || '50', 10);       // usuarios virtuales (escenario carga)
const DURACION = __ENV.DURACION || '3m';
const PICO = parseInt(__ENV.PICO || '300', 10);     // usuarios pico (escenario pico)

// Escenario "carga": rampa suave, sostiene, baja. Mide capacidad estable.
const etapasCarga = [
  { duration: '30s', target: Math.ceil(VUS / 3) },
  { duration: '30s', target: VUS },
  { duration: DURACION, target: VUS },
  { duration: '30s', target: 0 },
];

// Escenario "pico": subida rápida al peak (como un golpe de prensa), sostiene corto, baja.
const etapasPico = [
  { duration: '20s', target: Math.ceil(PICO / 4) },
  { duration: '20s', target: PICO },   // llegada de golpe
  { duration: '1m',  target: PICO },   // aguanta el peak
  { duration: '30s', target: 0 },
];

export const options = {
  stages: ESCENARIO === 'pico' ? etapasPico : etapasCarga,
  thresholds: {
    http_req_failed: ['rate<0.02'],      // <2% de errores
    http_req_duration: ['p(95)<1500'],   // p95 bajo 1,5 s
  },
};

export default function () {
  const res = http.get(URL, { tags: { name: 'home' } });
  check(res, {
    'status 200': (r) => r.status === 200,
    'tiene cuerpo': (r) => r.body && r.body.length > 0,
  });
  sleep(1); // 1 req/s por usuario: tráfico realista, no martilleo
}
