// Decodifica los iconos PNG (guardados como base64 en scripts/icons.b64.json)
// hacia public/icons/. Se ejecuta en postinstall y prebuild, así el repo
// queda 100% texto (compatible con push vía API) y los binarios se regeneran
// solos en cualquier entorno (local, Cloudflare Pages, CI).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const store = JSON.parse(readFileSync(join(root, "scripts/icons.b64.json"), "utf-8"));
const outDir = join(root, "public/icons");
mkdirSync(outDir, { recursive: true });

let escritos = 0;
for (const [nombre, b64] of Object.entries(store)) {
  const destino = join(outDir, nombre);
  const buffer = Buffer.from(b64, "base64");
  if (!existsSync(destino) || readFileSync(destino).length !== buffer.length) {
    writeFileSync(destino, buffer);
    escritos++;
  }
}
console.log(`[decode-icons] ${escritos} iconos regenerados en public/icons/`);
