import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = process.env.BACKEND_URL ?? 'http://localhost:8081'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    // Туннели (cloudflared/ngrok) приходят с чужим Host.
    allowedHosts: true,
    proxy: {
      '/api': backend,
      '/img': backend,
      '/dev': backend,
      '/webhooks': backend,
    },
  },
})
