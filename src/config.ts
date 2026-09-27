// ─── Datos de contacto y negocio ────────────────────────────────────────────
const WA_NUMERO = "56990014371";

/** Genera el link de WhatsApp con mensaje pre-llenado. */
export const waUrl = (mensaje: string) =>
  `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(mensaje)}`;

// Mensajes según contexto del CTA
export const WHATSAPP_URL = waUrl("Hola, quiero ordenar mi IVA con KickoffIVA.");
export const WHATSAPP_PLAN_URL = waUrl(
  "Hola, me interesa el Plan a Todo Evento ($500.000/mes). ¿Me cuentan cómo partimos?"
);
export const WHATSAPP_LEVANTAMIENTO_URL = waUrl(
  "Hola, tengo una anotación en el SII y quiero cotizar el levantamiento con garantía de 10 días hábiles."
);
export const WHATSAPP_MANDATARIO_URL = waUrl(
  "Hola, quiero conectar mi empresa con Mandatario Digital sin entregar mi clave."
);
export const waServicioUrl = (servicio: string) =>
  waUrl(`Hola, quiero cotizar este servicio: ${servicio}.`);
export const waCalculadoraUrl = (total: number) =>
  waUrl(
    `Hola, hice la prueba en la web y mi número estimado es ${clp(total)}. Quiero ordenar mi IVA.`
  );

export const KICKOFF_URL = "https://kickoff.cl";

// Base URL del backend KickoffIVA (contrato fijo; los endpoints viven bajo /api/...).
export const API_BASE_URL = "https://api.kickoffiva.cl";

export const PLAN = {
  nombre: "Plan a Todo Evento",
  precio: 500000,
  ventasHasta: "1.000 UF al mes",
  empleadosHasta: 5,
};

export const SERVICIOS = [
  {
    nombre: "Levantamiento de anotación",
    detalle: "10 días hábiles garantizados o te devolvemos el 50% del fee",
    precio: 500000,
    desde: true,
  },
  {
    nombre: "Rebaja de multa injusta o desproporcionada",
    detalle: "Defensa con criterio tributario, no plantillas",
    precio: 189000,
  },
  {
    nombre: "Regularización de F29 atrasados",
    detalle: "Todos los meses pendientes, declarados y en regla",
    precio: 129000,
  },
  {
    nombre: "Convenio de pago con Tesorería",
    detalle: "Negociamos las cuotas por ti",
    precio: 249000,
  },
];

export const clp = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-CL");
