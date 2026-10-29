import { abrirAsistente } from "../lib/asistente";

/**
 * Botones de acción comunes. Regla de usabilidad: en cualquier parte del sitio la
 * persona tiene a mano "Entrar" (ir a Mi IVA a probar) y "Conversemos en línea"
 * (abre a Kiko, que deriva a una persona si hace falta).
 */
export function BotonEntrar({
  texto = "Entrar y probar →",
  oscuro = false,
  className = "",
}: {
  texto?: string;
  oscuro?: boolean;
  className?: string;
}) {
  return (
    <a
      href="#mi-iva"
      className={`inline-flex min-h-[52px] items-center justify-center rounded-full px-8 py-3.5 text-lg font-semibold transition-colors ${
        oscuro ? "bg-tinta text-cancha hover:bg-panel" : "bg-cancha text-tinta hover:bg-cancha-dim"
      } ${className}`}
    >
      {texto}
    </a>
  );
}

export function BotonConversar({
  texto = "Conversemos en línea",
  oscuro = false,
  className = "",
}: {
  texto?: string;
  oscuro?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={abrirAsistente}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 px-7 py-3.5 text-base font-semibold transition-colors ${
        oscuro ? "border-tinta/40 text-tinta hover:border-tinta" : "border-linea text-papel hover:border-cancha/60"
      } ${className}`}
    >
      💬 {texto}
    </button>
  );
}

/** Franja corta entre secciones: siempre a un toque de entrar. */
export function BandaEntrar({ frase }: { frase: string }) {
  return (
    <div className="border-b border-linea bg-tinta">
      <div className="wrap flex flex-col items-stretch gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg text-papel">{frase}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <BotonEntrar />
          <BotonConversar />
        </div>
      </div>
    </div>
  );
}
