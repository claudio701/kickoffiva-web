-- 002_empresas_unicas.sql — KickoffIVA (Neon Postgres)
-- Candado anti-duplicado a nivel de base: una cuenta no puede tener dos
-- empresas con el mismo RUT (comparado sin puntos/guion, K mayúscula).
--
-- Cómo correrlo: Neon console → proyecto kickoffiva → SQL Editor → pegar → Run.
-- Es idempotente: se puede correr más de una vez sin daño.
--
-- PASO A (obligatorio antes del B): borrar duplicados que quedaron de las
-- pruebas, conservando la empresa más antigua de cada (usuario, RUT).
-- Los documentos de las empresas borradas se eliminan en cascada
-- (FK company_id ON DELETE CASCADE); en producción real revisar antes.
BEGIN;

DELETE FROM companies a
USING companies b
WHERE a.user_id = b.user_id
  AND regexp_replace(upper(a.rut), '[^0-9K]', '', 'g')
    = regexp_replace(upper(b.rut), '[^0-9K]', '', 'g')
  AND (a.created_at > b.created_at OR (a.created_at = b.created_at AND a.id > b.id));

-- PASO B: índice único sobre el RUT normalizado.
CREATE UNIQUE INDEX IF NOT EXISTS companies_user_rut_unique
  ON companies (user_id, (regexp_replace(upper(rut), '[^0-9K]', '', 'g')));

COMMIT;

-- Opcional: limpiar cuentas de prueba creadas durante el diagnóstico.
-- DELETE FROM users WHERE email LIKE 'diag-claude-%@kickoffiva.cl'
--    OR email LIKE 'test.%@kickoffiva.cl' OR email LIKE 'persona.%@kickoffiva.cl';
