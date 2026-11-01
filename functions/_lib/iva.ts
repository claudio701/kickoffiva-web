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
  /** Remanente de crédito fiscal que viene del período anterior (DL 825, art. 26). */
  remanenteAnterior: number;
  ivaAPagar: number;
  creditoArrastrable: number;
  ppm: number;
  totalAPagar: number;
}

// @ts-ignore -- plain JS ESM mirror, typed via the interface above
import { calcCierre as calcCierreJs, remanenteAcumulado as remanenteAcumuladoJs } from './iva.logic.mjs';

export const calcCierre: (
  ventas: DocSii[],
  compras: DocSii[],
  tasaPpm: number,
  remanenteAnterior?: number,
) => CierreResult = calcCierreJs;

export const remanenteAcumulado: (periodos: Array<{ debito: number; credito: number }>) => number =
  remanenteAcumuladoJs;
