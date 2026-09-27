import test from 'node:test';
import assert from 'node:assert/strict';
import { runJob } from '../src/index.js';

function mockFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [pat, fn] of handlers) if (String(url).includes(pat)) return fn(init);
    return new Response('not found', { status: 404 });
  };
  return calls;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

const env = { API_BASE: 'https://api.test', CRON_SECRET: 's3cret', DIGEST_TO: 'cc@kickoff.cl', RESEND_API_KEY: 're_x', FROM_EMAIL: 'KickoffIVA <a@kickoffiva.cl>', SEND_CLIENT_EMAILS: '1' };

test('runJob: genera, envía email al cliente, marca enviada y manda resumen', async () => {
  const alertas = [{ id: 'a1', empresa: 'E1', rut: '76.123.456-0', persona: 'Ana', email: 'ana@e1.cl', tipo: 'numero', mensaje: 'hola *$1*', telefono: '+56911111111', enviada: false, waLink: 'https://wa.me/1' }];
  const calls = mockFetch([
    ['/api/cron/generar', (init) => { assert.equal(init.headers['x-cron-secret'], 's3cret'); return json({ empresas: 1, creadas: 1, siiRevisadas: 0 }); }],
    ['/api/cron/hoy', () => json({ fecha: '2026-10-10', alertas })],
    ['/api/cron/enviada', (init) => { assert.equal(JSON.parse(init.body).id, 'a1'); return json({ ok: true }); }],
    ['api.resend.com', () => json({ id: 'email_1' })],
  ]);
  const r = await runJob(env);
  assert.equal(r.ok, true);
  assert.equal(r.envio.enviadosEmail, 1);
  const resend = calls.filter((c) => c.url.includes('resend'));
  assert.equal(resend.length, 2); // cliente + resumen
  assert.deepEqual(JSON.parse(resend[0].init.body).to, ['ana@e1.cl']);
  assert.deepEqual(JSON.parse(resend[1].init.body).to, ['cc@kickoff.cl']);
});

test('runJob: día sin alertas no manda resumen', async () => {
  const calls = mockFetch([
    ['/api/cron/generar', () => json({ empresas: 3, creadas: 0 })],
    ['/api/cron/hoy', () => json({ fecha: '2026-10-03', alertas: [] })],
  ]);
  const r = await runJob(env);
  assert.equal(r.ok, true);
  assert.equal(calls.filter((c) => c.url.includes('resend')).length, 0);
});

test('runJob: si la API falla, avisa por email al equipo y no revienta', async () => {
  const calls = mockFetch([
    ['/api/cron/generar', () => json({ error: 'No autorizado' }, 401)],
    ['api.resend.com', () => json({ id: 'x' })],
  ]);
  const r = await runJob(env);
  assert.equal(r.ok, false);
  const resend = calls.filter((c) => c.url.includes('resend'));
  assert.equal(resend.length, 1);
  assert.match(JSON.parse(resend[0].init.body).subject, /cron falló/);
});

test('runJob: sin RESEND_API_KEY no envía nada pero corre', async () => {
  mockFetch([
    ['/api/cron/generar', () => json({ empresas: 1, creadas: 1 })],
    ['/api/cron/hoy', () => json({ fecha: '2026-10-12', alertas: [{ id: 'z', empresa: 'E', rut: 'r', email: 'e@e.cl', tipo: 'ultimo_dia', mensaje: 'm', telefono: null, enviada: false }] })],
  ]);
  const r = await runJob({ ...env, RESEND_API_KEY: undefined });
  assert.equal(r.ok, true);
  assert.equal(r.envio.enviadosEmail, 0);
  assert.ok(r.log.some((l) => /sin RESEND_API_KEY/.test(l)));
});
