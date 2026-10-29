/**
 * Medición propia del embudo (sin cookies ni datos personales).
 *
 *   POST /        -> registra un evento { nombre, origen?, utm? }  → 204
 *   GET  /resumen -> conteo por evento, día y fuente de los últimos 30 días
 *                    (header x-cron-secret = env.CRON_SECRET, igual que /api/cron)
 *
 * Solo se aceptan nombres de la lista EVENTOS; el resto se descarta en silencio.
 * No se guarda IP, user-agent, correo ni nada que identifique a la persona.
 */
import { Hono } from 'hono';
import { q, type Env } from '../_lib/db';

export const EVENTOS = [
  'whatsapp_click', // clic en cualquier enlace a wa.me
  'calculadora_uso', // primera interacción con la calculadora
  'registro_ok', // cuenta creada
  'cta_click', // clic en un elemento con data-evento="cta_click"
] as const;

type Evento = (typeof EVENTOS)[number];

let tablaLista = false;
async function asegurarTabla(env: Env): Promise<void> {
  if (tablaLista) return;
  await q(
    env,
    `CREATE TABLE IF NOT EXISTS eventos (
       id           bigserial PRIMARY KEY,
       nombre       text NOT NULL,
       origen       text,
       utm_source   text,
       utm_medium   text,
       utm_campaign text,
       fecha        date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
       creado       timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await q(env, `CREATE INDEX IF NOT EXISTS eventos_fecha_nombre_idx ON eventos (fecha, nombre)`);
  tablaLista = true;
}

/** Texto corto y sin control: evita que el endpoint sirva para guardar basura. */
function corto(v: unknown, max = 80): string | null {
  if (typeof v !== 'string') return null;
  const s = Array.from(v)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>')
    .join('')
    .trim()
    .slice(0, max);
  return s || null;
}

export function normalizarEvento(body: unknown): {
  nombre: Evento;
  origen: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
} | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!EVENTOS.includes(b.nombre as Evento)) return null;
  const utm = (b.utm && typeof b.utm === 'object' ? b.utm : {}) as Record<string, unknown>;
  return {
    nombre: b.nombre as Evento,
    origen: corto(b.origen),
    utmSource: corto(utm.source),
    utmMedium: corto(utm.medium),
    utmCampaign: corto(utm.campaign),
  };
}

const app = new Hono<{ Bindings: Env & { CRON_SECRET?: string } }>();

app.post('/', async (c) => {
  let body: unknown;
  try {
    // sendBeacon envía text/plain: se lee como texto y se parsea.
    body = JSON.parse(await c.req.text());
  } catch {
    return c.body(null, 204);
  }
  const ev = normalizarEvento(body);
  if (!ev) return c.body(null, 204);
  try {
    await asegurarTabla(c.env);
    await q(
      c.env,
      `INSERT INTO eventos (nombre, origen, utm_source, utm_medium, utm_campaign) VALUES ($1, $2, $3, $4, $5)`,
      [ev.nombre, ev.origen, ev.utmSource, ev.utmMedium, ev.utmCampaign],
    );
  } catch (e) {
    console.error('eventos: no se pudo registrar', e);
  }
  return c.body(null, 204);
});

app.get('/resumen', async (c) => {
  const secret = c.env.CRON_SECRET;
  if (!secret || c.req.header('x-cron-secret') !== secret) {
    return c.json({ error: 'No autorizado' }, 401);
  }
  await asegurarTabla(c.env);
  const filas = await q(
    c.env,
    `SELECT fecha::text AS fecha, nombre, coalesce(utm_source, '(directo)') AS fuente, count(*)::int AS n
       FROM eventos
      WHERE fecha >= (now() AT TIME ZONE 'America/Santiago')::date - 30
      GROUP BY 1, 2, 3
      ORDER BY 1 DESC, 2, 3`,
  );
  return c.json({ dias: 30, filas });
});

export default app;
