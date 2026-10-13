import { app } from './app'
import { env } from './config/env'

app.listen(env.port)

console.log(`POS API  http://localhost:${env.port}/api`)
console.log(`API docs http://localhost:${env.port}/openapi`)
