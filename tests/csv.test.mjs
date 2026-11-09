import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, escapeCell } from '../functions/_lib/csv.logic.mjs';

test('neutraliza textos que Excel interpretaría como fórmula', () => {
  assert.equal(escapeCell('=HYPERLINK("http://x","clic")'), `"'=HYPERLINK(""http://x"",""clic"")"`);
  assert.equal(escapeCell('+56 9 1234'), "'+56 9 1234");
  assert.equal(escapeCell('-1+1'), "'-1+1");
  assert.equal(escapeCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(escapeCell('\tx'), "'\tx");
});

test('no toca números (notas de crédito en negativo) ni textos normales', () => {
  assert.equal(escapeCell(-11900), '-11900');
  assert.equal(escapeCell(0), '0');
  assert.equal(escapeCell('76.123.456-0'), '76.123.456-0');
  assert.equal(escapeCell('Comercial Sur Ltda.'), 'Comercial Sur Ltda.');
});

test('mantiene el escape de ; comillas y saltos de línea', () => {
  assert.equal(escapeCell('a;b'), '"a;b"');
  assert.equal(escapeCell('di "hola"'), '"di ""hola"""');
  assert.equal(buildCsv(['A', 'B'], [['x', -5]]), 'A;B\r\nx;-5\r\n');
});
