import { Hono } from 'hono';
import { q, type Env } from '../_lib/db';
import { hashPassword, verifyPassword } from '../_lib/passwords';
import { signToken, authUser } from '../_lib/jwt';
import { correoDisponible, enviarLinkRecuperacion, consumirToken, type RecuperarEnv } from '../_lib/recuperar';
import { rutValido, formatearRut, limpiarRut } from '../_lib/rut';
import { texto, email as emailNorm } from '../_lib/sanitize';
import {
  LIMITES,
  ipDe,
  claveIntento,
  excedido,
  anotar,
  limpiar,
  turnstileOk,
  MSG_DEMASIADOS,
  MSG_VERIFICACION,
  type LimitesEnv,
} from '../_lib/limites';

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

/** RUT sin puntos ni guion, K mayúscula: igual que el índice companies_user_rut_unique. */
const RUT_SQL = "regexp_replace(upper(rut), '[^0-9K]', '', 'g')";

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

const auth = new Hono<{ Bindings: Env & LimitesEnv & RecuperarEnv }>();

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
    turnstileToken?: string;
  };

  // Anti-bots: tope de cuentas por IP y captcha invisible (si está configurado).
  const ip = ipDe(c);
  const claveIp = await claveIntento('registro-ip', ip || 'sin-ip');
  if (await excedido(c.env, claveIp, LIMITES.registroPorIp.max, LIMITES.registroPorIp.minutos)) {
    return c.json({ error: MSG_DEMASIADOS }, 429);
  }
  if (!(await turnstileOk(c.env, body.turnstileToken, ip))) {
    return c.json({ error: MSG_VERIFICACION }, 400);
  }

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

  // Se puede entrar con el RUT: por eso un RUT no puede quedar en dos cuentas distintas.
  if (rutEmpresaRaw) {
    const ya = await q(c.env, `SELECT 1 FROM companies WHERE ${RUT_SQL} = $1 LIMIT 1`, [limpiarRut(rutEmpresaRaw)]);
    if (ya.length > 0) {
      return c.json({ error: 'Ese RUT ya tiene una cuenta. Toca "Ya tengo cuenta" para entrar.' }, 409);
    }
  }

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
      return c.json({ error: 'Ese correo ya tiene una cuenta. Toca "Ya tengo cuenta" para entrar.' }, 409);
    }
    throw err;
  }

  await anotar(c.env, claveIp);

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
    /** RUT (del negocio con que se registró) o correo. */
    identificador?: string;
    email?: string; // compat: clientes antiguos mandan solo email
    password?: string;
    turnstileToken?: string;
  };
  const bruto = String(body.identificador ?? body.email ?? '').trim();
  const password = body.password;
  const esCorreo = bruto.includes('@');
  const email = esCorreo ? emailNorm(bruto) : '';
  const rut = !esCorreo && rutValido(bruto) ? limpiarRut(bruto) : '';

  if ((!email && !rut) || typeof password !== 'string' || !password) {
    return c.json({ error: 'Credenciales inválidas' }, 401);
  }

  // Anti fuerza bruta: tope de fallas por correo y por IP (15 min).
  const ip = ipDe(c);
  const claveCorreo = await claveIntento('login-cuenta', email || `rut:${rut}`);
  const claveIp = await claveIntento('login-ip', ip || 'sin-ip');
  if (
    (await excedido(c.env, claveCorreo, LIMITES.loginPorCorreo.max, LIMITES.loginPorCorreo.minutos)) ||
    (await excedido(c.env, claveIp, LIMITES.loginPorIp.max, LIMITES.loginPorIp.minutos))
  ) {
    return c.json({ error: MSG_DEMASIADOS }, 429);
  }
  if (!(await turnstileOk(c.env, body.turnstileToken, ip))) {
    return c.json({ error: MSG_VERIFICACION }, 400);
  }

  const users = email
    ? await q<UserRow>(c.env, 'SELECT id, email, nombre, password_hash FROM users WHERE email = $1 LIMIT 1', [email])
    : await q<UserRow>(
        c.env,
        `SELECT DISTINCT u.id, u.email, u.nombre, u.password_hash
           FROM users u JOIN companies co ON co.user_id = u.id
          WHERE regexp_replace(upper(co.rut), '[^0-9K]', '', 'g') = $1
          LIMIT 2`,
        [rut],
      );
  // Un RUT que aparece en dos cuentas (p.ej. un contador y su cliente) es ambiguo: se pide el correo.
  const user = users.length === 1 ? users[0] : undefined;
  if (!email && users.length > 1) {
    await anotar(c.env, claveCorreo, claveIp);
    return c.json({ error: 'Ese RUT está en más de una cuenta. Entra con tu correo.' }, 401);
  }
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await anotar(c.env, claveCorreo, claveIp);
    return c.json({ error: 'Credenciales inválidas' }, 401);
  }
  await limpiar(c.env, claveCorreo);

  const companies = await q<CompanyRow>(
    c.env,
    'SELECT id, user_id, nombre, rut FROM companies WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
    [user.id],
  );

  const token = await signToken(user.id, c.env.JWT_SECRET);
  return c.json({ token, user: toPublicUser(user, companies[0]) });
});

