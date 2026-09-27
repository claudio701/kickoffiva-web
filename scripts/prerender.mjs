/**
 * Prerender (SSG) de la home de KickoffIVA.
 *
 * 1. Compila src/entry-server.tsx a un bundle Node (dist-ssr/) con Vite SSR.
 * 2. Importa el bundle y ejecuta render() → HTML completo de la home.
 * 3. Inyecta ese HTML dentro de <div id="root"> en dist/index.html.
 *    El cliente (src/main.tsx) detecta el contenido y usa hydrateRoot.
 *
 * Se encadena después de `vite build` en el script "build" de package.json.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ssrOutDir = resolve(root, "dist-ssr");
const ssrEntry = resolve(ssrOutDir, "entry-server.js");
const distIndex = resolve(root, "dist", "index.html");

// 1. Build SSR (bundle ESM para Node; package.json tiene "type": "module")
const viteBin = resolve(root, "node_modules", "vite", "bin", "vite.js");
execFileSync(
  process.execPath,
  [viteBin, "build", "--ssr", "src/entry-server.tsx", "--outDir", "dist-ssr"],
  { stdio: "inherit", cwd: root }
);

if (!existsSync(ssrEntry)) {
  throw new Error(`[prerender] No se generó ${ssrEntry}`);
}

// 2. Render en Node
const { render } = await import(pathToFileURL(ssrEntry).href);
const html = render();
if (!html || html.length < 500) {
  throw new Error(`[prerender] render() devolvió HTML sospechosamente corto (${html.length} chars)`);
}

// 3. Inyección en dist/index.html.
// split/join en vez de replace(): el HTML puede contener `$&`, `$'` etc.,
// que String.replace interpretaría como patrones especiales.
const MARKER = '<div id="root"></div>';
const template = readFileSync(distIndex, "utf8");
if (!template.includes(MARKER)) {
  throw new Error(`[prerender] No se encontró ${MARKER} en dist/index.html`);
}
const out = template.split(MARKER).join(`<div id="root">${html}</div>`);
writeFileSync(distIndex, out);

// Limpieza: el bundle SSR es un artefacto intermedio, no se despliega.
rmSync(ssrOutDir, { recursive: true, force: true });

console.log(
  `[prerender] OK — dist/index.html: ${template.length} → ${out.length} bytes (+${html.length} de HTML prerenderizado)`
);

// 4. Versión de caché del service worker inyectada en build.
// Identificador único por build: hash corto del HTML prerenderizado (cambia
// con cualquier cambio de contenido o del hash del asset index-*.js que
// referencia) + timestamp, para garantizar rotación incluso en rebuilds
// idénticos. Así cada deploy crea una caché nueva y el `activate` del SW
// borra la anterior automáticamente.
const swPath = resolve(root, "dist", "sw.js");
const swSource = readFileSync(swPath, "utf8");
if (!swSource.includes("__BUILD_VERSION__")) {
  throw new Error(`[prerender] dist/sw.js no contiene el placeholder __BUILD_VERSION__`);
}
const buildVersion = `${createHash("sha256").update(out).digest("hex").slice(0, 10)}-${Date.now().toString(36)}`;
writeFileSync(swPath, swSource.split("__BUILD_VERSION__").join(buildVersion));
console.log(`[prerender] OK — dist/sw.js: caché de build "kickoffiva-${buildVersion}"`);
