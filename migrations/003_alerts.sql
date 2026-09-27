-- 003_alerts.sql — KickoffIVA (Neon Postgres)
-- Tabla de alertas generadas por /api/cron/generar (día 5/10/11/12 + notificaciones SII).
-- Idempotente. El backend también la crea sola en el primer run del cron
-- (functions/api/cron.ts → ensureAlertsTable), así que aplicar esto es opcional.
CREATE TABLE IF NOT EXISTS alerts (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  periodo     char(7) NOT NULL,            -- 'YYYY-MM'
  tipo        text NOT NULL,               -- preparacion | faltan_libros | numero | recordatorio | ultimo_dia | sii_notif_*
  mensaje     text NOT NULL,
  telefono    text,
  fecha       date NOT NULL,               -- día en que corresponde enviarla (hora Chile)
  enviada_en  timestamptz,                 -- null = pendiente
  canal       text,                        -- 'email' | 'whatsapp' | 'manual'
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, periodo, tipo)
);

CREATE INDEX IF NOT EXISTS alerts_fecha_idx ON alerts (fecha);
