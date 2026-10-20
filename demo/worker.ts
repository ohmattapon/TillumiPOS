import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const worker = setupWorker(...handlers)

// Fixed on-screen marker so a showcase screenshot can never pass as real data.
function showDemoRibbon(): void {
  const ribbon = document.createElement('div')
  ribbon.textContent = 'โหมดโชว์ — ข้อมูลไม่จริง'
  ribbon.setAttribute(
    'style',
    'position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
      'padding:4px 0;text-align:center;font-size:13px;color:#fff;' +
      'background:#b45309;pointer-events:none;',
  )
  document.body.appendChild(ribbon)
}

export async function startDemoWorker(): Promise<void> {
  // Vite always sets MODE (--mode flag); no env file needed, so nothing secret-adjacent is committed.
  if (import.meta.env.MODE !== 'demo-static') return
  await worker.start({ onUnhandledRequest: 'bypass' })
  showDemoRibbon()
}
