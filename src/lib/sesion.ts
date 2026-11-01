import { useEffect, useState } from "react";

/** Aviso interno cuando se inicia o cierra sesión (lo emiten setToken/clearToken). */
export const EVENTO_SESION = "kickoffiva-sesion";
/** Pide a Mi IVA mostrar "Ya tengo cuenta", "Soy nuevo" o recuperar contraseña (detail: "login" | "register" | "recuperar"). */
export const EVENTO_MODO = "kickoffiva-modo";

export function tieneSesion(): boolean {
  try {
    return localStorage.getItem("kickoffiva_token") !== null;
  } catch {
    return false;
  }
}

/** true si hay sesión; se actualiza al entrar o salir, también desde otra pestaña. */
export function useSesion(): boolean {
  const [activa, setActiva] = useState(false);
  useEffect(() => {
    const leer = () => setActiva(tieneSesion());
    leer();
    window.addEventListener(EVENTO_SESION, leer);
    window.addEventListener("storage", leer);
    return () => {
      window.removeEventListener(EVENTO_SESION, leer);
      window.removeEventListener("storage", leer);
    };
  }, []);
  return activa;
}

/** Lleva a la sección de entrada en el modo pedido ("recuperar" abre "¿Olvidaste tu contraseña?"). */
export function irAEntrar(modo: "login" | "register" | "recuperar") {
  window.dispatchEvent(new CustomEvent(EVENTO_MODO, { detail: modo }));
}
