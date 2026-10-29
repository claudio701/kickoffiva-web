/**
 * Acceso a la tabla `documents` con cifrado en la aplicación.
 * Toda lectura/escritura de documentos del SII pasa por aquí.
 *
 * - insertDoc: cifra (v2, llave actual) + índice ciego; un duplicado (por el índice de
 *              cualquier llave del llavero) no se inserta.
 * - loadDocs:  lee y descifra v2 o v1; las filas legacy (sin datos_enc) se leen de las
 *              columnas en claro mientras esas columnas existan.
 * - recifrarDocs: pasa a v2 con la llave actual todo lo que no lo esté (legacy en claro,
 *              v1, o v2 con una llave anterior) y limpia las columnas en claro.
 * - eliminarColumnasLegacy: borra las columnas en claro cuando ya no queda nada en ellas.
 */
import { q, type Env } from './db';
import { llaveroDesdeEnv, type Llavero } from './crypto';
import {
  normalizarDoc as _normalizar,
  docDesdeLegacy as _desdeLegacy,
  cifrarDocV2 as _cifrarV2,
  descifrarDocAlguno as _descifrarAlguno,
  hashesDoc as _hashes,
} from './doccrypto.logic.mjs';
import { prefijoActual as _prefijoActual } from './keyring.logic.mjs';

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

export const normalizarDoc: (d: DocEntrada) => DocGuardado = _normalizar;
const docDesdeLegacy: (row: Record<string, unknown>) => DocGuardado = _desdeLegacy;
const cifrarDocV2: (l: Llavero, companyId: string, d: DocEntrada) => Promise<string> = _cifrarV2;
const descifrarDocAlguno: (l: Llavero, companyId: string, blob: string) => Promise<DocGuardado> = _descifrarAlguno;
const hashesDoc: (l: Llavero, companyId: string, tipo: string, d: DocEntrada) => Promise<string[]> = _hashes;
const prefijoActual: (l: Llavero) => string = _prefijoActual;

const COLUMNAS_LEGACY = ['fecha', 'rut_emisor', 'folio', 'razon_social', 'neto', 'iva', 'total'] as const;

let schemaChecked = false;
export async function ensureDocSchema(env: Env): Promise<void> {
  if (schemaChecked) return;
  await q(env, `ALTER TABLE documents ADD COLUMN IF NOT EXISTS datos_enc text`);
  await q(env, `ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_hash text`);
  await q(env, `CREATE UNIQUE INDEX IF NOT EXISTS documents_company_hash_uq ON documents (company_id, doc_hash)`);
  schemaChecked = true;
}

