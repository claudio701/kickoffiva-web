/**
 * client.ts — Cliente del portal SII (solo fetch + WebCrypto, Cloudflare Workers).
 *
 * Flujo real (producción):
 *   1. Login con RUT + Clave Tributaria contra el CGI clásico de autenticación:
 *        POST https://zeus.sii.cl/cgi_AUT2000/CAutInicio.cgi
 *      (zeusr.sii.cl es espejo; formulario origen:
 *        https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html)
 *      Campos: rut (cuerpo), dv, referencia, clave, 411 (constante opaca de la
 *      página). Éxito = redirección FUERA del host zeus (p.ej. misiir.sii.cl)
 *      con cookies TOKEN / CSESSIONID / NETSCAPE_LIVEWIRE.*.
 *      Fallo de clave = la respuesta se QUEDA en zeus.sii.cl (HTML con el
 *      mensaje de error). Se hace UN solo intento: cada intento fallido cuenta
 *      para el bloqueo de cuenta del contribuyente.
 *   2. Descarga del CSV del Registro de Compras y Ventas desde el portal RCV:
 *        https://www4.sii.cl/consdcvinternetui/
 *      Endpoint de descarga (ingeniería inversa del SPA "Descargar detalles"):
 *        GET /consdcvinternetui/sdiDownload?fileName=RCV_{COMPRA|VENTA}_REGISTRO_{rut}_{periodo}.csv
 *      con las cookies de sesión y Referer/Origin de www4.sii.cl.
 *   3. El texto CSV se normaliza con parseRcvCsv (./parse).
 *
 * Modo mock (env.SII_MOCK === "1"): login siempre OK y los getters devuelven
 * los fixtures parseados — cero red. Es la vía por defecto en desarrollo y CI.
 *
 * Errores tipados:
 *   - CredencialesInvalidas: clave rechazada / sesión no establecida.
 *   - SiiNoDisponible: red, 5xx, markup cambiado, respuesta no-CSV.
 *
 * Limitaciones conocidas (ver docs/sii-connector.md):
 *   - El SII bloquea rangos de IP de datacenter (Cloudflare incluido) con
 *     WAF/captcha intermitente; el contrato HTML puede cambiar sin aviso.
 *   - sdiDownload es una URL inferida del comportamiento del SPA; el portal
 *     genera algunos CSV de forma diferida. La alternativa más robusta es el
 *     facade JSON POST .../consdcvinternetui/services/data/facadeService/
 *     {getResumen,getDetalleCompra,getDetalleVenta} (namespace
 *     cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/<op>,
 *     conversationId = valor de la cookie TOKEN). Se documenta como plan B.
 */

// Extensiones explícitas: las resuelve tanto esbuild (Cloudflare) como Node 24
// (type-stripping), así el cliente también se puede probar local sin compilar.
import { parseRcvCsv } from './parse.logic.mjs';
import { CSV_COMPRAS, CSV_VENTAS } from './fixtures.ts';

export class CredencialesInvalidas extends Error {
  constructor(message = 'El SII rechazó las credenciales') {
    super(message);
    this.name = 'CredencialesInvalidas';
  }
}

export class SiiNoDisponible extends Error {
  constructor(message = 'El SII no está disponible') {
    super(message);
    this.name = 'SiiNoDisponible';
  }
}

// ---------------------------------------------------------------------------
// Constantes del portal (producción)
// ---------------------------------------------------------------------------

/** Formulario público de login (GET, para extraer el campo oculto "411"). */
const LOGIN_FORM_URL = 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html';
/** CGI de autenticación. zeusr.sii.cl es espejo equivalente. */
const LOGIN_POST_URL = 'https://zeus.sii.cl/cgi_AUT2000/CAutInicio.cgi';
/** Destino post-login: lo usa el portal como `referencia` por defecto. */
const LOGIN_REFERENCIA = 'https://misiir.sii.cl/cgi_misii/siihome.cgi';
/** Base del portal RCV (SPA Angular). */
const RCV_BASE = 'https://www4.sii.cl';
/** Descarga de CSV "Descargar detalles" del RCV. */
const RCV_DOWNLOAD_URL = `${RCV_BASE}/consdcvinternetui/sdiDownload`;

/** Buzón de notificaciones electrónicas del contribuyente.
 *  OJO: el SII puede migrar esta URL o cambiar el markup sin aviso —
 *  getNotificaciones() es best-effort y falla en silencio controlado. */
