-- 005_sii_clave_rechazada.sql — KickoffIVA (Neon Postgres)
-- Marca de clave SII rechazada por el portal. Mientras no sea NULL, ni el cron
-- ni la sincronización manual vuelven a usar esa clave (evita bloquear la
-- Clave Tributaria del cliente por reintentos). Se limpia al guardar una clave
-- nueva o al borrarla. Idempotente: el backend también la crea sola
-- (functions/_lib/sii-estado.ts → asegurarColumnaRechazo).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sii_clave_rechazada_en timestamptz;

-- Limpieza única: las cuentas que crea scripts/verify-api.mjs en cada deploy
-- (email prueba.<timestamp>@kickoffiva.cl) quedaban con una clave SII falsa
-- guardada para el RUT 76.123.456-0, y el cron la intentaba a diario contra el
-- SII real. Se borran esas credenciales; las cuentas de prueba no tienen datos reales.
UPDATE companies c
   SET sii_rut = NULL, sii_clave_enc = NULL, sii_clave_rechazada_en = NULL
  FROM users u
 WHERE u.id = c.user_id
   AND u.email LIKE 'prueba.%@kickoffiva.cl'
   AND c.sii_clave_enc IS NOT NULL;
