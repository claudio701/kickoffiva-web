/**
 * Sanitización de texto (tipada). La implementación vive en
 * sanitize.logic.mjs para que los tests de Node la importen sin build.
 */
import { texto as _texto, email as _email } from './sanitize.logic.mjs';

/** Limpia texto libre: sin < >, sin caracteres de control, espacios colapsados, largo máximo. */
export const texto: (valor: unknown, max?: number) => string = _texto;

/** Normaliza un correo: recortado, minúsculas, largo máximo. */
export const email: (valor: unknown) => string = _email;