const NOTIF_URL = 'https://www4.sii.cl/bolcoreinternetui/';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Timeout por request al SII: sus servidores pueden colgar la conexión con
 *  IPs de datacenter, y sin esto la Function moriría por límite de tiempo
 *  devolviendo una página HTML 502 en vez de un JSON controlado. */
const SII_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Cookie jar mínimo (Workers no tiene cookie store automático)
// ---------------------------------------------------------------------------

class CookieJar {
  private jar = new Map<string, string>();

  /** Absorbe todos los Set-Cookie de una respuesta. */
  absorb(res: Response): void {
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies: string[] =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : headers.get('set-cookie')
          ? [headers.get('set-cookie') as string]
          : [];
    for (const sc of setCookies) {
      const par = sc.split(';')[0];
      const eq = par.indexOf('=');
      if (eq > 0) this.jar.set(par.slice(0, eq).trim(), par.slice(eq + 1).trim());
    }
  }

  /** Header Cookie para hosts *.sii.cl (todas nuestras cookies son de .sii.cl). */
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  get size(): number {
    return this.jar.size;
  }
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

interface EnvLike {
  SII_MOCK?: string;
}

export class SiiClient {
  private readonly mock: boolean;
  private readonly jar = new CookieJar();
  private rutNormalizado: string | null = null; // "76123456-7"

  constructor(env: EnvLike = {}) {
    this.mock = env.SII_MOCK === '1';
  }

  /** "76.123.456-7" / "761234567" → { cuerpo: "76123456", dv: "7" } */
  private static splitRut(rut: string): { cuerpo: string; dv: string } {
    const limpio = rut.replace(/[.\s]/g, '').toUpperCase();
    const m = /^(\d{5,9})-?([\dK])$/.exec(limpio);
    if (!m) throw new CredencialesInvalidas(`RUT con formato inválido: "${rut}"`);
    return { cuerpo: m[1], dv: m[2] };
  }

  /**
   * Autentica contra el portal. Un solo intento (cada fallo cuenta para el
   * bloqueo de clave del contribuyente).
   * @throws {CredencialesInvalidas} clave/RUT rechazados
   * @throws {SiiNoDisponible} red/5xx/markup inesperado
   */
  async login(rut: string, clave: string): Promise<void> {
    const { cuerpo, dv } = SiiClient.splitRut(rut);
    this.rutNormalizado = `${cuerpo}-${dv}`;
    if (this.mock) return;

    // El formulario incluye un campo oculto de nombre "411" con una constante
    // opaca; se lee de la página pública. Si cambia el markup, se sigue con
    // string vacío (el portal históricamente no lo valida en servidor).
    let codigo411 = '';
    try {
      const formRes = await fetch(LOGIN_FORM_URL, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(SII_TIMEOUT_MS),
      });
      if (formRes.ok) {
        const html = await formRes.text();
        this.jar.absorb(formRes);
        const m =
          /name=["']411["'][^>]*value=["']([^"']*)["']/i.exec(html) ??
          /value=["']([^"']*)["'][^>]*name=["']411["']/i.exec(html);
        if (m) codigo411 = m[1];
      }
    } catch {
      // Best-effort: el POST puede funcionar igual.
    }

    const body = new URLSearchParams({
      rut: cuerpo,
      dv,
      referencia: LOGIN_REFERENCIA,
      clave,
      '411': codigo411,
    });

    let res: Response;
    try {
      res = await fetch(LOGIN_POST_URL, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: LOGIN_FORM_URL,
          Cookie: this.jar.header(),
        },
        body: body.toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(SII_TIMEOUT_MS),
      });
    } catch (e) {
      throw new SiiNoDisponible(`No se pudo contactar zeus.sii.cl: ${(e as Error).message}`);
    }

    // Éxito: 3xx hacia OTRO host (misiir/palena/www4…). Clave mala: 200 o
    // redirección que se queda en zeus.sii.cl con el error en el body.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? '';
      this.jar.absorb(res);
      let host = '';
      try {
        host = new URL(location, LOGIN_POST_URL).host;
      } catch {
        /* location relativa malformada */
      }
      if (host && !/^zeusr?\.sii\.cl$/i.test(host)) {
        if (this.jar.size === 0) {
          throw new SiiNoDisponible('Login aceptado pero sin cookies de sesión (markup cambió)');
        }
        return; // autenticado
      }
      throw new CredencialesInvalidas();
    }
    if (res.ok) {
      // Se quedó en el login: rechazo de credenciales (el portal responde 200
      // con el mensaje "La Clave Tributaria ingresada no es correcta…").
      throw new CredencialesInvalidas();
    }
    if (res.status >= 500) {
      throw new SiiNoDisponible(`zeus.sii.cl respondió HTTP ${res.status}`);
    }
    throw new SiiNoDisponible(`Respuesta inesperada del login SII (HTTP ${res.status})`);
  }

