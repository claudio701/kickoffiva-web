/**
 * Persistencia de la tabla `alerts` con cifrado en la aplicación.
 *
 * El mensaje (lleva montos de IVA/PPM calculados desde los libros del SII) y el
 * teléfono se guardan cifrados con el llavero ("v2.<kid>.…"), amarrados a la
 * empresa por AAD. En claro quedan solo id, empresa, período, tipo, fechas y canal.
 * Las filas antiguas en claro se leen tal cual hasta que el job de recifrado las cifre.
 */
import { q, type Env } from './db';
import { llaveroDesdeEnv, type Llavero } from './crypto';
import {
  cifrar as _cifrar,
  descifrar as _descifrar,
  estaCifrado as _estaCifrado,
  prefijoActual as _prefijoActual,
} from './keyring.logic.mjs';

const cifrar: (l: Llavero, proposito: string, contexto: string, texto: string) => Promise<string> = _cifrar;
const descifrar: (l: Llavero, proposito: string, contexto: string, blob: string) => Promise<string> = _descifrar;
const estaCifrado: (v: unknown) => boolean = _estaCifrado;
const prefijoActual: (l: Llavero) => string = _prefijoActual;

const P_MENSAJE = 'alerta-mensaje';
const P_TELEFONO = 'alerta-telefono';

/**
 * Crea la tabla alerts si no existe (idempotente, una vez por isolate).
 * Evita depender de una migración manual para que el cron funcione.
 */
let alertsTableChecked = false;
export async function ensureAlertsTable(env: Env): Promise<void> {
  if (alertsTableChecked) return;
  await q(
    env,
    `CREATE TABLE IF NOT EXISTS alerts (
       id          text PRIMARY KEY,
       company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
       periodo     char(7) NOT NULL,
       tipo        text NOT NULL,
       mensaje     text NOT NULL,
       telefono    text,
       fecha       date NOT NULL,
       enviada_en  timestamptz,
       canal       text,
       created_at  timestamptz NOT NULL DEFAULT now(),
       UNIQUE (company_id, periodo, tipo)
     )`,
  );
  await q(env, `CREATE INDEX IF NOT EXISTS alerts_fecha_idx ON alerts (fecha)`);
  alertsTableChecked = true;
}

/** Inserta una alerta cifrada. Devuelve true si se creó (false si ya existía ese tipo). */
export async function insertAlerta(
  env: Env,
  a: { companyId: string; periodo: string; tipo: string; mensaje: string; telefono: string | null; fecha: string },
): Promise<boolean> {
  const llavero = await llaveroDesdeEnv(env);
  const [mensaje, telefono] = await Promise.all([
    cifrar(llavero, P_MENSAJE, a.companyId, a.mensaje),
    a.telefono ? cifrar(llavero, P_TELEFONO, a.companyId, a.telefono) : Promise.resolve(null),
  ]);
  const rows = (await q(
    env,
    `INSERT INTO alerts (id, company_id, periodo, tipo, mensaje, telefono, fecha)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (company_id, periodo, tipo) DO NOTHING
     RETURNING id`,
    [crypto.randomUUID(), a.companyId, a.periodo, a.tipo, mensaje, telefono, a.fecha],
  )) as { id: string }[];
  return rows.length > 0;
}

async function abrir(llavero: Llavero, proposito: string, companyId: string, v: string | null): Promise<string | null> {
  if (v == null) return null;
  return estaCifrado(v) ? descifrar(llavero, proposito, companyId, v) : v; // fila antigua en claro
}

/**
 * Descifra mensaje y teléfono de una alerta. Si una fila no descifra (alterada o de
 * una llave retirada) se devuelve un aviso en vez de tumbar el resumen completo.
 */
export async function descifrarAlerta(
  env: Env,
  companyId: string,
  mensaje: string,
  telefono: string | null,
): Promise<{ mensaje: string; telefono: string | null; ok: boolean }> {
  const llavero = await llaveroDesdeEnv(env);
  try {
    const [m, t] = await Promise.all([
      abrir(llavero, P_MENSAJE, companyId, mensaje),
      abrir(llavero, P_TELEFONO, companyId, telefono),
    ]);
    return { mensaje: m ?? '', telefono: t, ok: true };
  } catch {
    return { mensaje: '[alerta ilegible: no se pudo descifrar]', telefono: null, ok: false };
  }
}

/** Cifra con la llave actual las alertas que no lo estén (en claro o llave anterior). */
export async function recifrarAlertas(
  env: Env,
  limite = 500,
): Promise<{ recifradas: number; errores: number; pendientes: number }> {
  await ensureAlertsTable(env);
  const llavero = await llaveroDesdeEnv(env);
  const prefijo = prefijoActual(llavero);
  const filtro = `mensaje NOT LIKE $1 OR (telefono IS NOT NULL AND telefono NOT LIKE $1)`;
  const rows = (await q(
    env,
    `SELECT id, company_id, mensaje, telefono FROM alerts WHERE ${filtro} ORDER BY id LIMIT $2`,
    [prefijo, limite],
  )) as Array<{ id: string; company_id: string; mensaje: string; telefono: string | null }>;
  let recifradas = 0;
  let errores = 0;
  for (const r of rows) {
    try {
      const m = await abrir(llavero, P_MENSAJE, r.company_id, r.mensaje);
      const t = await abrir(llavero, P_TELEFONO, r.company_id, r.telefono);
      const [mc, tc] = await Promise.all([
        cifrar(llavero, P_MENSAJE, r.company_id, m ?? ''),
        t ? cifrar(llavero, P_TELEFONO, r.company_id, t) : Promise.resolve(null),
      ]);
      await q(env, `UPDATE alerts SET mensaje = $2, telefono = $3 WHERE id = $1`, [r.id, mc, tc]);
      recifradas += 1;
    } catch {
      errores += 1;
    }
  }
  const rest = (await q(env, `SELECT count(*)::int AS n FROM alerts WHERE ${filtro}`, [prefijo])) as { n: number }[];
  return { recifradas, errores, pendientes: Number(rest[0]?.n ?? 0) };
}
