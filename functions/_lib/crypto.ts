/**
 * Bóveda de credenciales SII — AES-256-GCM con WebCrypto (Workers).
 *
 * La clave de cifrado viene de env.SII_ENC_KEY como hex de 64 caracteres
 * (32 bytes). El valor almacenado es base64(iv ‖ ciphertext ‖ tag), con
 * IV aleatorio de 12 bytes por cifrado. El tag GCM (16 bytes) lo anexa
 * WebCrypto al final del ciphertext, por lo que el layout es exactamente
 * iv(12) ‖ cipher(n) ‖ tag(16).
 *
 * PRECAUCIÓN: la clave SII (clave tributaria) nunca se registra en logs
 * ni se expone en respuestas/errores.
 */
import { q } from './db';

/** Entorno mínimo que necesita este módulo. */
export interface CryptoEnv {
  SII_ENC_KEY: string;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let cachedKey: Promise<CryptoKey> | null = null;

function getKey(env: CryptoEnv): Promise<CryptoKey> {
  if (!cachedKey) {
    const hex = env.SII_ENC_KEY;
    if (typeof hex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hex)) {
      // No incluir el valor en el error: podría terminar en logs.
      throw new Error('SII_ENC_KEY inválida: se espera hex de 64 caracteres');
    }
    cachedKey = crypto.subtle.importKey(
      'raw',
      hexToBytes(hex),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
  }
  return cachedKey;
}

/**
 * Cifra la clave SII. Devuelve base64(iv ‖ cipher ‖ tag).
 */
export async function encryptClave(env: CryptoEnv, plaintext: string): Promise<string> {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return bytesToBase64(out);
}

/**
 * Descifra un valor producido por encryptClave. Lanza si el formato o el
 * tag de autenticación no son válidos.
 */
export async function decryptClave(env: CryptoEnv, stored: string): Promise<string> {
  const key = await getKey(env);
  const data = base64ToBytes(stored);
  if (data.length < 12 + 16 + 1) {
    throw new Error('Credencial SII almacenada con formato inválido');
  }
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

export interface SiiCreds {
  rut: string;
  clave: string;
}

/**
 * Recupera y descifra las credenciales SII de una empresa.
 * Devuelve null si la empresa no existe o no tiene rut/clave configurados.
 */
export async function getSiiCreds(
  env: CryptoEnv,
  companyId: string,
): Promise<SiiCreds | null> {
  const rows = (await q(
    env as any,
    'SELECT sii_rut, sii_clave_enc FROM companies WHERE id = $1',
    [companyId],
  )) as Array<{ sii_rut: string | null; sii_clave_enc: string | null }>;
  const row = rows?.[0];
  if (!row || !row.sii_rut || !row.sii_clave_enc) return null;
  const clave = await decryptClave(env, row.sii_clave_enc);
  return { rut: row.sii_rut, clave };
}
