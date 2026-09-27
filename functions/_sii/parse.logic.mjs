/**
 * parse.logic.mjs — Parser del CSV "Registro de Compras y Ventas" (RCV) del SII.
 *
 * Formato esperado (descarga "Descargar detalles" del portal RCV,
 * https://www4.sii.cl/consdcvinternetui/):
 *   - Separador `;` (se tolera `,` si domina en la cabecera)
 *   - Números en formato chileno: puntos como miles ("1.234.567"),
 *     coma decimal opcional, negativos con "-" o paréntesis contables "(1.190)"
 *   - Cabeceras en español, orden variable: "Fecha Docto", "Nro"/"Folio",
 *     "RUT Proveedor"/"RUT Cliente"/"RUT", "Razon Social",
 *     "Monto Neto", "Monto IVA"/"Monto IVA Recuperable"/"IVA", "Monto Total"
 *   - Filas finales de resumen/totales (sin fecha ni folio) que se omiten
 *   - BOM UTF-8 opcional
 *
 * Cualquier layout irreconocible lanza FormatoDesconocido — nunca se adivina.
 *
 * Este archivo es .mjs a propósito: cero dependencias y sin sintaxis TS, para
 * que `node --test` lo importe directo. `parse.ts` solo re-exporta.
 */

export class FormatoDesconocido extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormatoDesconocido';
  }
}

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

/** Divide una línea CSV respetando comillas dobles ("" = comilla literal). */
export function splitCsvLinea(linea, delim) {
  const out = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (enComillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += ch;
      }
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === delim) {
      out.push(campo);
      campo = '';
    } else {
      campo += ch;
    }
  }
  out.push(campo);
  return out;
}

/**
 * Parsea un número chileno a entero: "1.234.567" → 1234567,
 * "-15.966" → -15966, "(119.000)" → -119000, "1.234,56" → 1235.
 * Vacío/null → 0. Lanza FormatoDesconocido si no parece número.
 */
export function parseNumeroChileno(valor) {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') return Math.round(valor);
  let s = String(valor).trim();
  if (s === '' || s === '-') return 0;
  let negativo = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negativo = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$\s ]/g, '');
  if (s.startsWith('-')) {
    negativo = !negativo;
    s = s.slice(1);
  }
  // Formato chileno: '.' miles, ',' decimales.
  s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new FormatoDesconocido(`Valor numérico irreconocible: "${valor}"`);
  }
  const n = Math.round(Number(s));
  return negativo ? -n : n;
}

