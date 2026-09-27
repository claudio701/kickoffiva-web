/**
 * Pure IVA (Chilean VAT) calculation — TypeScript facade.
 * Single source of truth lives in ./iva.logic.mjs (dependency-free plain JS
 * so node --test can import it without a TS toolchain); this file re-exports
 * it and adds the public typings used by the Pages Functions.
 */

export interface DocSii {
  fecha?: string;
  rutEmisor?: string;
  folio?: string | number;
  neto: number;
  iva: number;
  total?: number;
}

export interface CierreResult {
  ventasNetas: number;
  comprasNetas: number;
  debitoFiscal: number;
  creditoFiscal: number;
  ivaAPagar: number;
  creditoArrastrable: number;
  ppm: number;
  totalAPagar: number;
}

// @ts-ignore -- plain JS ESM mirror, typed via the interface above
import { calcCierre as calcCierreJs } from './iva.logic.mjs';

export const calcCierre: (
  ventas: DocSii[],
  compras: DocSii[],
  tasaPpm: number,
) => CierreResult = calcCierreJs;
