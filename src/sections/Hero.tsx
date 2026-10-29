import { BotonEntrar, BotonConversar } from "../components/Botones";

const DOLORES = [
  "multas automáticas",
  "anotaciones fantasma",
  "vulneraciones sin aviso",
  "plazos que nadie entiende",
  "formularios en chino mandarín",
  "intereses que corren solos",
  "certificados bloqueados",
  "devoluciones congeladas",
];

export default function Hero() {
  return (
    <section className="relative pt-28 sm:pt-36 pb-0 overflow-hidden">
      <div className="wrap">
        <p className="kicker mb-5">Servicio para pymes chilenas · un producto de Kickoff</p>

        <h1 className="headline text-[2.6rem] sm:text-6xl lg:text-7xl max-w-4xl">
          El SII no te va a pillar con los pantalones abajo{" "}
          <span className="text-cancha">nunca más.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base sm:text-lg text-humo leading-relaxed">
          Tu IVA calculado el <strong className="text-papel font-semibold">día 28 de cada mes</strong> —
          antes de que el SII publique su propuesta. Y cuando te peguen igual
          (multas, anotaciones, vulneraciones),{" "}
          <strong className="text-papel font-semibold">las resolvemos nosotros.</strong>{" "}
          Rápido y a precio justo.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
          <BotonEntrar />
          <BotonConversar />
        </div>
        <a
          href="#calculadora"
          className="mt-4 inline-block min-h-[44px] py-2 text-base text-cancha underline underline-offset-4 hover:text-cancha-dim"
        >
          O calcula en 30 segundos cuánto te ha costado el SII →
        </a>

        <p className="mt-4 font-mono text-[11px] sm:text-xs text-humo">
          Sin instalar nada · sin letra chica · con equipo humano detrás
        </p>
      </div>

      {/* Ticker de dolores */}
      <div className="mt-14 sm:mt-20 border-y border-linea py-3 overflow-hidden" aria-hidden="true">
        <div className="flex w-max animate-marquee gap-0 whitespace-nowrap">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0">
              {DOLORES.map((d) => (
                <span key={dup + d} className="flex items-center font-mono text-xs sm:text-sm text-humo">
                  <span className="px-4">{d}</span>
                  <span className="text-multa">✕</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
