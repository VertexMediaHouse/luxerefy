import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: ['rice-raises-even-acknowledged.trycloudflare.com'],
  },
  plugins: [react(), tailwindcss()],
})