import { app } from './app'
import { env } from './libs/env'
import { client } from './libs/db'
import { container } from 'tsyringe'
import { readCacheToken, type IReadCache } from './modules/shared/ports/read-cache.port'
import { announceSetupCode } from './modules/setup/announce-setup-code'

app.listen(env.port)

console.log(`POS API  http://localhost:${env.port}/api/v1`)
console.log(`API docs http://localhost:${env.port}/openapi`)

let stopping = false
const shutdown = async () => {
  if (stopping) return
  stopping = true
  try {
    await app.stop()
    container.resolve<IReadCache>(readCacheToken).close()
    await client.close({ timeout: 5 })
    process.exit(0)
  } catch {
    console.error('API shutdown failed')
    process.exit(1)
  }
}
process.once('SIGTERM', () => { void shutdown() })
process.once('SIGINT', () => { void shutdown() })

await announceSetupCode()
