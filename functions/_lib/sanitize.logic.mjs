/**
 * Sanitización de texto de entrada — implementación pura, sin dependencias.
 *
 * Fuente de verdad; `sanitize.ts` la re-exporta con tipos para las Pages
 * Functions. Se mantiene en .mjs para probarla con `node --test` sin build.
 *
 * Regla: todo texto libre que entra por la API (nombre de persona, nombre de
 * empresa) pasa por `texto()` antes de tocar la base de datos.
 */

/**
 * Limpia un texto libre: quita < y > (anti-HTML), caracteres de control,
 * colapsa espacios, recorta y limita el largo.
 * @param {unknown} valor
 * @param {number} [max=120]
 * @returns {string}
 */
export function texto(valor, max = 120) {
  return String(valor ?? '')
    .replace(/[<>]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Normaliza un correo: recorta, minúsculas, largo máximo.
 * @param {unknown} valor
 * @returns {string}
 */
export function email(valor) {
  return String(valor ?? '').trim().toLowerCase().slice(0, 120);
}
