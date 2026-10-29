/**
 * f29.logic.mjs — lectura de la propuesta de F29 del SII (JavaScript puro, sin
 * dependencias, para que node --test lo pruebe directo). client.ts lo re-exporta.
 *
 * Contrato (observado en vivo, documentado por el proyecto MIT albertomarturelo/sii,
 * docs/sii-contract/f29.md): { metaData: { errors }, data: { listCodPropuestos:
 * [{ codigo, valor }], listCodAdministrativos: [...] } }; valor numérico con punto
 * decimal; código 115 = tasa PPM en % (p.ej. "0.125").
 */
/**
 * Lee el código 115 (tasa PPM, en %) de una respuesta de la propuesta F29 y lo devuelve
 * como fracción. null si no hay propuesta o no trae el código. Lanza Error si
 * el SII informa un error de negocio (metaData.errors).
 */
export function extraerTasaPpm(json) {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Respuesta inesperada de la propuesta F29');
  }
  const env = json;
  const errores = env.metaData?.errors;
  if (Array.isArray(errores) ? errores.length > 0 : errores) {
    throw new Error('El SII informó un error en la propuesta F29');
  }
  const data = env.data;
  if (!data || typeof data !== 'object') return null; // sin propuesta para el período
  for (const lista of [data.listCodPropuestos, data.listCodAdministrativos]) {
    if (!Array.isArray(lista)) continue;
    for (const fila of lista) {
      if (typeof fila !== 'object' || fila === null) continue;
      const f = fila;
      if (String(f.codigo ?? f.cod ?? '') !== '115') continue;
      const crudo = String(f.valor ?? f.monto ?? '').trim();
      if (crudo === '') continue; // código sin valor: no es un 0%
      const pct = Number(crudo);
      // Rango sano (0% a 30%; 0 es válido, p.ej. PPM suspendido por pérdidas).
      if (Number.isFinite(pct) && pct >= 0 && pct <= 30) return Math.round(pct * 10000) / 1000000;
    }
  }
  return null;
}
