import { useCallback, useEffect, useState } from "react";
import { clp, WHATSAPP_MANDATARIO_URL } from "../config";
import {
  ApiError,
  crearEmpresa,
  descargarLibro,
  getActiveCompanyId,
  getCierreActual,
  getEmpresa,
  getEmpresas,
  getMe,
  getToken,
  guardarCredencialesSii,
  login,
  logout,
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
import { leerCalcGuardada } from "./Calculadora";

const ESTADO_STYLES: Record<EstadoCierre, string> = {
  listo: "bg-cancha/15 text-cancha border-cancha/40",
  pendiente: "bg-multa/15 text-multa border-multa/40",
  sin_datos: "bg-panel text-humo border-linea",
};

const ESTADO_LABELS: Record<EstadoCierre, string> = {
  listo: "Listo",
  pendiente: "Pendiente",
  sin_datos: "Sin datos",
};

function estadoBadge(estado: EstadoCierre) {
  const cls = ESTADO_STYLES[estado] ?? "bg-panel text-humo border-linea";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${cls}`}
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
  nombre?: string;
  email?: string;
  password?: string;
}

export default function MiIva() {
  const [usuario, setUsuario] = useState<Usuario | null>(() => getMe());
  const [autenticado, setAutenticado] = useState(() => getToken() !== null);

  // ── Login / Registro ──
  const [modo, setModo] = useState<Modo>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [erroresRegistro, setErroresRegistro] = useState<ErroresRegistro>({});
  const [authCargando, setAuthCargando] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
      setCierre(await getCierreActual());
    } catch (e) {
      setCierreError(manejarError(e, "No pudimos cargar tu cierre del mes."));
    } finally {
      setCierreCargando(false);
    }
  }, [manejarError]);

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
      } catch {
        if (!cancel) setEmpresas([]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [autenticado]);

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
      setEmpresaError("Ingresa el nombre de la empresa.");
      return;
    }
    if (!rutValido(nuevaRut)) {
      setEmpresaError("RUT inválido. Revisa el dígito verificador (formato 12345678-9).");
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
    if (!nombre.trim()) errs.nombre = "Ingresa tu nombre.";
    if (!email.trim()) {
      errs.email = "Ingresa tu correo.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = "Correo inválido.";
    }
    if (password.length < 8) errs.password = "Mínimo 8 caracteres.";
    return errs;
  };

  const onSubmitAuth = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAuthError(null);

    if (modo === "register") {
      const errs = validarRegistro();
      setErroresRegistro(errs);
      if (Object.keys(errs).length > 0) return;
    }

    setAuthCargando(true);
    try {
      const res =
        modo === "register"
          ? await register({
              email: email.trim(),
              password,
              nombre: nombre.trim(),
              ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
            })
          : await login(email.trim(), password);
      setUsuario(res.user);
      setPassword("");
      setAutenticado(true);
    } catch (e) {
      setAuthError(
        e instanceof ApiError && e.status !== 401
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
      setSiiError("RUT inválido. Revisa el dígito verificador (formato 12345678-9).");
      return;
    }
    if (claveSii.length < 4) {
      setSiiError("La clave tributaria debe tener al menos 4 caracteres.");
      return;
    }
    setSiiCargando(true);
    try {
      await guardarCredencialesSii(rutSii.trim(), claveSii);
      setClaveSii(""); // nunca la retenemos en pantalla
      setSiiOk("Clave guardada cifrada. Ya puedes sincronizar tus libros.");
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
    try {
      const r = await sincronizarSii(periodo);
      setSyncMsg(
        `Sincronizado: ${r.compras.n} compras y ${r.ventas.n} ventas importadas de ${r.periodo}.`
      );
      await cargarCierre();
    } catch (e) {
      setSiiError(manejarError(e, "No pudimos sincronizar con el SII."));
    } finally {
      setSyncCargando(false);
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

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    setAuthError(null);
    setErroresRegistro({});
  };

  const inputCls =
    "w-full rounded-xl border border-linea bg-tinta px-4 py-3 text-base text-papel placeholder:text-humo/60 outline-none focus:border-cancha/60 focus:ring-2 focus:ring-cancha/20 transition";
  const inputErrorCls = "border-multa/60 focus:border-multa/70 focus:ring-multa/20";
  const errorTxt = "mt-1.5 font-mono text-[11px] text-multa";

  return (
    <section id="mi-iva" className="border-b border-linea bg-panel/40">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">Mi IVA — área de clientes</p>
        <h2 className="headline text-3xl sm:text-4xl lg:text-5xl max-w-3xl">
          Tu IVA del mes, en un solo número
        </h2>

        <div className="mt-10 max-w-2xl">
          {!autenticado ? (
            /* ── Estado: sin sesión ─────────────────────────────────── */
            <div className="rounded-2xl border border-linea bg-tinta p-6 sm:p-8">
              <p className="text-sm text-humo leading-relaxed">
                {modo === "login"
                  ? "Clientes KickoffIVA: tu IVA real del mes, calculado con tus libros del SII."
                  : "Crea tu cuenta y empieza a ver tu IVA del mes calculado con tus libros."}
              </p>

              <form method="post" action="#mi-iva" onSubmit={onSubmitAuth} className="mt-6 space-y-4" noValidate={modo === "register"}>
                {modo === "register" && (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium">Tu nombre</span>
                      <input
                        type="text"
                        required
                        autoComplete="name"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej: Claudio Pérez"
                        className={`${inputCls} ${erroresRegistro.nombre ? inputErrorCls : ""}`}
                      />
                      {erroresRegistro.nombre ? (
                        <p role="alert" className={errorTxt}>{erroresRegistro.nombre}</p>
                      ) : (
                        <p className="mt-1.5 font-mono text-[11px] text-humo/70">
                          La cuenta es tuya como persona. Después agregas tu empresa (o varias, si manejas más de una).
                        </p>
                      )}
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium">
                        Tu WhatsApp <span className="font-normal text-humo">(opcional)</span>
                      </span>
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="+56 9 1234 5678"
                        className={inputCls}
                      />
                      <p className="mt-1.5 font-mono text-[11px] text-humo/70">
                        Para avisarte tu IVA del mes antes del día 12. Nunca te enviaremos publicidad.
                      </p>
                    </label>
                  </>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Correo</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@empresa.cl"
                    className={`${inputCls} ${erroresRegistro.email ? inputErrorCls : ""}`}
                  />
                  {erroresRegistro.email && modo === "register" && (
                    <p role="alert" className={errorTxt}>{erroresRegistro.email}</p>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Contraseña</span>
                  <input
                    type="password"
                    required
                    minLength={modo === "register" ? 8 : undefined}
                    autoComplete={modo === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputCls} ${erroresRegistro.password ? inputErrorCls : ""}`}
                  />
                  {erroresRegistro.password && modo === "register" && (
                    <p role="alert" className={errorTxt}>{erroresRegistro.password}</p>
                  )}
                </label>

                {authError && (
                  <p role="alert" className="font-mono text-xs text-multa">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authCargando}
                  className="inline-flex w-full justify-center rounded-full bg-cancha px-7 py-3.5 text-base font-semibold text-tinta hover:bg-cancha-dim transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {authCargando
                    ? modo === "register"
                      ? "Creando cuenta…"
                      : "Ingresando…"
                    : modo === "register"
                      ? "Crear cuenta →"
                      : "Ingresar a Mi IVA →"}
                </button>
              </form>

              <p className="mt-6 border-t border-linea pt-5 text-center font-mono text-[11px] text-humo">
                {modo === "login" ? (
                  <>
                    ¿Primera vez?{" "}
                    <button
                      type="button"
                      onClick={() => cambiarModo("register")}
                      className="text-cancha underline underline-offset-4 hover:text-cancha-dim"
                    >
                      Crea tu cuenta
                    </button>
                  </>
                ) : (
                  <>
                    ¿Ya tienes cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => cambiarModo("login")}
                      className="text-cancha underline underline-offset-4 hover:text-cancha-dim"
                    >
                      Inicia sesión
                    </button>
                  </>
                )}
              </p>
            </div>
          ) : empresas === null ? (
            /* ── Estado: cargando cuenta ──────────────────────────── */
            <div className="rounded-2xl border border-linea bg-tinta p-6 sm:p-8">
              <p className="font-mono text-sm text-humo animate-pulse">Cargando tu cuenta…</p>
            </div>
          ) : empresas.length === 0 || mostrarAgregar ? (
            /* ── Estado: agregar empresa (onboarding o adicional) ──── */
            <div className="rounded-2xl border border-linea bg-tinta p-6 sm:p-8">
              <p className="kicker">
                {empresas.length === 0 ? "Último paso: agrega tu empresa" : "Agregar otra empresa"}
              </p>
              <p className="mt-4 text-sm text-humo leading-relaxed">
                {empresas.length === 0
                  ? `Listo ${usuario?.nombre ?? ""}, tu cuenta está creada. Ahora agrega la empresa cuyo IVA quieres ver. Si manejas varias, podrás agregarlas todas aquí mismo.`
                  : "Agrega otra empresa a tu cuenta — podrás cambiar entre ellas cuando quieras."}
              </p>
              {calcGuardada && empresas.length === 0 && (
                <p className="mt-3 rounded-xl border border-cancha/30 bg-cancha/5 px-4 py-3 text-sm text-humo">
                  ✓ Retomamos tus datos de la calculadora: estimaste ventas de{" "}
                  <span className="font-mono text-cancha">{clp(calcGuardada.ventas)}</span> al mes.
                  Agrega tu empresa y sube tus libros reales para ver tu número exacto, no una estimación.
                </p>
              )}

              <form method="post" action="#mi-iva" onSubmit={(e) => void onCrearEmpresa(e)} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Nombre de la empresa</span>
                  <input
                    type="text"
                    required
                    autoComplete="organization"
                    value={nuevaNombre}
                    onChange={(e) => setNuevaNombre(e.target.value)}
                    placeholder="Empresa SpA"
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">RUT de la empresa</span>
                  <input
                    type="text"
                    required
                    value={nuevaRut}
                    onChange={(e) => setNuevaRut(e.target.value)}
                    placeholder="76.123.456-7"
                    className={inputCls}
                  />
                  <p className="mt-1.5 font-mono text-[11px] text-humo/70">
                    El RUT con que facturas (aparece en tu carpeta tributaria del SII). Si trabajas como persona natural con inicio de actividades, usa tu propio RUT.
                  </p>
                </label>

                {empresaError && (
                  <p role="alert" className="font-mono text-xs text-multa">{empresaError}</p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={empresaCargando}
                    className="rounded-full bg-cancha px-7 py-3 text-sm font-semibold text-tinta hover:bg-cancha-dim transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {empresaCargando ? "Agregando…" : "Agregar empresa →"}
                  </button>
                  {empresas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarAgregar(false);
                        setEmpresaError(null);
                      }}
                      className="rounded-full border border-linea px-7 py-3 text-sm text-humo hover:text-papel transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>
          ) : (
            /* ── Estado: con sesión y empresa ───────────────────────── */
            <div className="space-y-6">
              {/* Selector de empresa activa */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {empresas.length > 1 ? (
                  <label className="block">
                    <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.18em] text-humo">
                      Viendo empresa
                    </span>
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
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-humo">
                    {empresas[0]?.nombre} · {empresas[0]?.rut}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setMostrarAgregar(true)}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-cancha hover:text-cancha-dim transition-colors"
                >
                  ＋ Agregar empresa
                </button>
              </div>

              {/* Cierre del mes */}
              <div className="rounded-2xl border border-linea bg-tinta p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="kicker">Mi cierre del mes</p>
                  {cierre && estadoBadge(cierre.estado)}
                </div>

                {usuario && (
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-humo">
                    Cuenta de {usuario.nombre}
                  </p>
                )}

                {cierreCargando ? (
                  <p className="mt-6 font-mono text-sm text-humo animate-pulse">
                    Cargando tu cierre…
                  </p>
                ) : cierreError ? (
                  <div className="mt-6">
                    <p role="alert" className="font-mono text-xs text-multa">
                      {cierreError}
                    </p>
                    <button
                      type="button"
                      onClick={() => void cargarCierre()}
                      className="mt-3 rounded-full border border-linea px-5 py-2 text-sm text-papel hover:border-cancha/60 transition-colors"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : cierre ? (
                  sinDatos ? (
                    /* ── Cierre sin datos: estado vacío amigable ── */
                    <div className="mt-6 rounded-xl border border-dashed border-linea p-6 text-center">
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-humo">
                        Período {cierre.periodo}
                      </p>
                      <p className="mt-3 text-base text-papel">
                        Aún no tenemos tus libros de este mes — sincroniza o súbelos.
                      </p>
                      {calcGuardada ? (
                        <p className="mt-2 text-sm text-humo">
                          En la calculadora estimaste ventas de{" "}
                          <span className="font-mono text-cancha">{clp(calcGuardada.ventas)}</span> al
                          mes. Sube tus libros reales y te mostramos tu IVA exacto, no una estimación.
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-humo">
                          La sincronización automática llega con la conexión al SII.
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-humo">
                        Período {cierre.periodo}
                      </p>
                      <p className="mt-2 font-display font-bold text-4xl sm:text-6xl text-cancha leading-none">
                        {clp(cierre.ivaAPagar)}
                      </p>
                      <p className="mt-3 text-sm text-humo">IVA a pagar este mes</p>

                      <dl className="mt-7 space-y-3 border-t border-linea pt-6 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-humo">Débito fiscal (ventas)</dt>
                          <dd className="font-mono text-papel">{clp(cierre.debitoFiscal)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-humo">Crédito fiscal (compras)</dt>
                          <dd className="font-mono text-papel">{clp(cierre.creditoFiscal)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-humo">PPM (tasa {cierre.tasaPpm}%)</dt>
                          <dd className="font-mono text-papel">{clp(cierre.ppm)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-linea pt-3">
                          <dt className="font-medium text-papel">Total a pagar</dt>
                          <dd className="font-mono font-medium text-papel">
                            {clp(cierre.totalAPagar)}
                          </dd>
                        </div>
                      </dl>

                      {cierre.creditoArrastrable != null && (
                        <p className="mt-4 rounded-xl border border-cancha/30 bg-cancha/5 px-4 py-3 font-mono text-[11px] text-cancha">
                          Tienes {clp(cierre.creditoArrastrable)} de crédito arrastrable para los
                          próximos meses.
                        </p>
                      )}
                    </>
                  )
                ) : null}
              </div>

              {/* Descargar libros */}
              <div className="rounded-2xl border border-linea bg-tinta p-6 sm:p-8">
                <p className="kicker">Descargar libros</p>
                <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
                  <label className="block flex-1">
                    <span className="mb-1.5 block text-sm font-medium">Período</span>
                    <input
                      type="month"
                      value={periodo}
                      onChange={(e) => setPeriodo(e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={descargando !== null || !periodo || sinDatos}
                      onClick={() => void onDescargar("compra")}
                      className="rounded-full border border-cancha/50 px-6 py-3 text-sm font-semibold text-cancha hover:bg-cancha/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {descargando === "compra" ? "Descargando…" : "Libro de compras"}
                    </button>
                    <button
                      type="button"
                      disabled={descargando !== null || !periodo || sinDatos}
                      onClick={() => void onDescargar("venta")}
                      className="rounded-full border border-cancha/50 px-6 py-3 text-sm font-semibold text-cancha hover:bg-cancha/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {descargando === "venta" ? "Descargando…" : "Libro de ventas"}
                    </button>
                  </div>
                </div>
                {descargaError && (
                  <p role="alert" className="mt-4 font-mono text-xs text-multa">
                    {descargaError}
                  </p>
                )}
                <p className="mt-4 font-mono text-[11px] leading-relaxed text-humo/70">
                  También puedes importar tus libros directo desde el SII configurando la
                  conexión de abajo.
                </p>
              </div>

              {/* Conexión SII */}
              <div className="rounded-2xl border border-linea bg-tinta p-6 sm:p-8">
                <p className="kicker">Conexión con el SII (opcional)</p>

                {/* Opción A — Mandatario Digital (recomendada): sin entregar la clave */}
                <div className="mt-5 rounded-xl border border-cancha/40 bg-cancha/5 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold text-papel">
                      Opción A — Sin entregar tu clave: Mandatario Digital
                    </p>
                    <span className="inline-flex items-center rounded-full border border-cancha/40 bg-cancha/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-cancha">
                      Recomendada
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-cancha">
                    Tu clave tributaria jamás sale de tus manos.
                  </p>
                  <ol className="mt-3 space-y-2 text-sm leading-relaxed text-humo">
                    <li>
                      <span className="font-mono text-cancha">1.</span> Entra a sii.cl con tu clave
                      tributaria.
                    </li>
                    <li>
                      <span className="font-mono text-cancha">2.</span> En el menú "Mandatarios",
                      autoriza como mandatario al RUT que te enviaremos por WhatsApp.
                    </li>
                    <li>
                      <span className="font-mono text-cancha">3.</span> Nosotros operamos con nuestra
                      propia clave — y tú revocas la autorización cuando quieras, directo en el SII.
                    </li>
                  </ol>
                  <p className="mt-3 font-mono text-[11px] leading-relaxed text-humo/70">
                    Figura legal del art. 9° del Código Tributario: el mandatario entra al SII con su
                    propia clave, nunca con la tuya.
                  </p>
                  <a
                    href={WHATSAPP_MANDATARIO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block rounded-full bg-cancha px-6 py-3 text-sm font-semibold text-tinta hover:bg-cancha/90 transition-colors"
                  >
                    Conectar con Mandatario Digital por WhatsApp →
                  </a>
                </div>

                {/* Opción B — Automatización total: clave cifrada */}
                <div className="mt-8">
                  <p className="text-sm font-semibold text-papel">
                    Opción B — Automatización total: clave cifrada
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-humo">
                    Si prefieres que el sistema baje tus libros solo cada mes, sin que nadie
                    intervenga, guarda tu clave cifrada:
                  </p>
                </div>

                {/* Mensaje de seguridad: siempre visible, antes de pedir la clave */}
                <div className="mt-4 rounded-xl border border-cancha/30 bg-cancha/5 px-4 py-3">
                  <p className="text-sm font-semibold text-papel">
                    🔒 Tu clave tributaria queda cifrada y nadie puede leerla
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-humo">
                    Se guarda cifrada con el mismo estándar que usan los bancos (AES-256).
                    Ni el equipo de KickoffIVA ni nadie puede verla, y jamás se muestra en
                    pantalla. Solo se usa para descargar tus libros de compra y venta desde
                    el SII, y puedes reemplazarla cuando quieras guardando una nueva.
                  </p>
                </div>

                {empresa?.siiConfigurado ? (
                  <div className="mt-5">
                    <p className="text-sm text-cancha">
                      ✓ Clave tributaria configurada (cifrada). El SII nunca la muestra de vuelta.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        disabled={syncCargando || !periodo}
                        onClick={() => void onSincronizar()}
                        className="rounded-full bg-cancha px-6 py-3 text-sm font-semibold text-tinta hover:bg-cancha/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {syncCargando ? "Sincronizando con el SII…" : `Sincronizar ${periodo} desde el SII`}
                      </button>
                    </div>
                    <p className="mt-3 font-mono text-[11px] text-humo/70">
                      ¿Cambiaste tu clave en el SII? Guárdala de nuevo abajo y se reemplaza cifrada.
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-humo">
                    Con esta conexión tus libros se importan solos cada mes, sin que subas nada a mano.
                  </p>
                )}

                <form method="post" action="#mi-iva" onSubmit={(e) => void onGuardarSii(e)} className="mt-5 space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <label className="block flex-1">
                      <span className="mb-1.5 block text-sm font-medium">RUT con que entras al SII</span>
                      <input
                        type="text"
                        required
                        value={rutSii}
                        onChange={(e) => setRutSii(e.target.value)}
                        placeholder="12.345.678-5"
                        className={inputCls}
                      />
                      <p className="mt-1.5 font-mono text-[11px] text-humo/70">
                        El mismo RUT que usas para entrar a sii.cl — puede ser tu RUT personal o el de la empresa, según cómo ingreses al portal.
                      </p>
                    </label>
                    <label className="block flex-1">
                      <span className="mb-1.5 block text-sm font-medium">Clave tributaria</span>
                      <input
                        type="password"
                        required
                        autoComplete="off"
                        value={claveSii}
                        onChange={(e) => setClaveSii(e.target.value)}
                        placeholder="••••••••"
                        className={inputCls}
                      />
                      <p className="mt-1.5 font-mono text-[11px] text-humo/70">
                        La misma clave con que entras a sii.cl. Viaja cifrada y se guarda cifrada.
                      </p>
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={siiCargando}
                    className="rounded-full border border-cancha/50 px-6 py-3 text-sm font-semibold text-cancha hover:bg-cancha/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {siiCargando ? "Guardando cifrada…" : empresa?.siiConfigurado ? "Reemplazar clave (se cifra)" : "Guardar clave cifrada"}
                  </button>
                </form>

                {siiError && (
                  <p role="alert" className="mt-4 font-mono text-xs text-multa">{siiError}</p>
                )}
                {siiOk && (
                  <p role="status" className="mt-4 font-mono text-xs text-cancha">{siiOk}</p>
                )}
                {syncMsg && (
                  <p role="status" className="mt-2 font-mono text-xs text-cancha">{syncMsg}</p>
                )}
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-humo hover:text-papel transition-colors"
              >
                Cerrar sesión →
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
