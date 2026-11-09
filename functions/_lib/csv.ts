/**
 * Tiny CSV builder for Chilean-style semicolon-delimited files.
 * Escapes ; " and newlines per RFC-4180-style quoting, and neutralizes
 * spreadsheet formulas in text cells. Lógica en csv.logic.mjs (probada con node --test).
 */
import { buildCsv as _buildCsv } from './csv.logic.mjs';

export const buildCsv: (headers: (string | number)[], rows: (string | number)[][]) => string = _buildCsv;
