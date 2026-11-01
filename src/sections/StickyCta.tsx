import { useEffect, useState } from "react";
import { irAEntrar, useSesion } from "../lib/sesion";
import { abrirAsistente } from "../lib/asistente";

// Barra fija inferior solo en móvil: aparece tras hacer scroll,
// para que el CTA humano siempre esté a un toque de distancia.
export default function StickyCta() {
  const sesion = useSesion();
  const [bajo, setBajo] = useState(false);
  const [sobreMiIva, setSobreMiIva] = useState(false);
  useEffect(() => {
    // Leer scrollY no fuerza layout; medir "Mi IVA" en cada scroll sí, por eso eso va con IntersectionObserver.
    const onScroll = () => setBajo(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // Se oculta sobre "Mi IVA": ahí la persona está llenando datos y la barra le tapa el formulario.
    const miIva = document.getElementById("mi-iva");
    let obs: IntersectionObserver | undefined;
    if (miIva && typeof IntersectionObserver !== "undefined") {
      obs = new IntersectionObserver(([e]) => setSobreMiIva(e.isIntersecting));
      obs.observe(miIva);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      obs?.disconnect();
    };
  }, []);
  const visible = bajo && !sobreMiIva;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 sm:hidden border-t border-linea bg-tinta px-4 pt-3 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex gap-2">
        <a
          href="#mi-iva"
          onClick={() => !sesion && irAEntrar("register")}
          className="flex flex-1 min-h-[52px] items-center justify-center rounded-full bg-cancha py-3.5 text-lg font-semibold text-tinta"
        >
          {sesion ? "Ver mi IVA →" : "Entrar y probar →"}
        </a>
        <button
          type="button"
          onClick={abrirAsistente}
          aria-label="Abrir a Kiko, tu asistente"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 border-humo/60 text-2xl"
        >
          💬
        </button>
      </div>
    </div>
  );
}
