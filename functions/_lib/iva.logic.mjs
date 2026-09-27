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
 * @property {number} ivaAPagar
 * @property {number} creditoArrastrable
 * @property {number} ppm
 * @property {number} totalAPagar
 */

/**
 * @param {DocSii[]} ventas
 * @param {DocSii[]} compras
 * @param {number} tasaPpm - PPM rate as a fraction (e.g. 0.01 for 1%)
 * @returns {CierreResult}
 */
export function calcCierre(ventas, compras, tasaPpm) {
  const ventasNetas = (ventas || []).reduce((acc, d) => acc + (d.neto || 0), 0);
  const comprasNetas = (compras || []).reduce((acc, d) => acc + (d.neto || 0), 0);
  const debitoFiscal = (ventas || []).reduce((acc, d) => acc + (d.iva || 0), 0);
  const creditoFiscal = (compras || []).reduce((acc, d) => acc + (d.iva || 0), 0);

  const ivaAPagar = Math.max(0, debitoFiscal - creditoFiscal);
  const creditoArrastrable = Math.max(0, creditoFiscal - debitoFiscal);
  const ppm = Math.round(ventasNetas * (tasaPpm || 0));
  const totalAPagar = ivaAPagar + ppm;

  return {
    ventasNetas,
    comprasNetas,
    debitoFiscal,
    creditoFiscal,
    ivaAPagar,
    creditoArrastrable,
    ppm,
    totalAPagar,
  };
}
