import { Check } from "lucide-react";
import { PLAN, WHATSAPP_PLAN_URL, clp } from "../config";

const INCLUYE = [
  "Contabilidad completa mensual + F29 declarado y pagado en fecha",
  `Remuneraciones y cotizaciones de hasta ${PLAN.empleadosHasta} trabajadores`,
  "Defensa ante cualquier irregularidad del SII: multas, anotaciones, fiscalizaciones",
  "Juicio y defensa tributaria cubiertos: reclamos SII y Tribunales Tributarios",
  "Respuesta en 24 h hábiles — conocemos tu empresa por su nombre",
  "Un solo precio. Sin horas cobradas. Sin sorpresas.",
];

export default function Plan() {
  return (
    <section id="plan" className="border-b border-linea">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">El plan con todo incluido</p>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <h2 className="headline text-3xl sm:text-4xl lg:text-5xl">{PLAN.nombre}</h2>
            <p className="mt-6 font-display font-bold text-5xl sm:text-6xl text-cancha leading-none">
              {clp(PLAN.precio)}
              <span className="text-xl sm:text-2xl text-humo font-sans font-normal">/mes</span>
            </p>
            <p className="mt-5 text-sm sm:text-base text-humo leading-relaxed">
              Para empresas con <strong className="text-papel">ventas hasta {PLAN.ventasHasta}</strong>{" "}
              y <strong className="text-papel">hasta {PLAN.empleadosHasta} empleados</strong>.
            </p>
            <p className="mt-4 font-mono text-[11px] text-humo">
              Precio con IVA incluido · sin permanencia de amarre
            </p>
            <a
              href={WHATSAPP_PLAN_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex rounded-full bg-cancha px-7 py-3.5 text-base font-semibold text-tinta hover:bg-cancha-dim transition-colors"
            >
              Quiero el Plan →
            </a>
          </div>

          <ul className="space-y-0 self-center">
            {INCLUYE.map((item) => (
              <li key={item} className="flex gap-4 border-t border-linea py-4 last:border-b">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-cancha" strokeWidth={2.5} />
                <span className="text-sm sm:text-base text-papel/90 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-14 text-center font-display text-xl sm:text-2xl text-humo max-w-3xl mx-auto">
          El SII es de todos los chilenos — no del Estado.{" "}
          <span className="text-papel">Nosotros también lo ordenamos.</span>
        </p>
      </div>
    </section>
  );
}
