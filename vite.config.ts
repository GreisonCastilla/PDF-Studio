import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Needed for hot reload when the source lives on a bind-mounted volume (Docker + WSL2).
    watch: { usePolling: true, interval: 300 },
  },
  preview: { host: '0.0.0.0', port: 4173 },
  optimizeDeps: { include: ['pdfjs-dist'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
})
