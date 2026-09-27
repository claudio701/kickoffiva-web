/**
 * Rutas multiempresa — la cuenta es de la PERSONA; cada cuenta puede tener
 * varias empresas (típico: un contador con varios clientes).
 *
 *   GET  /   -> { empresas: [{ id, nombre, rut, siiConfigurado }] }
 *   POST /   -> 201 { id, nombre, rut, siiConfigurado } (crea empresa de la cuenta)
 *               400 nombre vacío / RUT inválido
 *               409 { error: "Ya tienes una empresa con ese RUT" }
 *
 * La empresa ACTIVA de cada request se elige con el header `x-company-id`
 * (validado contra el usuario); sin header se usa la primera.
 *
 * Anti-duplicado: doble candado. (1) chequeo previo por usuario + RUT
 * normalizado (sin puntos/guion, K mayúscula); (2) si existe el índice único
 * de migrations/002_empresas_unicas.sql, la violación 23505 también → 409.
 */
import { Hono } from 'hono';
import { authUser } from '../_lib/jwt';
import { q, type Env } from '../_lib/db';
import { rutValido, formatearRut, limpiarRut } from '../_lib/rut';
import { texto } from '../_lib/sanitize';

const empresas = new Hono<{ Bindings: Env }>();

const NOMBRE_MAX = 120;
const DUPLICADA = 'Ya tienes una empresa con ese RUT';

interface EmpresaRow {
  id: string;
  nombre: string;
  rut: string;
  sii_rut: string | null;
  sii_clave_enc: string | null;
}

function toPublic(e: EmpresaRow) {
  return {
    id: e.id,
    nombre: e.nombre,
    rut: e.rut,
    siiConfigurado: Boolean(e.sii_rut && e.sii_clave_enc),
  };
}

empresas.get('/', async (c) => {
  const auth = await authUser(c);
  if (!auth) return c.json({ error: 'No autorizado' }, 401);
  const rows = (await q(
    c.env,
    'SELECT id, nombre, rut, sii_rut, sii_clave_enc FROM companies WHERE user_id = $1 ORDER BY created_at ASC',
    [auth.userId],
  )) as EmpresaRow[];
  return c.json({ empresas: rows.map(toPublic) });
});

empresas.post('/', async (c) => {
  const auth = await authUser(c);
  if (!auth) return c.json({ error: 'No autorizado' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    nombre?: unknown;
    rut?: unknown;
  };
  // FIX: sanitización anti-XSS en el backend (no solo en React).
  const nombre = texto(body.nombre, NOMBRE_MAX);
  const rut = typeof body.rut === 'string' ? body.rut.trim() : '';

  if (!nombre) return c.json({ error: 'El nombre de la empresa es obligatorio' }, 400);
  if (!rut || !rutValido(rut)) {
    return c.json({ error: 'RUT inválido. Revisa el dígito verificador (formato 12345678-9).' }, 400);
  }

  // FIX: anti-duplicado (candado 1) — compara el RUT normalizado en SQL para
  // que "76.123.456-0", "76123456-0" y "761234560" cuenten como el mismo.
  const clave = limpiarRut(rut);
  const dup = (await q(
    c.env,
    `SELECT id FROM companies
      WHERE user_id = $1
        AND regexp_replace(upper(rut), '[^0-9K]', '', 'g') = $2
      LIMIT 1`,
    [auth.userId, clave],
  )) as Array<{ id: string }>;
  if (dup.length > 0) return c.json({ error: DUPLICADA }, 409);

  const id = crypto.randomUUID();
  try {
    await q(c.env, 'INSERT INTO companies (id, user_id, nombre, rut) VALUES ($1, $2, $3, $4)', [
      id,
      auth.userId,
      nombre,
      formatearRut(rut),
    ]);
  } catch (err) {
    // Candado 2: índice único (carrera entre dos requests simultáneas).
    if ((err as { code?: string })?.code === '23505') {
      return c.json({ error: DUPLICADA }, 409);
    }
    throw err;
  }

  const rows = (await q(
    c.env,
    'SELECT id, nombre, rut, sii_rut, sii_clave_enc FROM companies WHERE id = $1',
    [id],
  )) as EmpresaRow[];
  return c.json(toPublic(rows[0]), 201);
});

export default empresas;
