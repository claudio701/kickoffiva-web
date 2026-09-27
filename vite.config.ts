import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/',
  // inspectAttr() inyecta atributos code-path de desarrollo — solo en `vite dev`,
  // nunca en el build de producción (eran 16 KB de DOM innecesario y rutas internas).
  plugins: command === 'serve' ? [inspectAttr(), react()] : [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
