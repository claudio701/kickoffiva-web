import { useCallback, useEffect, useRef, useState } from "react";
import { clp, waUrl, WHATSAPP_MANDATARIO_URL } from "../config";
import {
  ApiError,
  crearEmpresa,
  descargarLibro,
  getActiveCompanyId,
  getCierre,
  getEmpresa,
  getEmpresas,
  getMe,
  getToken,
  borrarCredencialesSii,
  guardarCredencialesSii,
  login,
  logout,
  recuperarClave,
  restablecerClave,
  register,
  setActiveCompanyId,
  sincronizarSii,
  type CierreActual,
  type Empresa,
  type EmpresaResumen,
  type EstadoCierre,
  type Usuario,
} from "../lib/api";
import { rutValido } from "../lib/rut";
import { mesLargo, moverMes, tasaPpmTexto, vencimientoF29 } from "../lib/formato";
import Turnstile, { TURNSTILE_ACTIVO } from "../components/Turnstile";
import { abrirAsistente } from "../lib/asistente";
import { EVENTO_MODO } from "../lib/sesion";
import { leerCalcGuardada } from "./Calculadora";

const ESTADO_STYLES: Record<EstadoCierre, string> = {
  listo: "bg-cancha/15 text-cancha border-cancha/40",
  pendiente: "bg-multa/15 text-multa border-multa/40",
  sin_datos: "bg-panel text-humo border-linea",
};

const ESTADO_LABELS: Record<EstadoCierre, string> = {
  listo: "✓ Calculado",
  pendiente: "Pendiente",
  sin_datos: "Faltan tus facturas",
};

