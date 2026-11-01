// Analítica de embudo (Google Analytics 4). Se activa solo si VITE_GA_ID está
// definido en el build; sin esa variable todas las funciones son no-op.

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;

let iniciado = false;

/** Carga gtag.js y registra los clics a WhatsApp de todo el sitio. */
export function iniciarAnalitica(): void {
  if (!GA_ID || iniciado || typeof window === "undefined") return;
  iniciado = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js espera el objeto `arguments`, no un array
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);

  // Un solo listener para todos los enlaces wa.me: sección de origen como dato.
  document.addEventListener("click", (ev) => {
    const a = (ev.target as Element | null)?.closest?.("a[href*='wa.me']");
    if (!a) return;
    const zona = a.closest("[id], header, footer");
    registrarEvento("clic_whatsapp", {
      ubicacion: zona?.id || zona?.tagName.toLowerCase() || "otro",
    });
  });
}

/** Evento del embudo: cuenta creada, sincronización, calculadora, etc. */
export function registrarEvento(nombre: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  window.gtag?.("event", nombre, params);
}
