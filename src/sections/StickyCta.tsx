import { useEffect, useState } from "react";
import { WHATSAPP_URL } from "../config";

// Barra fija inferior solo en móvil: aparece tras hacer scroll,
// para que el CTA humano siempre esté a un toque de distancia.
export default function StickyCta() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Se oculta sobre "Mi IVA": ahí la persona está llenando datos y la barra le tapa el formulario.
    const onScroll = () => {
      const miIva = document.getElementById("mi-iva")?.getBoundingClientRect();
      const sobreMiIva = miIva ? miIva.top < window.innerHeight && miIva.bottom > 0 : false;
      setVisible(window.scrollY > window.innerHeight * 0.8 && !sobreMiIva);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 sm:hidden border-t border-linea bg-tinta/95 backdrop-blur-md px-4 pt-3 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center rounded-full bg-cancha py-3.5 text-base font-semibold text-tinta"
      >
        Ordenar mi IVA — hablemos →
      </a>
    </div>
  );
}