function estadoBadge(estado: EstadoCierre) {
  const cls = ESTADO_STYLES[estado] ?? "bg-panel text-humo border-linea";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${cls}`}
    >
      {ESTADO_LABELS[estado] ?? estado}
    </span>
  );
}

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Modo = "login" | "register";

interface ErroresRegistro {
  rut?: string;
  nombre?: string;
  email?: string;
  password?: string;
}

export default function MiIva() {
  const [usuario, setUsuario] = useState<Usuario | null>(() => getMe());
  const [autenticado, setAutenticado] = useState(() => getToken() !== null);

  // ── Login / Registro ──
  // La mayoría de quienes llegan aquí son nuevos: si nunca entró en este equipo, "Soy nuevo".
  const [modo, setModo] = useState<Modo>(() => (getMe() ? "login" : "register"));
  const [verPassword, setVerPassword] = useState(false);
  // Recuperar contraseña: "recuperar" pide el link; "restablecer" llega desde el link del correo.
  const [tokenRestablecer] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("restablecer");
    } catch {
      return null;
    }
  });
  const [vista, setVista] = useState<"normal" | "recuperar" | "restablecer">(() =>
    tokenRestablecer ? "restablecer" : "normal"
  );
  const [recuperarMsg, setRecuperarMsg] = useState<string | null>(null);
  const [cuentaError, setCuentaError] = useState<string | null>(null);
  const [reintentoCuenta, setReintentoCuenta] = useState(0);
  const [verClaveSii, setVerClaveSii] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rutRegistro, setRutRegistro] = useState("");
  const [erroresRegistro, setErroresRegistro] = useState<ErroresRegistro>({});
  const [authCargando, setAuthCargando] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Turnstile: el token sirve una sola vez; tras cada envío se vuelve a montar el widget.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);


  // ── Empresas de la cuenta ──
  const [empresas, setEmpresas] = useState<EmpresaResumen[] | null>(null);
  const [empresaActiva, setEmpresaActiva] = useState<string | null>(() => getActiveCompanyId());
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [nuevaNombre, setNuevaNombre] = useState("");
  const [nuevaRut, setNuevaRut] = useState("");
  const [empresaCargando, setEmpresaCargando] = useState(false);
  const [empresaError, setEmpresaError] = useState<string | null>(null);

  // ── Cierre ──
  const [cierre, setCierre] = useState<CierreActual | null>(null);
  const [cierreCargando, setCierreCargando] = useState(false);
  const [cierreError, setCierreError] = useState<string | null>(null);

  // ── Descargas ──
  const [periodo, setPeriodo] = useState(periodoActual);
  const [descargando, setDescargando] = useState<"compra" | "venta" | null>(null);
  const [descargaError, setDescargaError] = useState<string | null>(null);

  // ── Conexión SII ──
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [rutSii, setRutSii] = useState("");
  const [claveSii, setClaveSii] = useState("");
  const [siiCargando, setSiiCargando] = useState(false);
  const [siiError, setSiiError] = useState<string | null>(null);
  const [siiOk, setSiiOk] = useState<string | null>(null);
  const [syncCargando, setSyncCargando] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const sinDatos = cierre?.estado === "sin_datos";

  // Datos que el visitante usó en la calculadora pública (si los hay).
  const [calcGuardada] = useState(() => leerCalcGuardada());

  const manejarError = useCallback((e: unknown, fallback: string): string => {
    if (e instanceof ApiError && e.status === 401) {
      setAutenticado(false);
      setUsuario(null);
      setCierre(null);
      return e.message; // "Sesión expirada..."
    }
    return e instanceof Error ? e.message : fallback;
  }, []);

  const cargarCierre = useCallback(async () => {
    setCierreCargando(true);
    setCierreError(null);
    try {
      // El mismo mes que eligió la persona (antes siempre era el mes en curso).
      setCierre(await getCierre(periodo));
    } catch (e) {
      setCierreError(manejarError(e, "No pudimos cargar tu IVA de ese mes."));
    } finally {
      setCierreCargando(false);
    }
  }, [manejarError, periodo]);

  // "Entrar" del encabezado abre "Ya tengo cuenta"; "Entrar y probar", "Soy nuevo".
  useEffect(() => {
    const cambiar = (ev: Event) => {
      const m = (ev as CustomEvent).detail;
      if (m === "login" || m === "register") {
        setModo(m);
        setVista("normal");
        setAuthError(null);
        setErroresRegistro({});
      }
    };
    window.addEventListener(EVENTO_MODO, cambiar);
    return () => window.removeEventListener(EVENTO_MODO, cambiar);
  }, []);

  // Al entrar o crear la cuenta, la sección cambia de alto: llevamos a la persona
  // al comienzo de su cuenta para que no quede mirando otra parte de la página.
  const recienEntro = useRef(false);
  useEffect(() => {
    if (recienEntro.current && empresas !== null) {
      recienEntro.current = false;
      document.getElementById("mi-iva")?.scrollIntoView({ block: "start" });
    }
  }, [empresas]);

  // Cargar las empresas de la cuenta al autenticarse.
  useEffect(() => {
    if (!autenticado) return;
    let cancel = false;
    (async () => {
      try {
        const lista = await getEmpresas();
        if (cancel) return;
        setEmpresas(lista);
        const guardada = getActiveCompanyId();
        const activa = lista.find((e) => e.id === guardada)?.id ?? lista[0]?.id ?? null;
        setEmpresaActiva(activa);
        setActiveCompanyId(activa);
      } catch (e) {
        if (cancel) return;
        if (e instanceof ApiError && e.status === 401) {
          // Sesión vencida: volver a entrar (no pedirle crear la empresa de nuevo).
          setAutenticado(false);
          setUsuario(null);
          setModo("login");
          setAuthError("Tu sesión se cerró por seguridad. Vuelve a entrar.");
        } else {
          setCuentaError("No pudimos cargar tu cuenta. Revisa tu internet e intenta de nuevo.");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [autenticado, reintentoCuenta]);

  // Cargar cierre + empresa cada vez que cambia la empresa activa.
  useEffect(() => {
    if (autenticado && empresaActiva) {
      void cargarCierre();
      getEmpresa()
        .then(setEmpresa)
        .catch(() => setEmpresa(null));
    }
  }, [autenticado, empresaActiva, cargarCierre]);

  const onCambiarEmpresa = (id: string) => {
    setEmpresaActiva(id);
    setActiveCompanyId(id);
    setSyncMsg(null);
    setSiiOk(null);
    setSiiError(null);
  };

  const onCrearEmpresa = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setEmpresaError(null);
    if (!nuevaNombre.trim()) {
      setEmpresaError("Escribe el nombre de la empresa.");
      return;
    }
    if (!rutValido(nuevaRut)) {
      setEmpresaError("El RUT no es válido. Revisa el número que va después del guion (ejemplo: 76.123.456-7).");
      return;
    }
    setEmpresaCargando(true);
    try {
      const creada = await crearEmpresa(nuevaNombre.trim(), nuevaRut.trim());
      const lista = [...(empresas ?? []), creada];
      setEmpresas(lista);
      setNuevaNombre("");
      setNuevaRut("");
      setMostrarAgregar(false);
      onCambiarEmpresa(creada.id);
    } catch (e) {
      setEmpresaError(manejarError(e, "No pudimos agregar la empresa."));
    } finally {
      setEmpresaCargando(false);
    }
  };

  const validarRegistro = (): ErroresRegistro => {
    const errs: ErroresRegistro = {};
    if (!rutRegistro.trim()) errs.rut = "Escribe el RUT de la empresa.";
    else if (!rutValido(rutRegistro)) errs.rut = "El RUT no es válido. Revisa el número que va después del guion (ejemplo: 76.123.456-7).";
    if (!nombre.trim()) errs.nombre = "Escribe el nombre de la empresa.";
    if (!email.trim()) {
      errs.email = "Escribe tu correo.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = "Revisa el correo: debe tener una @ (ejemplo: rosa@gmail.com).";
    }
    if (password.length < 8) errs.password = "La contraseña debe tener al menos 8 letras o números.";
    return errs;
  };

  const onSubmitAuth = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAuthError(null);

    if (modo === "register") {
      const errs = validarRegistro();
      setErroresRegistro(errs);
      if (Object.keys(errs).length > 0) {
        // Llevar a la persona al primer dato que falta (en celular puede quedar fuera de vista).
        requestAnimationFrame(() => {
          const campo = document.querySelector<HTMLInputElement>('#mi-iva [aria-invalid="true"]');
          campo?.scrollIntoView({ block: "center" });
          campo?.focus();
        });
        return;
      }
    }

    if (TURNSTILE_ACTIVO && !captchaToken) {
      setAuthError("Estamos verificando que eres una persona. Espera un segundo y vuelve a tocar el botón.");
      return;
    }

    setAuthCargando(true);
    try {
      const token = captchaToken ?? undefined;
      const res =
        modo === "register"
          ? await register({
              email: email.trim(),
              password,
              nombre: nombre.trim(),
              // El negocio se crea junto con la cuenta: la persona queda adentro al tiro.
              nombreEmpresa: nombre.trim(),
              rutEmpresa: rutRegistro.trim(),
              ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
              ...(token ? { turnstileToken: token } : {}),
            })
          : await login(email.trim(), password, token);
      setUsuario(res.user);
      setPassword("");
      recienEntro.current = true;
      setAutenticado(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && modo === "register") {
        // Ya tiene cuenta: lo pasamos a "Ya tengo cuenta" con su correo escrito.
        setModo("login");
        setPassword("");
        setAuthError(
          `Ya tienes una cuenta con ese ${/RUT/.test(e.message) ? "RUT" : "correo"}. Escribe tu contraseña aquí abajo para entrar. Si no la recuerdas, toca "¿Olvidaste tu contraseña?".`
        );
        return;
      }
      setAuthError(
        e instanceof ApiError && e.status === 401 && modo === "login" && e.message !== "Credenciales inválidas"
          ? e.message // p.ej. "Ese RUT está en más de una cuenta. Entra con tu correo."
          : e instanceof ApiError && e.status === 401 && modo === "login"
          ? "El RUT o correo, o la contraseña, no coinciden. Si no la recuerdas, toca \"¿Olvidaste tu contraseña?\"."
          : e instanceof ApiError && e.status !== 401
          ? e.message
          : manejarError(
              e,
              modo === "register"
                ? "No pudimos crear tu cuenta. Revisa tus datos."
                : "No pudimos iniciar sesión. Revisa tus datos."
            )
      );
    } finally {
      setAuthCargando(false);
      if (TURNSTILE_ACTIVO) {
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
    }
  };


  const onDescargar = async (tipo: "compra" | "venta") => {
    setDescargando(tipo);
    setDescargaError(null);
    try {
      await descargarLibro(tipo, periodo);
    } catch (e) {
      setDescargaError(manejarError(e, "No pudimos descargar el libro."));
    } finally {
      setDescargando(null);
    }
  };

  const onGuardarSii = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSiiError(null);
    setSiiOk(null);
    if (!rutValido(rutSii)) {
      setSiiError("El RUT no es válido. Revisa el número que va después del guion (ejemplo: 12.345.678-5).");
      return;
    }
    if (claveSii.length < 4) {
      setSiiError("La clave del SII es muy corta. Revisa que esté completa.");
      return;
    }
    setSiiCargando(true);
    try {
      await guardarCredencialesSii(rutSii.trim(), claveSii);
      setClaveSii(""); // nunca la retenemos en pantalla
      setSiiOk("Listo, tu clave quedó guardada y protegida. Ahora toca el botón para traer tus facturas.");
      setEmpresa(await getEmpresa());
    } catch (e) {
      setSiiError(manejarError(e, "No pudimos guardar tu clave. Intenta de nuevo."));
    } finally {
      setSiiCargando(false);
    }
  };

  const onSincronizar = async () => {
    setSyncCargando(true);
    setSyncMsg(null);
    setSiiError(null);
    setSiiOk(null);
    try {
      const r = await sincronizarSii(periodo);
      setSyncMsg(
        `Listo: trajimos ${r.compras.n} ${r.compras.n === 1 ? "factura de compra" : "facturas de compra"} y ${r.ventas.n} ${r.ventas.n === 1 ? "factura de venta" : "facturas de venta"} de ${mesLargo(periodo)}.`
      );
      setEmpresa(await getEmpresa());
      await cargarCierre();
    } catch (e) {
      const msg = manejarError(e, "No pudimos traer tus facturas desde el SII. Intenta de nuevo en unos minutos o escríbenos por WhatsApp.");
      const rechazada = /rechaz/i.test(msg);
      setSiiError(
        rechazada
          ? "El SII no aceptó tu RUT o tu clave. Revisa que sean los mismos con que entras a sii.cl y guárdalos de nuevo aquí abajo. No volveremos a intentarlo hasta que lo hagas, para que el SII no bloquee tu clave."
          : msg
      );
      if (rechazada) setEmpresa(await getEmpresa().catch(() => empresa));
    } finally {
      setSyncCargando(false);
    }
  };

  const onBorrarSii = async () => {
    if (
      !window.confirm(
        "¿Borrar tu clave del SII de KickoffIVA? Dejaremos de traer tus facturas hasta que la guardes de nuevo."
      )
    ) {
      return;
    }
    setSiiError(null);
    setSiiOk(null);
    setSyncMsg(null);
    setSiiCargando(true);
    try {
      await borrarCredencialesSii();
      setSiiOk("Listo, borramos tu clave del SII. Ya no la tenemos guardada.");
      setEmpresa(await getEmpresa());
    } catch (e) {
      setSiiError(manejarError(e, "No pudimos borrar tu clave. Intenta de nuevo."));
    } finally {
      setSiiCargando(false);
    }
  };

  const onLogout = () => {
    logout();
    setAutenticado(false);
    setUsuario(null);
    setCierre(null);
    setEmpresa(null);
    setEmpresas(null);
    setEmpresaActiva(null);
    setEmail("");
    setModo("login");
  };

  const onRecuperar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAuthError(null);
    setRecuperarMsg(null);
    if (!email.trim()) {
      setAuthError("Escribe tu RUT o tu correo.");
      return;
    }
    setAuthCargando(true);
    try {
      const r = await recuperarClave(email.trim());
      setRecuperarMsg(r.mensaje);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "No pudimos enviar el correo. Intenta de nuevo.");
    } finally {
      setAuthCargando(false);
    }
  };

  const onRestablecer = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAuthError(null);
    if (password.length < 8) {
      setAuthError("La contraseña debe tener al menos 8 letras o números.");
      return;
    }
    setAuthCargando(true);
    try {
      const res = await restablecerClave(tokenRestablecer ?? "", password);
      try {
        // Sacamos el token de la dirección: ya se usó.
        window.history.replaceState(null, "", window.location.pathname + "#mi-iva");
      } catch {
        /* sin history */
      }
      setUsuario(res.user);
      setPassword("");
      setVista("normal");
      recienEntro.current = true;
      setAutenticado(true);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "No pudimos guardar la contraseña. Intenta de nuevo.");
    } finally {
      setAuthCargando(false);
    }
  };

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    setAuthError(null);
    setErroresRegistro({});
  };

  // Estilos pensados para cualquier persona: letra grande, contraste alto,
  // botones de al menos 48px de alto y ayudas en texto normal (no mono chico).
  const inputCls =
    "w-full rounded-xl border-2 border-linea bg-tinta px-4 py-3.5 text-lg text-papel placeholder:text-humo outline-none focus:border-cancha focus:ring-2 focus:ring-cancha/30 transition";
  const inputErrorCls = "border-multa focus:border-multa focus:ring-multa/30";
  const labelTxt = "mb-2 block text-base font-semibold text-papel";
  const ayudaTxt = "mt-2 text-sm leading-relaxed text-humo";
  const errorTxt = "mt-2 text-base font-medium text-multa";
  const btnPrimario =
    "inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-cancha px-7 py-3.5 text-lg font-semibold text-tinta hover:bg-cancha-dim transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
  const btnSecundario =
    "inline-flex min-h-[48px] w-full items-center justify-center rounded-full border-2 border-cancha/60 px-6 py-3 text-base font-semibold text-cancha hover:bg-cancha/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto";
  const tarjeta = "rounded-2xl border border-linea bg-tinta p-5 sm:p-8";

  /** Etiqueta "Paso N de 3" para que la persona sepa cuánto le falta. */
  const paso = (n: number, texto: string) => (
    <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-cancha/15 px-4 py-1.5 text-sm font-semibold text-cancha">
      Paso {n} de 2 · {texto}
    </p>
  );

  /** Ayuda siempre a un toque: abre a Kiko, el asistente. */
  const ayuda = (
    <button
      type="button"
      onClick={abrirAsistente}
      className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-linea px-5 py-3 text-base text-papel hover:border-cancha/60 transition-colors"
    >
      🙋 ¿Te complicaste? Pregúntale a Kiko
    </button>
  );

  const mensajeError = (texto: string | null) =>
    texto ? (
      <p role="alert" className="mt-4 rounded-xl border border-multa/50 bg-multa/10 px-4 py-3 text-base font-medium text-multa">
        ⚠️ {texto}
      </p>
    ) : null;

  const mensajeOk = (texto: string | null) =>
    texto ? (
      <p role="status" className="mt-4 rounded-xl border border-cancha/50 bg-cancha/10 px-4 py-3 text-base font-medium text-cancha">
        ✓ {texto}
      </p>
    ) : null;

  const siiConectado = Boolean(empresa?.siiConfigurado);

  /* ── Tasa PPM: la fija el SII y la leemos nosotros; el cliente no hace nada ── */
  const ppmDelSii = empresa?.tasaPpmOrigen === "sii" || empresa?.tasaPpmOrigen === "manual";
  const tarjetaPpm = ppmDelSii ? (
    <p className="mt-5 text-sm text-humo">
      ✓ Tasa de PPM que te fijó el SII: <strong className="text-papel">{tasaPpmTexto(empresa?.tasaPpm ?? 0)}</strong>
    </p>
  ) : (
    <p className="mt-5 rounded-xl border border-multa/50 bg-multa/10 px-4 py-3 text-base text-papel">
      Este total es <strong>estimado</strong>: todavía estamos leyendo del SII tu tasa de PPM y por
      ahora usamos {tasaPpmTexto(empresa?.tasaPpm ?? 0)}. No tienes que hacer nada; se ajusta sola
      cuando el SII nos la entregue.
    </p>
  );

  /* ── Tarjeta: conexión con el SII (paso 3) ───────────────────────────── */
  const tarjetaSii = (
    <div id="conectar-sii" className={tarjeta}>
      {!siiConectado && paso(2, "Conecta el SII")}
      <h3 className="font-display text-2xl font-semibold text-papel">
        {siiConectado ? "Tus facturas del SII" : "Trae tus facturas desde el SII"}
      </h3>

      {siiConectado ? (
        <div className="mt-4">
          {empresa?.siiClaveRechazada ? (
            <p role="alert" className="rounded-xl border border-multa/50 bg-multa/10 px-4 py-3 text-base font-medium text-multa">
              ⚠️ El SII rechazó tu clave. Para que no te la bloquee, no volveremos a intentarlo hasta que la guardes
              de nuevo aquí abajo.
            </p>
          ) : (
            <p className="text-base text-cancha">✓ Tu clave del SII está guardada y cifrada.</p>
          )}
          <button
            type="button"
            disabled={syncCargando || !periodo || Boolean(empresa?.siiClaveRechazada)}
            onClick={() => void onSincronizar()}
            className={`${btnPrimario} mt-4`}
          >
            {syncCargando ? "Trayendo tus facturas… (puede tardar 1 minuto)" : `Traer mis facturas de ${mesLargo(periodo)}`}
          </button>
          <p className={ayudaTxt}>Para otro mes, cámbialo arriba con los botones ‹ y ›.</p>
          {mensajeError(siiError)}
          {mensajeOk(syncMsg)}
          {mensajeOk(siiOk)}
          {/* Ya conectado: el formulario queda plegado para no recargar la pantalla
              (abierto si el SII rechazó la clave, porque hay que guardarla de nuevo) */}
          <details open={Boolean(empresa?.siiClaveRechazada)} className="mt-6 rounded-xl border border-linea p-4">
            <summary className="min-h-[44px] cursor-pointer py-2 text-base font-semibold text-papel">
              ¿Cambiaste tu clave del SII? Guárdala de nuevo
            </summary>
            <form method="post" action="#mi-iva" onSubmit={(e) => void onGuardarSii(e)} className="mt-6 space-y-5">
        <label className="block">
          <span className={labelTxt}>RUT con que entras al SII</span>
          <input
            type="text"
            required
            autoComplete="off"
            value={rutSii}
            onChange={(e) => setRutSii(e.target.value)}
            aria-describedby="ayuda-rut-sii"
            className={inputCls}
          />
          <p id="ayuda-rut-sii" className={ayudaTxt}>El mismo RUT que escribes cuando entras a sii.cl. Ejemplo: 12.345.678-5</p>
        </label>
        <label className="block">
          <span className={labelTxt}>Clave del SII</span>
          <div className="flex gap-2">
            <input
              type={verClaveSii ? "text" : "password"}
              required
              autoComplete="off"
              value={claveSii}
              onChange={(e) => setClaveSii(e.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setVerClaveSii((v) => !v)}
              aria-pressed={verClaveSii}
              className="min-h-[52px] shrink-0 rounded-xl border-2 border-humo/60 px-4 text-base text-papel hover:border-humo"
            >
              {verClaveSii ? "Ocultar" : "Ver"}
            </button>
          </div>
          <p className={ayudaTxt}>La misma clave con que entras a sii.cl.</p>
        </label>
        <button type="submit" disabled={siiCargando} className={siiConectado ? btnSecundario : btnPrimario}>
          {siiCargando ? "Guardando…" : siiConectado ? "Guardar clave nueva" : "Guardar y conectar"}
        </button>
      </form>
          </details>
          <button
            type="button"
            disabled={siiCargando}
            onClick={() => void onBorrarSii()}
            className="mt-4 min-h-[44px] text-base font-semibold text-humo underline underline-offset-4 hover:text-papel"
          >
            Borrar mi clave del SII
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-base leading-relaxed text-humo">
            Con tu RUT y tu clave del SII traemos solas tus facturas de compra y venta, y
            calculamos lo que pagas. Tú no subes nada.
          </p>
          {/* Mensaje de seguridad: siempre visible antes de pedir la clave */}
          <div className="mt-6 rounded-xl border border-cancha/30 bg-cancha/5 px-4 py-4">
            <p className="text-base font-semibold text-papel">🔒 Tu clave queda guardada bajo llave</p>
            <p className="mt-1.5 text-sm leading-relaxed text-humo">
              Se guarda cifrada, como en los bancos, y nunca se muestra en pantalla. Solo la usa
              el sistema para traer tus facturas del SII. Puedes borrarla cuando quieras.
            </p>
          </div>
          <form method="post" action="#mi-iva" onSubmit={(e) => void onGuardarSii(e)} className="mt-6 space-y-5">
        <label className="block">
          <span className={labelTxt}>RUT con que entras al SII</span>
          <input
            type="text"
            required
            autoComplete="off"
            value={rutSii}
            onChange={(e) => setRutSii(e.target.value)}
            aria-describedby="ayuda-rut-sii"
            className={inputCls}
          />
          <p id="ayuda-rut-sii" className={ayudaTxt}>El mismo RUT que escribes cuando entras a sii.cl. Ejemplo: 12.345.678-5</p>
        </label>
        <label className="block">
          <span className={labelTxt}>Clave del SII</span>
          <div className="flex gap-2">
            <input
              type={verClaveSii ? "text" : "password"}
              required
              autoComplete="off"
              value={claveSii}
              onChange={(e) => setClaveSii(e.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setVerClaveSii((v) => !v)}
              aria-pressed={verClaveSii}
              className="min-h-[52px] shrink-0 rounded-xl border-2 border-humo/60 px-4 text-base text-papel hover:border-humo"
            >
              {verClaveSii ? "Ocultar" : "Ver"}
            </button>
          </div>
          <p className={ayudaTxt}>La misma clave con que entras a sii.cl.</p>
        </label>
        <button type="submit" disabled={siiCargando} className={siiConectado ? btnSecundario : btnPrimario}>
          {siiCargando ? "Guardando…" : siiConectado ? "Guardar clave nueva" : "Guardar y conectar"}
        </button>
      </form>
          {mensajeError(siiError)}
          {mensajeOk(siiOk)}
        </>
      )}

      {/* Alternativa sin entregar la clave */}
      <details className="mt-8 rounded-xl border border-linea p-4">
        <summary className="cursor-pointer text-base font-semibold text-papel">
          ¿No quieres darnos tu clave? Hay otra forma
        </summary>
        <p className="mt-3 text-base leading-relaxed text-humo">
          Puedes autorizarnos como <strong className="text-papel">mandatario</strong> en el SII. Así
          entramos con nuestra propia clave y tú puedes quitar el permiso cuando quieras.
        </p>
        <ol className="mt-3 space-y-2 text-base leading-relaxed text-humo">
          <li>1. Entra a sii.cl con tu clave.</li>
          <li>2. En el menú "Mandatarios", autoriza el RUT que te enviamos por WhatsApp.</li>
          <li>3. Listo: nosotros hacemos el resto.</li>
        </ol>
        <a
          href={WHATSAPP_MANDATARIO_URL}
          target="_blank"
          rel="noreferrer"
          className={`${btnSecundario} mt-4`}
        >
          Pedir el RUT por WhatsApp
        </a>
      </details>
    </div>
  );

  return (
    <section id="mi-iva" className="scroll-mt-16 border-b border-linea bg-panel/40">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">{autenticado ? "Tu cuenta" : "Entrar"}</p>
        <h2 className="headline text-3xl sm:text-4xl lg:text-5xl max-w-3xl">
          {autenticado ? "Tu IVA del mes" : "Entra y mira tu IVA del mes"}
        </h2>

        <div className="mt-8 max-w-2xl">
          {!autenticado && vista === "recuperar" ? (
            /* ── Olvidé mi contraseña ───────────────────────────────── */
            <div className={tarjeta}>
              <h3 className="font-display text-2xl font-semibold text-papel">¿Olvidaste tu contraseña?</h3>
              <p className="mt-3 text-base text-humo leading-relaxed">
                Escribe tu RUT o tu correo y te mandamos un link para crear una contraseña nueva.
              </p>
              {recuperarMsg ? (
                mensajeOk(recuperarMsg)
              ) : (
                <form method="post" action="#mi-iva" onSubmit={(e) => void onRecuperar(e)} className="mt-6 space-y-5">
                  <label className="block">
                    <span className={labelTxt}>Tu RUT o tu correo</span>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ejemplo: 76.123.456-7"
                      className={inputCls}
                    />
                  </label>
                  {mensajeError(authError)}
                  {authError && (
                    <a
                      href={waUrl("Hola, no puedo entrar a mi cuenta de KickoffIVA y necesito ayuda.")}
                      target="_blank"
                      rel="noreferrer"
                      className={btnSecundario}
                    >
                      Pedir ayuda por WhatsApp
                    </a>
                  )}
                  <button type="submit" disabled={authCargando} className={btnPrimario}>
                    {authCargando ? "Enviando…" : "Enviarme el link"}
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => {
                  setVista("normal");
                  setAuthError(null);
                  setRecuperarMsg(null);
                }}
                className="mt-4 w-full min-h-[44px] text-base text-humo underline underline-offset-4 hover:text-papel"
              >
                ← Volver a entrar
              </button>
              {ayuda}
            </div>
          ) : !autenticado && vista === "restablecer" ? (
            /* ── Crear contraseña nueva (desde el link del correo) ──── */
            <div className={tarjeta}>
              <h3 className="font-display text-2xl font-semibold text-papel">Crea tu contraseña nueva</h3>
              <form method="post" action="#mi-iva" onSubmit={(e) => void onRestablecer(e)} className="mt-6 space-y-5">
                <label className="block">
                  <span className={labelTxt}>Contraseña nueva</span>
                  <div className="flex gap-2">
                    <input
                      type={verPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setVerPassword((v) => !v)}
                      aria-pressed={verPassword}
                      className="min-h-[52px] shrink-0 rounded-xl border-2 border-linea px-4 text-base text-papel hover:border-humo"
                    >
                      {verPassword ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                  <p className={ayudaTxt}>Mínimo 8 letras o números.</p>
                </label>
                {mensajeError(authError)}
                <button type="submit" disabled={authCargando} className={btnPrimario}>
                  {authCargando ? "Guardando…" : "Guardar y entrar"}
                </button>
              </form>
              {/* Si el link venció o ya se usó, que haya salida en esta misma pantalla */}
              <button
                type="button"
                onClick={() => {
                  setVista("recuperar");
                  setAuthError(null);
                  setRecuperarMsg(null);
                }}
                className={`${btnSecundario} mt-4 sm:w-full`}
              >
                Pedir un link nuevo
              </button>
              <button
                type="button"
                onClick={() => {
                  setVista("normal");
                  setModo("login");
                  setAuthError(null);
                }}
                className="mt-3 w-full min-h-[44px] text-base text-humo underline underline-offset-4 hover:text-papel"
              >
                ← Volver a entrar
              </button>
              {ayuda}
            </div>
          ) : !autenticado ? (
            /* ── Estado: sin sesión ─────────────────────────────────── */
            <div className={tarjeta}>
              {/* Dos botones grandes en vez de un link chico escondido abajo */}
              <div className="grid grid-cols-2 gap-2 rounded-full border border-linea p-1" role="tablist">
                {(["register", "login"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={modo === m}
                    onClick={() => cambiarModo(m)}
                    className={`min-h-[48px] rounded-full px-3 text-base font-semibold transition-colors ${
                      modo === m ? "bg-cancha text-tinta" : "text-papel hover:bg-panel"
                    }`}
                  >
                    {m === "register" ? "Soy nuevo" : "Ya tengo cuenta"}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                {modo === "register" && paso(1, "Crea tu cuenta")}
                <p className="text-base text-humo leading-relaxed">
                  {modo === "login"
                    ? "Entra con el RUT de la empresa (o tu correo) y tu contraseña."
                    : "Son 2 pasos y toma 2 minutos. No necesitas saber de impuestos."}
                </p>
              </div>

              <form method="post" action="#mi-iva" onSubmit={onSubmitAuth} className="mt-6 space-y-5" noValidate={modo === "register"}>
                {modo === "register" ? (
                  <>
                    <label className="block">
                      <span className={labelTxt}>RUT de la empresa</span>
                      <input
                        type="text"
                        required
                        autoComplete="off"
                        value={rutRegistro}
                        onChange={(e) => setRutRegistro(e.target.value)}
                        placeholder="Ejemplo: 76.123.456-7"
                        aria-invalid={Boolean(erroresRegistro.rut)}
                        className={`${inputCls} ${erroresRegistro.rut ? inputErrorCls : ""}`}
                      />
                      {erroresRegistro.rut ? (
                        <p role="alert" className={errorTxt}>{erroresRegistro.rut}</p>
                      ) : (
                        <p className={ayudaTxt}>El RUT con que la empresa emite sus facturas. (Si facturas como persona natural con giro, es tu RUT.)</p>
                      )}
                    </label>
                    <label className="block">
                      <span className={labelTxt}>Nombre de la empresa</span>
                      <input
                        type="text"
                        required
                        autoComplete="organization"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ejemplo: Panadería Doña Rosa SpA"
                        aria-invalid={Boolean(erroresRegistro.nombre)}
                        className={`${inputCls} ${erroresRegistro.nombre ? inputErrorCls : ""}`}
                      />
                      {erroresRegistro.nombre && <p role="alert" className={errorTxt}>{erroresRegistro.nombre}</p>}
                    </label>
                    <label className="block">
                      <span className={labelTxt}>Tu correo</span>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ejemplo: rosa@gmail.com"
                        aria-invalid={Boolean(erroresRegistro.email)}
                        className={`${inputCls} ${erroresRegistro.email ? inputErrorCls : ""}`}
                      />
                      {erroresRegistro.email && <p role="alert" className={errorTxt}>{erroresRegistro.email}</p>}
                    </label>
                  </>
                ) : (
                  <label className="block">
                    <span className={labelTxt}>RUT de la empresa o tu correo</span>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ejemplo: 76.123.456-7"
                      className={inputCls}
                    />
                  </label>
                )}

                <label className="block">
                  <span className={labelTxt}>{modo === "register" ? "Inventa una contraseña" : "Tu contraseña"}</span>
                  <div className="flex gap-2">
                    <input
                      type={verPassword ? "text" : "password"}
                      required
                      minLength={modo === "register" ? 8 : undefined}
                      autoComplete={modo === "register" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(erroresRegistro.password && modo === "register")}
                      className={`${inputCls} ${erroresRegistro.password && modo === "register" ? inputErrorCls : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setVerPassword((v) => !v)}
                      aria-pressed={verPassword}
                      className="min-h-[52px] shrink-0 rounded-xl border-2 border-linea px-4 text-base text-papel hover:border-humo"
                    >
                      {verPassword ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                  {erroresRegistro.password && modo === "register" ? (
                    <p role="alert" className={errorTxt}>{erroresRegistro.password}</p>
                  ) : (
                    modo === "register" && (
                      <p className={ayudaTxt}>Mínimo 8 letras o números. No es tu clave del SII.</p>
                    )
                  )}
                </label>

                {modo === "register" && (
                  <label className="block">
                    <span className={labelTxt}>
                      Tu WhatsApp <span className="font-normal text-humo">(si quieres)</span>
                    </span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="+56 9 1234 5678"
                      className={inputCls}
                    />
                    <p className={ayudaTxt}>Te avisamos cuánto pagar antes de que venza. Nada de publicidad.</p>
                  </label>
                )}

                <Turnstile key={captchaKey} onToken={setCaptchaToken} />

                {mensajeError(authError)}

                <button type="submit" disabled={authCargando} className={btnPrimario}>
                  {authCargando
                    ? modo === "register"
                      ? "Creando tu cuenta…"
                      : "Entrando…"
                    : modo === "register"
                      ? "Crear mi cuenta"
                      : "Entrar"}
                </button>
              </form>
              {modo === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setVista("recuperar");
                    setAuthError(null);
                  }}
                  className="mt-4 w-full min-h-[44px] text-base font-semibold text-cancha underline underline-offset-4 hover:text-cancha-dim"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
              {ayuda}
            </div>
          ) : cuentaError ? (
            /* ── No se pudo cargar la cuenta: reintentar, nunca pedir crear la empresa ── */
            <div className={tarjeta}>
              {mensajeError(cuentaError)}
              <button
                type="button"
                onClick={() => {
                  setCuentaError(null);
                  setEmpresas(null);
                  setReintentoCuenta((n) => n + 1);
                }}
                className={`${btnPrimario} mt-4`}
              >
                Intentar de nuevo
              </button>
              {ayuda}
            </div>
          ) : empresas === null ? (
            /* ── Estado: cargando cuenta ──────────────────────────── */
            <div className={tarjeta}>
              <p className="text-lg text-humo animate-pulse">Cargando tu cuenta…</p>
            </div>
          ) : empresas.length === 0 || mostrarAgregar ? (
            /* ── Estado: agregar empresa (onboarding o adicional) ──── */
            <div className={tarjeta}>
              
              <h3 className="font-display text-2xl font-semibold text-papel">
                {empresas.length === 0 ? "¿Cuál es tu empresa?" : "Agregar otra empresa"}
              </h3>
              <p className="mt-3 text-base text-humo leading-relaxed">
                {empresas.length === 0
                  ? `Bien${usuario?.nombre ? `, ${usuario.nombre}` : ""}: tu cuenta está lista. Ahora dinos de qué empresa quieres ver el IVA.`
                  : "Si manejas más de una empresa, agrégala aquí y cambias entre ellas cuando quieras."}
              </p>
              {calcGuardada && empresas.length === 0 && (
                <p className="mt-4 rounded-xl border border-cancha/30 bg-cancha/5 px-4 py-3 text-base text-humo">
                  ✓ En la calculadora pusiste ventas de{" "}
                  <span className="font-semibold text-cancha">{clp(calcGuardada.ventas)}</span> al mes.
                  Con tus facturas reales te damos el número exacto.
                </p>
              )}

              <form method="post" action="#mi-iva" onSubmit={(e) => void onCrearEmpresa(e)} className="mt-6 space-y-5">
                <label className="block">
                  <span className={labelTxt}>Nombre de la empresa</span>
                  <input
                    type="text"
                    required
                    autoComplete="organization"
                    value={nuevaNombre}
                    onChange={(e) => setNuevaNombre(e.target.value)}
                    placeholder="Ejemplo: Panadería Doña Rosa"
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className={labelTxt}>RUT de la empresa</span>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={nuevaRut}
                    onChange={(e) => setNuevaRut(e.target.value)}
                    placeholder="Ejemplo: 76.123.456-7"
                    className={inputCls}
                  />
                  <p className={ayudaTxt}>
                    El RUT con que haces tus facturas o boletas. Si trabajas como persona, es tu propio RUT.
                  </p>
                </label>

                {mensajeError(empresaError)}

                <div className="flex flex-col gap-3">
                  <button type="submit" disabled={empresaCargando} className={btnPrimario}>
                    {empresaCargando ? "Guardando…" : empresas.length === 0 ? "Seguir" : "Agregar empresa"}
                  </button>
                  {empresas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarAgregar(false);
                        setEmpresaError(null);
                      }}
                      className="min-h-[48px] rounded-full border border-linea px-7 py-3 text-base text-papel hover:border-humo transition-colors"
                    >
                      Volver
                    </button>
                  )}
                </div>
              </form>
              {ayuda}
            </div>
          ) : (
            /* ── Estado: con sesión y empresa ───────────────────────── */
            <div className="space-y-6">
              {/* Negocio activo */}
              <div className="space-y-3">
                {empresas.length > 1 ? (
                  <label className="block">
                    <span className={labelTxt}>Estás viendo</span>
                    <select
                      value={empresaActiva ?? ""}
                      onChange={(e) => onCambiarEmpresa(e.target.value)}
                      className={inputCls}
                    >
                      {empresas.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre} · {e.rut}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-lg font-semibold text-papel">
                    {empresas[0]?.nombre} <span className="whitespace-nowrap font-normal text-humo">· {empresas[0]?.rut}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setMostrarAgregar(true)}
                  className="min-h-[44px] text-base font-semibold text-cancha underline underline-offset-4 hover:text-cancha-dim"
                >
                  + Agregar otra empresa
                </button>
              </div>

              {/* Cierre del mes */}
              <div className={tarjeta}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-2xl font-semibold text-papel">
                    Tu IVA de {mesLargo(periodo)}
                  </h3>
                  {cierre && estadoBadge(cierre.estado)}
                </div>

                {/* Un solo selector de mes para todo: resultado, facturas y descargas */}
                <div className="mt-4 flex items-center gap-2" role="group" aria-label="Elegir mes">
                  <button
                    type="button"
                    onClick={() => setPeriodo((p) => moverMes(p, -1))}
                    aria-label="Mes anterior"
                    className="min-h-[48px] min-w-[48px] rounded-full border-2 border-humo/60 px-3 text-xl text-papel hover:border-cancha"
                  >
                    ‹
                  </button>
                  <p className="flex-1 text-center text-lg font-semibold capitalize text-papel" aria-live="polite">
                    {mesLargo(periodo)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPeriodo((p) => moverMes(p, 1))}
                    disabled={periodo >= periodoActual()}
                    aria-label="Mes siguiente"
                    className="min-h-[48px] min-w-[48px] rounded-full border-2 border-humo/60 px-3 text-xl text-papel hover:border-cancha disabled:opacity-30"
                  >
                    ›
                  </button>
                </div>

                {cierreCargando ? (
                  <p className="mt-6 text-lg text-humo animate-pulse">Calculando…</p>
                ) : cierreError ? (
                  <div className="mt-4">
                    {mensajeError(cierreError)}
                    <button type="button" onClick={() => void cargarCierre()} className={`${btnSecundario} mt-4`}>
                      Intentar de nuevo
                    </button>
                  </div>
                ) : cierre ? (
                  sinDatos ? (
                    /* ── Sin datos: decir qué hacer, con un botón ── */
                    <div className="mt-5 rounded-xl border-2 border-dashed border-linea p-5 text-center">
                      <p className="text-lg text-papel">Todavía no tenemos tus facturas de este mes.</p>
                      {calcGuardada && (
                        <p className="mt-2 text-base text-humo">
                          En la calculadora pusiste ventas de{" "}
                          <span className="font-semibold text-cancha">{clp(calcGuardada.ventas)}</span> al mes.
                        </p>
                      )}
                      {!siiConectado && (
                        <a href="#conectar-sii" className={`${btnPrimario} mt-5`}>
                          Conectar con el SII ↓
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="mt-5 text-base text-humo">Lo que debes pagar por {mesLargo(cierre.periodo)}</p>
                      <p className="mt-1 font-display font-bold text-5xl sm:text-6xl text-cancha leading-none">
                        {clp(cierre.totalAPagar)}
                      </p>
                      <p className="mt-2 text-sm text-humo">IVA + PPM, con tus facturas del SII.</p>
                      <p className="mt-4 rounded-xl border border-linea bg-panel px-4 py-3 text-base text-papel">
                        📅 Se declara y paga en el SII (Formulario 29) a más tardar el{" "}
                        <strong>{vencimientoF29(cierre.periodo)}</strong> si emites factura electrónica
                        (si no, el {vencimientoF29(cierre.periodo, 12)}). <strong>Este monto todavía no está pagado.</strong>
                      </p>
                      <button
                        type="button"
                        onClick={abrirAsistente}
                        className="mt-3 min-h-[44px] text-base font-semibold text-cancha underline underline-offset-4"
                      >
                        ¿Cómo lo pago? Pregúntale a Kiko
                      </button>

                      <dl className="mt-7 space-y-4 border-t border-linea pt-6 text-base">
                        <div className="flex justify-between gap-4">
                          <dt className="text-humo">
                            IVA de lo que vendiste
                            <span className="block text-sm">(débito fiscal)</span>
                          </dt>
                          <dd className="whitespace-nowrap font-mono text-papel">{clp(cierre.debitoFiscal)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-humo">
                            Menos el IVA de lo que compraste
                            <span className="block text-sm">(crédito fiscal)</span>
                          </dt>
                          <dd className="whitespace-nowrap font-mono text-papel">− {clp(cierre.creditoFiscal)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-linea pt-4">
                          <dt className="text-papel">IVA a pagar</dt>
                          <dd className="whitespace-nowrap font-mono text-papel">{clp(cierre.ivaAPagar)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-humo">
                            Más el PPM ({tasaPpmTexto(cierre.tasaPpm)} de tus ventas{ppmDelSii ? "" : ", estimado"})
                            <span className="block text-sm">(adelanto del impuesto a la renta)</span>
                          </dt>
                          <dd className="whitespace-nowrap font-mono text-papel">{clp(cierre.ppm)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-linea pt-4">
                          <dt className="font-semibold text-papel">Total a pagar</dt>
                          <dd className="whitespace-nowrap font-mono font-semibold text-papel">{clp(cierre.totalAPagar)}</dd>
                        </div>
                      </dl>

                      {tarjetaPpm}

                      {(cierre.creditoArrastrable ?? 0) > 0 && (
                        <p className="mt-5 rounded-xl border border-cancha/30 bg-cancha/5 px-4 py-3 text-base text-cancha">
                          A tu favor: te sobran {clp(cierre.creditoArrastrable ?? 0)} de IVA de compras. Se
                          descuentan el próximo mes.
                        </p>
                      )}
                    </>
                  )
                ) : null}
              </div>

              {/* Paso 3 / sincronizar: antes que las descargas, es lo que más importa */}
              {tarjetaSii}

              {/* Descargar libros (para el contador o para guardar) */}
              {!sinDatos && (
                <div className={tarjeta}>
                  <h3 className="font-display text-xl font-semibold text-papel">Descargar tus libros</h3>
                  <p className="mt-2 text-base text-humo">
                    Planilla con tus compras y ventas de {mesLargo(periodo)}, para guardar o mandar a tu contador.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={descargando !== null || !periodo}
                      onClick={() => void onDescargar("compra")}
                      className={btnSecundario}
                    >
                      {descargando === "compra" ? "Descargando…" : "Libro de compras"}
                    </button>
                    <button
                      type="button"
                      disabled={descargando !== null || !periodo}
                      onClick={() => void onDescargar("venta")}
                      className={btnSecundario}
                    >
                      {descargando === "venta" ? "Descargando…" : "Libro de ventas"}
                    </button>
                  </div>
                  {mensajeError(descargaError)}
                </div>
              )}

              {ayuda}

              <button
                type="button"
                onClick={onLogout}
                className="min-h-[44px] text-base text-humo underline underline-offset-4 hover:text-papel transition-colors"
              >
                Salir de mi cuenta
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
