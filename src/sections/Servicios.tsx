import { SERVICIOS, waServicioUrl, clp } from "../config";

// Página SEO estática por servicio (public/servicios/<slug>/index.html)
const SLUGS: Record<string, string> = {
  "Levantamiento de anotación": "levantamiento-anotaciones",
  "Rebaja de multa injusta o desproporcionada": "rebaja-multas",
  "Regularización de F29 atrasados": "regularizacion-f29",
  "Convenio de pago con Tesorería": "convenio-tesoreria",
};

export default function Servicios() {
  return (
    <section id="servicios" className="border-b border-linea bg-panel/40">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">Servicios puntuales</p>
        <h2 className="headline text-3xl sm:text-4xl lg:text-5xl">
          ¿Te pegaron igual? Se arregla —{" "}
          <span className="text-humo">y no lo arreglas tú.</span>
        </h2>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-linea bg-linea sm:grid-cols-2">
          {SERVICIOS.map((s) => (
            <article key={s.nombre} className="group bg-tinta p-6 sm:p-8 flex flex-col">
              <h3 className="font-display font-semibold text-xl sm:text-2xl leading-tight">
                <a
                  href={`/servicios/${SLUGS[s.nombre]}/`}
                  className="hover:text-cancha transition-colors"
                >
                  {s.nombre}
                </a>
              </h3>
              <p className="mt-3 text-sm text-humo leading-relaxed flex-1">{s.detalle}</p>
              <div className="mt-6 flex items-baseline justify-between gap-4">
                <p className="font-mono text-lg text-cancha">
                  {s.desde && <span className="text-xs text-humo mr-2">desde</span>}
                  {clp(s.precio)}
                </p>
                <a
                  href={waServicioUrl(s.nombre)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-humo group-hover:text-cancha transition-colors"
                >
                  Cotizar →
                </a>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-6 font-mono text-[11px] sm:text-xs text-humo text-center">
          Precios con IVA incluido · pago con tarjeta · seguimiento visible
        </p>
      </div>
    </section>
  );
}
