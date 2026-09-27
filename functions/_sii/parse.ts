/**
 * parse.ts — Fachada TypeScript del parser RCV.
 *
 * La lógica vive en `./parse.logic.mjs` (JavaScript puro, cero dependencias)
 * para que `node --test` pueda probarla sin compilar. Aquí solo se re-exporta
 * y se tipa el contrato público.
 */

// La lógica vive en el .mjs hermano (ver nota del encabezado).
export { parseRcvCsv, FormatoDesconocido } from './parse.logic.mjs';

/** Documento RCV normalizado (contrato del módulo). */
export interface DocumentoRcv {
  /** Fecha de emisión ISO YYYY-MM-DD (null si la celda era irreconocible). */
  fecha: string | null;
  /** RUT de la contraparte normalizado `cuerpo-dv` (sin puntos, DV mayúscula). */
  rutEmisor: string | null;
  /** Folio del documento, siempre como string. */
  folio: string;
  /** Monto neto afecto (pesos chilenos, entero). Negativo en notas de crédito. */
  neto: number;
  /** Monto IVA. Negativo en notas de crédito. */
  iva: number;
  /** Monto total del documento. */
  total: number;
  /** Razón social de la contraparte. */
  razonSocial: string | null;
}

export type TipoLibro = 'compra' | 'venta';
