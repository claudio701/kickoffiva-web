/**
 * Protección contra bots y fuerza bruta en registro e ingreso.
 *
 * 1. Límite de intentos (siempre activo), contado en Postgres:
 *      - ingreso: fallas por correo y por IP en una ventana de 15 minutos
 *      - registro: cuentas creadas por IP en una hora
 *    Las claves se guardan como SHA-256 (no quedan correos ni IPs legibles).
 * 2. Cloudflare Turnstile (captcha invisible), solo si TURNSTILE_SECRET está
 *    configurado. Sin la variable, no se exige (el sitio sigue funcionando).
 */
import { q, type Env } from './db';

export interface LimitesEnv extends Env {
  TURNSTILE_SECRET?: string;
}

export const LIMITES = {
  loginPorCorreo: { max: 8, minutos: 15 },
  loginPorIp: { max: 30, minutos: 15 },
  registroPorIp: { max: 5, minutos: 60 },
} as const;

let tablaLista = false;
async function asegurarTabla(env: Env): Promise<void> {
  if (tablaLista) return;
  await q(
    env,
    `CREATE TABLE IF NOT EXISTS auth_intentos (
       clave   text NOT NULL,
       creado  timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await q(env, `CREATE INDEX IF NOT EXISTS auth_intentos_clave_idx ON auth_intentos (clave, creado)`);
  tablaLista = true;
}

async function sha256(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** IP del visitante según Cloudflare (vacía en local). */
export function ipDe(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header('cf-connecting-ip') ?? '';
}

/** Clave anónima para contar intentos: tipo + valor hasheado. */
export async function claveIntento(tipo: string, valor: string): Promise<string> {
  return `${tipo}:${await sha256(valor.toLowerCase())}`;
}

/** ¿Superó el máximo en la ventana? */
export async function excedido(env: Env, clave: string, max: number, minutos: number): Promise<boolean> {
  await asegurarTabla(env);
  const rows = (await q(
    env,
    `SELECT count(*)::int AS n FROM auth_intentos
      WHERE clave = $1 AND creado > now() - make_interval(mins => $2)`,
    [clave, minutos],
  )) as { n: number }[];
  return Number(rows[0]?.n ?? 0) >= max;
}

/** Registra un intento. De vez en cuando limpia los de más de un día. */
export async function anotar(env: Env, ...claves: string[]): Promise<void> {
  await asegurarTabla(env);
  for (const clave of claves) {
    await q(env, `INSERT INTO auth_intentos (clave) VALUES ($1)`, [clave]);
  }
  if (Math.random() < 0.02) {
    await q(env, `DELETE FROM auth_intentos WHERE creado < now() - interval '1 day'`);
  }
}

/** Borra los intentos fallidos de un correo tras un ingreso correcto. */
export async function limpiar(env: Env, clave: string): Promise<void> {
  await asegurarTabla(env);
  await q(env, `DELETE FROM auth_intentos WHERE clave = $1`, [clave]);
}

/**
 * Verifica el token de Turnstile. Devuelve true si Turnstile no está
 * configurado (TURNSTILE_SECRET ausente) o si el token es válido.
 */
export async function turnstileOk(env: LimitesEnv, token: unknown, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // si Cloudflare no responde, no dejamos pasar bots
  }
}

export const MSG_DEMASIADOS =
  'Hubo demasiados intentos seguidos. Por seguridad espera 15 minutos y vuelve a intentar, o escríbenos por WhatsApp.';
export const MSG_VERIFICACION = 'No pudimos verificar que eres una persona. Recarga la página e intenta de nuevo.';
