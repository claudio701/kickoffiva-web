// Prueba de carga para kickoffiva.cl con k6 (https://k6.io).
// CORRER DESDE TU MÁQUINA O UN SERVICIO DE LOAD TESTING, no desde Claude.
// Antes de correr:
//   - Apunta a STAGING si existe (URL=...), o coordina con tu proveedor de hosting.
//   - Es TU sitio; no lo uses contra sitios de terceros.
//   - Empieza conservador (VUs bajos) y sube de a poco. Esto NO es para tumbar el sitio,
//     es para medir hasta dónde responde bien.
//
// Uso:
//   k6 run carga-kickoffiva.js
//   URL=https://staging.kickoffiva.cl VUS=50 DURACION=3m k6 run carga-kickoffiva.js
//
// Interpretación: mira http_req_duration (p95) y http_req_failed. Si p95 se dispara o
// suben los errores al subir VUs, ahí está el techo de capacidad.

import http from 'k6/http';
import { check, sleep } from 'k6';

const URL = __ENV.URL || 'https://www.kickoffiva.cl';
const VUS = parseInt(__ENV.VUS || '30', 10);        // usuarios virtuales pico (conservador)
const DURACION = __ENV.DURACION || '2m';

export const options = {
  // Rampa suave: sube, mantiene, baja. Evita el golpe seco.
  stages: [
    { duration: '30s', target: Math.ceil(VUS / 3) },
    { duration: '30s', target: VUS },
    { duration: DURACION, target: VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],      // <1% de errores
    http_req_duration: ['p(95)<1000'],   // p95 bajo 1 s
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
