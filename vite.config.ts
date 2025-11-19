import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wasm()],
  worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
    optimizeDeps: {
        exclude: ['@fedimint/core-web'],
    },
})
