import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    build: { minify: true },
    plugins: [
      react(),
      tailwindcss(),
      {
        // The dev server injects an inline React-refresh script; the shipped build stays strict.
        name: 'dev-csp',
        transformIndexHtml: (html, ctx) =>
          ctx.server ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") : html
      }
    ]
  }
})
