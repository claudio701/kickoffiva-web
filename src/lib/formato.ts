// Formatos pensados para que cualquier persona los entienda.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-10" → "octubre 2026" (lo que entiende cualquier persona). */
export function mesLargo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return periodo;
  const nombre = MESES[Number(m[2]) - 1];
  return nombre ? `${nombre} ${m[1]}` : periodo;
}

/** Tasa PPM guardada como fracción (0.01) → "1%". */
export function tasaPpmTexto(tasa: number): string {
  const pct = Math.round(tasa * 100 * 100) / 100;
  return `${pct.toLocaleString("es-CL")}%`;
}

/** "2026-10" → "2026-09" (delta = -1) o "2026-11" (delta = +1). */
export function moverMes(periodo: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return periodo;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Plazo del F29 de un período: se declara y paga el mes siguiente, hasta el día 20
 * si se factura electrónicamente (el caso de casi todas las pymes) o el 12 si no.
 * "2026-10" → "20 de noviembre 2026".
 */
export function vencimientoF29(periodo: string, dia = 20): string {
  return `${dia} de ${mesLargo(moverMes(periodo, 1))}`;
}
