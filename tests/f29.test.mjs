import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerTasaPpm } from '../functions/_sii/f29.logic.mjs';

const env = (data, errors = null) => ({ metaData: { errors }, data });

test('lee el código 115 (en %) y lo devuelve como fracción', () => {
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '538', valor: '2709150' }, { codigo: '115', valor: '0.25' }] })), 0.0025);
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: 115, valor: 1 }] })), 0.01);
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '115', valor: '0.125' }] })), 0.00125);
});

test('también lo busca en los códigos administrativos', () => {
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [], listCodAdministrativos: [{ codigo: '115', valor: '0.5' }] })), 0.005);
});

test('0% es válido (PPM suspendido); vacío o fuera de rango no', () => {
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '115', valor: '0' }] })), 0);
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '115', valor: '' }] })), null);
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '115', valor: null }] })), null);
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '115', valor: '45' }] })), null);
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '115', valor: 'abc' }] })), null);
});

test('sin propuesta o sin código 115 → null', () => {
  assert.equal(extraerTasaPpm(env(null)), null);
  assert.equal(extraerTasaPpm(env({ listCodPropuestos: [{ codigo: '538', valor: '1' }] })), null);
  assert.equal(extraerTasaPpm(env({})), null);
});

test('error de negocio del SII o respuesta rara → lanza', () => {
  assert.throws(() => extraerTasaPpm(env(null, [{ id: 1, descripcion: 'Consulta RUT no esta autorizado' }])));
  assert.throws(() => extraerTasaPpm('<html>'));
  assert.throws(() => extraerTasaPpm(null));
});
