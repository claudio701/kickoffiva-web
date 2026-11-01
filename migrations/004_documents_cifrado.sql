-- 004_documents_cifrado.sql — KickoffIVA (Neon Postgres)
-- Cifrado de los registros del SII en la aplicación (AES-256-GCM, ver functions/_lib/documents.ts).
-- El backend agrega estas columnas solo (ensureDocSchema) y migra las filas legacy
-- vía POST /api/cron/migrar-documentos (lo llama el Worker del cron). Este archivo
-- documenta el esquema; aplicarlo a mano es opcional e idempotente.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS datos_enc text;   -- "v1." + base64(iv ‖ cipher ‖ tag)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_hash  text;   -- HMAC-SHA256(empresa|tipo|folio|RUT emisor)
CREATE UNIQUE INDEX IF NOT EXISTS documents_company_hash_uq ON documents (company_id, doc_hash);

-- Desde que se lee "Tipo Doc" del RCV, doc_hash = HMAC(empresa|tipo|folio|RUT|"dte"|tipoDoc),
-- para que una nota de crédito no se descarte como duplicado de la factura del mismo folio y RUT.
-- Las filas guardadas antes (sin tipoDoc en el blob) conservan su índice anterior y no requieren
-- SQL (el HMAC necesita la llave, que no está en la base): al volver a sincronizar ese período,
-- insertDoc reconoce la fila antigua (mismo índice sin tipo y mismos montos), la actualiza en su
-- lugar con el tipo y el índice nuevo, e inserta aparte la NC que antes se había descartado.

-- El job POST /api/cron/recifrar elimina solo las columnas en claro cuando ya no queda
-- ninguna fila que dependa de ellas (functions/_lib/documents.ts → eliminarColumnasLegacy).
-- Equivalente manual, SOLO si SELECT count(*) FROM documents WHERE datos_enc IS NULL = 0:
-- ALTER TABLE documents DROP COLUMN fecha, DROP COLUMN rut_emisor, DROP COLUMN folio,
--   DROP COLUMN razon_social, DROP COLUMN neto, DROP COLUMN iva, DROP COLUMN total;
