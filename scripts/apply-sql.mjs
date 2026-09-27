#!/usr/bin/env node
/**
 * scripts/apply-sql.mjs — aplica un archivo .sql a la base Neon (Postgres)
 * dentro de una transacción, usando el driver HTTP de Neon (sin psql).
 *
 * Uso (desde kickoffiva-web/):
 *   node scripts/apply-sql.mjs "<DATABASE_URL>" migrations/002_empresas_unicas.sql
 *
 * - El DATABASE_URL se pasa como argumento (o en la variable de entorno
 *   DATABASE_URL); nunca se guarda en el repo.
 * - Se ignoran comentarios (-- ...) y las líneas BEGIN/COMMIT: la transacción
 *   la maneja el driver (todo o nada).
 */
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const [, , urlArg, fileArg] = process.argv;
const url = (urlArg && !urlArg.endsWith('.sql') ? urlArg : process.env.DATABASE_URL) ?? '';
const file = fileArg ?? (urlArg && urlArg.endsWith('.sql') ? urlArg : '');

if (!url || !file) {
  console.error('uso: node scripts/apply-sql.mjs "<DATABASE_URL>" <archivo.sql>');
  console.error('     (o exporta DATABASE_URL y pasa solo el archivo)');
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error('DATABASE_URL debe empezar con postgres:// o postgresql:// (Neon).');
  process.exit(1);
}

const raw = await readFile(file, 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s && !/^(BEGIN|COMMIT|START TRANSACTION|END)$/i.test(s));

if (statements.length === 0) {
  console.error('El archivo no contiene sentencias SQL.');
  process.exit(1);
}

const sql = neon(url);
console.log(`Aplicando ${statements.length} sentencia(s) de ${file} ...`);
try {
  const results = await sql.transaction(statements.map((s) => sql.query(s)));
  results.forEach((r, i) => {
    const n = Array.isArray(r) ? r.length : (r?.rowCount ?? '');
    console.log(`  ok ${i + 1}/${statements.length}: ${statements[i].slice(0, 60).replace(/\s+/g, ' ')}... ${n === '' ? '' : `(${n} filas)`}`);
  });
  console.log('Listo: transacción confirmada.');
} catch (err) {
  console.error('Falló (nada se aplicó, se hizo rollback):', err?.message ?? err);
  process.exit(1);
}
