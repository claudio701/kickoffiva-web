import { useEffect, useRef, useState } from "react";
import { waUrl } from "../config";
import { EVENTO_ABRIR_ASISTENTE } from "../lib/asistente";

/**
 * "Kiko", el amigo que atiende: un personaje que saluda y resuelve las dudas típicas
 * con botones grandes (sin escribir). Si no basta, deriva a una persona por WhatsApp.
 *
 * Cualquier parte del sitio lo abre con abrirAsistente() de ../lib/asistente.
 */

const NOMBRE = "Kiko";

interface Tema {
  pregunta: string;
  respuesta: string;
  accion?: { texto: string; href: string; externo?: boolean };
}

const TEMAS: Tema[] = [
  {
    pregunta: "Quiero entrar y probar",
    respuesta: "¡Buenísimo! Toca el botón y te llevo. Si es tu primera vez, elige \"Soy nuevo\": con el RUT de la empresa, tu correo y una contraseña quedas adentro.",
    accion: { texto: "Entrar", href: "#mi-iva" },
  },
  {
    pregunta: "Recién llego, ¿qué hago?",
    respuesta:
      "¡Bienvenido! Son 2 pasos: 1) crea tu cuenta con el RUT y el nombre de la empresa, tu correo y una contraseña; 2) conecta el SII. Nosotros calculamos el resto.",
    accion: { texto: "Llévame a crear mi cuenta", href: "#mi-iva" },
  },
  {
    pregunta: "¿Cuándo y cómo pago el IVA?",
    respuesta:
      "El IVA de cada mes se declara y paga el mes siguiente en sii.cl, con el Formulario 29: hasta el día 20 si emites factura electrónica (si no, hasta el 12). Entras a sii.cl con tu RUT y clave, vas a Impuestos mensuales, declaras el F29 y pagas con tu banco. Si prefieres que lo hagamos nosotros, eso es el Plan a Todo Evento.",
    accion: { texto: "Ver el Plan", href: "#plan" },
  },
  {
    pregunta: "Olvidé mi contraseña de KickoffIVA",
    respuesta:
      "Toca \"Entrar\", luego \"Ya tengo cuenta\" y abajo \"¿Olvidaste tu contraseña?\". Te mandamos un correo con un link para crear una nueva.",
    accion: { texto: "Ir a entrar", href: "#mi-iva" },
  },
  {
    pregunta: "No sé mi clave del SII",
    respuesta:
      "Es la misma clave con que entras a sii.cl. Si no la tienes o se te olvidó, en la página de ingreso de sii.cl está la opción para recuperarla o crear una nueva con tu cédula de identidad. Si te enredas, te ayudamos por WhatsApp.",
    accion: { texto: "Ir a sii.cl", href: "https://www.sii.cl", externo: true },
  },
  {
    pregunta: "¿Es seguro darles mi clave?",
    respuesta:
      "Sí. Tu clave se guarda cifrada (como en los bancos) y nunca se muestra en pantalla. Solo la usa el sistema para traer tus facturas, y puedes borrarla cuando quieras desde tu panel. Y si prefieres no darla, puedes autorizarnos como mandatario en el SII.",
  },
  {
    pregunta: "No me sale, estoy perdido",
    respuesta: "Tranquilo, para eso estamos. Escríbenos y una persona del equipo te ayuda paso a paso.",
  },
];

const WA_AYUDA = waUrl("Hola, me ayuda Kiko pero necesito hablar con una persona.");

/** El muñequito: cara redonda, sonrisa y mano saludando. Colores de la marca. */
function Personaje({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="34" r="24" fill="#C8F04A" />
      <path d="M14 24 Q32 4 50 24 Z" fill="#0C0C0A" />
      <rect x="12" y="22" width="40" height="5" rx="2.5" fill="#0C0C0A" />
      <circle cx="24" cy="34" r="3.2" fill="#0C0C0A" />
      <circle cx="40" cy="34" r="3.2" fill="#0C0C0A" />
      <circle cx="25" cy="33" r="1" fill="#F2EFE6" />
      <circle cx="41" cy="33" r="1" fill="#F2EFE6" />
      <circle cx="18" cy="41" r="3" fill="#E9A13B" opacity="0.55" />
      <circle cx="46" cy="41" r="3" fill="#E9A13B" opacity="0.55" />
      <path d="M24 43 Q32 50 40 43" stroke="#0C0C0A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g className="origin-[56px_44px] motion-safe:animate-[saludo_1.6s_ease-in-out_infinite]">
        <circle cx="57" cy="40" r="5.5" fill="#C8F04A" stroke="#0C0C0A" strokeWidth="2" />
      </g>
    </svg>
  );
}

