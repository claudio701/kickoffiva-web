import test from 'node:test';
import assert from 'node:assert/strict';
import { texto, email } from '../functions/_lib/sanitize.logic.mjs';
import { limpiarRut } from '../functions/_lib/rut.logic.mjs';

test('texto: elimina < > (anti-HTML) y caracteres de control', () => {
  assert.equal(texto('<script>alert(1)</script>'), 'scriptalert(1)/script');
  assert.equal(texto('Comercial\u0000 Pérez\u001F SpA'), 'Comercial Pérez SpA');
});

test('texto: colapsa espacios y recorta', () => {
  assert.equal(texto('   Comercial    Pérez   SpA  '), 'Comercial Pérez SpA');
  assert.equal(texto('\n\tHola\n'), 'Hola');
});

test('texto: limita el largo (120 por defecto)', () => {
  assert.equal(texto('a'.repeat(500)).length, 120);
  assert.equal(texto('a'.repeat(500), 80).length, 80);
});

test('texto: vacío / null / undefined -> ""', () => {
  assert.equal(texto(''), '');
  assert.equal(texto(null), '');
  assert.equal(texto(undefined), '');
  assert.equal(texto('   '), '');
});

test('email: minúsculas y recorte', () => {
  assert.equal(email('  JUAN@EMPRESA.CL '), 'juan@empresa.cl');
  assert.equal(email(undefined), '');
});

test('clave de duplicado: distintos formatos del mismo RUT coinciden', () => {
  const formatos = ['76.123.456-0', '76123456-0', '761234560', ' 76.123.456 - 0 '];
  for (const f of formatos) assert.equal(limpiarRut(f), '761234560');
  assert.equal(limpiarRut('10.000.013-k'), '10000013K');
});
