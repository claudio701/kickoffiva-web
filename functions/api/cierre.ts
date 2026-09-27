import { Hono } from 'hono';
import { q, type Env } from '../_lib/db';
import { authUser, resolveCompany } from '../_lib/jwt';
import { calcCierre, type DocSii } from '../_lib/iva';
import { loadDocs } from '../_lib/documents';

const cierre = new Hono<{ Bindings: Env }>();

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidPeriodo(p: string): boolean {
  return PERIODO_RE.test(p);
}

/** Current period (YYYY-MM) in America/Santiago timezone. */
function currentPeriodo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

cierre.get('/actual', async (c) => {
  const user = await authUser(c);
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const companyId = await resolveCompany(c, user.userId);
  if (!companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);
  const periodo = currentPeriodo();
  return handleCierre(c, companyId, periodo);
});

cierre.get('/:periodo', async (c) => {
  const user = await authUser(c);
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const companyId = await resolveCompany(c, user.userId);
  if (!companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);
  const periodo = c.req.param('periodo');
  if (!isValidPeriodo(periodo)) {
    return c.json({ error: 'Periodo inválido, use formato YYYY-MM' }, 400);
  }
  return handleCierre(c, companyId, periodo);
});

async function handleCierre(
  c: any,
  companyId: string,
  periodo: string,
): Promise<Response> {
  const env = c.env;

  // Documentos cifrados en la base; loadDocs los descifra.
  const docs = await loadDocs(env, companyId, periodo);

  const ventas: DocSii[] = [];
  const compras: DocSii[] = [];
  for (const d of docs) {
    const doc: DocSii = {
      fecha: d.fecha ?? undefined,
      rutEmisor: d.rutEmisor ?? undefined,
      folio: d.folio ?? undefined,
      neto: d.neto,
      iva: d.iva,
      total: d.total,
    };
    if (d.tipo === 'venta') ventas.push(doc);
    else if (d.tipo === 'compra') compras.push(doc);
  }

  const companyRows = (await q(
    env,
    `SELECT tasa_ppm FROM companies WHERE id = $1`,
    [companyId],
  )) as { tasa_ppm: number | string | null }[];
  const tasaPpm = Number(companyRows[0]?.tasa_ppm) || 0;

  const result = calcCierre(ventas, compras, tasaPpm);
  const estado =
    ventas.length + compras.length === 0 ? 'sin_datos' : 'listo';

  return c.json({
    periodo,
    ventasNetas: result.ventasNetas,
    comprasNetas: result.comprasNetas,
    debitoFiscal: result.debitoFiscal,
    creditoFiscal: result.creditoFiscal,
    ivaAPagar: result.ivaAPagar,
    creditoArrastrable: result.creditoArrastrable,
    ppm: result.ppm,
    tasaPpm,
    totalAPagar: result.totalAPagar,
    estado,
  });
}

export default cierre;
