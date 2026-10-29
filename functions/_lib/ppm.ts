/**
 * Tasa de PPM de cada empresa: la fija el SII (p.ej. 0,25% en empresas nuevas Pro Pyme)
 * y la leemos de su propuesta de F29 (código 115). El cliente no tiene por qué saberla.
 *
 * companies.tasa_ppm_origen:
 *   'defecto' → aún no la pudimos leer; se usa el 1% inicial y el cálculo es estimado
 *   'sii'     → leída del SII (tasa_ppm_actualizada = cuándo)
 *   'manual'  → la cargó el equipo (PUT /api/empresa/ppm)
 */
import { q, type Env } from './db';
import type { SiiClient } from '../_sii/client';

export type OrigenPpm = 'defecto' | 'sii' | 'manual';

let columnasListas = false;
export async function asegurarColumnasPpm(env: Env): Promise<void> {
  if (columnasListas) return;
  await q(env, `ALTER TABLE companies ADD COLUMN IF NOT EXISTS tasa_ppm_origen text NOT NULL DEFAULT 'defecto'`);
  await q(env, `ALTER TABLE companies ADD COLUMN IF NOT EXISTS tasa_ppm_actualizada timestamptz`);
  columnasListas = true;
}

/**
 * Lee la tasa desde el SII con una sesión ya iniciada y la guarda. Best-effort: si el
 * SII no la entrega, deja la tasa como estaba. Devuelve la tasa leída o null.
 * Nunca pisa una tasa cargada a mano por el equipo con un dato vacío.
 */
export async function actualizarTasaPpmDesdeSii(
  env: Env,
  companyId: string,
  client: SiiClient,
  periodo: string, // AAAAMM
): Promise<number | null> {
  let tasa: number | null = null;
  try {
    tasa = await client.getTasaPpm(periodo);
  } catch {
    return null; // SII caído, WAF o sesión sin permiso para el F29: se reintenta otro día
  }
  if (tasa === null) return null;
  await asegurarColumnasPpm(env);
  await q(
    env,
    `UPDATE companies SET tasa_ppm = $2, tasa_ppm_origen = 'sii', tasa_ppm_actualizada = now() WHERE id = $1`,
    [companyId, tasa],
  );
  return tasa;
}
