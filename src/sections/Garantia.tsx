import { WHATSAPP_LEVANTAMIENTO_URL } from "../config";

export default function Garantia() {
  return (
    <section className="border-b border-linea">
      <div className="wrap py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16 items-center">
          <p className="font-display font-bold text-[5.5rem] sm:text-[9rem] leading-none text-cancha">
            99%
          </p>
          <div>
            <h2 className="headline text-3xl sm:text-4xl">
              Levantamientos logrados en 10 días hábiles. Garantizado.
            </h2>
            <p className="mt-5 text-humo leading-relaxed max-w-xl">
              Subes la información de tu empresa, cotizamos el valor exacto y partimos.{" "}
              <strong className="text-papel font-semibold">
                Si no la levantamos en 10 días hábiles, te devolvemos el 50% del fee.
              </strong>
            </p>
            <div className="mt-7 rounded-xl border border-cancha/40 bg-cancha/5 p-5 sm:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cancha">
                Garantía Anti-Multa
              </p>
              <p className="mt-3 text-sm sm:text-base text-papel leading-relaxed">
                Levantamos tu anotación en 10 días hábiles o te devolvemos el 50% del fee.
                Firmada en tu contrato — no es marketing, es una obligación nuestra.
              </p>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <a
                href={WHATSAPP_LEVANTAMIENTO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-linea px-6 py-3 text-sm font-medium text-papel hover:border-cancha hover:text-cancha transition-colors"
              >
                Cotizar mi levantamiento →
              </a>
              <a
                href="/servicios/levantamiento-anotaciones/"
                className="text-sm font-medium text-humo hover:text-cancha transition-colors"
              >
                Ver detalle del servicio →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
