import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { abrirAsistente } from "../lib/asistente";

const NAV = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#plan", label: "Plan" },
  { href: "#servicios", label: "Servicios" },
  { href: "#faq", label: "Preguntas" },
  { href: "#mi-iva", label: "Entrar" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        scrolled || open ? "border-linea bg-tinta/90 backdrop-blur-md" : "border-transparent"
      }`}
    >
      <div className="wrap flex h-14 sm:h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-baseline gap-2 shrink-0" onClick={() => setOpen(false)}>
          <span className="font-display font-bold text-lg sm:text-xl tracking-tight">
            KICKOFF<span className="text-cancha">IVA</span>
          </span>
          <span className="hidden md:inline font-mono text-[10px] uppercase tracking-[0.18em] text-humo">
            un producto de Kickoff
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-7">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-sm text-humo hover:text-papel transition-colors"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {/* Clientes que vuelven: "Entrar" siempre visible, sin buscar en el menú */}
          <button
            type="button"
            onClick={abrirAsistente}
            aria-label="Conversemos en línea"
            className="rounded-full border border-linea px-3 sm:px-4 py-2.5 text-sm font-semibold text-papel hover:border-humo transition-colors"
          >
            <span aria-hidden="true">💬</span>
            <span className="hidden sm:inline"> Conversemos en línea</span>
          </button>
          {/* Lo principal: entrar a probar, siempre visible y en el color de acción */}
          <a
            href="#mi-iva"
            onClick={() => setOpen(false)}
            className="rounded-full bg-cancha px-5 py-2.5 text-base font-semibold text-tinta hover:bg-cancha-dim transition-colors"
          >
            Entrar
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-linea text-papel"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Menú móvil */}
      {open && (
        <nav className="lg:hidden border-t border-linea bg-tinta/95 backdrop-blur-md">
          <div className="wrap py-4 flex flex-col">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="py-3.5 text-base text-papel border-b border-linea last:border-0"
              >
                {n.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
