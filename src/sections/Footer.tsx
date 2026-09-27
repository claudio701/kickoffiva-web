import { KICKOFF_URL, WHATSAPP_URL } from "../config";

export default function Footer() {
  return (
    <footer className="bg-tinta">
      <div className="wrap pt-12 pb-28 sm:py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <p className="font-display font-bold text-xl">
              KICKOFF<span className="text-cancha">IVA</span>
            </p>
            <p className="mt-3 text-sm text-humo leading-relaxed">
              El brazo automatizado de{" "}
              <a
                href={KICKOFF_URL}
                target="_blank"
                rel="noreferrer"
                className="text-papel underline decoration-cancha underline-offset-4 hover:text-cancha transition-colors"
              >
                Kickoff
              </a>
              . Tu IVA el día 28 de cada mes y defensa tributaria con garantía,
              para pymes chilenas.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-14 gap-y-3 text-sm">
            <a href="#como-funciona" className="text-humo hover:text-papel transition-colors">Cómo funciona</a>
            <a href="#plan" className="text-humo hover:text-papel transition-colors">Plan a Todo Evento</a>
            <a href="#servicios" className="text-humo hover:text-papel transition-colors">Servicios</a>
            <a href="#faq" className="text-humo hover:text-papel transition-colors">Preguntas</a>
            <a href="/privacidad/" className="text-humo hover:text-papel transition-colors">Privacidad</a>
            <a href="/terminos/" className="text-humo hover:text-papel transition-colors">Términos</a>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-humo hover:text-cancha transition-colors">WhatsApp</a>
            <a href={KICKOFF_URL} target="_blank" rel="noreferrer" className="text-humo hover:text-cancha transition-colors">kickoff.cl</a>
          </nav>
        </div>

        <div className="mt-10 border-t border-linea pt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-humo">
            © {new Date().getFullYear()} KickoffIVA · Consultora Kickoff · RUT 78.443.573-9 · Santa Beatriz 111, of. 607-608, Providencia, Santiago
          </p>
          <p className="font-mono text-[11px] text-humo">
            Ecosistema Kickoff — Chile · México · Colombia · Perú · Brasil · Paraguay · Argentina
          </p>
        </div>
      </div>
    </footer>
  );
}
