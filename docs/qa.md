# QA — KickoffIVA

Guía de verificación por capas. Todos los comandos se ejecutan desde `kickoffiva-web/` salvo que se indique lo contrario.

## Capas de verificación

| Capa | Comando | Qué atrapa | Qué NO atrapa |
|---|---|---|---|
| **Type-check frontend** | `npx tsc -p tsconfig.app.json --noEmit` | Errores de tipos en `src/` (React/Vite) | Lógica de negocio, contratos de API |
| **Type-check functions** | `npx tsc -p tsconfig.functions.json` | Errores de tipos en `functions/**/*.ts` (routers Hono, `_lib/`, `_sii/`) bajo strict + lib `WebWorker` | Tipos de runtime de Cloudflare (D1, KV) — `@cloudflare/workers-types` no está instalado, `types: []` a propósito; errores de binding D1 |
| **Unit tests** | `node --test tests/` | Tests de unidad que agregue el equipo bajo `tests/` | Integración entre módulos |
| **E2E local (lógica pura)** | `node tests/e2e-local.mjs` | Cálculo de IVA/cierre, parsing de CSV SII, validación de RUT contra valores calculados a mano (10 ventas + 6 compras) | Red, auth, D1, HTTP |
| **Verificación en vivo** | `node ../scripts/verify-api.mjs https://api.kickoffiva.cl` | Deploy sano: health, CORS, register/login, JWT, cierre, libros CSV, credenciales SII | Cálculos numéricos internos (los cubre el E2E local) |

> **Cuándo correr cada una:** type-checks y E2E local en cada commit; verificación en vivo después de cada deploy a Cloudflare Pages.

## 1. Type-check de las Pages Functions

`tsconfig.functions.json` es **separado** de los tsconfig de Vite (`tsconfig.app.json` / `tsconfig.node.json`, no tocarlos):

- `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler` — mismo estilo que la app.
- `lib: ["ES2022", "WebWorker"]` — el runtime de Pages Functions es un Worker, no el DOM del navegador.
- `types: []` — **evita** que TS cargue `vite/client` u otros ambientes; `@cloudflare/workers-types` **no está instalado**, así que los bindings (`env.DB`, etc.) se tipan como records genéricos hasta que se instale.
- `include: ["functions/**/*.ts"]`, `noEmit: true`.

```bash
npx tsc -p tsconfig.functions.json
```

Si `functions/` aún no existe (otros agentes la están creando), `tsc` reportará "No inputs were found" — es esperado hasta la integración.

## 2. Unit tests

```bash
node --test tests/
```

El runner nativo de Node ejecuta cualquier `tests/**/*.test.mjs` que se agregue. Hoy la cobertura principal es el E2E local (siguiente sección).

## 3. E2E local — lógica pura (sin servidor)

```bash
node tests/e2e-local.mjs
```

- **No levanta nada**: importa directamente los módulos espejo (`*.logic.mjs`) que las Functions comparten con Node.
- Sonda con `fs.existsSync` cada módulo: `functions/_lib/iva.logic.mjs`, `functions/_sii/parse.logic.mjs`, `functions/_lib/rut.logic.mjs`. Si falta alguno → **WARN** (no FAIL), para que el script sirva mientras otros agentes terminan.
- Simulación: 10 ventas de neto 100.000 + 6 compras de neto 50.000, parse de un CSV fixture tipo SII y `calcCierre`.
- Valores esperados (calculados a mano, IVA 19%): débito 190.000, crédito 57.000, **saldo a pagar 133.000**, 16 documentos parseados.
- Aserciones con `node:assert`; exit code 0 = OK / solo WARNs, 1 = falla.

## 4. Verificación en vivo (deploy)

```bash
# desde kickoffiva-web/
node ../scripts/verify-api.mjs https://api.kickoffiva.cl
```

Pasos: preflight CORS → health → register → login (JWT) → cierre actual → 401 sin Bearer → libros CSV → credenciales SII (`POST /api/empresa/sii`, WARN si 404). Paths sobreescribibles por variables de entorno (`PATH_*`). Exit code 0 si todo PASS.

## Nota wrangler (Cloudflare Pages Functions)

Para servir el frontend y las Functions juntas con D1:

```toml
# wrangler.toml (raíz del proyecto — referencia, lo crea el equipo de backend)
name = "kickoffiva"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "kickoffiva"
database_id = "<id-de-la-base>"
```

- `npm run build` → `dist/`; `npx wrangler pages deploy dist` publica estáticos **y** todo lo que haya en `functions/`.
- Local: `npx wrangler pages dev dist --d1 DB=<id>` da D1 real en desarrollo.
- El binding debe llamarse `DB` para coincidir con `env.DB` en las Functions.
