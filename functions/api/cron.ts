/**
 * Endpoints del cron de alertas — protegidos con x-cron-secret (env.CRON_SECRET).
 *
 *   POST /generar  → crea las alertas del día para todas las empresas
 *                    (idempotente: UNIQUE(company_id, periodo, tipo))
 *   GET  /hoy      → lista las alertas pendientes de hoy con link wa.me
 *
 * Pensado para ser llamado 1 vez al día (09:07 hora Chile) por la
 * automatización programada de KickoffIVA.
 */
import { Hono } from 'hono';
import { q, type Env } from '../_lib/db';
import { alertaDelDia, alertaSiiNotificacion, hoyEnChile, waLink, type DatosEmpresa } from '../_lib/alerts';
import { getSiiCreds } from '../_lib/crypto';
import { SiiClient } from '../_sii/client';

const cron = new Hono<{ Bindings: Env & { CRON_SECRET?: string } }>();

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
  ventas_netas: number | string | null;
  compras_netas: number | string | null;
  debito: number | string | null;
  credito: number | string | null;
}

async function empresasConTotales(env: Env, periodo: string): Promise<DatosEmpresa[]> {
  const rows = (await q(
    env,
    `SELECT c.id, c.nombre, u.nombre AS persona, u.telefono, c.tasa_ppm,
            COALESCE(SUM(CASE WHEN d.tipo = 'venta'  THEN d.neto END), 0) AS ventas_netas,
            COALESCE(SUM(CASE WHEN d.tipo = 'compra' THEN d.neto END), 0) AS compras_netas,
            COALESCE(SUM(CASE WHEN d.tipo = 'venta'  THEN d.iva END), 0)  AS debito,
            COALESCE(SUM(CASE WHEN d.tipo = 'compra' THEN d.iva END), 0)  AS credito
       FROM companies c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN documents d ON d.company_id = c.id AND d.periodo = $1
      GROUP BY c.id, c.nombre, u.nombre, u.telefono, c.tasa_ppm`,
    [periodo],
  )) as EmpresaRow[];

  return rows.map((r) => {
    const ventasNetas = Number(r.ventas_netas) || 0;
    const comprasNetas = Number(r.compras_netas) || 0;
    const debitoFiscal = Number(r.debito) || 0;
    const creditoFiscal = Number(r.credito) || 0;
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

  const { fecha, dia, periodo } = hoyEnChile();
  const empresas = await empresasConTotales(c.env, periodo);

  let creadas = 0;
  const tipos: Record<string, number> = {};
  for (const e of empresas) {
    const alerta = alertaDelDia(dia, e, periodo);
    if (!alerta) continue;
    const result = (await q(
      c.env,
      `INSERT INTO alerts (id, company_id, periodo, tipo, mensaje, telefono, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (company_id, periodo, tipo) DO NOTHING
       RETURNING id`,
      [crypto.randomUUID(), e.companyId, periodo, alerta.tipo, alerta.mensaje, e.telefono, fecha],
    )) as { id: string }[];
    if (result.length > 0) {
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
      const result = (await q(
        c.env,
        `INSERT INTO alerts (id, company_id, periodo, tipo, mensaje, telefono, fecha)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (company_id, periodo, tipo) DO NOTHING
         RETURNING id`,
        [
          crypto.randomUUID(),
          emp.id,
          periodo,
          tipo,
          alertaSiiNotificacion(emp.persona, emp.nombre, notif.titulos),
          emp.telefono,
          fecha,
        ],
      )) as { id: string }[];
      if (result.length > 0) {
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

  const { fecha } = hoyEnChile();
  const rows = (await q(
    c.env,
    `SELECT a.id, a.tipo, a.mensaje, a.telefono, a.enviada_en,
            c.nombre AS empresa, c.rut
       FROM alerts a
       JOIN companies c ON c.id = a.company_id
      WHERE a.fecha = $1
      ORDER BY a.created_at ASC`,
    [fecha],
  )) as Array<{
    id: string;
    tipo: string;
    mensaje: string;
    telefono: string | null;
    enviada_en: string | null;
    empresa: string;
    rut: string;
  }>;

  return c.json({
    fecha,
    alertas: rows.map((r) => ({
      id: r.id,
      empresa: r.empresa,
      rut: r.rut,
      tipo: r.tipo,
      mensaje: r.mensaje,
      telefono: r.telefono,
      enviada: Boolean(r.enviada_en),
      waLink: r.telefono ? waLink(r.telefono, r.mensaje) : null,
    })),
  });
});

export default cron;
