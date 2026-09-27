import { renderToString } from "react-dom/server";
import App from "./App";

/**
 * Entrada SSR para prerendering (SSG) de la home.
 * `scripts/prerender.mjs` la compila con `vite build --ssr` y ejecuta render()
 * en Node para inyectar el HTML completo en dist/index.html.
 */
export function render(): string {
  return renderToString(<App />);
}
