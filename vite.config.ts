import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleAdminApi } from './src/server/adminApi.ts'

const adminApiPlugin = (): Plugin => ({
  name: 'admin-api-middleware',
  configureServer: s => { s.middlewares.use(handleAdminApi) },
  configurePreviewServer: s => { s.middlewares.use(handleAdminApi) },
})

export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: ['rice-raises-even-acknowledged.trycloudflare.com'],
  },
  plugins: [react(), tailwindcss(), adminApiPlugin()],
})