/**
 * POST /recuperar { identificador } — envía un link para crear contraseña nueva.
 * Responde lo mismo exista o no la cuenta (no revela qué correos/RUT están registrados).
 */
auth.post('/recuperar', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { identificador?: string };
  const bruto = String(body.identificador ?? '').trim();
  const OK = {
    ok: true,
    mensaje: 'Si hay una cuenta con ese RUT o correo, te enviamos un correo con un link para crear una contraseña nueva. Revisa también la carpeta de spam.',
  };
  if (!bruto) return c.json({ error: 'Escribe tu RUT o tu correo.' }, 400);
  if (!correoDisponible(c.env)) {
    return c.json({ error: 'Por ahora no podemos enviar correos. Escríbenos por WhatsApp y te ayudamos a entrar.' }, 503);
  }

  const ip = ipDe(c);
  const claveIp = await claveIntento('recuperar-ip', ip || 'sin-ip');
  const claveCuenta = await claveIntento('recuperar-cuenta', bruto.toLowerCase());
  if (
    (await excedido(c.env, claveIp, 10, 60)) ||
    (await excedido(c.env, claveCuenta, 3, 60))
  ) {
    return c.json({ error: MSG_DEMASIADOS }, 429);
  }
  await anotar(c.env, claveIp, claveCuenta);

  const esCorreo = bruto.includes('@');
  const users = esCorreo
    ? await q<UserRow>(c.env, 'SELECT id, email, nombre, password_hash FROM users WHERE email = $1 LIMIT 1', [emailNorm(bruto)])
    : rutValido(bruto)
      ? await q<UserRow>(
          c.env,
          `SELECT DISTINCT u.id, u.email, u.nombre, u.password_hash
             FROM users u JOIN companies co ON co.user_id = u.id
            WHERE regexp_replace(upper(co.rut), '[^0-9K]', '', 'g') = $1
            LIMIT 2`,
          [limpiarRut(bruto)],
        )
      : [];
  if (users.length === 1) {
    try {
      await enviarLinkRecuperacion(c.env, users[0]);
    } catch (e) {
      console.error('recuperar: no se pudo enviar el correo', (e as Error).message);
      return c.json({ error: 'No pudimos enviar el correo. Intenta en unos minutos o escríbenos por WhatsApp.' }, 503);
    }
  }
  return c.json(OK);
});

/** POST /restablecer { token, password } — fija la contraseña nueva y deja la sesión iniciada. */
auth.post('/restablecer', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { token?: string; password?: string };
  const password = body.password;
  if (typeof password !== 'string' || password.length < 8) {
    return c.json({ error: 'La contraseña debe tener al menos 8 letras o números.' }, 400);
  }
  const userId = await consumirToken(c.env, String(body.token ?? ''));
  if (!userId) {
    return c.json({ error: 'El link ya se usó o venció. Pide uno nuevo con "¿Olvidaste tu contraseña?".' }, 400);
  }
  await q(c.env, 'UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), userId]);
  const users = await q<UserRow>(c.env, 'SELECT id, email, nombre, password_hash FROM users WHERE id = $1 LIMIT 1', [userId]);
  const user = users[0];
  if (!user) return c.json({ error: 'No encontramos la cuenta.' }, 400);
  await limpiar(c.env, await claveIntento('login-cuenta', user.email));
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
