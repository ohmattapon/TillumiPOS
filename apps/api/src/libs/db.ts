import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { env } from './env'
import * as schema from '../infrastructure/database/schema'

export const client = new SQL(env.databaseUrl)

export const db = drizzle({ client, schema, casing: 'snake_case' })

export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Accepted by services that can run either standalone or inside a caller's transaction. */
export type Executor = Db | Tx
