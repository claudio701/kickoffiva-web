/**
 * Cifrado de los registros del SII (tabla documents) — implementación pura
 * sobre WebCrypto (funciona igual en Cloudflare Workers y en Node 20+).
 *
 * Cada documento (fecha, RUT emisor, folio, razón social, montos) se guarda
 * como UN blob cifrado con AES-256-GCM en la columna `datos_enc`. En claro
 * quedan solo id, company_id, periodo, tipo y `doc_hash`: un índice ciego
 * HMAC-SHA256 para detectar duplicados sin exponer folio ni RUT.
 *
 * Llaves: derivadas con HKDF-SHA256 desde SII_ENC_KEY (32 bytes hex), con
 * `info` distinto para cifrar y para el HMAC. Así una sola llave maestra en
 * Cloudflare protege clave SII y documentos, y las llaves derivadas son
 * independientes entre sí.
 *
 * Formato de `datos_enc`: "v1." + base64(iv(12) ‖ ciphertext ‖ tag(16)).
 */

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const cache = new Map(); // masterHex -> Promise<{enc, mac}>

/** Deriva (y cachea) las llaves de cifrado y de HMAC desde la llave maestra. */
export function derivarLlaves(masterHex) {
  if (typeof masterHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(masterHex)) {
    throw new Error('SII_ENC_KEY inválida: se espera hex de 64 caracteres');
  }
  let p = cache.get(masterHex);
  if (!p) {
    p = (async () => {
      const master = await subtle.importKey('raw', hexToBytes(masterHex), 'HKDF', false, ['deriveKey']);
      const salt = te.encode('kickoffiva-documents');
      const enc = await subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('kickoffiva:documents:enc:v1') },
        master, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
      );
      const mac = await subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('kickoffiva:documents:mac:v1') },
        master, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign'],
      );
      return { enc, mac };
    })();
    cache.set(masterHex, p);
  }
  return p;
}

/** Normaliza un documento a los campos que se guardan (todo lo demás se ignora). */
export function normalizarDoc(d) {
  const folio = d.folio == null ? null : String(d.folio).trim() || null;
  return {
    fecha: d.fecha ? String(d.fecha).slice(0, 10) : null,
    rutEmisor: d.rutEmisor ? String(d.rutEmisor).trim() : null,
    folio,
    razonSocial: d.razonSocial ? String(d.razonSocial).trim().slice(0, 200) : null,
    neto: Math.round(Number(d.neto) || 0),
    iva: Math.round(Number(d.iva) || 0),
    total: d.total == null ? Math.round((Number(d.neto) || 0) + (Number(d.iva) || 0)) : Math.round(Number(d.total) || 0),
  };
}

/** Cifra un documento normalizado → string para la columna datos_enc. */
export async function cifrarDoc(masterHex, doc) {
  const { enc } = await derivarLlaves(masterHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, enc, te.encode(JSON.stringify(normalizarDoc(doc)))));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return 'v1.' + bytesToBase64(out);
}

/** Descifra datos_enc → documento normalizado. Lanza si el blob fue alterado. */
export async function descifrarDoc(masterHex, blob) {
  if (typeof blob !== 'string' || !blob.startsWith('v1.')) throw new Error('Documento cifrado con formato desconocido');
  const { enc } = await derivarLlaves(masterHex);
  const data = base64ToBytes(blob.slice(3));
  if (data.length < 12 + 16 + 1) throw new Error('Documento cifrado truncado');
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, enc, data.slice(12));
  return JSON.parse(td.decode(plain));
}

/**
 * Índice ciego para duplicados: HMAC(company_id | tipo | folio | rutEmisor).
 * Determinístico por llave; no revela folio ni RUT.
 */
export async function hashDoc(masterHex, companyId, tipo, doc) {
  const { mac } = await derivarLlaves(masterHex);
  const n = normalizarDoc(doc);
  const msg = [companyId, tipo, n.folio ?? '', (n.rutEmisor ?? '').replace(/[^0-9kK]/g, '').toUpperCase()].join('\u0000');
  const sig = await subtle.sign('HMAC', mac, te.encode(msg));
  return bytesToHex(new Uint8Array(sig));
}

/** Convierte una fila legacy (columnas en claro) al formato de documento. */
export function docDesdeLegacy(row) {
  return normalizarDoc({
    fecha: row.fecha ? new Date(row.fecha).toISOString().slice(0, 10) : null,
    rutEmisor: row.rut_emisor,
    folio: row.folio,
    razonSocial: row.razon_social,
    neto: row.neto,
    iva: row.iva,
    total: row.total,
  });
}
