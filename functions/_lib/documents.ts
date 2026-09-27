/**
 * Acceso a la tabla `documents` con cifrado en la aplicación.
 * Toda lectura/escritura de documentos del SII pasa por aquí.
 *
 * - insertDoc: cifra + índice ciego; ON CONFLICT (company_id, doc_hash) → duplicado.
 * - loadDocs:  lee y descifra; las filas legacy (sin datos_enc) se leen de las
 *              columnas en claro hasta que se migren.
 * - ensureDocSchema: agrega columnas/índice si faltan (idempotente, 1 vez por isolate).
 * - migrateLegacyDocs: cifra las filas legacy y borra sus columnas en claro.
 */
import { q, type Env } from './db';
import {
  cifrarDoc as _cifrar,
  descifrarDoc as _descifrar,
  hashDoc as _hash,
  normalizarDoc as _normalizar,
  docDesdeLegacy as _desdeLegacy,
} from './doccrypto.logic.mjs';

export interface DocGuardado {
  fecha: string | null;
  rutEmisor: string | null;
  folio: string | null;
  razonSocial: string | null;
  neto: number;
  iva: number;
  total: number;
}
export interface DocEntrada {
  fecha?: string | null;
  rutEmisor?: string | null;
  folio?: string | number | null;
  razonSocial?: string | null;
  neto?: number;
  iva?: number;
  total?: number | null;
}
export interface DocLeido extends DocGuardado {
  id: string;
  companyId: string;
  tipo: 'compra' | 'venta';
  periodo: string;
}

const cifrarDoc: (k: string, d: DocEntrada) => Promise<string> = _cifrar;
const descifrarDoc: (k: string, blob: string) => Promise<DocGuardado> = _descifrar;
const hashDoc: (k: string, companyId: string, tipo: string, d: DocEntrada) => Promise<string> = _hash;
export const normalizarDoc: (d: DocEntrada) => DocGuardado = _normalizar;
const docDesdeLegacy: (row: Record<string, unknown>) => DocGuardado = _desdeLegacy;

function llave(env: Env): string {
  const k = env.SII_ENC_KEY;
  if (typeof k !== 'string' || !/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('SII_ENC_KEY inválida: se espera hex de 64 caracteres');
  }
  return k;
}

let schemaChecked = false;
export async function ensureDocSchema(env: Env): Promise<void> {
  if (schemaChecked) return;
  await q(env, `ALTER TABLE documents ADD COLUMN IF NOT EXISTS datos_enc text`);
  await q(env, `ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_hash text`);
  await q(env, `CREATE UNIQUE INDEX IF NOT EXISTS documents_company_hash_uq ON documents (company_id, doc_hash)`);
  schemaChecked = true;
}

/** Inserta un documento cifrado. Devuelve true si se insertó, false si era duplicado. */
export async function insertDoc(
  env: Env,
  companyId: string,
  periodo: string,
  tipo: 'compra' | 'venta',
  doc: DocEntrada,
): Promise<boolean> {
  await ensureDocSchema(env);
  const k = llave(env);
  const [blob, hash] = await Promise.all([cifrarDoc(k, doc), hashDoc(k, companyId, tipo, doc)]);
  const rows = (await q(
    env,
    `INSERT INTO documents (id, company_id, periodo, tipo, datos_enc, doc_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, doc_hash) DO NOTHING
     RETURNING id`,
    [crypto.randomUUID(), companyId, periodo, tipo, blob, hash],
  )) as { id: string }[];
  return rows.length > 0;
}

interface RawRow {
  id: string;
  company_id: string;
  periodo: string;
  tipo: 'compra' | 'venta';
  datos_enc: string | null;
  fecha: string | null;
  rut_emisor: string | null;
  folio: string | number | null;
  razon_social: string | null;
  neto: number | string | null;
  iva: number | string | null;
  total: number | string | null;
}

async function decodeRow(k: string, r: RawRow): Promise<DocLeido> {
  const d = r.datos_enc ? await descifrarDoc(k, r.datos_enc) : docDesdeLegacy(r as unknown as Record<string, unknown>);
  return { ...d, id: r.id, companyId: r.company_id, tipo: r.tipo, periodo: r.periodo };
}

/** Lee (y descifra) los documentos de una empresa y período; tipo opcional. */
export async function loadDocs(
  env: Env,
  companyId: string,
  periodo: string,
  tipo?: 'compra' | 'venta',
): Promise<DocLeido[]> {
  await ensureDocSchema(env);
  const k = llave(env);
  const rows = (await q(
    env,
    `SELECT id, company_id, periodo, tipo, datos_enc, fecha, rut_emisor, folio, razon_social, neto, iva, total
       FROM documents
      WHERE company_id = $1 AND periodo = $2 ${tipo ? 'AND tipo = $3' : ''}`,
    tipo ? [companyId, periodo, tipo] : [companyId, periodo],
  )) as RawRow[];
  const docs = await Promise.all(rows.map((r) => decodeRow(k, r)));
  docs.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '') || (a.folio ?? '').localeCompare(b.folio ?? '', undefined, { numeric: true }));
  return docs;
}

/** Lee (y descifra) TODOS los documentos de un período, agrupados por empresa (para el cron). */
export async function loadDocsPeriodo(env: Env, periodo: string): Promise<Map<string, DocLeido[]>> {
  await ensureDocSchema(env);
  const k = llave(env);
  const rows = (await q(
    env,
    `SELECT id, company_id, periodo, tipo, datos_enc, fecha, rut_emisor, folio, razon_social, neto, iva, total
       FROM documents WHERE periodo = $1`,
    [periodo],
  )) as RawRow[];
  const out = new Map<string, DocLeido[]>();
  for (const r of rows) {
    const d = await decodeRow(k, r);
    const arr = out.get(d.companyId) ?? [];
    arr.push(d);
    out.set(d.companyId, arr);
  }
  return out;
}

/** Cifra las filas legacy (sin datos_enc) y limpia sus columnas en claro. Idempotente. */
export async function migrateLegacyDocs(env: Env, limite = 500): Promise<{ migradas: number; pendientes: number }> {
  await ensureDocSchema(env);
  const k = llave(env);
  const rows = (await q(
    env,
    `SELECT id, company_id, periodo, tipo, datos_enc, fecha, rut_emisor, folio, razon_social, neto, iva, total
       FROM documents WHERE datos_enc IS NULL LIMIT $1`,
    [limite],
  )) as RawRow[];
  let migradas = 0;
  for (const r of rows) {
    const doc = docDesdeLegacy(r as unknown as Record<string, unknown>);
    const [blob, hash] = await Promise.all([cifrarDoc(k, doc), hashDoc(k, r.company_id, r.tipo, doc)]);
    const upd = (await q(
      env,
      `UPDATE documents
          SET datos_enc = $2, doc_hash = $3,
              fecha = NULL, rut_emisor = NULL, folio = NULL, razon_social = NULL, neto = NULL, iva = NULL, total = NULL
        WHERE id = $1
          AND NOT EXISTS (SELECT 1 FROM documents d2 WHERE d2.company_id = $4 AND d2.doc_hash = $3 AND d2.id <> $1)
        RETURNING id`,
      [r.id, blob, hash, r.company_id],
    )) as { id: string }[];
    if (upd.length > 0) migradas += 1;
    else await q(env, `DELETE FROM documents WHERE id = $1`, [r.id]); // duplicado legacy: se descarta
  }
  const rest = (await q(env, `SELECT count(*)::int AS n FROM documents WHERE datos_enc IS NULL`)) as { n: number }[];
  return { migradas, pendientes: Number(rest[0]?.n ?? 0) };
}
