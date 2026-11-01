import test from 'node:test';
import assert from 'node:assert/strict';
import { periodoAnterior, periodoTributario } from '../functions/_lib/periodo.logic.mjs';

test('periodoAnterior: mes anterior, con cambio de año', () => {
  assert.equal(periodoAnterior('2026-10'), '2026-09');
  assert.equal(periodoAnterior('2026-01'), '2025-12');
  assert.equal(periodoAnterior('2026-11'), '2026-10');
});

test('periodoTributario: el 10 de octubre se declara septiembre', () => {
  assert.equal(periodoTributario('2026-10-10'), '2026-09');
  assert.equal(periodoTributario('2026-10-05'), '2026-09');
  assert.equal(periodoTributario('2027-01-12'), '2026-12');
});
