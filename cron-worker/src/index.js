/**
 * kickoffiva-cron — Worker de Cloudflare con Cron Trigger.
 *
 * Cada día (ver wrangler.toml → [triggers] crons):
 *   1. POST {API_BASE}/api/cron/generar   → crea las alertas del día (idempotente)
 *   2. GET  {API_BASE}/api/cron/hoy       → lista las alertas de hoy
 *   3. Si SEND_CLIENT_EMAILS=1 y hay RESEND_API_KEY: envía cada alerta pendiente
 *      por email al cliente y la marca como enviada (POST /api/cron/enviada).
 *   4. Envía el resumen diario a DIGEST_TO (solo si hay alertas o hubo error),
 *      con links wa.me listos para mandar por WhatsApp con un clic.
 *
 * Ejecución manual (para probar sin esperar al cron):
 *   GET https://<worker>/run   con header  x-cron-secret: <CRON_SECRET>
 *
 * Variables (wrangler.toml [vars]): API_BASE, DIGEST_TO, FROM_EMAIL, SEND_CLIENT_EMAILS
 * Secretos (wrangler secret put):   CRON_SECRET, RESEND_API_KEY (opcional)
 */
import { armarResumen, armarCorreoCliente } from './digest.js';

async function api(env, path, init = {}) {
  const res = await fetch(`${env.API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': env.CRON_SECRET ?? '',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no-JSON */ }
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

async function enviarEmail(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY) return { ok: false, skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL || 'KickoffIVA <onboarding@resend.dev>', to: [to], subject, text, html }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`);
  return { ok: true };
}

export async function runJob(env) {
  const log = [];
  let generar = null;
  let hoy = { fecha: '', alertas: [] };
  let error = null;
  const envio = { enviadosEmail: 0, erroresEmail: 0 };

  try {
    generar = await api(env, '/api/cron/generar', { method: 'POST', body: '{}' });
    log.push(`generar: ${JSON.stringify(generar)}`);
    hoy = await api(env, '/api/cron/hoy');
    log.push(`hoy: ${hoy.alertas.length} alerta(s)`);

    if (env.SEND_CLIENT_EMAILS === '1' && env.RESEND_API_KEY) {
      for (const a of hoy.alertas) {
        if (a.enviada || !a.email) continue;
        try {
          await enviarEmail(env, { to: a.email, ...armarCorreoCliente(a) });
          await api(env, '/api/cron/enviada', { method: 'POST', body: JSON.stringify({ id: a.id, canal: 'email' }) });
          a.enviada = true;
          a.canal = 'email';
          envio.enviadosEmail += 1;
        } catch (e) {
          envio.erroresEmail += 1;
          log.push(`email ${a.email}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    error = e;
    log.push(`ERROR: ${e.message}`);
  }

  // Resumen al equipo: siempre que haya alertas o error (no spamear días vacíos).
  const hayAlgo = hoy.alertas.length > 0 || error;
  if (hayAlgo && env.DIGEST_TO) {
    const r = armarResumen(hoy, generar, env.SEND_CLIENT_EMAILS === '1' ? envio : {});
    if (error) {
      r.subject = `⚠️ KickoffIVA cron falló · ${new Date().toISOString().slice(0, 10)}`;
      r.text = `El cron de alarmas falló:\n${error.message}\n\n${r.text}`;
      r.html = `<p style="color:#b00020"><strong>El cron de alarmas falló:</strong> ${error.message}</p>${r.html}`;
    }
    try {
      const sent = await enviarEmail(env, { to: env.DIGEST_TO, ...r });
      log.push(sent.skipped ? 'resumen: sin RESEND_API_KEY, no enviado' : `resumen enviado a ${env.DIGEST_TO}`);
    } catch (e) {
      log.push(`resumen: ${e.message}`);
    }
  } else {
    log.push('resumen: sin alertas hoy, no se envía');
  }

  return { ok: !error, fecha: hoy.fecha, alertas: hoy.alertas.length, generar, envio, log };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runJob(env).then((r) => console.log(JSON.stringify(r))));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      if (!env.CRON_SECRET || request.headers.get('x-cron-secret') !== env.CRON_SECRET) {
        return new Response('No autorizado', { status: 401 });
      }
      const r = await runJob(env);
      return new Response(JSON.stringify(r, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('kickoffiva-cron ok', { status: 200 });
  },
};
