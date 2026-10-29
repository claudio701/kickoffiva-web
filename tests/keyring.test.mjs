import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crearLlavero,
  llaveroDesdeEnv,
  cifrar,
  descifrar,
  estaCifrado,
  cifradoConActual,
  prefijoActual,
  descifrarClaveLegacy,
  hexToBytes,
  bytesToBase64,
  kidDe,
} from '../functions/_lib/keyring.logic.mjs';
import {
  cifrarDoc,
  cifrarDocV2,
  descifrarDocAlguno,
  hashDoc,
  hashesDoc,
} from '../functions/_lib/doccrypto.logic.mjs';

const K1 = '1'.repeat(64);
const K2 = '2'.repeat(64);
const K3 = '3'.repeat(64);

test('llavero: llave actual primero, anteriores después, sin duplicados', async () => {
  const l = await crearLlavero(K2, ` ${K1} ,${K2},`);
  assert.equal(l.actual.hex, K2);
  assert.deepEqual(l.llaves.map((x) => x.hex), [K2, K1]);
  assert.match(l.actual.kid, /^[0-9a-f]{8}$/);
  assert.equal(l.actual.kid, await kidDe(K2));
  assert.notEqual(l.llaves[0].kid, l.llaves[1].kid);
  assert.equal(prefijoActual(l), `v2.${l.actual.kid}.%`);
  assert.equal((await llaveroDesdeEnv({ SII_ENC_KEY: K1 })).llaves.length, 1);
});

test('llavero: rechaza llaves inválidas sin incluir el valor en el error', () => {
  assert.throws(() => crearLlavero('corta'), (e) => !e.message.includes('corta'));
  assert.throws(() => crearLlavero(undefined));
  const mala = 'z'.repeat(64);
  assert.throws(() => crearLlavero(K1, mala), (e) => !e.message.includes(mala));
});

test('cifrar/descifrar: ida y vuelta, IV aleatorio, formato v2 sin texto en claro', async () => {
  const l = await crearLlavero(K1);
  const a = await cifrar(l, 'sii-clave', 'emp1', 'MiClave123');
  const b = await cifrar(l, 'sii-clave', 'emp1', 'MiClave123');
  assert.notEqual(a, b);
  assert.ok(estaCifrado(a) && cifradoConActual(l, a));
  assert.ok(!a.includes('MiClave'));
  assert.equal(await descifrar(l, 'sii-clave', 'emp1', a), 'MiClave123');
});

test('AAD: no descifra con otra empresa ni con otro propósito', async () => {
  const l = await crearLlavero(K1);
  const blob = await cifrar(l, 'sii-clave', 'emp1', 'secreto');
  await assert.rejects(() => descifrar(l, 'sii-clave', 'emp2', blob));
  await assert.rejects(() => descifrar(l, 'documento', 'emp1', blob));
  await assert.rejects(() => cifrar(l, 'sii-clave', '', 'x'));
});

test('alterado, llave desconocida o formato raro → falla, nunca devuelve basura', async () => {
  const l1 = await crearLlavero(K1);
  const blob = await cifrar(l1, 'p', 'c', 'hola');
  const alterado = blob.slice(0, -6) + (blob.endsWith('AAAA==') ? 'BBBB==' : 'AAAA==');
  await assert.rejects(() => descifrar(l1, 'p', 'c', alterado));
  const l3 = await crearLlavero(K3);
  await assert.rejects(() => descifrar(l3, 'p', 'c', blob), /no está en el llavero/);
  await assert.rejects(() => descifrar(l1, 'p', 'c', 'v1.abc'));
  assert.equal(estaCifrado('Hola Juan, tu IVA es $100'), false);
  assert.equal(estaCifrado(null), false);
});

test('rotación: con la llave vieja como anterior se lee lo viejo y se escribe con la nueva', async () => {
  const viejo = await crearLlavero(K1);
  const blobViejo = await cifrar(viejo, 'p', 'c', 'dato');
  const rotado = await crearLlavero(K2, K1);
  assert.equal(await descifrar(rotado, 'p', 'c', blobViejo), 'dato');
  assert.equal(cifradoConActual(rotado, blobViejo), false);
  const nuevo = await cifrar(rotado, 'p', 'c', 'dato');
  assert.equal(cifradoConActual(rotado, nuevo), true);
  // Retirada la llave vieja, lo nuevo sigue legible y lo viejo ya no.
  const final = await crearLlavero(K2);
  assert.equal(await descifrar(final, 'p', 'c', nuevo), 'dato');
  await assert.rejects(() => descifrar(final, 'p', 'c', blobViejo));
});

test('clave SII en formato heredado (llave maestra directa, sin prefijo) se sigue leyendo', async () => {
  const key = await crypto.subtle.importKey('raw', hexToBytes(K1), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('ClaveVieja')));
  const legacy = bytesToBase64(new Uint8Array([...iv, ...ct]));
  assert.equal(estaCifrado(legacy), false);
  assert.equal(await descifrarClaveLegacy(await crearLlavero(K2, K1), legacy), 'ClaveVieja');
  const l3 = await crearLlavero(K3);
  await assert.rejects(() => descifrarClaveLegacy(l3, legacy));
});

const doc = { fecha: '2026-09-15', rutEmisor: '76.123.456-0', folio: 1234, razonSocial: 'Proveedor SpA', neto: 100000, iva: 19000 };

test('documentos v2: ida y vuelta amarrada a la empresa; v1 heredado se lee con el llavero', async () => {
  const l = await crearLlavero(K2, K1);
  const v2 = await cifrarDocV2(l, 'emp1', doc);
  assert.ok(cifradoConActual(l, v2) && !v2.includes('Proveedor'));
  const esperado = { fecha: '2026-09-15', rutEmisor: '76.123.456-0', folio: '1234', razonSocial: 'Proveedor SpA', neto: 100000, iva: 19000, total: 119000 };
  assert.deepEqual(await descifrarDocAlguno(l, 'emp1', v2), esperado);
  await assert.rejects(() => descifrarDocAlguno(l, 'emp2', v2));
  const v1 = await cifrarDoc(K1, doc);
  assert.deepEqual(await descifrarDocAlguno(l, 'emp1', v1), esperado);
  const l3 = await crearLlavero(K3);
  await assert.rejects(() => descifrarDocAlguno(l3, 'emp1', v1));
  await assert.rejects(() => descifrarDocAlguno(l, 'emp1', 'basura'));
});

test('hashesDoc: [0] con la llave actual, uno por llave, compatible con hashDoc v1', async () => {
  const l = await crearLlavero(K2, K1);
  const hs = await hashesDoc(l, 'emp1', 'compra', doc);
  assert.equal(hs.length, 2);
  assert.equal(hs[0], await hashDoc(K2, 'emp1', 'compra', doc));
  assert.equal(hs[1], await hashDoc(K1, 'emp1', 'compra', doc));
});
