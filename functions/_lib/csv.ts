/**
 * Tiny CSV builder for Chilean-style semicolon-delimited files.
 * Escapes ; " and newlines per RFC-4180-style quoting.
 */

function escapeCell(value: string | number): string {
  const s = String(value);
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Build a CSV string from a header row and data rows.
 * @param headers column headers
 * @param rows rows of string|number cells
 * @returns CSV text (CRLF line endings, trailing newline)
 */
export function buildCsv(
  headers: (string | number)[],
  rows: (string | number)[][],
): string {
  const lines = [headers.map(escapeCell).join(';')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(';'));
  }
  return lines.join('\r\n') + '\r\n';
}
