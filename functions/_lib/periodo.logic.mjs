/**
 * Períodos tributarios (YYYY-MM) — lógica pura, sin dependencias, para que
 * `node --test` la importe directo.
 *
 * El F29 que vence en un mes declara el mes ANTERIOR: el 10 de octubre se avisa
 * del IVA de septiembre, no del de octubre (que aún no cierra).
 */

/** Mes anterior a un período: "2026-01" → "2025-12". */
export function periodoAnterior(periodo) {
  const y = Number(periodo.slice(0, 4));
  const m = Number(periodo.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Período que se declara en la fecha dada (YYYY-MM-DD, hora Chile): el mes anterior. */
export function periodoTributario(fecha) {
  return periodoAnterior(fecha.slice(0, 7));
}
