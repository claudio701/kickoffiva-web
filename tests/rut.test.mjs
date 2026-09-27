/**
 * Tests de las utilidades de RUT chileno (módulo 11).
 * Ejecutar: node --test tests/rut.test.mjs
 *
 * Los DVs de los fixtures fueron calculados/verificados con el propio
 * algoritmo módulo 11 antes de fijarlos aquí:
 *   12.345.678-5, 11.111.111-1, 8.888.888-K, 76.543.210-3, 15.518.624-0,
 *   5.555.555-9, 7.654.321-6
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  limpiarRut,
  formatearRut,
  rutValido,
  dvModulo11,
} from '../functions/_lib/rut.logic.mjs';

test('limpiarRut quita puntos, guion y normaliza k', () => {
  assert.equal(limpiarRut('12.345.678-5'), '123456785');
  assert.equal(limpiarRut('8.888.888-k'), '8888888K');
  assert.equal(limpiarRut('8.888.888-K'), '8888888K');
  assert.equal(limpiarRut('12345678-5'), '123456785');
  assert.equal(limpiarRut('123456785'), '123456785');
  assert.equal(limpiarRut(' 12.345.678 - 5 '), '123456785');
});

test('formatearRut produce NN.NNN.NNN-D', () => {
  assert.equal(formatearRut('12345678-5'), '12.345.678-5');
  assert.equal(formatearRut('123456785'), '12.345.678-5');
  assert.equal(formatearRut('12.345.678-5'), '12.345.678-5');
  assert.equal(formatearRut('8888888k'), '8.888.888-K');
  assert.equal(formatearRut('7654321-6'), '7.654.321-6');
  assert.equal(formatearRut('5555555-9'), '5.555.555-9');
});

test('dvModulo11 calcula el dígito verificador correcto', () => {
  assert.equal(dvModulo11('12345678'), '5');
  assert.equal(dvModulo11('11111111'), '1');
  assert.equal(dvModulo11('8888888'), 'K');
  assert.equal(dvModulo11('76543210'), '3');
  assert.equal(dvModulo11('15518624'), '0');
  assert.equal(dvModulo11('7654321'), '6');
});

test('rutValido acepta RUTs válidos en cualquier formato', () => {
  const validos = [
    '12.345.678-5',
    '12345678-5',
    '123456785',
    '11.111.111-1',
    '8.888.888-K',
    '8.888.888-k', // k minúscula
    '8888888K',
    '76.543.210-3',
    '15.518.624-0',
    '5.555.555-9',
    '7.654.321-6',
  ];
  for (const rut of validos) {
    assert.equal(rutValido(rut), true, `esperado válido: ${rut}`);
  }
});

test('rutValido rechaza dígito verificador incorrecto', () => {
  const invalidos = [
    '12.345.678-9', // DV real es 5
    '11.111.111-2', // DV real es 1
    '8.888.888-9', // DV real es K
    '7.654.321-K', // DV real es 6 (caso K donde no corresponde)
    '12345678-K',
    '15.518.624-1', // DV real es 0
  ];
  for (const rut of invalidos) {
    assert.equal(rutValido(rut), false, `esperado inválido: ${rut}`);
  }
});

test('rutValido rechaza entradas malformadas', () => {
  const malformados = [
    '',
    '1',
    'K',
    '-',
    '12.345.678',
    'abc-def',
    '12.345.67A-5',
    '0-0',
    '00000000-0',
    '12.345.678-55',
    null,
    undefined,
    123,
  ];
  for (const rut of malformados) {
    assert.equal(rutValido(rut), false, `esperado malformado: ${rut}`);
  }
});
