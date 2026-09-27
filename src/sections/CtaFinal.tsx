import { WHATSAPP_URL } from "../config";

export default function CtaFinal() {
  return (
    <section className="border-b border-linea bg-cancha text-tinta">
      <div className="wrap py-16 sm:py-24 text-center">
        <h2 className="headline text-4xl sm:text-6xl max-w-3xl mx-auto !text-tinta">
          Tu IVA del próximo mes puede estar listo el día 28.
        </h2>
        <p className="mt-5 text-tinta/75 max-w-xl mx-auto text-base sm:text-lg">
          Escríbenos hoy. Te decimos en qué está tu empresa y cuánto cuesta ordenarla —
          sin compromiso y sin letra chica.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex justify-center rounded-full bg-tinta px-8 py-4 text-base font-semibold text-cancha hover:bg-panel transition-colors"
          >
            Hablemos por WhatsApp →
          </a>
          <a
            href="#calculadora"
            className="inline-flex justify-center rounded-full border-2 border-tinta/30 px-8 py-4 text-base font-semibold text-tinta hover:border-tinta transition-colors"
          >
            Calcular mi número
          </a>
        </div>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-tinta/70">
          Respuesta en 24 h hábiles · conocemos tu empresa por su nombre
        </p>
      </div>
    </section>
  );
}
