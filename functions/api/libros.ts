import { Hono } from 'hono';
import { q, type Env } from '../_lib/db';
import { authUser, resolveCompany } from '../_lib/jwt';
import { buildCsv } from '../_lib/csv';

const libros = new Hono<{ Bindings: Env }>();

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CSV_HEADERS = ['Fecha', 'RUT Emisor', 'Folio', 'Razón Social', 'Neto', 'IVA', 'Total'];

function isValidPeriodo(p: string): boolean {
  return PERIODO_RE.test(p);
}

function badPeriodo(c: any): Response {
  return c.json({ error: 'Periodo inválido, use formato YYYY-MM' }, 400);
}

interface LibroRow {
  fecha: string | null;
  rut_emisor: string | null;
  folio: string | number | null;
  razon_social: string | null;
  neto: number | string;
  iva: number | string;
  total: number | string | null;
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return '';
  // Normalize to YYYY-MM-DD regardless of driver date serialization.
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function libroCsv(
  c: any,
  companyId: string,
  tipo: 'compra' | 'venta',
  periodo: string,
): Promise<Response> {
  const rows = (await q(
    c.env,
    `SELECT fecha, rut_emisor, folio, razon_social, neto, iva, total
       FROM documents
      WHERE company_id = $1 AND tipo = $2
        AND periodo = $3
      ORDER BY fecha ASC, folio ASC`,
    [companyId, tipo, periodo],
  )) as LibroRow[];

  const dataRows: (string | number)[][] = rows.map((r) => [
    formatFecha(r.fecha),
    r.rut_emisor ?? '',
    r.folio != null ? String(r.folio) : '',
    r.razon_social ?? '',
    Math.round(Number(r.neto) || 0),
    Math.round(Number(r.iva) || 0),
    Math.round(Number(r.total) || 0),
  ]);

  const csv = buildCsv(CSV_HEADERS, dataRows);
  const filename =
    tipo === 'compra'
      ? `libro-compras-${periodo}.csv`
      : `libro-ventas-${periodo}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

libros.get('/compra', async (c) => {
  const user = await authUser(c);
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const companyId = await resolveCompany(c, user.userId);
  if (!companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);
  const periodo = c.req.query('periodo') ?? '';
  if (!isValidPeriodo(periodo)) return badPeriodo(c);
  return libroCsv(c, companyId, 'compra', periodo);
});

libros.get('/venta', async (c) => {
  const user = await authUser(c);
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const companyId = await resolveCompany(c, user.userId);
  if (!companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);
  const periodo = c.req.query('periodo') ?? '';
  if (!isValidPeriodo(periodo)) return badPeriodo(c);
  return libroCsv(c, companyId, 'venta', periodo);
});

interface UploadDoc {
  fecha?: string;
  rutEmisor?: string;
  folio?: string | number;
  neto?: number;
  iva?: number;
  total?: number;
  razonSocial?: string;
}

interface UploadBody {
  periodo?: string;
  tipo?: 'compra' | 'venta';
  documentos?: UploadDoc[];
}

const MAX_DOCS = 2000;

function isNonNegInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

libros.post('/upload', async (c) => {
  const user = await authUser(c);
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const companyId = await resolveCompany(c, user.userId);
  if (!companyId) return c.json({ error: 'Primero agrega tu empresa' }, 400);

  let body: UploadBody;
  try {
    body = await c.req.json<UploadBody>();
  } catch {
    return c.json({ error: 'JSON inválido' }, 400);
  }

  const { periodo, tipo, documentos } = body;
  if (!periodo || !isValidPeriodo(periodo)) return badPeriodo(c);
  if (tipo !== 'compra' && tipo !== 'venta') {
    return c.json({ error: 'tipo debe ser "compra" o "venta"' }, 400);
  }
  if (!Array.isArray(documentos)) {
    return c.json({ error: 'documentos debe ser un arreglo' }, 400);
  }
  if (documentos.length > MAX_DOCS) {
    return c.json({ error: `Máximo ${MAX_DOCS} documentos por carga` }, 400);
  }

  for (let i = 0; i < documentos.length; i++) {
    const d = documentos[i] ?? {};
    const folioOk =
      d.folio !== undefined && d.folio !== null && String(d.folio).trim() !== '';
    if (!isNonNegInt(d.neto) || !isNonNegInt(d.iva) || !folioOk) {
      return c.json(
        {
          error: `Documento inválido en índice ${i}: neto/iva deben ser enteros >= 0 y folio no vacío`,
          index: i,
        },
        400,
      );
    }
  }

  let insertados = 0;
  let duplicados = 0;

  for (const d of documentos) {
    const neto = d.neto as number;
    const iva = d.iva as number;
    const total = isNonNegInt(d.total) ? d.total : neto + iva;
    const result = (await q(
      c.env,
      `INSERT INTO documents
         (id, company_id, periodo, tipo, fecha, rut_emisor, folio, razon_social, neto, iva, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (company_id, tipo, folio, rut_emisor) DO NOTHING
       RETURNING id`,
      [
        crypto.randomUUID(),
        companyId,
        periodo,
        tipo,
        d.fecha ?? null,
        d.rutEmisor ?? null,
        String(d.folio).trim(),
        d.razonSocial ?? null,
        neto,
        iva,
        total,
      ],
    )) as { id: string }[];
    if (result.length > 0) insertados += 1;
    else duplicados += 1;
  }

  return c.json({ insertados, duplicados });
});

export default libros;
