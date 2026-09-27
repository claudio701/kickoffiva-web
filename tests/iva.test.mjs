import { test } from 'node:test';
import assert from 'node:assert/strict';

// functions/_lib/iva.ts is a typed facade that re-exports the plain-JS mirror
// functions/_lib/iva.logic.mjs — the single source of truth. Tests import the
// .mjs directly so `node --test` works with no TS toolchain.
import { calcCierre } from '../functions/_lib/iva.logic.mjs';

const doc = (neto, iva, extra = {}) => ({ neto, iva, ...extra });

test('basic ventas/compras', () => {
  const ventas = [doc(100000, 19000), doc(50000, 9500)];
  const compras = [doc(40000, 7600)];
  const r = calcCierre(ventas, compras, 0.01);
  assert.equal(r.ventasNetas, 150000);
  assert.equal(r.comprasNetas, 40000);
  assert.equal(r.debitoFiscal, 28500);
  assert.equal(r.creditoFiscal, 7600);
  assert.equal(r.ivaAPagar, 20900);
  assert.equal(r.creditoArrastrable, 0);
  assert.equal(r.ppm, 1500);
  assert.equal(r.totalAPagar, 22400);
});

test('crédito > débito produces crédito arrastrable and zero iva a pagar', () => {
  const ventas = [doc(100000, 19000)];
  const compras = [doc(200000, 38000)];
  const r = calcCierre(ventas, compras, 0.01);
  assert.equal(r.debitoFiscal, 19000);
  assert.equal(r.creditoFiscal, 38000);
  assert.equal(r.ivaAPagar, 0);
  assert.equal(r.creditoArrastrable, 19000);
  // PPM is still owed on ventas netas even with no IVA a pagar.
  assert.equal(r.ppm, 1000);
  assert.equal(r.totalAPagar, 1000);
});

test('empty arrays', () => {
  const r = calcCierre([], [], 0.01);
  assert.deepEqual(r, {
    ventasNetas: 0,
    comprasNetas: 0,
    debitoFiscal: 0,
    creditoFiscal: 0,
    ivaAPagar: 0,
    creditoArrastrable: 0,
    ppm: 0,
    totalAPagar: 0,
  });
});

test('ppm rounding (Math.round on ventasNetas * tasa)', () => {
  // 99,999 * 0.0025 = 249.9975 -> 250
  const r1 = calcCierre([doc(99999, 0)], [], 0.0025);
  assert.equal(r1.ppm, 250);
  // 100 * 0.005 = 0.5 -> Math.round gives 1
  const r2 = calcCierre([doc(100, 0)], [], 0.005);
  assert.equal(r2.ppm, 1);
  // ppm is integer CLP
  const r3 = calcCierre([doc(1234567, 234568)], [doc(1, 0)], 0.01);
  assert.equal(r3.ppm, 12346);
  assert.ok(Number.isInteger(r3.ppm));
});

test('tasa 0 means no ppm', () => {
  const ventas = [doc(1000000, 190000)];
  const r = calcCierre(ventas, [], 0);
  assert.equal(r.ppm, 0);
  assert.equal(r.ivaAPagar, 190000);
  assert.equal(r.totalAPagar, 190000);
});

test('débito equals crédito: nothing payable, nothing arrastrable', () => {
  const r = calcCierre([doc(100000, 19000)], [doc(100000, 19000)], 0.01);
  assert.equal(r.ivaAPagar, 0);
  assert.equal(r.creditoArrastrable, 0);
  assert.equal(r.totalAPagar, 1000); // ppm only
});
