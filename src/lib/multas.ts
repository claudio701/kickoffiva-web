/**
 * Cálculo referencial de multas e intereses por F29 (IVA) pagado fuera de plazo,
 * ajustado a la normativa del SII vigente:
 *
 * - Multa: art. 97 N°11 del Código Tributario (impuestos de recargo, como el IVA):
 *   10% del impuesto adeudado, más 2% por cada mes o fracción de mes de retardo,
 *   con tope de 30%. Si la omisión la detecta el SII en una fiscalización, la multa
 *   parte en 20% (no se modela aquí: la calculadora asume regularización voluntaria).
 * - Intereses: art. 53 del Código Tributario, modificado por la Ley 21.713 (desde el
 *   1-ene-2025): interés penal DIARIO = (tasa de interés corriente CMF + 3,5%) / 360.
 *   El SII la fija por resolución cada junio y diciembre.
 * - No incluye el reajuste por IPC del art. 53 (depende del IPC de cada mes).
 *
 * Actualizar TASA_PENAL cada semestre con el valor publicado por el SII en
 * https://www.sii.cl/valores_y_fechas/otros_valores/tasa_interes_penal_diario.html
 */

export const IVA_TASA = 0.19;
export const MULTA_BASE = 0.1;
export const MULTA_MES_EXTRA = 0.02;
export const MULTA_TOPE = 0.3;

/** Tasa de interés penal diaria vigente (certificado SII 06/2026: TIC 4,20% + 3,5% = 7,70% / 360). */
export const TASA_PENAL = {
  diaria: 0.000213888889,
  anual: 0.077,
  desde: "2026-07-01",
  hasta: "2026-12-31",
  texto: "2º semestre 2026",
};

/** % de multa del art. 97 N°11 para un F29 con `meses` de atraso (1 = primer mes). */
export function porcentajeMulta(meses: number): number {
  if (meses <= 0) return 0;
  return Math.min(MULTA_TOPE, MULTA_BASE + (meses - 1) * MULTA_MES_EXTRA);
}

export interface ResultadoMultas {
  /** IVA a pagar de un mes: débito (ventas) menos crédito (compras), nunca negativo. */
  ivaMes: number;
  multas: number;
  intereses: number;
  estimado: number;
}

/**
 * `mesesAtrasados` F29 pendientes: el más antiguo lleva `mesesAtrasados` meses de
 * atraso, el más reciente 1 mes (cada uno con su propio % de multa e intereses).
 */
export function calcularMultas(ventasNetas: number, comprasNetas: number, mesesAtrasados: number): ResultadoMultas {
  const ivaMes = Math.max(0, (ventasNetas - comprasNetas) * IVA_TASA);
  let multas = 0;
  let intereses = 0;
  for (let k = 1; k <= mesesAtrasados; k++) {
    multas += ivaMes * porcentajeMulta(k);
    intereses += ivaMes * TASA_PENAL.diaria * 30 * k;
  }
  return { ivaMes, multas, intereses, estimado: multas + intereses };
}

/** true si la tasa guardada ya no corresponde al semestre actual. */
export function tasaDesactualizada(hoy = new Date()): boolean {
  const iso = hoy.toISOString().slice(0, 10);
  return iso > TASA_PENAL.hasta;
}
