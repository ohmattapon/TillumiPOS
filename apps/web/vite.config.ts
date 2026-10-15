import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The API the dev server proxies to. The browser tests point it at their own throwaway API.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env for the whole repo, at the root. Only VITE_-prefixed names reach the browser.
  envDir: '../..',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    // Listen on the LAN so tablets and other tills can open the app.
    host: true,
    // Same-origin proxy keeps the session cookie first-party, so no CORS setup is needed.
    proxy: { '/api': apiTarget, '/openapi': apiTarget, '/media': apiTarget },
  },
})
