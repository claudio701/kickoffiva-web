import type { Context } from 'hono';
import { sign, verify } from 'hono/jwt';
import { q, type Env } from './db';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/** Authenticated principal: user id from the JWT plus their company id. */
export interface AuthUser {
  userId: string;
  companyId: string | null;
}

/** Signs an HS256 JWT with payload {sub: userId, exp} valid for 30 days. */
export async function signToken(userId: string, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS;
  return sign({ sub: userId, exp }, secret);
}

/** Verifies an HS256 JWT and returns the user id (sub), or null if invalid. */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<string | null> {
  try {
    const payload = await verify(token, secret, 'HS256');
    return typeof payload.sub === 'string' ? payload.sub : null;
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
  const userId = await verifyToken(token, c.env.JWT_SECRET);
  if (!userId) return null;
  const rows = await q<{ id: string }>(
    c.env,
    'SELECT id FROM companies WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
    [userId],
  );
  return { userId, companyId: rows[0]?.id ?? null };
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
