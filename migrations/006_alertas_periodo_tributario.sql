-- 006_alertas_periodo_tributario.sql — KickoffIVA (Neon Postgres)
-- Las alertas del F29 (preparacion, faltan_libros, numero, recordatorio, ultimo_dia)
-- se guardaban con periodo = mes calendario de `fecha`; desde este cambio se guardan
-- con el período que se declara (el mes anterior). Sin corregir las antiguas, la del
-- 5 de noviembre (periodo 2026-10) chocaría con la del 5 de octubre (que quedó como
-- 2026-10) en UNIQUE(company_id, periodo, tipo) y no se crearía.
--
-- Idempotente: una fila corregida ya no cumple periodo = mes de fecha. El backend lo
-- hace solo al primer run del cron (functions/_lib/alertas.ts → ensureAlertsTable),
-- así que aplicar esto a mano es opcional. Fila a fila y de la más antigua a la más
-- nueva, para no chocar con el UNIQUE mientras se corre.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM alerts
     WHERE tipo IN ('preparacion', 'faltan_libros', 'numero', 'recordatorio', 'ultimo_dia')
       AND periodo = to_char(fecha, 'YYYY-MM')
     ORDER BY fecha ASC, id ASC
  LOOP
    UPDATE alerts
       SET periodo = to_char(date_trunc('month', fecha) - interval '1 month', 'YYYY-MM')
     WHERE id = r.id;
  END LOOP;
END $$;
-- Nota: el texto de esas alertas antiguas (ya enviadas) sigue nombrando el mes
-- calendario; no se reescribe.
