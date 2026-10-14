import { app } from './app'
import { env } from './libs/env'
import { announceSetupCode } from './modules/setup/announce-setup-code'

app.listen(env.port)

console.log(`POS API  http://localhost:${env.port}/api/v1`)
console.log(`API docs http://localhost:${env.port}/openapi`)

await announceSetupCode()
