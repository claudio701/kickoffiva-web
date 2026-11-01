import test from 'node:test';
import assert from 'node:assert/strict';
import { cifrarDoc, descifrarDoc, hashDoc, normalizarDoc, docDesdeLegacy, derivarLlaves, mismoDocSinTipo } from '../functions/_lib/doccrypto.logic.mjs';
import { calcCierre } from '../functions/_lib/iva.logic.mjs';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const doc = { fecha: '2026-09-15', rutEmisor: '76.123.456-0', folio: 1234, razonSocial: 'Proveedor SpA', neto: 100000, iva: 19000 };

test('cifrar/descifrar: ida y vuelta exacta, total calculado', async () => {
  const blob = await cifrarDoc(K, doc);
  assert.match(blob, /^v1\./);
  assert.ok(!blob.includes('Proveedor') && !blob.includes('1234'));
  const back = await descifrarDoc(K, blob);
  assert.deepEqual(back, { fecha: '2026-09-15', rutEmisor: '76.123.456-0', folio: '1234', tipoDoc: null, razonSocial: 'Proveedor SpA', neto: 100000, iva: 19000, total: 119000 });
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
  assert.deepEqual(d, { fecha: '2026-09-15', rutEmisor: '1-9', folio: '5', tipoDoc: null, razonSocial: 'R', neto: 100, iva: 19, total: 119 });
});

test('derivarLlaves: rechaza llave maestra inválida', () => {
  assert.throws(() => derivarLlaves('corta'));
  assert.throws(() => derivarLlaves('z'.repeat(64)));
});

// Caso de la auditoría 2026-10-09: factura 33 y NC 61 con el mismo folio y RUT.
const factura = { fecha: '2026-09-05', rutEmisor: '76.123.456-7', folio: '1284', tipoDoc: 33, neto: 450000, iva: 85500 };
const nc = { fecha: '2026-09-20', rutEmisor: '76.123.456-7', folio: '1284', tipoDoc: 61, neto: 100000, iva: 19000 };

test('hashDoc: factura 33 y NC 61 del mismo folio y RUT tienen índices distintos', async () => {
  assert.notEqual(await hashDoc(K, 'emp1', 'compra', factura), await hashDoc(K, 'emp1', 'compra', nc));
  // tipoDoc como string o número da el mismo índice
  assert.equal(await hashDoc(K, 'emp1', 'compra', nc), await hashDoc(K, 'emp1', 'compra', { ...nc, tipoDoc: '61' }));
});

test('hashDoc: sin tipoDoc el índice es el de antes (documentos ya guardados no cambian)', async () => {
  const { tipoDoc: _t, ...sinTipo } = factura;
  assert.equal(await hashDoc(K, 'emp1', 'compra', sinTipo), await hashDoc(K, 'emp1', 'compra', { ...factura, tipoDoc: null }));
  assert.notEqual(await hashDoc(K, 'emp1', 'compra', sinTipo), await hashDoc(K, 'emp1', 'compra', factura));
});

test('normalizarDoc: notas de crédito 61 y 112 siempre negativas; la factura no se toca', () => {
  for (const tipoDoc of [61, 112, '61']) {
    const n = normalizarDoc({ ...nc, tipoDoc });
    assert.deepEqual([n.neto, n.iva, n.total], [-100000, -19000, -119000]);
  }
  const ya = normalizarDoc({ ...nc, neto: -100000, iva: -19000, total: -119000 });
  assert.deepEqual([ya.neto, ya.iva, ya.total], [-100000, -19000, -119000]);
  const f = normalizarDoc(factura);
  assert.deepEqual([f.tipoDoc, f.neto, f.iva], [33, 450000, 85500]);
});

test('crédito fiscal con factura y NC del mismo folio: 66.500 (no 85.500)', () => {
  const r = calcCierre([], [normalizarDoc(factura), normalizarDoc(nc)], 0);
  assert.equal(r.creditoFiscal, 66500);
});

test('mismoDocSinTipo: la fila antigua es la misma factura, pero no la NC', () => {
  const { tipoDoc: _t, ...facturaAntigua } = factura;
  assert.equal(mismoDocSinTipo(facturaAntigua, factura), true);
  assert.equal(mismoDocSinTipo(facturaAntigua, nc), false);
  // NC guardada antes en positivo calza con la NC entrante (que ahora es negativa)
  const { tipoDoc: _t2, ...ncAntigua } = nc;
  assert.equal(mismoDocSinTipo(ncAntigua, nc), true);
  // una fila que ya tiene tipoDoc nunca se trata como antigua
  assert.equal(mismoDocSinTipo(factura, factura), false);
});
