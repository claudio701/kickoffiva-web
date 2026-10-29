import { useEffect, useRef } from "react";

/**
 * Captcha invisible de Cloudflare Turnstile. Solo se activa si existe
 * VITE_TURNSTILE_SITE_KEY en el build; sin ella no renderiza nada y el
 * formulario funciona igual (el servidor tampoco lo exige sin TURNSTILE_SECRET).
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const TURNSTILE_ACTIVO = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let cargando: Promise<void> | null = null;
function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!cargando) {
    cargando = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        cargando = null;
        reject(new Error("No se pudo cargar la verificación"));
      };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

export default function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let id: string | null = null;
    let cancel = false;
    cargarScript()
      .then(() => {
        if (cancel || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          language: "es",
          appearance: "interaction-only",
          callback: (t: string) => onTokenRef.current(t),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancel = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="min-h-0" />;
}
