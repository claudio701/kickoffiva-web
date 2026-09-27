import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/cloudflare-pages';
import auth from './auth';
import cierre from './cierre';
import libros from './libros';
import empresa from './empresa';
import empresas from './empresas';
import cron from './cron';
import sii from './sii';
import type { Env } from '../_lib/db';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.use(
  '*',
  cors({
    origin: (origin) =>
      origin === 'https://www.kickoffiva.cl' ||
      origin === 'https://kickoffiva.cl' ||
      /^http:\/\/localhost:\d+$/.test(origin)
        ? origin
        : '',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    // FIX: x-company-id (empresa activa) faltaba -> el preflight fallaba y el
    // navegador mostraba "Failed to fetch" en cierre/empresa/libros/sii.
    allowHeaders: ['Content-Type', 'Authorization', 'x-company-id'],
    // Para que el frontend pueda leer el nombre del CSV descargado.
    exposeHeaders: ['Content-Disposition'],
    maxAge: 86400,
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ ok: true, version: '1.0.0' }));

app.route('/auth', auth);
app.route('/cierre', cierre);
app.route('/libros', libros);
app.route('/empresa', empresa);
app.route('/empresas', empresas);
app.route('/sii', sii);
app.route('/cron', cron);

app.onError((err, c) => {
  console.error('API error:', err);
  return c.json({ error: 'Error interno del servidor' }, 500);
});

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

export const onRequest = handle(app);
