/**
 * api/sii.ts — Sub-router Hono del conector SII (Cloudflare Pages Functions).
 *
 *   POST /sincronizar   { "periodo": "AAAAMM" }   (Authorization: Bearer <jwt>)
 *
 * Flujo:
 *   1. authUser() valida el JWT → { userId, companyId }.
 *   2. getSiiCreds(env, companyId) recupera rut + clave tributaria cifrados
 *      (los guarda PUT /api/empresa/sii, ruta de otro agente).
 *   3. SiiClient.login() y descarga en paralelo de ambos libros
 *      (Promise.allSettled: un lado caído no tira el otro).
 *   4. Inserción cifrada e idempotente en `documents` (índice ciego por
 *      empresa+tipo+folio+RUT emisor; ver _lib/documents.ts).
 *
 * Respuestas:
 *   200 { periodo, compras: { n, errores? }, ventas: { n, errores? } }
 *   400 { error: "Credenciales SII no configuradas" }   (sin credenciales)
 *   400 { error: "Credenciales SII rechazadas por el portal" } (login rechazado)
 *   401 { error: "No autorizado" }
 *   503 { error: "El SII no está disponible, intenta más tarde" } (503 porque Cloudflare intercepta 502 de origen)
 */

import { Hono } from 'hono';
import { authUser, resolveCompany } from '../_lib/jwt';
import { getSiiCreds } from '../_lib/crypto';
import { insertDoc } from '../_lib/documents';
import {
  SiiClient,
  CredencialesInvalidas,
  SiiNoDisponible,
} from '../_sii/client';
import type { DocumentoRcv } from '../_sii/parse';

const SII_NO_DISPONIBLE = 'El SII no está disponible, intenta más tarde';

interface ResultadoLibro {
  n: number;
  errores?: number;
}

const app = new Hono();

app.post('/sincronizar', async (c: any) => {
  try {
    return await handleSincronizar(c);
  } catch (e) {
    console.error('SII sincronizar error:', e);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

async function handleSincronizar(c: any): Promise<Response> {
  const auth = await authUser(c);
  if (!auth) return c.json({ error: 'No autorizado' }, 401);
  const companyId = await resolveCompany(c, auth.userId);
  if (!companyId) {
    return c.json({ error: 'Primero agrega tu empresa' }, 400);
  }

  let periodo = '';
  try {
    const body = (await c.req.json()) as { periodo?: string };
    periodo = String(body.periodo ?? '');
  } catch {
    /* body vacío o no-JSON */
  }
  if (!/^\d{6}$/.test(periodo)) {
    return c.json({ error: 'periodo inválido (formato AAAAMM, p.ej. "202601")' }, 400);
  }
  // La tabla documents guarda periodo como char(7) 'YYYY-MM'.
  const periodoDb = `${periodo.slice(0, 4)}-${periodo.slice(4)}`;

  const creds = await getSiiCreds(c.env, companyId);
  if (!creds) {
    return c.json({ error: 'Credenciales SII no configuradas' }, 400);
  }

  const client = new SiiClient(c.env);
  try {
    await client.login(creds.rut, creds.clave);
  } catch (e) {
    if (e instanceof CredencialesInvalidas) {
      return c.json({ error: 'Credenciales SII rechazadas por el portal' }, 400);
    }
    if (e instanceof SiiNoDisponible) {
      return c.json({ error: SII_NO_DISPONIBLE }, 503);
    }
    throw e;
  }

  const [comprasRes, ventasRes] = await Promise.allSettled([
    client.getLibroCompras(periodo),
    client.getLibroVentas(periodo),
  ]);

  /** Inserta los docs de un libro y cuenta los errores de inserción. */
  const persistir = async (
    result: PromiseSettledResult<DocumentoRcv[]>,
    tipo: 'compra' | 'venta',
  ): Promise<ResultadoLibro> => {
    if (result.status === 'rejected') {
      if (result.reason instanceof SiiNoDisponible) throw result.reason; // → 503
      return { n: 0, errores: 1 }; // p.ej. FormatoDesconocido: se reporta, no se cae
    }
    const docs = result.value;
    let errores = 0;
    for (const doc of docs) {
      try {
        // Cifrado en la app + índice ciego: el duplicado no inserta (idempotente).
        await insertDoc(c.env, companyId, periodoDb, tipo, {
          folio: doc.folio,
          rutEmisor: doc.rutEmisor,
          fecha: doc.fecha,
          neto: doc.neto,
          iva: doc.iva,
          total: doc.total,
          razonSocial: doc.razonSocial,
        });
      } catch {
        errores++;
      }
    }
    return errores > 0 ? { n: docs.length, errores } : { n: docs.length };
  };

  try {
    const compras = await persistir(comprasRes, 'compra');
    const ventas = await persistir(ventasRes, 'venta');
    return c.json({ periodo, compras, ventas });
  } catch (e) {
    if (e instanceof SiiNoDisponible) {
      return c.json({ error: SII_NO_DISPONIBLE }, 503);
    }
    throw e;
  }
}

export default app;
