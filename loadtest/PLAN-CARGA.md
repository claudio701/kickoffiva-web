# Plan de prueba de carga — kickoffiva.cl (antes de una campaña de marketing)

Objetivo: saber si el sitio aguanta el tráfico que traería una campaña, sin tumbarlo.

## Reglas
- Es TU sitio. No correr esto contra sitios de terceros.
- Si está en hosting compartido (Vercel, Netlify, un shared host), una prueba de carga
  puede violar sus términos o afectar a otros: **usa staging** o **avisa al proveedor**.
- Sube de a poco. La meta es medir el techo, no reventar el servidor.

## Cómo correr (k6)
1. Instala k6: https://k6.io/docs/get-started/installation/
2. Corre con poca carga primero y ve subiendo:
   ```
   VUS=20  DURACION=2m k6 run carga-kickoffiva.js
   VUS=50  DURACION=3m k6 run carga-kickoffiva.js
   VUS=100 DURACION=3m k6 run carga-kickoffiva.js
   ```
   (Apunta a staging: `URL=https://staging.kickoffiva.cl ...`)
3. Alternativa sin instalar nada: un servicio gestionado (k6 Cloud, Loader.io,
   BlazeMeter) que ya tiene permiso para generar carga.

## Qué mirar en el resultado
- **http_req_failed**: si empieza a subir sobre ~1%, el servidor ya no da abasto.
- **http_req_duration p95**: si pasa de 1 s, la experiencia se degrada.
- El número de VUs donde eso ocurre = tu techo aproximado de capacidad.

## Siguiente paso
Pásame el resumen que imprime k6 (el bloque final con http_req_duration, http_req_failed,
iterations) y te digo hasta cuánto tráfico aguanta y qué conviene ajustar (CDN, cache,
escalar el hosting) antes de la campaña.

## Nota de hosting
Este sitio está en **Cloudflare Pages** (functions/ + Cloudflare). Cloudflare tiene
protección anti-DDoS: una prueba de carga agresiva puede ser bloqueada o marcada como
ataque. Mantén la carga moderada, avísale a Cloudflare si vas a cargas altas, o prueba
sobre un deploy de *preview*/staging. No subas a miles de VUs contra producción.
