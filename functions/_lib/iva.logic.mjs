/**
 * Pure IVA (Chilean VAT) calculation logic — plain JS ESM mirror.
 * This is the single source of truth; functions/_lib/iva.ts re-exports it.
 * Keep this file dependency-free so it can be imported directly by node --test.
 */

/**
 * @typedef {Object} DocSii
 * @property {string} [fecha]
 * @property {string} [rutEmisor]
 * @property {string|number} [folio]
 * @property {number} neto
 * @property {number} iva
 * @property {number} [total]
 */

/**
 * @typedef {Object} CierreResult
 * @property {number} ventasNetas
 * @property {number} comprasNetas
 * @property {number} debitoFiscal
 * @property {number} creditoFiscal
 * @property {number} remanenteAnterior
 * @property {number} ivaAPagar
 * @property {number} creditoArrastrable
 * @property {number} ppm
 * @property {number} totalAPagar
 */

/**
 * @param {DocSii[]} ventas
 * @param {DocSii[]} compras
 * @param {number} tasaPpm - PPM rate as a fraction (e.g. 0.01 for 1%)
 * @param {number} [remanenteAnterior] - remanente de crédito fiscal del período anterior
 *   (ver remanenteAcumulado); se suma al crédito del período (DL 825, art. 26).
 * @returns {CierreResult}
 */
export function calcCierre(ventas, compras, tasaPpm, remanenteAnterior = 0) {
  const ventasNetas = (ventas || []).reduce((acc, d) => acc + (d.neto || 0), 0);
  const comprasNetas = (compras || []).reduce((acc, d) => acc + (d.neto || 0), 0);
  const debitoFiscal = (ventas || []).reduce((acc, d) => acc + (d.iva || 0), 0);
  const creditoFiscal = (compras || []).reduce((acc, d) => acc + (d.iva || 0), 0);

  const remanente = Math.max(0, Math.round(remanenteAnterior || 0));
  const ivaAPagar = Math.max(0, debitoFiscal - creditoFiscal - remanente);
  const creditoArrastrable = Math.max(0, creditoFiscal + remanente - debitoFiscal);
  const ppm = Math.round(ventasNetas * (tasaPpm || 0));
  const totalAPagar = ivaAPagar + ppm;

  return {
    ventasNetas,
    comprasNetas,
    debitoFiscal,
    creditoFiscal,
    remanenteAnterior: remanente,
    ivaAPagar,
    creditoArrastrable,
    ppm,
    totalAPagar,
  };
}

/**
 * Remanente de crédito fiscal que llega a un período: el que no se usó se acumula al
 * crédito del período siguiente, y así sucesivamente (DL 825, art. 26).
 * Los períodos sin movimiento lo dejan pasar igual.
 *
 * TODO(norma): el art. 27 permite reajustar el remanente convirtiéndolo a UTM y
 * reconvirtiéndolo al imputarlo. No está implementado: no se pudo confirmar en sii.cl ni
 * en bcn.cl qué UTM usar (fecha en que debió pagarse vs. mes de la declaración), y el
 * modelo no tiene valores de UTM. Hasta entonces el remanente va en pesos nominales,
 * sin reajuste.
 *
 * @param {Array<{debito: number, credito: number}>} periodos - períodos ANTERIORES, en
 *   orden cronológico (el primero sin remanente previo).
 * @returns {number}
 */
export function remanenteAcumulado(periodos) {
  let remanente = 0;
  for (const p of periodos || []) {
    remanente = Math.max(0, (p.credito || 0) + remanente - (p.debito || 0));
  }
  return remanente;
}
