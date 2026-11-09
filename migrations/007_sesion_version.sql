-- 007_sesion_version.sql — KickoffIVA (Neon Postgres)
-- Versión de sesión por usuario. Cada JWT lleva la versión vigente al firmarse
-- (claim `ver`); al restablecer la contraseña la versión sube y todas las
-- sesiones anteriores dejan de valer (incluida una sesión robada).
-- Los tokens emitidos antes de este cambio no traen `ver` y cuentan como 0,
-- así que nadie pierde su sesión al desplegar.
-- Idempotente: el backend también la crea sola
-- (functions/_lib/jwt.ts → asegurarSesionVersion).
ALTER TABLE users ADD COLUMN IF NOT EXISTS sesion_version integer NOT NULL DEFAULT 0;
