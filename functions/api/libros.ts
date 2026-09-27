import { Hono } from 'hono';
import { type Env } from '../_lib/db';
import { authUser, resolveCompany } from '../_lib/jwt';
import { buildCsv } from '../_lib/csv';
import { insertDoc, loadDocs } from '../_lib/documents';

const libros = new Hono<{ Bindings: Env }>();

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CSV_HEADERS = ['Fecha', 'RUT Emisor', 'Folio', 'Razón Social', 'Neto', 'IVA', 'Total'];

function isValidPeriodo(p: string): boolean {
  return PERIODO_RE.test(p);
}

function badPeriodo(c: any): Response {
  return c.json({ error: 'Periodo inválido, use formato YYYY-MM' }, 400);
}

async function libroCsv(
  c: any,
  companyId: string,
  tipo: 'compra' | 'venta',
  periodo: string,
): Promise<Response> {
  // Los documentos se guardan cifrados; loadDocs los descifra y ordena por fecha/folio.
  const docs = await loadDocs(c.env, companyId, periodo, tipo);

  const dataRows: (string | number)[][] = docs.map((d) => [
    d.fecha ?? '',
    d.rutEmisor ?? '',
    d.folio ?? '',
    d.razonSocial ?? '',
    d.neto,
    d.iva,
    d.total,
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
    const ok = await insertDoc(c.env, companyId, periodo, tipo, {
      fecha: d.fecha ?? null,
      rutEmisor: d.rutEmisor ?? null,
      folio: String(d.folio).trim(),
      razonSocial: d.razonSocial ?? null,
      neto,
      iva,
      total,
    });
    if (ok) insertados += 1;
    else duplicados += 1;
  }

  return c.json({ insertados, duplicados });
});

export default libros;
