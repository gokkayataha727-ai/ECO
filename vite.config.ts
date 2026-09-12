import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Allow Tauri dev server to be accessed
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },

  // Clear the console on dev start
  clearScreen: false,

  // Env variables prefixed with TAURI_ will be exposed
  envPrefix: ['VITE_', 'TAURI_'],

  // Multi-page build for customer display window
  build: {
    // Tauri targets ES2021
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    // Don't produce source maps for production (smaller build)
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Optimized chunk splitting
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'customer-display': resolve(__dirname, 'customer-display.html'),
      },
    },
    // Keep build size small
    chunkSizeWarningLimit: 500,
  },
})
