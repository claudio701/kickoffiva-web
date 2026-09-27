import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "¿Cómo calculan mi IVA el día 28 si el SII aún no publica nada?",
    a: "Porque el sistema lee tus documentos tributarios todos los días del mes, no una vez al mes. Cuando llega el día 28, el cierre ya está procesado: solo se consolida. El SII publica su propuesta recién el día 5 del mes siguiente — para entonces tú ya tienes tu número hace diez días.",
  },
  {
    q: "¿Tengo que darles mi clave del SII?",
    a: "No necesariamente: tienes dos vías. La recomendada es el Mandatario Digital (art. 9° del Código Tributario): nos autorizas en sii.cl desde el menú Mandatarios y operamos con nuestra propia clave — la tuya jamás sale de tus manos y la revocas cuando quieras, directo en el SII. Si prefieres automatización total, guardas tu clave cifrada con AES-256-GCM: nadie puede leerla, ni siquiera el equipo de KickoffIVA, y el sistema baja tus libros solo.",
  },
  {
    q: "¿Esto reemplaza a mi contador?",
    a: "El Plan a Todo Evento sí: incluye contabilidad completa, F29, remuneraciones y defensa tributaria. Si ya tienes contador y solo necesitas resolver un problema puntual — una multa, una anotación, F29 atrasados — contratas solo ese servicio y listo.",
  },
  {
    q: "¿Qué pasa si no levantan mi anotación en 10 días hábiles?",
    a: "Te devolvemos el 50% del fee. Está firmado en el contrato: no es una promesa comercial, es una obligación nuestra. En el 99% de los casos lo logramos dentro del plazo.",
  },
  {
    q: "¿Los precios tienen IVA incluido?",
    a: "Sí, todos los precios publicados son finales, con IVA incluido. Puedes pagar con tarjeta y el seguimiento de tu caso es visible en todo momento.",
  },
  {
    q: "¿Quién está detrás de KickoffIVA?",
    a: "La consultora Kickoff (kickoff.cl): +8 años asesorando pymes chilenas, +5.000 empresas atendidas, con contadores, tributaristas y abogados en Santiago y presencia en 7 países. KickoffIVA es su brazo automatizado: el sistema calcula, el equipo responde.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="border-b border-linea">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">Preguntas frecuentes</p>
        <h2 className="headline text-3xl sm:text-4xl lg:text-5xl">
          Lo que toda pyme pregunta antes de partir
        </h2>

        <Accordion type="single" collapsible className="mt-10 max-w-3xl">
          {FAQS.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`} className="border-linea">
              <AccordionTrigger className="text-left text-base sm:text-lg font-medium text-papel hover:text-cancha hover:no-underline py-5">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm sm:text-base text-humo leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