/** ¿Siguen existiendo las columnas en claro? (cacheado por isolate) */
let legacyCols: boolean | null = null;
async function hayColumnasLegacy(env: Env): Promise<boolean> {
  if (legacyCols !== null) return legacyCols;
  const rows = (await q(
    env,
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'documents' AND column_name = ANY($1::text[])`,
    [COLUMNAS_LEGACY as unknown as string[]],
  )) as { n: number }[];
  legacyCols = Number(rows[0]?.n ?? 0) > 0;
  return legacyCols;
}

/**
 * SELECT de documentos que incluye las columnas en claro solo si existen. Si otro
 * isolate las borró entre medio (undefined_column), refresca el cache y reintenta.
 */
async function selectDocs(env: Env, where: string, params: unknown[]): Promise<RawRow[]> {
  for (let intento = 0; ; intento++) {
    const legacy = await hayColumnasLegacy(env);
    const cols = `id, company_id, periodo, tipo, datos_enc${legacy ? ', ' + COLUMNAS_LEGACY.join(', ') : ''}`;
    try {
      return (await q(env, `SELECT ${cols} FROM documents ${where}`, params)) as RawRow[];
    } catch (e) {
      if (intento === 0 && legacy && (e as { code?: string }).code === '42703') {
        legacyCols = null;
        continue;
      }
      throw e;
    }
  }
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
  const llavero = await llaveroDesdeEnv(env);
  const [hashes, blob] = await Promise.all([
    hashesDoc(llavero, companyId, tipo, doc),
    cifrarDocV2(llavero, companyId, doc),
  ]);
  // Durante una rotación, una fila aún no recifrada tiene el índice de una llave anterior.
  if (hashes.length > 1) {
    const ya = await q(
      env,
      `SELECT 1 FROM documents WHERE company_id = $1 AND doc_hash = ANY($2::text[]) LIMIT 1`,
      [companyId, hashes.slice(1)],
    );
    if (ya.length > 0) return false;
  }
  const rows = (await q(
    env,
    `INSERT INTO documents (id, company_id, periodo, tipo, datos_enc, doc_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, doc_hash) DO NOTHING
     RETURNING id`,
    [crypto.randomUUID(), companyId, periodo, tipo, blob, hashes[0]],
  )) as { id: string }[];
  return rows.length > 0;
}

interface RawRow {
  id: string;
  company_id: string;
  periodo: string;
  tipo: 'compra' | 'venta';
  datos_enc: string | null;
  fecha?: string | null;
  rut_emisor?: string | null;
  folio?: string | number | null;
  razon_social?: string | null;
  neto?: number | string | null;
  iva?: number | string | null;
  total?: number | string | null;
}

async function decodificar(llavero: Llavero, r: RawRow): Promise<DocGuardado> {
  if (r.datos_enc) return descifrarDocAlguno(llavero, r.company_id, r.datos_enc);
  if (!('fecha' in r)) throw new Error('Documento sin datos cifrados ni columnas legacy');
  return docDesdeLegacy(r as unknown as Record<string, unknown>);
}

async function decodeRow(llavero: Llavero, r: RawRow): Promise<DocLeido> {
  const d = await decodificar(llavero, r);
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
  const llavero = await llaveroDesdeEnv(env);
  const rows = await selectDocs(
    env,
    `WHERE company_id = $1 AND periodo = $2 ${tipo ? 'AND tipo = $3' : ''}`,
    tipo ? [companyId, periodo, tipo] : [companyId, periodo],
  );
  const docs = await Promise.all(rows.map((r) => decodeRow(llavero, r)));
  docs.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '') || (a.folio ?? '').localeCompare(b.folio ?? '', undefined, { numeric: true }));
  return docs;
}

/** Lee (y descifra) TODOS los documentos de un período, agrupados por empresa (para el cron). */
export async function loadDocsPeriodo(env: Env, periodo: string): Promise<Map<string, DocLeido[]>> {
  await ensureDocSchema(env);
  const llavero = await llaveroDesdeEnv(env);
  const rows = await selectDocs(env, `WHERE periodo = $1`, [periodo]);
  const out = new Map<string, DocLeido[]>();
  for (const r of rows) {
    const d = await decodeRow(llavero, r);
    const arr = out.get(d.companyId) ?? [];
    arr.push(d);
    out.set(d.companyId, arr);
  }
  return out;
}

export interface ResultadoRecifrado {
  recifrados: number;
  duplicadosEliminados: number;
  errores: number;
  pendientes: number;
}

/**
 * Pasa a v2 con la llave actual las filas que no lo estén (legacy en claro, v1 o v2 de
 * una llave anterior), recalcula el índice ciego y borra las columnas en claro de la
 * fila. Una fila cuyo índice nuevo ya existe es un duplicado y se elimina. Idempotente.
 */
export async function recifrarDocs(env: Env, limite = 500): Promise<ResultadoRecifrado> {
  await ensureDocSchema(env);
  const llavero = await llaveroDesdeEnv(env);
  const prefijo = prefijoActual(llavero);
  const rows = await selectDocs(
    env,
    `WHERE datos_enc IS NULL OR datos_enc NOT LIKE $1 ORDER BY id LIMIT $2`,
    [prefijo, limite],
  );
  const limpiarLegacy = (await hayColumnasLegacy(env))
    ? ', ' + COLUMNAS_LEGACY.map((c) => `${c} = NULL`).join(', ')
    : '';
  let recifrados = 0;
  let duplicadosEliminados = 0;
  let errores = 0;
  for (const r of rows) {
    try {
      const doc = await decodificar(llavero, r);
      const [blob, hashes] = await Promise.all([
        cifrarDocV2(llavero, r.company_id, doc),
        hashesDoc(llavero, r.company_id, r.tipo, doc),
      ]);
      const upd = (await q(
        env,
        `UPDATE documents SET datos_enc = $2, doc_hash = $3${limpiarLegacy}
          WHERE id = $1
            AND NOT EXISTS (SELECT 1 FROM documents d2 WHERE d2.company_id = $4 AND d2.doc_hash = $3 AND d2.id <> $1)
          RETURNING id`,
        [r.id, blob, hashes[0], r.company_id],
      )) as { id: string }[];
      if (upd.length > 0) recifrados += 1;
      else {
        await q(env, `DELETE FROM documents WHERE id = $1`, [r.id]); // duplicado: ya existe recifrado
        duplicadosEliminados += 1;
      }
    } catch {
      errores += 1; // p.ej. llave anterior ya retirada del llavero: se reporta, no se borra
    }
  }
  const rest = (await q(
    env,
    `SELECT count(*)::int AS n FROM documents WHERE datos_enc IS NULL OR datos_enc NOT LIKE $1`,
    [prefijo],
  )) as { n: number }[];
  return { recifrados, duplicadosEliminados, errores, pendientes: Number(rest[0]?.n ?? 0) };
}

/**
 * Borra de la tabla las columnas en claro (fecha, rut_emisor, folio, razon_social,
 * neto, iva, total) SOLO si ninguna fila depende de ellas: todas tienen datos_enc y
 * todas esas columnas están vacías. Idempotente.
 */
export async function eliminarColumnasLegacy(
  env: Env,
): Promise<{ eliminadas: boolean; yaNoExistian?: boolean; filasPendientes?: number }> {
  await ensureDocSchema(env);
  if (!(await hayColumnasLegacy(env))) return { eliminadas: false, yaNoExistian: true };
  const conDatos = COLUMNAS_LEGACY.map((c) => `${c} IS NOT NULL`).join(' OR ');
  const rows = (await q(
    env,
    `SELECT count(*)::int AS n FROM documents WHERE datos_enc IS NULL OR ${conDatos}`,
  )) as { n: number }[];
  const n = Number(rows[0]?.n ?? 0);
  if (n > 0) return { eliminadas: false, filasPendientes: n };
  await q(env, `ALTER TABLE documents ${COLUMNAS_LEGACY.map((c) => `DROP COLUMN IF EXISTS ${c}`).join(', ')}`);
  legacyCols = false;
  return { eliminadas: true };
}
