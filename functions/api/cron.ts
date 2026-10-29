/**
 * Endpoints del cron de alertas — protegidos con x-cron-secret (env.CRON_SECRET).
 *
 *   POST /generar  → crea las alertas del día para todas las empresas
 *                    (idempotente: UNIQUE(company_id, periodo, tipo))
 *   GET  /hoy      → lista las alertas pendientes de hoy con link wa.me
 *   POST /recifrar → cifra/rota todo lo sensible con la llave actual (ver abajo)
 *
 * Pensado para ser llamado 1 vez al día (09:07 hora Chile) por la
 * automatización programada de KickoffIVA.
 */
import { Hono, type Context } from 'hono';
import { q, type Env } from '../_lib/db';
import { alertaDelDia, alertaSiiNotificacion, hoyEnChile, waLink, type DatosEmpresa } from '../_lib/alerts';
import { SiiClient } from '../_sii/client';
import { getSiiCreds, recifrarClaves } from '../_lib/crypto';
import { loadDocsPeriodo, recifrarDocs, eliminarColumnasLegacy } from '../_lib/documents';
import { ensureAlertsTable, insertAlerta, descifrarAlerta, recifrarAlertas } from '../_lib/alertas';

type CronBindings = { Bindings: Env & { CRON_SECRET?: string } };
const cron = new Hono<CronBindings>();

function autorizado(c: any): boolean {
  const secret = c.env.CRON_SECRET;
  if (!secret) return false; // sin secret configurado, el cron no existe
  return c.req.header('x-cron-secret') === secret;
}

interface EmpresaRow {
  id: string;
  nombre: string;
  persona: string | null;
  telefono: string | null;
  tasa_ppm: number | string | null;
}

async function empresasConTotales(env: Env, periodo: string): Promise<DatosEmpresa[]> {
  const rows = (await q(
    env,
    `SELECT c.id, c.nombre, u.nombre AS persona, u.telefono, c.tasa_ppm
       FROM companies c
       JOIN users u ON u.id = c.user_id`,
  )) as EmpresaRow[];
  // Los documentos están cifrados: se descifran en la app y se suman aquí.
  const porEmpresa = await loadDocsPeriodo(env, periodo);

  return rows.map((r) => {
    let ventasNetas = 0, comprasNetas = 0, debitoFiscal = 0, creditoFiscal = 0;
    for (const d of porEmpresa.get(r.id) ?? []) {
      if (d.tipo === 'venta') { ventasNetas += d.neto; debitoFiscal += d.iva; }
      else if (d.tipo === 'compra') { comprasNetas += d.neto; creditoFiscal += d.iva; }
    }
    const ivaAPagar = Math.max(0, debitoFiscal - creditoFiscal);
    const tasaPpm = Number(r.tasa_ppm) || 0;
    const ppm = Math.round(ventasNetas * tasaPpm);
    const tieneDatos = ventasNetas + comprasNetas > 0;
    return {
      companyId: r.id,
      nombreEmpresa: r.nombre,
      nombrePersona: r.persona,
      telefono: r.telefono,
      ventasNetas,
      comprasNetas,
      debitoFiscal,
      creditoFiscal,
      ivaAPagar,
      ppm,
      totalAPagar: ivaAPagar + ppm,
      tieneDatos,
    };
  });
}

cron.post('/generar', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'No autorizado' }, 401);

  await ensureAlertsTable(c.env);
  const { fecha, dia, periodo } = hoyEnChile();
  const empresas = await empresasConTotales(c.env, periodo);

  let creadas = 0;
  const tipos: Record<string, number> = {};
  for (const e of empresas) {
    const alerta = alertaDelDia(dia, e, periodo);
    if (!alerta) continue;
    const creada = await insertAlerta(c.env, {
      companyId: e.companyId,
      periodo,
      tipo: alerta.tipo,
      mensaje: alerta.mensaje,
      telefono: e.telefono,
      fecha,
    });
    if (creada) {
      creadas += 1;
      tipos[alerta.tipo] = (tipos[alerta.tipo] ?? 0) + 1;
    }
  }

  // ── Revisión del buzón SII (solo empresas con clave configurada) ──
  // Best-effort: si el portal falla o cambia, se silencia y se sigue.
  const conSii = (await q(
    c.env,
    `SELECT c.id, c.nombre, u.nombre AS persona, u.telefono
       FROM companies c
       JOIN users u ON u.id = c.user_id
      WHERE c.sii_rut IS NOT NULL AND c.sii_clave_enc IS NOT NULL`,
  )) as Array<{ id: string; nombre: string; persona: string | null; telefono: string | null }>;

  let siiRevisadas = 0;
  for (const emp of conSii) {
    try {
      const creds = await getSiiCreds(c.env, emp.id);
      if (!creds) continue;
      const client = new SiiClient(c.env as { SII_MOCK?: string });
      await client.login(creds.rut, creds.clave);
      const notif = await client.getNotificaciones();
      siiRevisadas += 1;
      if (!notif.hay) continue;
      // Dedupe por contenido: cada notificación distinta genera su propia fila.
      const clave = notif.titulos.join('|') || 'sin-detalle';
      let hash = 0;
      for (let i = 0; i < clave.length; i++) hash = (hash * 31 + clave.charCodeAt(i)) >>> 0;
      const tipo = `sii_notif_${hash.toString(36)}`;
      const creada = await insertAlerta(c.env, {
        companyId: emp.id,
        periodo,
        tipo,
        mensaje: alertaSiiNotificacion(emp.persona, emp.nombre, notif.titulos),
        telefono: emp.telefono,
        fecha,
      });
      if (creada) {
        creadas += 1;
        tipos.sii_notificacion = (tipos.sii_notificacion ?? 0) + 1;
      }
    } catch {
      // Silencioso: SII caído, WAF, clave rechazada o markup nuevo.
    }
  }

  return c.json({ fecha, dia, periodo, empresas: empresas.length, creadas, tipos, siiRevisadas });
});

