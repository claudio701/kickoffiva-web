/**
 * Lógica pura del cron de alarmas (sin red): arma el resumen diario y los
 * correos a clientes a partir de la respuesta de /api/cron/hoy.
 * Se testea con `node --test` desde la raíz del repo.
 */

const TIPO_LABEL = {
  preparacion: 'Preparación (día 5)',
  faltan_libros: 'Faltan libros (día 10)',
  numero: 'Número listo (día 10)',
  recordatorio: 'Recordatorio (día 11)',
  ultimo_dia: 'ÚLTIMO DÍA (día 12)',
};

export function etiquetaTipo(tipo) {
  if (TIPO_LABEL[tipo]) return TIPO_LABEL[tipo];
  if (String(tipo).startsWith('sii_notif')) return 'Notificación SII';
  return tipo;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resumen diario para el equipo (email a DIGEST_TO).
 * @param {{fecha:string, alertas:Array}} hoy  respuesta de GET /api/cron/hoy
 * @param {{creadas?:number, empresas?:number, siiRevisadas?:number}|null} generar respuesta de POST /generar
 * @param {{enviadosEmail?:number, erroresEmail?:number}} envio
 * @returns {{subject:string, text:string, html:string}}
 */
export function armarResumen(hoy, generar, envio = {}) {
  const alertas = hoy?.alertas ?? [];
  const pendientes = alertas.filter((a) => !a.enviada);
  const subject = alertas.length === 0
    ? `KickoffIVA · ${hoy?.fecha ?? ''} · sin alertas hoy`
    : `KickoffIVA · ${hoy?.fecha ?? ''} · ${alertas.length} alerta(s), ${pendientes.length} por enviar`;

  const lineas = [];
  lineas.push(`Resumen de alarmas — ${hoy?.fecha ?? ''}`);
  if (generar) {
    lineas.push(`Empresas revisadas: ${generar.empresas ?? 0} · alertas nuevas: ${generar.creadas ?? 0} · buzones SII revisados: ${generar.siiRevisadas ?? 0}`);
  }
  if (envio.enviadosEmail != null) {
    lineas.push(`Correos a clientes: ${envio.enviadosEmail} enviados${envio.erroresEmail ? `, ${envio.erroresEmail} con error` : ''}`);
  }
  lineas.push('');
  if (alertas.length === 0) {
    lineas.push('Sin alertas para hoy.');
  }
  for (const a of alertas) {
    lineas.push(`[${a.enviada ? 'enviada' : 'PENDIENTE'}] ${etiquetaTipo(a.tipo)} — ${a.empresa} (${a.rut})`);
    lineas.push(`  ${a.persona ?? ''} ${a.email ?? ''} ${a.telefono ?? '(sin teléfono)'}`);
    lineas.push(`  ${a.mensaje}`);
    if (a.waLink) lineas.push(`  WhatsApp: ${a.waLink}`);
    lineas.push('');
  }
  const text = lineas.join('\n');

  const items = alertas.map((a) => `
    <li style="margin:0 0 14px 0">
      <strong>${esc(etiquetaTipo(a.tipo))}</strong> — ${esc(a.empresa)} (${esc(a.rut)})
      <span style="color:${a.enviada ? '#2e7d32' : '#b26a00'}">[${a.enviada ? 'enviada' : 'pendiente'}]</span><br>
      <span style="color:#555">${esc(a.persona ?? '')} · ${esc(a.email ?? '')} · ${esc(a.telefono ?? 'sin teléfono')}</span><br>
      <span>${esc(a.mensaje)}</span><br>
      ${a.waLink ? `<a href="${esc(a.waLink)}">Enviar por WhatsApp</a>` : '<em>sin teléfono para WhatsApp</em>'}
    </li>`).join('');
  const html = `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
    <h2 style="margin:0 0 8px 0">KickoffIVA — alarmas del ${esc(hoy?.fecha ?? '')}</h2>
    ${generar ? `<p style="margin:0 0 4px 0">Empresas revisadas: ${generar.empresas ?? 0} · alertas nuevas: ${generar.creadas ?? 0} · buzones SII: ${generar.siiRevisadas ?? 0}</p>` : ''}
    ${envio.enviadosEmail != null ? `<p style="margin:0 0 12px 0">Correos a clientes: ${envio.enviadosEmail} enviados${envio.erroresEmail ? `, ${envio.erroresEmail} con error` : ''}</p>` : ''}
    ${alertas.length === 0 ? '<p>Sin alertas para hoy.</p>' : `<ol style="padding-left:18px">${items}</ol>`}
  </div>`;
  return { subject, text, html };
}

/** Correo individual para el cliente (una alerta). */
export function armarCorreoCliente(a) {
  const subject = {
    preparacion: 'Ya cerró el mes: sube tus libros para calcular tu IVA',
    faltan_libros: 'Faltan tus libros — el F29 vence el día 12',
    numero: 'Tu IVA del mes está listo',
    recordatorio: 'Mañana vence tu F29',
    ultimo_dia: 'HOY vence tu F29',
  }[a.tipo] ?? (String(a.tipo).startsWith('sii_notif') ? 'Notificación nueva del SII' : 'Aviso de KickoffIVA');
  const text = `${a.mensaje}\n\n— KickoffIVA · kickoffiva.cl`;
  const html = `
  <div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">
    <p>${esc(a.mensaje).replace(/\*([^*]+)\*/g, '<strong>$1</strong>')}</p>
    <p style="color:#666;font-size:13px">— KickoffIVA · <a href="https://www.kickoffiva.cl/#mi-iva">kickoffiva.cl</a></p>
  </div>`;
  return { subject: `${subject} · ${a.empresa}`, text, html };
}