export default function Asistente() {
  const [abierto, setAbierto] = useState(false);
  const [tema, setTema] = useState<Tema | null>(null);
  const [saludo, setSaludo] = useState(false);
  // Sobre el área de entrar/cuenta el botón flotante tapaba campos: ahí se esconde
  // (los botones "¿Te complicaste?" de esa sección igual abren a Kiko).
  const [sobreCuenta, setSobreCuenta] = useState(false);
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const revisar = () => {
      const r = document.getElementById("mi-iva")?.getBoundingClientRect();
      setSobreCuenta(r ? r.top < window.innerHeight * 0.85 && r.bottom > window.innerHeight * 0.15 : false);
    };
    revisar();
    window.addEventListener("scroll", revisar, { passive: true });
    window.addEventListener("resize", revisar);
    return () => {
      window.removeEventListener("scroll", revisar);
      window.removeEventListener("resize", revisar);
    };
  }, []);

  // Al abrir: foco dentro del diálogo; Escape lo cierra.
  useEffect(() => {
    if (!abierto) return;
    dialogo.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        setTema(null);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  // Se abre desde cualquier botón "¿Te complicaste?" del sitio.
  useEffect(() => {
    const abrir = () => {
      setAbierto(true);
      setSaludo(false);
    };
    window.addEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
  }, []);

  // Saludo una vez por visita, a los pocos segundos.
  useEffect(() => {
    let visto = false;
    try {
      // Una vez por visita, y no a quien ya tiene sesión (ya sabe dónde está).
      visto = sessionStorage.getItem("kiko_saludo") === "1" || localStorage.getItem("kickoffiva_token") !== null;
    } catch {
      /* storage bloqueado: saludamos igual */
    }
    // En celular el globo tapa contenido: solo saludamos en pantallas grandes.
    if (visto || window.innerWidth < 640) return;
    const mostrar = setTimeout(() => {
      setSaludo(true);
      try {
        sessionStorage.setItem("kiko_saludo", "1");
      } catch {
        /* sin storage */
      }
    }, 4000);
    // El globo se va solo para no tapar botones de la página.
    const ocultar = setTimeout(() => setSaludo(false), 12000);
    return () => {
      clearTimeout(mostrar);
      clearTimeout(ocultar);
    };
  }, []);

  const cerrar = () => {
    setAbierto(false);
    setTema(null);
  };

  return (
    <div className="fixed right-4 bottom-24 sm:bottom-6 z-[60] flex flex-col items-end gap-3">
      {abierto && (
        <div
          ref={dialogo}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label={`${NOMBRE}, tu asistente`}
          className="w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl outline-none border border-linea bg-panel p-5 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <Personaje className="h-12 w-12 shrink-0" />
            <div className="flex-1">
              <p className="text-lg font-semibold text-papel">¡Hola! Soy {NOMBRE} 👋</p>
              <p className="text-base text-humo">Tu amigo para ayudarte con el IVA. ¿En qué te ayudo?</p>
            </div>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar"
              className="h-10 w-10 shrink-0 rounded-full text-2xl leading-none text-humo hover:text-papel"
            >
              ×
            </button>
          </div>

          {tema ? (
            <div className="mt-4">
              <p className="rounded-xl bg-tinta px-4 py-3 text-base font-semibold text-papel">{tema.pregunta}</p>
              <p className="mt-3 text-base leading-relaxed text-papel">{tema.respuesta}</p>
              {tema.accion && (
                <a
                  href={tema.accion.href}
                  {...(tema.accion.externo ? { target: "_blank", rel: "noreferrer" } : {})}
                  onClick={() => !tema.accion?.externo && cerrar()}
                  className="mt-4 flex min-h-[48px] items-center justify-center rounded-full bg-cancha px-5 py-3 text-base font-semibold text-tinta"
                >
                  {tema.accion.texto}
                </a>
              )}
              <a
                href={WA_AYUDA}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex min-h-[48px] items-center justify-center rounded-full border border-linea px-5 py-3 text-base text-papel hover:border-cancha/60"
              >
                Hablar con una persona
              </a>
              <button
                type="button"
                onClick={() => setTema(null)}
                className="mt-3 w-full min-h-[44px] text-base text-humo underline underline-offset-4"
              >
                ← Ver otras preguntas
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {TEMAS.map((t) => (
                <button
                  key={t.pregunta}
                  type="button"
                  onClick={() => setTema(t)}
                  className="min-h-[52px] rounded-xl border border-linea bg-tinta px-4 py-3 text-left text-base text-papel hover:border-cancha/60"
                >
                  {t.pregunta}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {saludo && !abierto && (
        <button
          type="button"
          onClick={() => {
            setAbierto(true);
            setSaludo(false);
          }}
          className="max-w-[16rem] rounded-2xl rounded-br-sm border border-linea bg-papel px-4 py-3 text-left text-base text-tinta shadow-xl"
        >
          ¡Hola! Soy {NOMBRE}, tu amigo para atenderte. ¿Te ayudo?
        </button>
      )}

      <button
        type="button"
        hidden={sobreCuenta && !abierto}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-label={abierto ? `Cerrar a ${NOMBRE}` : `Abrir a ${NOMBRE}, tu asistente`}
        aria-expanded={abierto}
        className="h-16 w-16 rounded-full border-2 border-tinta bg-panel shadow-xl transition-transform hover:scale-105"
      >
        <Personaje className="h-full w-full" />
      </button>
    </div>
  );
}
