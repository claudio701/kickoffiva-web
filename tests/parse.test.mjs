import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRcvCsv, parseTipoDoc } from '../functions/_sii/parse.logic.mjs';
import { calcCierre } from '../functions/_lib/iva.logic.mjs';

test('parseTipoDoc: código numérico o nombre del documento', () => {
  assert.equal(parseTipoDoc('33'), 33);
  assert.equal(parseTipoDoc(' 61 '), 61);
  assert.equal(parseTipoDoc('Factura Electronica'), 33);
  assert.equal(parseTipoDoc('Nota de Crédito Electrónica'), 61);
  assert.equal(parseTipoDoc('Nota de Credito de Exportacion Electronica'), 112);
  assert.equal(parseTipoDoc(''), null);
  assert.equal(parseTipoDoc('Boleta'), null);
});

// Caso de la auditoría 2026-10-09: factura 33 y NC 61 con el mismo folio y RUT, la NC
// en positivo (como la trae el RCV con código numérico).
const CSV = `Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA Recuperable;Monto Total
1;33;76.123.456-7;SERVICIOS ANDES SPA;1284;05/09/2026;450.000;85.500;535.500
2;61;76.123.456-7;SERVICIOS ANDES SPA;1284;20/09/2026;100.000;19.000;119.000
`;

test('parseRcvCsv: lee "Tipo Doc" y deja la NC en negativo', () => {
  const docs = parseRcvCsv(CSV, 'compra');
  assert.deepEqual(docs.map((d) => [d.tipoDoc, d.neto, d.iva, d.total]), [
    [33, 450000, 85500, 535500],
    [61, -100000, -19000, -119000],
  ]);
  assert.equal(calcCierre([], docs, 0).creditoFiscal, 66500);
});

test('parseRcvCsv: NC ya negativa "(19.000)" no se invierte; sin columna Tipo Doc → null', () => {
  const neg = CSV.replace('100.000;19.000;119.000', '(100.000);(19.000);(119.000)');
  assert.equal(parseRcvCsv(neg, 'compra')[1].iva, -19000);
  const sinTipo = `Folio;Fecha Docto;Monto Neto;Monto IVA\n1;05/09/2026;100;19\n`;
  assert.equal(parseRcvCsv(sinTipo, 'compra')[0].tipoDoc, null);
});
