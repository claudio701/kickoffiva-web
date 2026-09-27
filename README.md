# KickoffIVA — sitio + API (kickoffiva.cl)

Frontend (React 19 + Vite + Tailwind) y backend (Cloudflare Pages Functions con Hono)
en **un solo proyecto de Cloudflare Pages** (`kickoffiva-web`). Base de datos: **Neon Postgres**.

```
www.kickoffiva.cl / kickoffiva.cl  →  frontend estático (dist/)
api.kickoffiva.cl/api/*            →  functions/api/[[path]].ts (Hono)  →  Neon Postgres
```

> El servicio antiguo en Railway (MySQL + login Kimi) **no** forma parte de este sistema
> y no recibe tráfico del sitio.

## Cómo desplegar (Windows, desde esta carpeta)

| Paso | Qué hace |
|---|---|
| `LOGIN-CLOUDFLARE.cmd` | Solo la primera vez en un PC: abre el navegador → **Allow** en Cloudflare. Guarda la sesión de Wrangler. |
| `DEPLOY.cmd` | `npm install` → tests + type-check de `functions/` → `npm run build` → `wrangler pages deploy` → verificación en vivo (`scripts/verify-api.mjs`). Deja el detalle en `deploy.log`. |
| `EXPORT.cmd` | Genera `Downloads\kickoffiva-web-src.zip` con el código (sin `node_modules`/`dist`). |

Los scripts usan el Node que instala Kimi (`%LOCALAPPDATA%\Programs\Kimi\resources\resources\runtime`) o
un Node 20+ del sistema. Si `DEPLOY.cmd` termina en `[ERROR]`, el motivo está en `deploy.log`.

Equivalente manual (cualquier SO, Node 20+):

```bash
npm install
node --test tests/*.test.mjs
npx tsc -p tsconfig.functions.json
npm run build
npx wrangler pages deploy            # requiere `npx wrangler login` una vez
node scripts/verify-api.mjs https://api.kickoffiva.cl
```

## Variables de entorno (Cloudflare Pages → Settings → Environment variables)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Connection string de Neon (`postgresql://...`) — secreto |
| `JWT_SECRET` | Firma de los tokens de sesión (30 días) — secreto |
| `SII_ENC_KEY` | 64 hex (32 bytes): cifrado AES-256-GCM de la clave SII — secreto |
| `CRON_SECRET` | Protege `/api/cron/*` (header `x-cron-secret`) — secreto, opcional |
| `SII_MOCK` | `1` = SII simulado; ausente/`0` = SII real |

Nunca van en el código ni en Git.

## Alarmas (cron diario)

Motor: `functions/_lib/alerts.ts` (mensajes día 5/10/11/12 + notificaciones SII) expuesto en
`/api/cron/generar`, `/api/cron/hoy`, `/api/cron/enviada` (header `x-cron-secret`).
Disparador: Worker `cron-worker/` (Cloudflare Cron Trigger, 12:07 UTC ≈ 09:07 Chile) que genera
las alertas, envía el **resumen diario por email al equipo** (links `wa.me` listos para reenviar por
WhatsApp) y, si `SEND_CLIENT_EMAILS=1`, el correo a cada cliente. La tabla `alerts` se crea sola.

