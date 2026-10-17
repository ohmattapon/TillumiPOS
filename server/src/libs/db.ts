import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { env } from './env'
import * as schema from '../infrastructure/database/schema'

export const client = new SQL({
  url: env.databaseUrl,
  // Cloud Postgres (or a NAT on the way) drops idle connections without telling us,
  // so the first request after a quiet spell failed with "Connection closed".
  // Closing idle connections ourselves first means that request opens a fresh one.
  idleTimeout: 20,
  maxLifetime: 60 * 30,
})

export const db = drizzle({ client, schema, casing: 'snake_case' })

export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Accepted by services that can run either standalone or inside a caller's transaction. */
export type Executor = Db | Tx
