import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const worker = setupWorker(...handlers)

export async function startDemoWorker(): Promise<void> {
  // Vite always sets MODE (--mode flag); no env file needed, so nothing secret-adjacent is committed.
  if (import.meta.env.MODE !== 'demo-static') return
  await worker.start({ onUnhandledRequest: 'bypass' })
}
