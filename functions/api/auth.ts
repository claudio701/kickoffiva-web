import { Hono } from 'hono';
import { q, type Env } from '../_lib/db';
import { hashPassword, verifyPassword } from '../_lib/passwords';
import { signToken, authUser } from '../_lib/jwt';
import { rutValido, formatearRut } from '../_lib/rut';
import { texto, email as emailNorm } from '../_lib/sanitize';

/** users table row shape. */
export interface UserRow {
  id: string;
  email: string;
  nombre: string | null;
  password_hash: string;
}

/** companies table row shape (subset used by auth). */
export interface CompanyRow {
  id: string;
  user_id: string;
  nombre: string;
  rut: string;
}

/** Public user payload returned by the auth endpoints. */
export interface PublicUser {
  id: string;
  email: string;
  /** Nombre de la persona dueña de la cuenta. */
  nombre: string;
  /** Primera empresa de la cuenta (puede no tener aún). */
  nombreEmpresa: string | null;
  rutEmpresa: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Builds the public user payload from user + (optional) company rows. */
function toPublicUser(user: UserRow, company: CompanyRow | undefined): PublicUser {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre ?? user.email.split('@')[0],
    nombreEmpresa: company?.nombre ?? null,
    rutEmpresa: company?.rut ?? null,
  };
}

const auth = new Hono<{ Bindings: Env }>();

/** POST /register — crea la cuenta de la PERSONA; la empresa se puede
 *  agregar al registrar (compat) o después vía POST /api/empresas. */
auth.post('/register', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    nombre?: string;
    telefono?: string;
    nombreEmpresa?: string;
    rutEmpresa?: string;
  };

  const email = emailNorm(body.email);
  const password = body.password;
  // FIX: nombre obligatorio y sanitizado (antes se aceptaba vacío y caía al
  // prefijo del correo, generando cuentas "t4", "test", etc.).
  // Compat: si solo viene nombreEmpresa (registro con empresa), se usa ese.
  const nombre = texto(body.nombre, 80) || texto(body.nombreEmpresa, 80);
  const telefono = typeof body.telefono === 'string'
    ? body.telefono.replace(/[^\d+]/g, '').slice(0, 20) || null
    : null;
  const nombreEmpresa = texto(body.nombreEmpresa, 120) || undefined;
  const rutEmpresaRaw = typeof body.rutEmpresa === 'string' ? body.rutEmpresa.trim() : '';

  if (!nombre) {
    return c.json({ error: 'El nombre es obligatorio' }, 400);
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return c.json({ error: 'Correo inválido' }, 400);
  }
  if (typeof password !== 'string' || password.length < 8) {
    return c.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
  }
  // Si se informa una empresa, ambos campos son obligatorios y el RUT válido.
  if ((nombreEmpresa && !rutEmpresaRaw) || (!nombreEmpresa && rutEmpresaRaw)) {
    return c.json({ error: 'Para registrar la empresa se necesita su nombre y su RUT' }, 400);
  }
  if (rutEmpresaRaw && !rutValido(rutEmpresaRaw)) {
    return c.json({ error: 'RUT inválido. Revisa el dígito verificador (formato 12345678-9).' }, 400);
  }
  const rutEmpresa = rutEmpresaRaw ? formatearRut(rutEmpresaRaw) : undefined;

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    await q(c.env, 'INSERT INTO users (id, email, nombre, telefono, password_hash) VALUES ($1, $2, $3, $4, $5)', [
      userId,
      email,
      nombre,
      telefono,
      passwordHash,
    ]);
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      return c.json({ error: 'El correo ya está registrado' }, 409);
    }
    throw err;
  }

  let companyId: string | null = null;
  if (nombreEmpresa && rutEmpresa) {
    companyId = crypto.randomUUID();
    await q(
      c.env,
      'INSERT INTO companies (id, user_id, nombre, rut) VALUES ($1, $2, $3, $4)',
      [companyId, userId, nombreEmpresa, rutEmpresa],
    );
  }

  const token = await signToken(userId, c.env.JWT_SECRET);
  return c.json(
    {
      token,
      user: {
        id: userId,
        email,
        nombre,
        nombreEmpresa: nombreEmpresa ?? null,
        rutEmpresa: rutEmpresa ?? null,
      } satisfies PublicUser,
    },
    201,
  );
});

/** POST /login — verifies credentials and returns a JWT. */
auth.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = emailNorm(body.email);
  const password = body.password;

  if (!email || typeof password !== 'string' || !password) {
    return c.json({ error: 'Credenciales inválidas' }, 401);
  }

  const users = await q<UserRow>(
    c.env,
    'SELECT id, email, nombre, password_hash FROM users WHERE email = $1 LIMIT 1',
    [email],
  );
  const user = users[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Credenciales inválidas' }, 401);
  }

  const companies = await q<CompanyRow>(
    c.env,
    'SELECT id, user_id, nombre, rut FROM companies WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
    [user.id],
  );

  const token = await signToken(user.id, c.env.JWT_SECRET);
  return c.json({ token, user: toPublicUser(user, companies[0]) });
});

/** GET /me — returns the authenticated user (Bearer token required). */
auth.get('/me', async (c) => {
  const principal = await authUser(c);
  if (!principal) {
    return c.json({ error: 'No autorizado' }, 401);
  }
  const users = await q<UserRow>(
    c.env,
    'SELECT id, email, nombre, password_hash FROM users WHERE id = $1 LIMIT 1',
    [principal.userId],
  );
  const user = users[0];
  if (!user) {
    return c.json({ error: 'No autorizado' }, 401);
  }
  const companies = await q<CompanyRow>(
    c.env,
    'SELECT id, user_id, nombre, rut FROM companies WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
    [user.id],
  );
  return c.json({ user: toPublicUser(user, companies[0]) });
});

export default auth;
