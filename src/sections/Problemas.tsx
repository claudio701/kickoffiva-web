const PROBLEMAS = [
  {
    n: "01",
    titulo: "El SII te avisa cuando ya es tarde",
    texto:
      "Su propuesta llega el día 5 del mes siguiente. Nosotros te damos tu IVA el día 28 del mismo mes. Diez días de ventaja para ordenar la caja.",
  },
  {
    n: "02",
    titulo: "La multa llega sola. La defensa no.",
    texto:
      "Un día de atraso = 10% de multa más intereses corriendo por día. Por eso existe el Plan a Todo Evento: cualquier irregularidad, juicio o fiscalización queda cubierta.",
  },
  {
    n: "03",
    titulo: "Las anotaciones se levantan. Punto.",
    texto:
      "En 10 días hábiles garantizados — como en el 99% de nuestros casos — o te devolvemos el 50% del fee. El SII solo responde en 15 días; nosotros corremos por ti.",
  },
];

export default function Problemas() {
  return (
    <section className="border-b border-linea">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-10">El problema</p>
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {PROBLEMAS.map((p) => (
            <article key={p.n} className="border-t-2 border-linea pt-6">
              <span className="font-mono text-sm text-cancha">{p.n}</span>
              <h3 className="mt-3 font-display font-semibold text-xl sm:text-2xl leading-tight uppercase">
                {p.titulo}
              </h3>
              <p className="mt-4 text-sm sm:text-base text-humo leading-relaxed">{p.texto}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
