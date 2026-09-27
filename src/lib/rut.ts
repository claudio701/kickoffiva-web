// ─── Validación de RUT chileno (módulo 11) ──────────────────────────────────

/** Limpia un RUT: quita puntos y guion, mayúsculas. "12.345.678-5" → "123456785". */
export function limpiarRut(rut: string): string {
  return rut.replace(/[.\-]/g, "").toUpperCase().trim();
}

/** Calcula el dígito verificador (módulo 11) para el cuerpo del RUT (solo dígitos). */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * Valida formato + dígito verificador de un RUT chileno.
 * Acepta con o sin puntos/guion: "12345678-5", "12.345.678-5", "123456785".
 */
export function rutValido(rut: string): boolean {
  const limpio = limpiarRut(rut);
  if (!/^[0-9]{7,8}[0-9K]$/.test(limpio)) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return digitoVerificador(cuerpo) === dv;
}

/** Formatea un RUT limpio a "12.345.678-5". Devuelve el input si no es parseable. */
export function formatearRut(rut: string): string {
  const limpio = limpiarRut(rut);
  if (!/^[0-9]{7,8}[0-9K]$/.test(limpio)) return rut;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${dv}`;
}
