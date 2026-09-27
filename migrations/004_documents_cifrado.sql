-- 004_documents_cifrado.sql — KickoffIVA (Neon Postgres)
-- Cifrado de los registros del SII en la aplicación (AES-256-GCM, ver functions/_lib/documents.ts).
-- El backend agrega estas columnas solo (ensureDocSchema) y migra las filas legacy
-- vía POST /api/cron/migrar-documentos (lo llama el Worker del cron). Este archivo
-- documenta el esquema; aplicarlo a mano es opcional e idempotente.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS datos_enc text;   -- "v1." + base64(iv ‖ cipher ‖ tag)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_hash  text;   -- HMAC-SHA256(empresa|tipo|folio|RUT emisor)
CREATE UNIQUE INDEX IF NOT EXISTS documents_company_hash_uq ON documents (company_id, doc_hash);

-- Cuando pendientes = 0 (todas las filas migradas), las columnas en claro se pueden eliminar:
-- ALTER TABLE documents DROP COLUMN fecha, DROP COLUMN rut_emisor, DROP COLUMN folio,
--   DROP COLUMN razon_social, DROP COLUMN neto, DROP COLUMN iva, DROP COLUMN total;
