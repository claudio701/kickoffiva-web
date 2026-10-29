/**
 * Recuperar contraseña: link de un solo uso por correo, válido 30 minutos.
 *
 * - Se guarda solo el SHA-256 del token (quien lea la base no puede usar los links).
 * - El correo sale por Resend (RESEND_API_KEY + RESEND_FROM en Pages). Para que llegue
 *   a cualquier cliente, el dominio kickoffiva.cl debe estar verificado en Resend;
 *   con el remitente de prueba (onboarding@resend.dev) Resend solo entrega al dueño
 *   de la cuenta Resend.
 */
import { q, type Env } from './db';

export interface RecuperarEnv extends Env {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  SITE_URL?: string;
}

const MINUTOS_VALIDEZ = 30;

let tablaLista = false;
async function asegurarTabla(env: Env): Promise<void> {
  if (tablaLista) return;
  await q(
    env,
    `CREATE TABLE IF NOT EXISTS password_resets (
       token_hash text PRIMARY KEY,
       user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       expira     timestamptz NOT NULL,
       usado      boolean NOT NULL DEFAULT false,
       creado     timestamptz NOT NULL DEFAULT now()
     )`,
  );
  tablaLista = true;
}

async function sha256Hex(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

function tokenAleatorio(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** ¿Está configurado el envío de correos? */
export function correoDisponible(env: RecuperarEnv): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Crea el link de recuperación y lo envía. Lanza si el correo no se pudo enviar. */
export async function enviarLinkRecuperacion(
  env: RecuperarEnv,
  user: { id: string; email: string; nombre: string | null },
): Promise<void> {
  await asegurarTabla(env);
  const token = tokenAleatorio();
  await q(
    env,
    `INSERT INTO password_resets (token_hash, user_id, expira)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [await sha256Hex(token), user.id, MINUTOS_VALIDEZ],
  );
  const base = (env.SITE_URL || 'https://www.kickoffiva.cl').replace(/\/$/, '');
  const link = `${base}/?restablecer=${token}#mi-iva`;
  const saludo = user.nombre ? `Hola ${user.nombre}:` : 'Hola:';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'KickoffIVA <onboarding@resend.dev>',
      to: [user.email],
      subject: 'Crea tu nueva contraseña de KickoffIVA',
      text: `${saludo}\n\nPara crear una contraseña nueva, abre este link (sirve por ${MINUTOS_VALIDEZ} minutos y una sola vez):\n${link}\n\nSi no lo pediste tú, ignora este correo: tu contraseña sigue igual.\n\nKickoffIVA`,
      html: `<p>${saludo}</p><p>Para crear una contraseña nueva, toca el botón (sirve por ${MINUTOS_VALIDEZ} minutos y una sola vez):</p><p><a href="${link}" style="display:inline-block;padding:14px 24px;background:#C8F04A;color:#0C0C0A;border-radius:999px;font-weight:600;text-decoration:none">Crear contraseña nueva</a></p><p>Si no lo pediste tú, ignora este correo: tu contraseña sigue igual.</p><p>KickoffIVA</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
}

/**
 * Valida y consume un token. Devuelve el user_id si es válido (no usado, no vencido),
 * o null. Marca el token como usado en la misma operación (un solo uso).
 */
export async function consumirToken(env: Env, token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  await asegurarTabla(env);
  const rows = (await q(
    env,
    `UPDATE password_resets SET usado = true
      WHERE token_hash = $1 AND usado = false AND expira > now()
      RETURNING user_id`,
    [await sha256Hex(token)],
  )) as { user_id: string }[];
  return rows[0]?.user_id ?? null;
}
