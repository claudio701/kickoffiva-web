const PASOS = [
  {
    n: "1",
    titulo: "Conectas tu SII una sola vez",
    texto:
      "Nos das acceso con tu clave tributaria y el sistema empieza a leer tus facturas, notas de crédito y compras todos los días. Tú no vuelves a subir un papel.",
  },
  {
    n: "2",
    titulo: "El día 28, tu IVA ya está calculado",
    texto:
      "Como el sistema procesó el mes completo en tiempo real, el cierre no toma días: toma minutos. Tienes tu número diez días antes de que el SII publique su propuesta. Ordenas la caja con tiempo, no con sustos.",
  },
  {
    n: "3",
    titulo: "El sistema declara. Y si algo se tuerce, entran los humanos.",
    texto:
      "Tu F29 queda declarado y pagado en fecha, todos los meses. Y si aparece una multa, una anotación o una fiscalización, no te llega una alerta para que te arregles solo: el caso lo toma el equipo tributario de Kickoff, con garantía de 10 días hábiles.",
  },
];

export default function ComoFunciona() {
  return (
    <section id="como-funciona" className="border-b border-linea">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">Cómo funciona</p>
        <h2 className="headline text-3xl sm:text-4xl lg:text-5xl max-w-3xl">
          Cómo tu IVA está listo antes que el del SII
        </h2>
        <p className="mt-4 text-humo max-w-xl">
          No es magia. Es que el sistema trabaja todos los días, no una vez al mes.
        </p>

        <ol className="mt-12 space-y-0">
          {PASOS.map((p) => (
            <li
              key={p.n}
              className="grid gap-4 border-t border-linea py-8 sm:grid-cols-[64px_1fr] sm:gap-8"
            >
              <span className="font-display font-bold text-4xl sm:text-5xl text-cancha leading-none">
                {p.n}
              </span>
              <div>
                <h3 className="font-display font-semibold text-xl sm:text-2xl">{p.titulo}</h3>
                <p className="mt-3 max-w-2xl text-sm sm:text-base text-humo leading-relaxed">
                  {p.texto}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-10 border-l-2 border-cancha pl-5 font-display text-xl sm:text-2xl text-papel">
          El sistema calcula. El equipo responde.{" "}
          <span className="text-humo text-base sm:text-lg font-sans">
            Esa es la diferencia con un software que te deja solo — y con un contador que llega tarde.
          </span>
        </p>
      </div>
    </section>
  );
}