/** Normaliza una fecha a ISO YYYY-MM-DD. Acepta DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY e ISO. Irreconocible → null. */
export function parseFecha(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

/** Normaliza un RUT a `cuerpo-dv` (sin puntos, DV mayúscula). */
export function normalizarRut(rut) {
  if (rut === null || rut === undefined) return null;
  const limpio = String(rut).replace(/[.\s]/g, '').toUpperCase();
  const m = /^(\d{5,9})-?([\dK])$/.exec(limpio);
  if (!m) return limpio || null;
  return `${m[1]}-${m[2]}`;
}

// ---------------------------------------------------------------------------
// Mapeo de cabeceras
// ---------------------------------------------------------------------------

/** Minúsculas, sin tildes, sin caracteres no alfanuméricos. */
function normalizarHeader(h) {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Busca la primera columna cuyo header normalizado calce con algún alias. */
function buscar(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function mapearColumnas(headersRaw) {
  const h = headersRaw.map(normalizarHeader);
  return {
    // Orden importa: aliases más específicos primero.
    // Nota: en el CSV real del RCV la columna "Nro" es el correlativo de fila
    // y "Folio" es el folio del documento; por eso "folio" va antes que "nro".
    fecha: buscar(h, ['fechadocto', 'fechaemision', 'fechadoc', 'fchdoc', 'fecha']),
    rutEmisor: buscar(h, ['rutproveedor', 'rutcliente', 'rutemisor', 'rutdoc', 'rut']),
    folio: buscar(h, ['folio', 'foliodoc', 'nrodoc', 'numerodoc', 'numdoc', 'nro']),
    neto: buscar(h, ['montoneto', 'mntneto', 'totneto', 'neto']),
    iva: buscar(h, ['montoivarecuperable', 'montoiva', 'mntiva', 'totiva', 'iva']),
    total: buscar(h, ['montototal', 'mnttotal', 'montodocumento', 'tottotal', 'total']),
    razonSocial: buscar(h, ['razonsocial', 'rznsoc', 'nombre']),
  };
}

/** Fila de resumen/totales: sin fecha ni folio, o marcada con palabra clave. */
function esFilaResumen(celdaFecha, celdaFolio, cols) {
  const etiqueta = cols
    .slice(0, 3)
    .map((c) => normalizarHeader(c))
    .join('|');
  if (/total|resumen|cantidaddedocumentos/.test(etiqueta)) return true;
  return celdaFecha.trim() === '' && celdaFolio.trim() === '';
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

/**
 * Parsea un CSV del RCV y devuelve documentos normalizados:
 *   { fecha:"YYYY-MM-DD", rutEmisor, folio:string, neto:int, iva:int, total:int, razonSocial }
 *
 * @param {string} texto contenido del CSV (con o sin BOM)
 * @param {'compra'|'venta'|'compras'|'ventas'} tipo lado del registro (afecta
 *   solo los aliases de RUT: proveedor en compra, cliente en venta)
 * @returns {Array<object>}
 * @throws {FormatoDesconocido} si la cabecera no se reconoce
 */
export function parseRcvCsv(texto, tipo = 'compra') {
  if (!texto || !String(texto).trim()) {
    throw new FormatoDesconocido('CSV vacío');
  }
  const limpio = String(texto).replace(/^﻿/, ''); // BOM UTF-8 (\uFEFF)
  const lineas = limpio.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) {
    throw new FormatoDesconocido('CSV sin filas de datos');
  }

  // La cabecera es la primera línea que mapea columnas suficientes; se toleran
  // líneas previas de preámbulo (algunas descargas antiguas las incluían).
  let idxCabecera = -1;
  let mapa = null;
  let delim = ';';
  for (let i = 0; i < Math.min(lineas.length, 10); i++) {
    const l = lineas[i];
    delim = (l.match(/;/g) ?? []).length >= (l.match(/,/g) ?? []).length ? ';' : ',';
    const candidato = mapearColumnas(splitCsvLinea(l, delim));
    if (candidato.folio >= 0 && (candidato.total >= 0 || candidato.neto >= 0 || candidato.iva >= 0)) {
      idxCabecera = i;
      mapa = candidato;
      break;
    }
  }
  if (idxCabecera < 0 || !mapa) {
    throw new FormatoDesconocido(
      `Cabecera CSV irreconocible (tipo=${tipo}): "${lineas[0].slice(0, 120)}"`,
    );
  }

  const docs = [];
  for (let i = idxCabecera + 1; i < lineas.length; i++) {
    const cols = splitCsvLinea(lineas[i], delim);
    const celda = (idx) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : '');
    const celdaFecha = celda(mapa.fecha);
    const celdaFolio = celda(mapa.folio);
    if (esFilaResumen(celdaFecha, celdaFolio, cols)) continue; // totales/resumen finales
    docs.push({
      fecha: parseFecha(celdaFecha),
      rutEmisor: normalizarRut(celda(mapa.rutEmisor)),
      folio: String(celdaFolio),
      neto: parseNumeroChileno(celda(mapa.neto)),
      iva: parseNumeroChileno(celda(mapa.iva)),
      total: parseNumeroChileno(celda(mapa.total)),
      razonSocial: celda(mapa.razonSocial) || null,
    });
  }
  return docs;
}
