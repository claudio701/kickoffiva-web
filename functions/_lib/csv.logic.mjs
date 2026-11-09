/**
 * Constructor de CSV (separador ";", estilo Chile) — implementación pura.
 * Fuente de verdad; `csv.ts` la re-exporta con tipos. En .mjs para probarla
 * con `node --test` sin build.
 *
 * Anti inyección de fórmulas (CSV/formula injection, OWASP): un texto que
 * empieza con = + - @ tabulación o retorno de carro lo interpreta Excel como
 * fórmula (p.ej. una razón social "=HYPERLINK(...)"). A esos textos se les
 * antepone un apóstrofo. Los números (montos, incluidas las notas de crédito
 * en negativo) no se tocan: solo se neutralizan valores de tipo string.
 */

const INICIO_PELIGROSO = /^[=+\-@\t\r]/;

/**
 * @param {string | number} value
 * @returns {string}
 */
export function escapeCell(value) {
  let s = String(value);
  if (typeof value === 'string' && INICIO_PELIGROSO.test(s)) s = "'" + s;
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * @param {(string | number)[]} headers
 * @param {(string | number)[][]} rows
 * @returns {string} CSV (CRLF, salto final)
 */
export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(';')];
  for (const row of rows) lines.push(row.map(escapeCell).join(';'));
  return lines.join('\r\n') + '\r\n';
}
