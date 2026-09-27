/**
 * Motor de alertas mensuales — genera los mensajes de recordatorio F29.
 *
 * Calendario (hora Chile):
 *   día 5  → preparación: "ya cerró el mes, sube tus libros"
 *   día 10 → número listo (con montos) o aviso de que faltan libros
 *   día 11 → recordatorio (vence mañana)
 *   día 12 → último día (multa 10% + 2%/mes)
 *
 * Los montos se calculan desde documents (misma lógica que /api/cierre).
 */

export interface DatosEmpresa {
  companyId: string;
  nombreEmpresa: string;
  nombrePersona: string | null;
  telefono: string | null;
  ventasNetas: number;
  comprasNetas: number;
  debitoFiscal: number;
  creditoFiscal: number;
  ivaAPagar: number;
  ppm: number;
  totalAPagar: number;
  tieneDatos: boolean;
}

export interface AlertaGenerada {
  tipo: string;
  mensaje: string;
}

export function hoyEnChile(): { fecha: string; dia: number; periodo: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const fecha = `${get('year')}-${get('month')}-${get('day')}`;
  return { fecha, dia: Number(get('day')), periodo: fecha.slice(0, 7) };
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function nombreMes(periodo: string): string {
  const mes = Number(periodo.slice(5, 7));
  return MESES[mes - 1] ?? periodo;
}

export function clp(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL');
}

function saludo(d: DatosEmpresa): string {
  const nombre = d.nombrePersona?.split(' ')[0];
  return nombre ? `Hola ${nombre}` : 'Hola';
}

/** Decide qué alerta corresponde HOY a esta empresa (o null si ninguna). */
export function alertaDelDia(dia: number, d: DatosEmpresa, periodo: string): AlertaGenerada | null {
  const mes = nombreMes(periodo);
  const s = saludo(d);

  if (dia === 5) {
    return {
      tipo: 'preparacion',
      mensaje:
        `${s} 👋 Ya cerró ${mes}. Cuando tengas un momento, sube tus libros o sincroniza ` +
        `desde el SII en kickoffiva.cl para calcular tu IVA de ${d.nombreEmpresa}.`,
    };
  }

  if (dia === 10) {
    if (!d.tieneDatos) {
      return {
        tipo: 'faltan_libros',
        mensaje:
          `${s}, aún no tenemos los libros de ${mes} de ${d.nombreEmpresa} — sin ellos no puedo ` +
          `calcular tu IVA. Súbelos hoy en kickoffiva.cl y lo tienes en 1 minuto. El F29 vence el día 12.`,
      };
    }
    return {
      tipo: 'numero',
      mensaje:
        `${s}, tu cierre de ${mes} está listo (${d.nombreEmpresa}): ` +
        `IVA ${clp(d.ivaAPagar)} + PPM ${clp(d.ppm)} = *${clp(d.totalAPagar)} total*. ` +
        `Vence el día 12. Detalle en kickoffiva.cl`,
    };
  }

  if (dia === 11) {
    if (!d.tieneDatos) return null; // ya se avisó ayer
    return {
      tipo: 'recordatorio',
      mensaje:
        `⏰ ${s}, mañana vence tu F29 de ${mes} (${d.nombreEmpresa}): ${clp(d.totalAPagar)} a pagar. ` +
        `¿Necesitas ayuda? Responde este mensaje.`,
    };
  }

  if (dia === 12) {
    const base = d.tieneDatos ? clp(d.totalAPagar) : 'tu impuesto';
    return {
      tipo: 'ultimo_dia',
      mensaje:
        `🔴 ${s}, HOY vence la declaración de ${mes} (${d.nombreEmpresa}): ${base}. ` +
        `Si no declaras, la multa parte en 10% y crece cada mes. Entra ahora a sii.cl`,
    };
  }

  return null;
}

/** Alerta por notificación nueva del SII en el buzón del contribuyente. */
export function alertaSiiNotificacion(
  nombrePersona: string | null,
  nombreEmpresa: string,
  titulos: string[],
): string {
  const nombre = nombrePersona?.split(' ')[0];
  const s = nombre ? `Hola ${nombre}` : 'Hola';
  const detalle = titulos.length > 0 ? ` (${titulos[0].slice(0, 80)})` : '';
  return (
    `⚠️ ${s}, el SII dejó una notificación nueva para ${nombreEmpresa}${detalle}. ` +
    `Revísala hoy en sii.cl (menú "Notificaciones") — los plazos corren desde que se notifica. ` +
    `Responde este mensaje si quieres que la veamos contigo.`
  );
}

/** Arma el link wa.me con el mensaje precargado (para envío con un click). */
export function waLink(telefono: string, mensaje: string): string {
  const num = telefono.replace(/[^\d]/g, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}
