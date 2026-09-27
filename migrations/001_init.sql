-- KickoffIVA initial schema (applied separately; Pages Functions do not migrate).
BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id             text PRIMARY KEY,
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  rut            text NOT NULL,
  tasa_ppm       numeric NOT NULL DEFAULT 0.01,
  sii_rut        text,
  sii_clave_enc  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  periodo      char(7) NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('compra', 'venta')),
  fecha        date,
  rut_emisor   text,
  folio        text,
  neto         integer,
  iva          integer,
  total        integer,
  razon_social text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tipo, folio, rut_emisor)
);

CREATE INDEX IF NOT EXISTS documents_company_periodo_tipo_idx
  ON documents (company_id, periodo, tipo);

COMMIT;
