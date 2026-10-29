/**
 * Estado de la clave SII de cada empresa: si el portal la rechazó, se marca y
 * no se vuelve a usar hasta que el cliente guarde una clave nueva.
 *
 * Por qué: reintentar a diario una clave rechazada puede bloquear la Clave
 * Tributaria del cliente en el SII. Un solo rechazo basta para detener los
 * reintentos automáticos (cron) y manuales (sincronizar).
 */
import { q, type Env } from './db';

let columnaLista = false;

/** Crea la columna si falta (idempotente; equivale a migrations/005). */
export async function asegurarColumnaRechazo(env: Env): Promise<void> {
  if (columnaLista) return;
  await q(env, `ALTER TABLE companies ADD COLUMN IF NOT EXISTS sii_clave_rechazada_en timestamptz`);
  columnaLista = true;
}

/** Marca la clave de la empresa como rechazada por el SII. */
export async function marcarClaveRechazada(env: Env, companyId: string): Promise<void> {
  await asegurarColumnaRechazo(env);
  await q(env, `UPDATE companies SET sii_clave_rechazada_en = now() WHERE id = $1`, [companyId]);
}

/** true si el SII rechazó la clave guardada y el cliente aún no la reemplaza. */
export async function claveRechazada(env: Env, companyId: string): Promise<boolean> {
  await asegurarColumnaRechazo(env);
  const rows = (await q(env, `SELECT sii_clave_rechazada_en FROM companies WHERE id = $1`, [
    companyId,
  ])) as Array<{ sii_clave_rechazada_en: string | null }>;
  return Boolean(rows?.[0]?.sii_clave_rechazada_en);
}
