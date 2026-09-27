import { KICKOFF_URL } from "../config";

export default function Equipo() {
  return (
    <section className="border-b border-linea">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">Quiénes somos</p>
        <h2 className="headline text-3xl sm:text-4xl lg:text-5xl max-w-3xl">
          Los que corren por ti cuando el SII aprieta
        </h2>
        <p className="mt-6 max-w-2xl text-humo leading-relaxed">
          KickoffIVA no es una app huérfana. Es el sistema de{" "}
          <strong className="text-papel">Kickoff</strong>, una consultora con contadores,
          tributaristas y abogados que llevan +8 años defendiendo pymes. Cuando tu caso
          necesita criterio — rebajar una multa injusta, negociar un convenio con
          Tesorería, ir a un Tribunal Tributario — no lo resuelve un algoritmo.
          Lo resuelve el mismo equipo que ya lo hizo para +5.000 empresas.
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-linea bg-linea sm:grid-cols-3">
          {[
            { t: "Contadores", d: "tu contabilidad mensual y tu F29, siempre en fecha" },
            { t: "Tributaristas", d: "criterio para multas, anotaciones y fiscalizaciones" },
            { t: "Abogados", d: "defensa en reclamos SII y Tribunales Tributarios" },
          ].map((r) => (
            <div key={r.t} className="bg-tinta p-6 sm:p-7">
              <h3 className="font-display font-semibold text-lg text-cancha">{r.t}</h3>
              <p className="mt-2 text-sm text-humo leading-relaxed">{r.d}</p>
            </div>
          ))}
        </div>

        <a
          href={KICKOFF_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-8 inline-flex text-sm font-medium text-papel underline decoration-cancha decoration-2 underline-offset-4 hover:text-cancha transition-colors"
        >
          Conocer la consultora Kickoff →
        </a>
      </div>
    </section>
  );
}
