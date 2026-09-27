import test from 'node:test';
import assert from 'node:assert/strict';
import { armarResumen, armarCorreoCliente, etiquetaTipo } from '../src/digest.js';

const hoy = {
  fecha: '2026-10-10',
  alertas: [
    { id: '1', empresa: 'Comercial Pérez SpA', rut: '76.123.456-0', persona: 'Juan Pérez', email: 'juan@empresa.cl',
      tipo: 'numero', mensaje: 'Hola Juan, tu cierre está listo: *$133.000 total*.', telefono: '+56911111111',
      enviada: false, waLink: 'https://wa.me/56911111111?text=x' },
    { id: '2', empresa: 'Sin Datos Ltda', rut: '77.555.444-4', persona: null, email: 'a@b.cl',
      tipo: 'faltan_libros', mensaje: 'Faltan libros <script>', telefono: null, enviada: true, waLink: null },
  ],
};

test('resumen: asunto con conteo y pendientes', () => {
  const r = armarResumen(hoy, { empresas: 2, creadas: 2, siiRevisadas: 0 });
  assert.match(r.subject, /2 alerta\(s\), 1 por enviar/);
  assert.match(r.text, /PENDIENTE\] Número listo \(día 10\) — Comercial Pérez SpA/);
  assert.match(r.text, /WhatsApp: https:\/\/wa\.me\/56911111111/);
  assert.match(r.text, /Empresas revisadas: 2/);
});

test('resumen: HTML escapa contenido y marca sin teléfono', () => {
  const r = armarResumen(hoy, null);
  assert.doesNotMatch(r.html, /<script>/);
  assert.match(r.html, /&lt;script&gt;/);
  assert.match(r.html, /sin teléfono para WhatsApp/);
});

test('resumen: día sin alertas', () => {
  const r = armarResumen({ fecha: '2026-10-03', alertas: [] }, { empresas: 5, creadas: 0 });
  assert.match(r.subject, /sin alertas hoy/);
  assert.match(r.text, /Sin alertas para hoy/);
});

test('correo cliente: asunto por tipo y negrita desde *texto*', () => {
  const c = armarCorreoCliente(hoy.alertas[0]);
  assert.equal(c.subject, 'Tu IVA del mes está listo · Comercial Pérez SpA');
  assert.match(c.html, /<strong>\$133\.000 total<\/strong>/);
  assert.match(c.text, /kickoffiva\.cl/);
});

test('etiquetaTipo: notificación SII y desconocido', () => {
  assert.equal(etiquetaTipo('sii_notif_abc'), 'Notificación SII');
  assert.equal(etiquetaTipo('otro'), 'otro');
});
