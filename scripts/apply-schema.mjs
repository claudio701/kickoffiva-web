import { neon } from '@neondatabase/serverless';

const url = process.argv[2];
if (!url) { console.error('usage: node apply-schema.mjs <DATABASE_URL>'); process.exit(1); }
const sql = neon(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS companies (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    rut text NOT NULL,
    tasa_ppm numeric NOT NULL DEFAULT 0.01,
    sii_rut text,
    sii_clave_enc text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    periodo char(7) NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('compra', 'venta')),
    fecha date,
    rut_emisor text,
    folio text,
    neto integer,
    iva integer,
    total integer,
    razon_social text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, tipo, folio, rut_emisor)
  )`,
  `CREATE INDEX IF NOT EXISTS documents_company_periodo_tipo_idx ON documents (company_id, periodo, tipo)`,
];

for (const s of statements) {
  await sql.query(s);
  console.log('OK:', s.slice(0, 60).replace(/\s+/g, ' '));
}

const tables = await sql.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`
);
console.log('Tablas:', tables.map((t) => t.table_name).join(', '));