  /**
   * Descarga y normaliza el Registro de Compras del período.
   * @param periodo "AAAAMM" (p.ej. "202601")
   * @throws {SiiNoDisponible | CredencialesInvalidas | FormatoDesconocido}
   */
  async getLibroCompras(periodo: string) {
    if (this.mock) return parseRcvCsv(CSV_COMPRAS, 'compra');
    return this.descargarLibro('compra', periodo);
  }

  /** Descarga y normaliza el Registro de Ventas del período. */
  async getLibroVentas(periodo: string) {
    if (this.mock) return parseRcvCsv(CSV_VENTAS, 'venta');
    return this.descargarLibro('venta', periodo);
  }

  /**
   * Revisa el buzón de notificaciones del SII (best-effort).
   * Devuelve { hay: boolean, titulos: string[] }.
   * Ante WAF, markup nuevo o sesión caída lanza SiiNoDisponible —
   * el llamador decide silenciar: esta revisión nunca debe romper el cron.
   */
  async getNotificaciones(): Promise<{ hay: boolean; titulos: string[] }> {
    if (this.mock) return { hay: false, titulos: [] };
    if (!this.rutNormalizado) {
      throw new CredencialesInvalidas('Se requiere login() antes de consultar notificaciones');
    }
    let res: Response;
    try {
      res = await fetch(NOTIF_URL, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: `${RCV_BASE}/`,
          Accept: 'text/html, */*',
          Cookie: this.jar.header(),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(SII_TIMEOUT_MS),
      });
    } catch (e) {
      throw new SiiNoDisponible(`No se pudo revisar el buzón: ${(e as Error).message}`);
    }
    this.jar.absorb(res);
    if (!res.ok) {
      throw new SiiNoDisponible(`Buzón de notificaciones respondió HTTP ${res.status}`);
    }
    const html = await res.text();
    // Marcadores típicos de notificación no leída (best-effort; el portal
    // puede usar otros textos — si cambian, esto simplemente devuelve vacío).
    const sinLeer =
      /(no le[ií]d|sin leer|nueva notificaci[oó]n|pendiente de lectura|badge[^<]*>\s*[1-9])/i.test(
        html,
      );
    const titulos = [...html.matchAll(/<t[dh][^>]*>([^<]{10,120})<\/t[dh]>/gi)]
      .map((m) => m[1].trim())
      .filter((t) => !/^\d+$/.test(t))
      .slice(0, 3);
    return { hay: sinLeer, titulos };
  }

  private async descargarLibro(tipo: 'compra' | 'venta', periodo: string) {
    if (!this.rutNormalizado) {
      throw new CredencialesInvalidas('Se requiere login() antes de descargar');
    }
    if (!/^\d{6}$/.test(periodo)) {
      throw new SiiNoDisponible(`Período inválido (se espera AAAAMM): "${periodo}"`);
    }
    const fileName = `RCV_${tipo === 'compra' ? 'COMPRA' : 'VENTA'}_REGISTRO_${this.rutNormalizado}_${periodo}.csv`;
    const url = `${RCV_DOWNLOAD_URL}?fileName=${encodeURIComponent(fileName)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: `${RCV_BASE}/consdcvinternetui/`,
          Origin: RCV_BASE,
          Accept: 'text/csv, application/octet-stream, */*',
          Cookie: this.jar.header(),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(SII_TIMEOUT_MS),
      });
    } catch (e) {
      throw new SiiNoDisponible(`No se pudo descargar el libro de ${tipo}: ${(e as Error).message}`);
    }
    this.jar.absorb(res);

    if (res.status === 401 || res.status === 403) {
      throw new CredencialesInvalidas('La sesión del SII expiró durante la descarga');
    }
    if (!res.ok) {
      throw new SiiNoDisponible(`Descarga RCV respondió HTTP ${res.status}`);
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const texto = await res.text();
    if (contentType.includes('html') || /^\s*<(!doctype|html)/i.test(texto.slice(0, 200))) {
      // El portal devolvió una página (sesión caída, WAF, o CSV diferido aún
      // no generado): no es un CSV parseable.
      throw new SiiNoDisponible(
        'El portal RCV devolvió HTML en vez de CSV (sesión caída, WAF o descarga diferida pendiente)',
      );
    }
    return parseRcvCsv(texto, tipo);
  }
}
