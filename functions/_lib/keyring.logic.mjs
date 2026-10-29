/**
 * Llavero de cifrado de KickoffIVA — implementación pura sobre WebCrypto
 * (funciona igual en Cloudflare Workers y en Node 20+, sin dependencias).
 *
 * Todo dato sensible que viene del SII (clave tributaria, documentos del RCV,
 * mensajes de alerta con montos) se cifra aquí con AES-256-GCM.
 *
 * Llaves
 *   - SII_ENC_KEY            llave maestra ACTUAL (hex de 64 = 32 bytes). Cifra todo lo nuevo.
 *   - SII_ENC_KEY_PREVIOUS   llaves ANTERIORES separadas por coma (opcional). Solo descifran,
 *                            durante una rotación, hasta que el job de recifrado termine.
 *   Cada llave se identifica por un `kid` = 8 hex de SHA-256(etiqueta ‖ llave); el kid no
 *   revela la llave. Por cada propósito se deriva una subllave con HKDF-SHA256, así una
 *   subllave filtrada no sirve para otro tipo de dato.
 *
 * Formato:  "v2.<kid>." + base64(iv(12) ‖ ciphertext ‖ tag(16))
 *
 * Contexto (AAD): cada cifrado se amarra a `proposito` + `contexto` (el id de la empresa).
 * Copiar un valor cifrado a otra fila u otra empresa hace fallar el descifrado: alguien con
 * acceso de escritura a la base no puede, por ejemplo, poner la clave SII de la empresa A
 * en su propia empresa para que la app entre al SII con ella.
 */

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

const HEX64 = /^[0-9a-fA-F]{64}$/;
const BLOB_RE = /^v2\.([0-9a-f]{8})\.([A-Za-z0-9+/]+={0,2})$/;
const SALT = te.encode('kickoffiva-keyring');

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Identificador público de una llave maestra (no revela la llave). */
export async function kidDe(masterHex) {
  const material = new Uint8Array([...te.encode('kickoffiva:kid:'), ...hexToBytes(masterHex)]);
  const h = new Uint8Array(await subtle.digest('SHA-256', material));
  return bytesToHex(h.subarray(0, 4));
}

const llaveros = new Map(); // "actual|anteriores" -> Promise<Llavero>

/**
 * Arma el llavero desde la llave actual y las anteriores (CSV opcional).
 * Lanza (sin incluir valores en el mensaje) si alguna llave es inválida.
 */
export function crearLlavero(actualHex, anterioresCsv) {
  const cacheKey = `${actualHex}|${anterioresCsv ?? ''}`;
  let p = llaveros.get(cacheKey);
  if (p) return p;
  if (typeof actualHex !== 'string' || !HEX64.test(actualHex)) {
    throw new Error('SII_ENC_KEY inválida: se espera hex de 64 caracteres');
  }
  const anteriores = String(anterioresCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const a of anteriores) {
    if (!HEX64.test(a)) throw new Error('SII_ENC_KEY_PREVIOUS inválida: se esperan hex de 64 caracteres separados por coma');
  }
  const hexes = [];
  for (const h of [actualHex, ...anteriores]) {
    const n = h.toLowerCase();
    if (!hexes.includes(n)) hexes.push(n);
  }
  p = (async () => {
    const llaves = [];
    for (const hex of hexes) llaves.push(Object.freeze({ hex, kid: await kidDe(hex) }));
    if (new Set(llaves.map((l) => l.kid)).size !== llaves.length) {
      throw new Error('Dos llaves del llavero comparten identificador; genera otra llave');
    }
    return Object.freeze({ actual: llaves[0], llaves: Object.freeze(llaves) });
  })();
  llaveros.set(cacheKey, p);
  return p;
}

/** Llavero a partir de las variables de entorno. */
export function llaveroDesdeEnv(env) {
  return crearLlavero(env.SII_ENC_KEY, env.SII_ENC_KEY_PREVIOUS);
}

const subllaves = new Map(); // "hex|proposito" -> Promise<CryptoKey>
function subllave(hex, proposito) {
  const k = `${hex}|${proposito}`;
  let p = subllaves.get(k);
  if (!p) {
    p = subtle
      .importKey('raw', hexToBytes(hex), 'HKDF', false, ['deriveKey'])
      .then((master) =>
        subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: te.encode(`kickoffiva:${proposito}:enc:v2`) },
          master,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    subllaves.set(k, p);
  }
  return p;
}

function aad(proposito, contexto) {
  if (typeof proposito !== 'string' || !proposito) throw new Error('proposito requerido');
  if (typeof contexto !== 'string' || !contexto) throw new Error('contexto requerido');
  return te.encode(`${proposito}\u0000${contexto}`);
}

/** Cifra `texto` con la llave actual → "v2.<kid>.<base64>". */
export async function cifrar(llavero, proposito, contexto, texto) {
  const key = await subllave(llavero.actual.hex, proposito);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(proposito, contexto) }, key, te.encode(String(texto))),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return `v2.${llavero.actual.kid}.${bytesToBase64(out)}`;
}

/**
 * Descifra un valor "v2.". Lanza si el formato es otro, si la llave no está en el
 * llavero, si el valor fue alterado o si se usa con otro propósito/contexto.
 */
export async function descifrar(llavero, proposito, contexto, blob) {
  const m = typeof blob === 'string' ? BLOB_RE.exec(blob) : null;
  if (!m) throw new Error('Valor cifrado con formato desconocido');
  const llave = llavero.llaves.find((l) => l.kid === m[1]);
  if (!llave) throw new Error(`Valor cifrado con una llave que no está en el llavero (kid=${m[1]})`);
  const data = base64ToBytes(m[2]);
  if (data.length < 12 + 16) throw new Error('Valor cifrado truncado');
  const key = await subllave(llave.hex, proposito);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: aad(proposito, contexto) },
    key,
    data.slice(12),
  );
  return td.decode(plain);
}

/** ¿El valor tiene el formato cifrado v2? */
export function estaCifrado(valor) {
  return typeof valor === 'string' && BLOB_RE.test(valor);
}

/** ¿El valor ya está cifrado con la llave actual? (si no, el job de recifrado lo toma) */
export function cifradoConActual(llavero, valor) {
  return typeof valor === 'string' && valor.startsWith(`v2.${llavero.actual.kid}.`) && BLOB_RE.test(valor);
}

/** Prefijo SQL LIKE de los valores cifrados con la llave actual. */
export function prefijoActual(llavero) {
  return `v2.${llavero.actual.kid}.%`;
}

/**
 * Formato heredado de la clave SII (antes de v2): base64(iv ‖ ct ‖ tag) con la llave
 * maestra usada directo como AES-256-GCM, sin AAD. Prueba cada llave del llavero.
 */
export async function descifrarClaveLegacy(llavero, stored) {
  const data = base64ToBytes(stored);
  if (data.length < 12 + 16 + 1) throw new Error('Credencial SII almacenada con formato inválido');
  for (const l of llavero.llaves) {
    try {
      const key = await subtle.importKey('raw', hexToBytes(l.hex), { name: 'AES-GCM' }, false, ['decrypt']);
      const plain = await subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
      return td.decode(plain);
    } catch {
      /* siguiente llave */
    }
  }
  throw new Error('No se pudo descifrar la credencial SII con ninguna llave del llavero');
}
