import type { Context } from 'hono';
import { sign, verify } from 'hono/jwt';
import { q, type Env } from './db';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/** Authenticated principal: user id from the JWT plus their company id. */
export interface AuthUser {
  userId: string;
  companyId: string | null;
}

let columnaSesionLista = false;

/**
 * Crea users.sesion_version si falta (idempotente; equivale a migrations/007).
 * Cada sesión (JWT) lleva la versión vigente al firmarse; al cambiar la
 * contraseña la versión sube y todas las sesiones anteriores dejan de valer.
 */
export async function asegurarSesionVersion(env: Env): Promise<void> {
  if (columnaSesionLista) return;
  await q(env, 'ALTER TABLE users ADD COLUMN IF NOT EXISTS sesion_version integer NOT NULL DEFAULT 0');
  columnaSesionLista = true;
}

/** Signs an HS256 JWT with payload {sub: userId, ver, exp} valid for 30 days. */
export async function signToken(userId: string, secret: string, version = 0): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS;
  return sign({ sub: userId, ver: version, exp }, secret);
}

/**
 * Verifies an HS256 JWT and returns {userId, version}, or null if invalid.
 * Tokens firmados antes de existir `ver` cuentan como versión 0.
 */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<{ userId: string; version: number } | null> {
  try {
    const payload = await verify(token, secret, 'HS256');
    if (typeof payload.sub !== 'string') return null;
    const version = payload.ver === undefined ? 0 : payload.ver;
    if (typeof version !== 'number' || !Number.isInteger(version)) return null;
    return { userId: payload.sub, version };
  } catch {
    return null;
  }
}

/**
 * Middleware-style helper: reads "Authorization: Bearer <token>" from the Hono
 * context, verifies it with c.env.JWT_SECRET, and returns {userId, companyId}
 * (companyId looked up via the database), or null when unauthenticated.
 */
export async function authUser(
  c: Context<{ Bindings: Env }>,
): Promise<AuthUser | null> {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  const claims = await verifyToken(token, c.env.JWT_SECRET);
  if (!claims) return null;
  await asegurarSesionVersion(c.env);
  // Una sola consulta: el usuario debe existir y la versión de la sesión debe
  // ser la vigente (cambiar la contraseña invalida las sesiones anteriores).
  const rows = await q<{ sesion_version: number; company_id: string | null }>(
    c.env,
    `SELECT u.sesion_version,
            (SELECT id FROM companies WHERE user_id = u.id ORDER BY created_at ASC LIMIT 1) AS company_id
       FROM users u
      WHERE u.id = $1`,
    [claims.userId],
  );
  const row = rows[0];
  if (!row || Number(row.sesion_version) !== claims.version) return null;
  return { userId: claims.userId, companyId: row.company_id ?? null };
}

/**
 * Resuelve la empresa activa de la request: si el cliente envía el header
 * `x-company-id`, se valida que esa empresa pertenezca al usuario; si no,
 * se usa su primera empresa. Devuelve null si no hay empresa válida.
 */
export async function resolveCompany(
  c: Context<{ Bindings: Env }>,
  userId: string,
): Promise<string | null> {
  const wanted = c.req.header('x-company-id')?.trim();
  if (wanted) {
    const rows = await q<{ id: string }>(
      c.env,
      'SELECT id FROM companies WHERE id = $1 AND user_id = $2 LIMIT 1',
      [wanted, userId],
    );
    return rows[0]?.id ?? null;
  }
  const rows = await q<{ id: string }>(
    c.env,
    'SELECT id FROM companies WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
    [userId],
  );
  return rows[0]?.id ?? null;
}
