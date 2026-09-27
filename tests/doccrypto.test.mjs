import test from 'node:test';
import assert from 'node:assert/strict';
import { cifrarDoc, descifrarDoc, hashDoc, normalizarDoc, docDesdeLegacy, derivarLlaves } from '../functions/_lib/doccrypto.logic.mjs';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const doc = { fecha: '2026-09-15', rutEmisor: '76.123.456-0', folio: 1234, razonSocial: 'Proveedor SpA', neto: 100000, iva: 19000 };

test('cifrar/descifrar: ida y vuelta exacta, total calculado', async () => {
  const blob = await cifrarDoc(K, doc);
  assert.match(blob, /^v1\./);
  assert.ok(!blob.includes('Proveedor') && !blob.includes('1234'));
  const back = await descifrarDoc(K, blob);
  assert.deepEqual(back, { fecha: '2026-09-15', rutEmisor: '76.123.456-0', folio: '1234', razonSocial: 'Proveedor SpA', neto: 100000, iva: 19000, total: 119000 });
});

test('cifrado no determinístico (IV aleatorio) pero mismo contenido', async () => {
  const a = await cifrarDoc(K, doc);
  const b = await cifrarDoc(K, doc);
  assert.notEqual(a, b);
  assert.deepEqual(await descifrarDoc(K, a), await descifrarDoc(K, b));
});

test('otra llave o blob alterado → falla, nunca devuelve basura', async () => {
  const blob = await cifrarDoc(K, doc);
  await assert.rejects(() => descifrarDoc(K2, blob));
  const alterado = blob.slice(0, -4) + (blob.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  await assert.rejects(() => descifrarDoc(K, alterado));
  await assert.rejects(() => descifrarDoc(K, 'v0.xxxx'));
});

test('hashDoc: determinístico, ciego al formato del RUT y distinto por empresa/tipo/llave', async () => {
  const h1 = await hashDoc(K, 'emp1', 'compra', doc);
  const h2 = await hashDoc(K, 'emp1', 'compra', { ...doc, rutEmisor: '761234560', folio: '1234' });
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(h1, await hashDoc(K, 'emp2', 'compra', doc));
  assert.notEqual(h1, await hashDoc(K, 'emp1', 'venta', doc));
  assert.notEqual(h1, await hashDoc(K2, 'emp1', 'compra', doc));
  assert.notEqual(h1, await hashDoc(K, 'emp1', 'compra', { ...doc, folio: 1235 }));
});

test('normalizarDoc: redondea, recorta, total explícito se respeta', () => {
  const n = normalizarDoc({ folio: ' 77 ', neto: 10.6, iva: 2.4, total: 13, razonSocial: ' X '.padEnd(300, 'y') });
  assert.equal(n.folio, '77');
  assert.equal(n.neto, 11);
  assert.equal(n.iva, 2);
  assert.equal(n.total, 13);
  assert.equal(n.razonSocial.length, 200);
  assert.equal(n.fecha, null);
});

test('docDesdeLegacy: fila con columnas en claro → mismo formato', () => {
  const d = docDesdeLegacy({ fecha: '2026-09-15T00:00:00.000Z', rut_emisor: '1-9', folio: 5, razon_social: 'R', neto: '100', iva: '19', total: null });
  assert.deepEqual(d, { fecha: '2026-09-15', rutEmisor: '1-9', folio: '5', razonSocial: 'R', neto: 100, iva: 19, total: 119 });
});

test('derivarLlaves: rechaza llave maestra inválida', () => {
  assert.throws(() => derivarLlaves('corta'));
  assert.throws(() => derivarLlaves('z'.repeat(64)));
});
