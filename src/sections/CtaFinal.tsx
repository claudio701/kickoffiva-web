import { BotonEntrar, BotonConversar } from "../components/Botones";

export default function CtaFinal() {
  return (
    <section className="border-b border-linea bg-cancha text-tinta">
      <div className="wrap py-16 sm:py-24 text-center">
        <h2 className="headline text-4xl sm:text-6xl max-w-3xl mx-auto !text-tinta">
          Tu IVA del próximo mes puede estar listo el día 28.
        </h2>
        <p className="mt-5 text-tinta/75 max-w-xl mx-auto text-base sm:text-lg">
          Entra hoy y mira tu IVA del mes. Si te queda una duda, conversamos en línea —
          sin compromiso y sin letra chica.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
          <BotonEntrar oscuro />
          <BotonConversar oscuro />
        </div>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-tinta/70">
          Respuesta en 24 h hábiles · conocemos tu empresa por su nombre
        </p>
      </div>
    </section>
  );
}
