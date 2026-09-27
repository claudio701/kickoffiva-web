/**
 * Utilidades de RUT chileno — implementación pura, sin dependencias.
 *
 * Este archivo es la fuente de verdad; `rut.ts` lo re-exporta con tipos
 * para el runtime de Cloudflare Pages Functions. Se mantiene en .mjs para
 * poder probarse directamente con `node --test` (sin build).
 */

/**
 * Quita puntos, guiones y cualquier carácter que no sea dígito o K.
 * Normaliza la k minúscula a mayúscula.
 * @param {string} rut
 * @returns {string} ej. "12.345.678-5" -> "123456785"
 */
export function limpiarRut(rut) {
  return String(rut ?? '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase();
}

/**
 * Calcula el dígito verificador (módulo 11) de un cuerpo de RUT.
 * @param {string} cuerpo solo dígitos
 * @returns {string} "0"-"9" o "K"
 */
export function dvModulo11(cuerpo) {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

/**
 * Valida formato y dígito verificador. Acepta entrada con o sin
 * puntos/guion y con k minúscula.
 * @param {string} rut
 * @returns {boolean}
 */
export function rutValido(rut) {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  // Evita cuerpos absurdos como "0" o "0000000"
  if (Number(cuerpo) < 1) return false;
  return dvModulo11(cuerpo) === dv;
}

/**
 * Formatea un RUT como 12.345.678-5 (o 8.888.888-K).
 * @param {string} rut
 * @returns {string}
 */
export function formatearRut(rut) {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return String(rut ?? '');
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${conPuntos}-${dv}`;
}