cron.get('/hoy', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'No autorizado' }, 401);

  await ensureAlertsTable(c.env);
  const { fecha } = hoyEnChile();
  const rows = (await q(
    c.env,
    `SELECT a.id, a.company_id, a.tipo, a.mensaje, a.telefono, a.enviada_en, a.canal,
            c.nombre AS empresa, c.rut, u.email, u.nombre AS persona
       FROM alerts a
       JOIN companies c ON c.id = a.company_id
       JOIN users u ON u.id = c.user_id
      WHERE a.fecha = $1
      ORDER BY a.created_at ASC`,
    [fecha],
  )) as Array<{
    id: string;
    company_id: string;
    tipo: string;
    mensaje: string;
    telefono: string | null;
    enviada_en: string | null;
    canal: string | null;
    empresa: string;
    rut: string;
    email: string;
    persona: string | null;
  }>;

  // Mensaje y teléfono vienen cifrados: se descifran solo para esta respuesta.
  const alertas = await Promise.all(
    rows.map(async (r) => {
      const { mensaje, telefono } = await descifrarAlerta(c.env, r.company_id, r.mensaje, r.telefono);
      return {
        id: r.id,
        empresa: r.empresa,
        rut: r.rut,
        persona: r.persona,
        email: r.email,
        tipo: r.tipo,
        mensaje,
        telefono,
        enviada: Boolean(r.enviada_en),
        canal: r.canal,
        waLink: telefono ? waLink(telefono, mensaje) : null,
      };
    }),
  );
  return c.json({ fecha, alertas });
});

/** POST /enviada { id, canal } → marca una alerta como enviada (idempotente). */
cron.post('/enviada', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'No autorizado' }, 401);
  await ensureAlertsTable(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { id?: unknown; canal?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const canal = typeof body.canal === 'string' ? body.canal.slice(0, 20) : 'manual';
  if (!id) return c.json({ error: 'id requerido' }, 400);
  const rows = (await q(
    c.env,
    `UPDATE alerts SET enviada_en = COALESCE(enviada_en, now()), canal = COALESCE(canal, $2)
      WHERE id = $1 RETURNING id`,
    [id, canal],
  )) as { id: string }[];
  if (rows.length === 0) return c.json({ error: 'Alerta no encontrada' }, 404);
  return c.json({ ok: true });
});

/**
 * POST /recifrar (alias histórico: /migrar-documentos) → job de cifrado/rotación.
 *
 * En lotes, deja TODO lo sensible cifrado con la llave actual (SII_ENC_KEY):
 *   - documents: filas legacy en claro, v1, o v2 de una llave anterior → v2 actual
 *   - companies.sii_clave_enc: formato heredado o llave anterior → v2 actual
 *   - alerts: mensaje/teléfono en claro o de llave anterior → v2 actual
 * Cuando ya no queda ningún documento en claro, borra las columnas en claro de
 * `documents`. Idempotente; el Worker lo llama hasta que pendientes = 0.
 * Al terminar una rotación (pendientes = 0, errores = 0) se puede quitar
 * SII_ENC_KEY_PREVIOUS.
 */
async function recifrar(c: Context<CronBindings>) {
  if (!autorizado(c)) return c.json({ error: 'No autorizado' }, 401);
  const documentos = await recifrarDocs(c.env, 500);
  const claves = await recifrarClaves(c.env, 500);
  const alertas = await recifrarAlertas(c.env, 500);
  const columnasLegacy = await eliminarColumnasLegacy(c.env);
  return c.json({
    ok: true,
    documentos,
    claves,
    alertas,
    columnasLegacy,
    // Compatibilidad con el Worker: sigue llamando mientras pendientes > 0.
    migradas: documentos.recifrados,
    pendientes: documentos.pendientes + claves.pendientes + alertas.pendientes,
    errores: documentos.errores + claves.errores + alertas.errores,
  });
}
cron.post('/recifrar', recifrar);
cron.post('/migrar-documentos', recifrar);

export default cron;
