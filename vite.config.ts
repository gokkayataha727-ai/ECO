import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

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
