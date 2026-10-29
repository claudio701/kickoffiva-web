/**
 * Medición propia del embudo: visitas → clic en WhatsApp / calculadora → registro.
 * Sin cookies ni datos personales: solo el nombre del evento, la sección de la
 * página donde ocurrió y los parámetros UTM de la visita. Ver functions/api/eventos.ts.
 */
import { API_BASE_URL } from "../config";

export type Evento = "whatsapp_click" | "calculadora_uso" | "registro_ok" | "cta_click";

const UTM_KEY = "kiva_utm";

type Utm = { source?: string; medium?: string; campaign?: string };

/** UTM de la URL (query o después del ? del hash, p. ej. #plan?utm_source=mail). */
function utmDeUrl(): Utm {
  const partes = [window.location.search.slice(1), window.location.hash.split("?")[1] ?? ""];
  const utm: Utm = {};
  for (const parte of partes) {
    const p = new URLSearchParams(parte);
    utm.source ??= p.get("utm_source") ?? undefined;
    utm.medium ??= p.get("utm_medium") ?? undefined;
    utm.campaign ??= p.get("utm_campaign") ?? undefined;
  }
  return utm;
}

/** Primer contacto de la visita: se guarda en sessionStorage para no perderlo al navegar. */
function utmActual(): Utm {
  try {
    const guardado = sessionStorage.getItem(UTM_KEY);
    if (guardado) return JSON.parse(guardado) as Utm;
    const utm = utmDeUrl();
    if (utm.source || utm.medium || utm.campaign) sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    return utm;
  } catch {
    return utmDeUrl();
  }
}

export function registrarEvento(nombre: Evento, origen?: string): void {
  try {
    const body = JSON.stringify({ nombre, origen, utm: utmActual() });
    const url = `${API_BASE_URL}/api/eventos`;
    // text/plain = petición simple (sin preflight CORS); el servidor lo parsea como JSON.
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
    void fetch(url, { method: "POST", body, keepalive: true, mode: "no-cors" });
  } catch {
    /* la medición nunca rompe la página */
  }
}

/** Sección de la página donde está el elemento (id de la <section> más cercana). */
function origenDe(el: Element): string {
  const seccion = el.closest("section[id], header, footer, [data-origen]");
  return (
    seccion?.getAttribute("data-origen") ??
    seccion?.id ??
    seccion?.tagName.toLowerCase() ??
    "pagina"
  );
}

let escuchando = false;

/** Un solo listener para todo el sitio: clics a wa.me y elementos con data-evento. */
export function escucharClics(): void {
  if (escuchando) return;
  escuchando = true;
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.("a, [data-evento]");
      if (!el) return;
      const evento = el.getAttribute("data-evento");
      if (evento === "cta_click") {
        registrarEvento("cta_click", el.getAttribute("data-origen") ?? origenDe(el));
        return;
      }
      if (/^https:\/\/wa\.me\//.test(el.getAttribute("href") ?? "")) {
        registrarEvento("whatsapp_click", origenDe(el));
      }
    },
    { capture: true }
  );
}
