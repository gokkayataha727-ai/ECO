import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'

const PROD_CSP_CONTENT = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: http://localhost:8000",
  "connect-src 'self' http://localhost:8000",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function injectProductionCspPlugin(): Plugin {
  return {
    name: 'inject-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: PROD_CSP_CONTENT,
            },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), injectProductionCspPlugin()],

  // Use relative paths so Electron can load files via file:// protocol
  base: './',

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },

  // Clear the console on dev start
  clearScreen: false,

  // Multi-page build for customer display window
  build: {
    // Electron ships its own Chromium
    target: 'chrome120',
    // Don't produce source maps for production
    sourcemap: false,
    // Optimized chunk splitting
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'customer-display': resolve(import.meta.dirname, 'customer-display.html'),
      },
    },
    // Keep build size small
    chunkSizeWarningLimit: 500,
  },
})
