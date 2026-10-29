/**
 * Rutas de perfil de empresa + bóveda de credenciales SII.
 * Sub-router Hono (export default) para Cloudflare Pages Functions.
 *
 *   GET  /        -> { nombre, rut, tasaPpm, tasaPpmOrigen, siiConfigurado } (nunca la clave)
 *                    404 { error: "Sin empresa", empresa: null } si la cuenta
 *                    aún no tiene empresa (NO 401: la sesión sigue válida).
 *   PUT  /sii     -> guarda { rutSii, claveSii } cifrada con AES-256-GCM
 *                    (y limpia la marca de clave rechazada por el SII)
 *   DELETE /sii   -> borra RUT y clave SII de la empresa (revocación desde el panel)
 *   PUT  /ppm     -> fija la tasa PPM a mano (fracción, 0 a 0.30; uso del equipo).
 *                    Lo normal es que se lea sola del SII (_lib/ppm.ts).
 *
 * Códigos: 401 SOLO cuando falta o es inválido el JWT. Sin empresa → 404 en
 * GET y 400 "Primero agrega tu empresa" en PUT (mismo criterio que
 * cierre/libros/sii). La clave SII nunca se devuelve ni se loguea.
 */
import { Hono } from 'hono';
import { authUser, resolveCompany } from '../_lib/jwt';
import { q, type Env } from '../_lib/db';
import { encryptClave } from '../_lib/crypto';
import { rutValido, formatearRut } from '../_lib/rut';
import { asegurarColumnasPpm } from '../_lib/ppm';
import { asegurarColumnaRechazo } from '../_lib/sii-estado';

const TASA_PPM_MAX = 0.3;

const app = new Hono<{ Bindings: Env }>();

type Principal =
  | { ok: true; userId: string; companyId: string | null }
  | { ok: false };

/** Valida el JWT y resuelve la empresa activa (puede ser null). */
async function principal(c: any): Promise<Principal> {
  const auth = await authUser(c);
  if (!auth) return { ok: false };
  const companyId = await resolveCompany(c, auth.userId);
  return { ok: true, userId: auth.userId, companyId };
}

app.get('/', async (c) => {
  const p = await principal(c);
  if (!p.ok) return c.json({ error: 'No autorizado' }, 401);
  // FIX: sin empresa -> 404 (antes 401, y el frontend interpretaba 401 como
  // sesión expirada y cerraba la sesión justo después de registrarse).
  if (!p.companyId) return c.json({ error: 'Sin empresa', empresa: null }, 404);

  await asegurarColumnasPpm(c.env);
  await asegurarColumnaRechazo(c.env);
  const rows = (await q(
    c.env,
    'SELECT nombre, rut, tasa_ppm, tasa_ppm_origen, sii_rut, sii_clave_enc, sii_clave_rechazada_en FROM companies WHERE id = $1',
    [p.companyId],
  )) as Array<{
    nombre: string | null;
    rut: string | null;
    tasa_ppm: number | string | null;
    tasa_ppm_origen: string | null;
    sii_rut: string | null;
    sii_clave_enc: string | null;
    sii_clave_rechazada_en: string | null;
  }>;

  const company = rows?.[0];
  if (!company) return c.json({ error: 'Sin empresa', empresa: null }, 404);

  return c.json({
    nombre: company.nombre,
    rut: company.rut,
    // numeric de Postgres llega como string; el contrato del frontend es number.
    tasaPpm: Number(company.tasa_ppm) || 0,
    // 'sii' = leída del F29; 'defecto' = 1% inicial mientras no la leamos; 'manual' = equipo.
    tasaPpmOrigen: company.tasa_ppm_origen ?? 'defecto',
    siiConfigurado: Boolean(company.sii_rut && company.sii_clave_enc),
    // El SII rechazó la clave guardada: no se reintenta hasta que guarde una nueva.
    siiClaveRechazada: Boolean(company.sii_clave_enc && company.sii_clave_rechazada_en),
  });
});

app.put('/sii', async (c) => {
  const p = await principal(c);
  if (!p.ok) return c.json({ error: 'No autorizado' }, 401);
  if (!p.companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);

  let body: { rutSii?: unknown; claveSii?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Cuerpo JSON inválido' }, 400);
  }

  const { rutSii, claveSii } = body;
  if (typeof rutSii !== 'string' || !rutValido(rutSii)) {
    return c.json({ error: 'RUT inválido' }, 400);
  }
  if (typeof claveSii !== 'string' || claveSii.length < 4) {
    return c.json({ error: 'La clave debe tener al menos 4 caracteres' }, 400);
  }

  const claveEnc = await encryptClave(c.env, p.companyId, claveSii);
  await asegurarColumnaRechazo(c.env);
  await q(
    c.env,
    'UPDATE companies SET sii_rut = $1, sii_clave_enc = $2, sii_clave_rechazada_en = NULL WHERE id = $3',
    [formatearRut(rutSii), claveEnc, p.companyId],
  );

  return c.json({ ok: true, siiConfigurado: true });
});

app.delete('/sii', async (c) => {
  const p = await principal(c);
  if (!p.ok) return c.json({ error: 'No autorizado' }, 401);
  if (!p.companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);

  await asegurarColumnaRechazo(c.env);
  await q(
    c.env,
    'UPDATE companies SET sii_rut = NULL, sii_clave_enc = NULL, sii_clave_rechazada_en = NULL WHERE id = $1',
    [p.companyId],
  );

  return c.json({ ok: true, siiConfigurado: false });
});

app.put('/ppm', async (c) => {
  const p = await principal(c);
  if (!p.ok) return c.json({ error: 'No autorizado' }, 401);
  if (!p.companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);

  let body: { tasaPpm?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Cuerpo JSON inválido' }, 400);
  }

  const { tasaPpm } = body;
  if (typeof tasaPpm !== 'number' || !Number.isFinite(tasaPpm) || tasaPpm < 0 || tasaPpm > TASA_PPM_MAX) {
    return c.json({ error: 'La tasa PPM debe ser un número entre 0 y 0.30' }, 400);
  }

  await asegurarColumnasPpm(c.env);
  await q(
    c.env,
    "UPDATE companies SET tasa_ppm = $1, tasa_ppm_origen = 'manual', tasa_ppm_actualizada = now() WHERE id = $2",
    [tasaPpm, p.companyId],
  );

  return c.json({ ok: true, tasaPpm });
});

export default app;
