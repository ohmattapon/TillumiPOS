import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// The API the dev server proxies to. The browser tests point it at their own throwaway API.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000'

const server = (path: string) => fileURLToPath(new URL(`./server/src/${path}`, import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const demoStatic = mode === 'demo-static'
  // The showcase has no server and MSW answers every fetch in the browser, so in this
  // mode nothing is proxied anywhere (a stray proxy target would either leak into a
  // developer API on :3000 or answer 502s). The one request MSW cannot catch is the
  // customer display's EventSource (not fetch), which gets a quiet stub stream below.
  const target = demoStatic ? undefined : apiTarget
  const plugins: Plugin[] = [react(), tailwindcss()].flat()
  if (demoStatic) plugins.push(demoCustomerStream())
  return {
    plugins,
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
      { find: '@pos/api/cafe-menu', replacement: server('domains/cafe-menu.domain.ts') },
      { find: '@pos/api/promotions', replacement: server('domains/promotion.domain.ts') },
      { find: '@pos/api/dining-table', replacement: server('domains/dining-table.domain.ts') },
      { find: '@pos/api/pin', replacement: server('domains/pin.vo.ts') },
      { find: '@pos/api/promptpay-qr', replacement: server('domains/promptpay-qr.domain.ts') },
      { find: '@pos/api/permissions', replacement: server('permissions.ts') },
      { find: /^@pos\/api$/, replacement: server('app.ts') },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  server: {
    // Listen on the LAN so tablets and other tills can open the app.
    host: true,
    // Same-origin proxy keeps the session cookie first-party, so no CORS setup is needed.
    ...(target ? { proxy: { '/api': target, '/openapi': target, '/media': target } } : {}),
  },
  }
})

const DEMO_STREAM_PATH = '/api/v1/customer-display/stream'

/** The one event the demo stream sends: a pairing code that never gets used (sales travel over the browser channel). */
function demoWaitingEvent(expiresAt: string): string {
  return `event: waiting\ndata: ${JSON.stringify({ code: '123456', expiresAt })}\n\n`
}

/**
 * Demo-static only: the customer display's stream. MSW cannot see EventSource, so the dev
 * server answers it directly with a quiet open stream that keeps showing the demo pairing
 * code. Sales still travel over the browser channel; pairing accepts any code.
 *
 * A built showcase has no dev server either, so the build emits the same event as a static
 * file plus a `_headers` rule that makes it an event stream. Without it a static host answers
 * the path with index.html, the browser closes the EventSource for good and the display asks
 * for a new session in a tight loop. The file ends at once, so the browser reconnects every
 * few seconds, which is as quiet as the dev stream needs to be.
 */
function demoCustomerStream(): Plugin {
  return {
    name: 'demo-static-customer-stream',
    configureServer(server) {
      server.middlewares.use(DEMO_STREAM_PATH, (_req, res) => {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
        res.write(demoWaitingEvent(expiresAt))
        const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
        res.on('close', () => clearInterval(ping))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: DEMO_STREAM_PATH.slice(1), source: demoWaitingEvent('2099-01-01T00:00:00.000Z') })
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: `${DEMO_STREAM_PATH}\n  Content-Type: text/event-stream\n  Cache-Control: no-cache\n`,
      })
    },
  }
}
