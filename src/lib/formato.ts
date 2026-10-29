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
