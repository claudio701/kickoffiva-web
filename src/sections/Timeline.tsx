const HITOS = [
  { dia: "28", tag: "CIERRE KICKOFF", texto: "tu IVA del mes, calculado", activo: true },
  { dia: "~5", tag: "PROPUESTA SII", texto: "llega tarde: tú ya sabes", activo: false },
  { dia: "12·20", tag: "DECLARACIÓN Y PAGO", texto: "caja lista, cero sustos", activo: false },
];

export default function Timeline() {
  return (
    <section className="border-b border-linea bg-panel/40">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-10">El mes, ordenado</p>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-linea bg-linea sm:grid-cols-3">
          {HITOS.map((h) => (
            <div
              key={h.tag}
              className={`p-6 sm:p-8 ${h.activo ? "bg-cancha text-tinta" : "bg-tinta"}`}
            >
              <p className={`font-display font-bold text-5xl sm:text-6xl leading-none ${h.activo ? "" : "text-papel"}`}>
                {h.dia}
              </p>
              <p className={`mt-4 font-mono text-[11px] sm:text-xs uppercase tracking-[0.2em] ${h.activo ? "text-tinta/70" : "text-cancha"}`}>
                {h.tag}
              </p>
              <p className={`mt-1 text-sm ${h.activo ? "text-tinta/80" : "text-humo"}`}>{h.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
