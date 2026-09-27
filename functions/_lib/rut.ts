/**
 * Utilidades de RUT chileno (tipadas).
 * La implementación vive en rut.logic.mjs para que los tests de Node
 * (`node --test`) puedan importarla sin build; aquí solo se re-exporta
 * con firmas TypeScript.
 */
import {
  limpiarRut as _limpiarRut,
  formatearRut as _formatearRut,
  rutValido as _rutValido,
  dvModulo11 as _dvModulo11,
} from './rut.logic.mjs';

/** Quita puntos/guion y normaliza la K: "12.345.678-5" -> "123456785". */
export const limpiarRut: (rut: string) => string = _limpiarRut;

/** Formatea como "12.345.678-5". */
export const formatearRut: (rut: string) => string = _formatearRut;

/** Valida formato + dígito verificador (módulo 11). Acepta k/K. */
export const rutValido: (rut: string) => boolean = _rutValido;

/** Dígito verificador módulo 11 para un cuerpo numérico. */
export const dvModulo11: (cuerpo: string) => string = _dvModulo11;
