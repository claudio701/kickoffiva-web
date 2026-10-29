/**
 * Bóveda de credenciales SII — AES-256-GCM con el llavero (keyring.logic.mjs).
 *
 * La clave tributaria se guarda en companies.sii_clave_enc como
 * "v2.<kid>.<base64>", cifrada con la subllave del propósito "sii-clave" y
 * amarrada (AAD) al id de la empresa: copiada a otra empresa no descifra.
 *
 * Valores heredados (base64 sin prefijo, cifrados con la llave maestra directa)
 * se siguen leyendo hasta que el job de recifrado los pase a v2.
 *
 * PRECAUCIÓN: la clave SII (clave tributaria) nunca se registra en logs
 * ni se expone en respuestas/errores.
 */
import { q, type Env } from './db';
import {
  llaveroDesdeEnv as _llaveroDesdeEnv,
  cifrar as _cifrar,
  descifrar as _descifrar,
  estaCifrado as _estaCifrado,
  descifrarClaveLegacy as _descifrarClaveLegacy,
} from './keyring.logic.mjs';

/** Entorno mínimo que necesita este módulo. */
export interface CryptoEnv {
  SII_ENC_KEY: string;
  SII_ENC_KEY_PREVIOUS?: string;
}

export interface Llave {
  hex: string;
  kid: string;
}
export interface Llavero {
  actual: Llave;
  llaves: readonly Llave[];
}

export const llaveroDesdeEnv: (env: CryptoEnv) => Promise<Llavero> = _llaveroDesdeEnv;
const cifrar: (l: Llavero, proposito: string, contexto: string, texto: string) => Promise<string> = _cifrar;
const descifrar: (l: Llavero, proposito: string, contexto: string, blob: string) => Promise<string> = _descifrar;
const estaCifrado: (v: unknown) => boolean = _estaCifrado;
const descifrarClaveLegacy: (l: Llavero, stored: string) => Promise<string> = _descifrarClaveLegacy;

const PROPOSITO_CLAVE = 'sii-clave';

/** Cifra la clave SII de una empresa → "v2.<kid>.<base64>". */
export async function encryptClave(env: CryptoEnv, companyId: string, plaintext: string): Promise<string> {
  return cifrar(await llaveroDesdeEnv(env), PROPOSITO_CLAVE, companyId, plaintext);
}

/**
 * Descifra la clave SII de una empresa (v2 o formato heredado). Lanza si el
 * valor fue alterado, pertenece a otra empresa o su llave no está en el llavero.
 */
export async function decryptClave(env: CryptoEnv, companyId: string, stored: string): Promise<string> {
  const llavero = await llaveroDesdeEnv(env);
  if (estaCifrado(stored)) return descifrar(llavero, PROPOSITO_CLAVE, companyId, stored);
  return descifrarClaveLegacy(llavero, stored);
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
  const clave = await decryptClave(env, companyId, row.sii_clave_enc);
  return { rut: row.sii_rut, clave };
}

/**
 * Recifra con la llave actual las claves SII que no lo estén (formato heredado o
 * llave anterior). Idempotente; una clave que no descifra se cuenta como error y
 * no se toca.
 */
export async function recifrarClaves(
  env: Env,
  limite = 500,
): Promise<{ recifradas: number; errores: number; pendientes: number }> {
  const llavero = await llaveroDesdeEnv(env);
  const prefijo = `v2.${llavero.actual.kid}.%`;
  const rows = (await q(
    env,
    `SELECT id, sii_clave_enc FROM companies
      WHERE sii_clave_enc IS NOT NULL AND sii_clave_enc NOT LIKE $1
      ORDER BY id LIMIT $2`,
    [prefijo, limite],
  )) as Array<{ id: string; sii_clave_enc: string }>;
  let recifradas = 0;
  let errores = 0;
  for (const r of rows) {
    try {
      const clave = await decryptClave(env, r.id, r.sii_clave_enc);
      const nueva = await encryptClave(env, r.id, clave);
      // Solo si nadie la cambió entre medio (el usuario pudo guardar una clave nueva).
      await q(env, `UPDATE companies SET sii_clave_enc = $2 WHERE id = $1 AND sii_clave_enc = $3`, [
        r.id,
        nueva,
        r.sii_clave_enc,
      ]);
      recifradas += 1;
    } catch {
      errores += 1;
    }
  }
  const rest = (await q(
    env,
    `SELECT count(*)::int AS n FROM companies WHERE sii_clave_enc IS NOT NULL AND sii_clave_enc NOT LIKE $1`,
    [prefijo],
  )) as { n: number }[];
  return { recifradas, errores, pendientes: Number(rest[0]?.n ?? 0) };
}
