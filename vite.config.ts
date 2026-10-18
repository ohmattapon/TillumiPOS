import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The API the dev server proxies to. The browser tests point it at their own throwaway API.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000'

const server = (path: string) => fileURLToPath(new URL(`./server/src/${path}`, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env for the whole repo, at the root. Only VITE_-prefixed names reach the browser.
  envDir: '.',
  resolve: {
    // The web shares the server's pure domain code and its Eden types. These were the exports of the old @pos/api
    // package; keep them in step with "paths" in tsconfig.app.json.
    alias: [
      { find: '@pos/api/types', replacement: server('types.ts') },
      { find: '@pos/api/pricing', replacement: server('domains/pricing.ts') },
      { find: '@pos/api/shop-settings', replacement: server('domains/shop-settings.domain.ts') },
      { find: '@pos/api/modifiers', replacement: server('domains/modifier.domain.ts') },
      { find: '@pos/api/promotions', replacement: server('domains/promotion.domain.ts') },
      { find: '@pos/api/dining-table', replacement: server('domains/dining-table.domain.ts') },
      { find: '@pos/api/pin', replacement: server('domains/pin.vo.ts') },
      { find: '@pos/api/permissions', replacement: server('permissions.ts') },
      { find: /^@pos\/api$/, replacement: server('app.ts') },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  server: {
    // Listen on the LAN so tablets and other tills can open the app.
    host: true,
    // Same-origin proxy keeps the session cookie first-party, so no CORS setup is needed.
    proxy: { '/api': apiTarget, '/openapi': apiTarget, '/media': apiTarget },
  },
})
