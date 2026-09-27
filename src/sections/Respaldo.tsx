import { KICKOFF_URL } from "../config";

const STATS = [
  { n: "+8 años", t: "ordenando pymes chilenas" },
  { n: "+5.000", t: "empresas asesoradas" },
  { n: "99%", t: "de anotaciones levantadas en 10 días hábiles" },
  { n: "24 h", t: "respuesta en horario hábil" },
];

export default function Respaldo() {
  return (
    <section className="border-b border-linea">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">El respaldo</p>
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16 items-start">
          <div>
            <h2 className="headline text-3xl sm:text-4xl lg:text-5xl">
              Detrás del sistema hay una consultora de verdad.
            </h2>
            <p className="mt-5 text-humo leading-relaxed max-w-xl">
              KickoffIVA es el brazo automatizado de{" "}
              <a
                href={KICKOFF_URL}
                target="_blank"
                rel="noreferrer"
                className="text-papel underline decoration-cancha decoration-2 underline-offset-4 hover:text-cancha transition-colors"
              >
                Kickoff
              </a>
              , la consultora que lleva +8 años con la contabilidad, lo tributario y lo legal
              de las pymes chilenas. El sistema calcula rápido porque es software.
              Responde bien porque atrás hay gente.
            </p>
            <blockquote className="mt-6 border-l-2 border-cancha pl-5 text-sm sm:text-base text-papel/90 leading-relaxed max-w-xl">
              "Tras una carta de nuestro CEO en El Mercurio, el SII redujo los requisitos
              de verificación para nuevos emprendedores."
              <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.18em] text-humo">
                Como se vio en · Diario Financiero · El Mercurio
              </span>
            </blockquote>
          </div>

          <dl className="grid grid-cols-2 gap-px bg-linea rounded-xl overflow-hidden border border-linea">
            {STATS.map((s) => (
              <div key={s.n} className="bg-panel p-5 sm:p-6">
                <dt className="sr-only">{s.t}</dt>
                <dd className="font-display font-semibold text-2xl sm:text-3xl text-cancha">{s.n}</dd>
                <dd className="mt-2 text-xs sm:text-sm text-humo leading-snug">{s.t}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
