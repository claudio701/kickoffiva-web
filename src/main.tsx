import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// Si el HTML ya viene prerenderizado (SSG en build, ver scripts/prerender.mjs),
// hidratamos sobre el markup existente; si no, montaje SPA normal.
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, app)
} else {
  createRoot(rootEl).render(app)
}

// Service worker solo en producción (permite CSP estricta: script-src 'self')
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
