// ─── Cliente API KickoffIVA ─────────────────────────────────────────────────
// Contrato fijo con el backend nuevo (REST + JSON + Bearer JWT).
// Base URL: https://api.kickoffiva.cl — los endpoints viven bajo /api/...
// TODOS los llamados HTTP del sitio pasan por este módulo.

import { API_BASE_URL } from "../config";

const TOKEN_KEY = "kickoffiva_token";
const USER_KEY = "kickoffiva_user";
const COMPANY_KEY = "kickoffiva_company";

// ─── Tipos (contrato fijo) ──────────────────────────────────────────────────

export interface Usuario {
  id: string;
  email: string;
  /** Nombre de la persona dueña de la cuenta. */
  nombre: string;
  nombreEmpresa: string | null;
  rutEmpresa: string | null;
}

export interface AuthResponse {
  token: string;
  user: Usuario;
}

export interface RegisterInput {
  email: string;
  password: string;
  /** Nombre de la persona (la cuenta es de la persona). */
  nombre: string;
  /** WhatsApp de contacto para las alertas mensuales (opcional). */
  telefono?: string;
  /** Empresa inicial opcional (también se puede agregar después). */
  nombreEmpresa?: string;
  rutEmpresa?: string;
}

export interface EmpresaResumen {
  id: string;
  nombre: string;
  rut: string;
  siiConfigurado: boolean;
}

export type EstadoCierre = "listo" | "pendiente" | "sin_datos";

export interface CierreActual {
  /** Período tributario, formato "YYYY-MM" (ej. "2026-08"). */
  periodo: string;
  debitoFiscal: number;
  creditoFiscal: number;
  ivaAPagar: number;
  ppm: number;
  tasaPpm: number;
  totalAPagar: number;
  estado: EstadoCierre;
  ventasNetas: number;
  comprasNetas: number;
  creditoArrastrable?: number;
}

export interface Empresa {
  nombre: string;
  rut: string;
  tasaPpm: number;
  siiConfigurado: boolean;
}

export interface ResultadoSync {
  periodo: string;
  compras: { n: number; errores?: number };
  ventas: { n: number; errores?: number };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ─── Token + sesión ─────────────────────────────────────────────────────────

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function setStoredUser(user: Usuario): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage no disponible */
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(COMPANY_KEY);
}

/** Usuario de la sesión actual (cacheado al login/register; el contrato no expone /me). */
export function getMe(): Usuario | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    return null;
  }
}

// ─── Empresa activa (multiempresa) ──────────────────────────────────────────

export function getActiveCompanyId(): string | null {
  try {
    return localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

export function setActiveCompanyId(id: string | null): void {
  try {
    if (id) localStorage.setItem(COMPANY_KEY, id);
    else localStorage.removeItem(COMPANY_KEY);
  } catch {
    /* storage no disponible */
  }
}

// ─── Fetch base ─────────────────────────────────────────────────────────────

interface FetchOpts {
  /** false = llamada pública (login/register): no envía token ni trata 401 como sesión expirada. */
  auth?: boolean;
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  opts: FetchOpts = {}
): Promise<Response> {
  const usaSesion = opts.auth !== false;
  const token = usaSesion ? getToken() : null;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = usaSesion ? getActiveCompanyId() : null;
  if (companyId) headers["x-company-id"] = companyId;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  // 401 con token enviado → sesión expirada o inválida: limpiar y avisar.
  // (Un 401 de login/register es "credenciales inválidas", no expiración.)
  if (res.status === 401 && token) {
    clearToken();
    throw new ApiError("Sesión expirada. Vuelve a ingresar.", 401);
  }
  return res;
}

/** Extrae el mensaje de error del contrato: {error:"message"}. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    /* cuerpo no-JSON */
  }
  return `Error del servidor (${res.status})`;
}

async function apiJson<T>(
  path: string,
  init: RequestInit = {},
  opts: FetchOpts = {}
): Promise<T> {
  const res = await apiFetch(path, init, opts);
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res.json() as Promise<T>;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function register(input: RegisterInput): Promise<AuthResponse> {
  // POST /api/auth/register → 201 {token, user} | 409 email existe | 400 validación
  const data = await apiJson<AuthResponse>(
    "/api/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    { auth: false }
  );
  clearToken(); // cuenta nueva: descarta cualquier empresa activa de una sesión anterior
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  // POST /api/auth/login → {token, user} | 401 credenciales inválidas
  const data = await apiJson<AuthResponse>(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    { auth: false }
  );
  clearToken(); // sesión nueva: descarta la empresa activa de la sesión anterior
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

export function logout(): void {
  clearToken();
}

// ─── Cierre mensual ─────────────────────────────────────────────────────────

export async function getCierreActual(): Promise<CierreActual> {
  // GET /api/cierre/actual (Bearer)
  return apiJson<CierreActual>("/api/cierre/actual");
}

// ─── Descarga de libros (CSV) ───────────────────────────────────────────────

export type TipoLibro = "compra" | "venta";

/** Nombre de archivo desde Content-Disposition, con fallback según contrato (CSV). */
function filenameFrom(res: Response, fallback: string): string {
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : fallback;
}

export async function descargarLibro(tipo: TipoLibro, periodo: string): Promise<void> {
  // GET /api/libros/compra|venta?periodo=YYYY-MM (Bearer) → CSV (blob)
  const res = await apiFetch(`/api/libros/${tipo}?periodo=${encodeURIComponent(periodo)}`);
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);

  const blob = await res.blob();
  const filename = filenameFrom(res, `libro-${tipo}-${periodo}.csv`);

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}


// ─── Empresa y conexión SII ─────────────────────────────────────────────────

export async function getEmpresa(): Promise<Empresa | null> {
  // GET /api/empresa (Bearer) → { nombre, rut, tasaPpm, siiConfigurado }
  //                            → 404 { error: "Sin empresa" } si aún no hay empresa
  const res = await apiFetch("/api/empresa");
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  const data = (await res.json()) as Empresa;
  return { ...data, tasaPpm: Number(data.tasaPpm) || 0 };
}

export async function guardarCredencialesSii(
  rutSii: string,
  claveSii: string
): Promise<{ ok: boolean; siiConfigurado: boolean }> {
  // PUT /api/empresa/sii (Bearer) — la clave viaja por HTTPS y se guarda
  // cifrada con AES-256-GCM; nunca se devuelve ni se puede leer después.
  return apiJson("/api/empresa/sii", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rutSii, claveSii }),
  });
}

export async function sincronizarSii(periodo: string): Promise<ResultadoSync> {
  // POST /api/sii/sincronizar (Bearer) — periodo en formato "YYYY-MM",
  // la API lo convierte a AAAAMM que es lo que espera el portal del SII.
  return apiJson<ResultadoSync>("/api/sii/sincronizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periodo: periodo.replace("-", "") }),
  });
}


// ─── Multiempresa ───────────────────────────────────────────────────────────

export async function getEmpresas(): Promise<EmpresaResumen[]> {
  // GET /api/empresas (Bearer) → { empresas: [...] }
  const data = await apiJson<{ empresas: EmpresaResumen[] }>("/api/empresas");
  return data.empresas;
}

export async function crearEmpresa(nombre: string, rut: string): Promise<EmpresaResumen> {
  // POST /api/empresas (Bearer) → 201 { id, nombre, rut, siiConfigurado }
  return apiJson<EmpresaResumen>("/api/empresas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, rut }),
  });
}