Instalar/actualizar: `SETUP-ALARMAS.cmd` (genera el `CRON_SECRET`, lo guarda en Pages y en el Worker,
despliega ambos y hace una corrida de prueba → `alarmas-prueba.json`). Email vía [Resend](https://resend.com):
crea la cuenta, agrega la clave (`re_...`) cuando el script la pida o después con
`cd cron-worker && npx wrangler secret put RESEND_API_KEY`; para escribir a clientes verifica el dominio
`kickoffiva.cl` en Resend (registros DNS en Cloudflare) y pon `FROM_EMAIL`/`SEND_CLIENT_EMAILS` en `cron-worker/wrangler.toml`.
Prueba manual: `GET https://kickoffiva-cron.<subdominio>.workers.dev/run` con header `x-cron-secret`.
Tests: `cd cron-worker && node --test test/*.test.mjs`.

## Cifrado de datos

- **Registros del SII (`documents`)**: cada documento (fecha, RUT emisor, folio, razón social, montos)
  se guarda como un blob AES-256-GCM en `datos_enc`; en claro quedan solo empresa, período y tipo, más
  un índice ciego HMAC (`doc_hash`) para detectar duplicados. Llaves derivadas por HKDF desde `SII_ENC_KEY`.
  Toda lectura/escritura pasa por `functions/_lib/documents.ts`; los cálculos (cierre, alarmas, CSV) se
  hacen en la app tras descifrar. Filas antiguas en claro se migran solas (`POST /api/cron/migrar-documentos`,
  lo llama el Worker del cron). Esquema: `migrations/004_documents_cifrado.sql`.
- **Clave tributaria del SII**: AES-256-GCM (`functions/_lib/crypto.ts`), nunca en claro.
- **Contraseñas**: PBKDF2-SHA256, 100.000 iteraciones.
- Neon cifra además en reposo (AES-256) y en tránsito (TLS).
- Rotación de `SII_ENC_KEY` implica re-cifrar (no hay rotación automática todavía).

## Base de datos

- Esquema inicial: `migrations/001_init.sql` (ya aplicado en producción). Tabla `alerts`: `migrations/003_alerts.sql` (el cron la crea sola si falta).
- Candado anti-duplicado de empresas: `migrations/002_empresas_unicas.sql` (idempotente).
  Aplicar con:
  ```bash
  node scripts/apply-sql.mjs "<DATABASE_URL>" migrations/002_empresas_unicas.sql
  ```
  (o pegar el archivo en Neon → SQL Editor). El backend ya rechaza duplicados con 409 aunque
  el índice no exista; el índice es la segunda capa.

## Contrato de la API (resumen)

| Método y ruta | Respuestas |
|---|---|
| `POST /api/auth/register` `{email,password,nombre,telefono?}` | 201 `{token,user}` · 400 validación · 409 correo existe |
| `POST /api/auth/login` | 200 `{token,user}` · 401 credenciales |
| `GET /api/auth/me` | 200 `{user}` · 401 |
| `GET /api/empresas` · `POST /api/empresas` `{nombre,rut}` | 200 lista · 201 creada · 400 · **409 RUT repetido** |
| `GET /api/empresa` | 200 · **404 `Sin empresa`** (sesión válida, aún sin empresa) · 401 |
| `PUT /api/empresa/sii` · `PUT /api/empresa/ppm` | 200 · 400 (sin empresa / datos) · 401 |
| `GET /api/cierre/actual` · `/api/cierre/:periodo` | 200 · 400 sin empresa · 401 |
| `GET /api/libros/compra|venta?periodo=YYYY-MM` | CSV · 400 · 401 |
| `POST /api/sii/sincronizar` `{periodo:"AAAAMM"}` | 200 · 400 · 503 SII caído |

Regla: **401 solo cuando falta o es inválido el JWT.** El frontend (`src/lib/api.ts`) cierra la sesión
únicamente ante un 401 recibido con token enviado; login/register no envían token.
La empresa activa se elige con el header `x-company-id` (validado contra el usuario).

## Tests y QA

- `node --test tests/*.test.mjs` — RUT, sanitización, cifrado de documentos, lógica pura.
- `node tests/e2e-local.mjs` — cierre de IVA con datos de ejemplo (sin red).
- `node scripts/verify-api.mjs https://api.kickoffiva.cl` — 36 checks contra producción
  (crea cuentas `test.*@kickoffiva.cl` / `persona.*@kickoffiva.cl`; limpiar con el `DELETE` comentado
  al final de `migrations/002_empresas_unicas.sql`).
- Detalle: `docs/qa.md`.

## Estructura

```
src/            frontend (secciones en src/sections, cliente API en src/lib/api.ts, textos en src/config.ts)
functions/      backend Pages Functions (rutas en functions/api, utilidades en functions/_lib, SII en functions/_sii)
public/         estáticos: _headers (CSP/HSTS), _redirects, sitemap, PWA, páginas /servicios/*
migrations/     SQL de Neon
scripts/        deploy/verificación/utilidades
tests/          tests de Node (sin dependencias)
```

Historial de cambios recientes: `CAMBIOS-2026-09-27.md`.
