import { treaty } from '@elysiajs/eden'
import { container } from 'tsyringe'
import { app, type App } from '../src/app'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { client as sqlClient, db } from '../src/libs/db'
import { toProductResponse } from '../src/modules/products/adapters/controllers/product.presenter'
import type {
  CreateProductBody as CreateProduct,
  ProductResponse as Product,
} from '../src/modules/products/adapters/controllers/schemas/product.schema'
import { CreateProductUseCase } from '../src/modules/products/applications/usecases/create-product.usecase'
import { GetProductUseCase } from '../src/modules/products/applications/usecases/get-product.usecase'
import type { IMediaStorage } from '../src/modules/shared/ports/media-storage.port'
import { TOKENS } from '../src/modules/tokens'
import { ReceiveStockUseCase } from '../src/modules/inventory/applications/usecases/receive-stock.usecase'
import type { UserResponse as User } from '../src/modules/users/adapters/controllers/schemas/user.schema'
import { CreateUserUseCase } from '../src/modules/users/applications/usecases/create-user.usecase'
import { assertConnectedTestDatabase, ensureTestDatabase } from './database'
import { fakeMedia } from './media-server'

export { fakeMedia }

// Integration tests reach the database through this module, so it is prepared here
// rather than in the preload script, which unit tests also load.
await ensureTestDatabase()
await assertConnectedTestDatabase(sqlClient)
await migrate(db, { migrationsFolder: './drizzle' })

app.listen(0)
const origin = `http://localhost:${app.server!.port}`

/** Typed client for the API, optionally carrying a session cookie. */
export const client = (cookie?: string) => {
  const api = treaty<App>(origin, cookie ? { headers: { cookie } } : {}).api
  // Eden's dynamic route proxy exposes a `then` property. Hide it so returning
  // this client from an async helper does not trigger Promise assimilation.
  return new Proxy(api, { get: (target, key) => key === 'then' ? undefined : Reflect.get(target, key) })
}

export type Api = ReturnType<typeof client>

export interface Session {
  api: Api
  user: User
}

export const PASSWORD = 'test-password-1'

/** Logs in over HTTP and returns a client holding the session cookie. */
export async function login(username: string, password = PASSWORD): Promise<Api> {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) throw new Error(`Login as "${username}" failed with ${response.status}`)
  return client(response.headers.getSetCookie()[0]!.split(';')[0])
}

/** Creates a user with the given role and logs them in. */
export async function signIn(role: User['role'] = 'owner', username: string = role): Promise<Session> {
  const created = await container
    .resolve(CreateUserUseCase)
    .execute({ username, password: PASSWORD, displayName: username, role })
  return { api: await login(username), user: created.toSnapshot() }
}

let productCounter = 0

/** Creates a product (price 10.00, cost 6.00 unless overridden) and optionally receives opening stock. */
export async function seedProduct(
  by: Session,
  { stock = 0, ...input }: Partial<CreateProduct> & { stock?: number } = {},
): Promise<Product> {
  const n = ++productCounter
  const product = await container.resolve(CreateProductUseCase).execute({
    sku: `SKU-${n}`,
    name: `Product ${n}`,
    priceSatang: 1000,
    costSatang: 600,
    ...input,
  })
  if (stock > 0) await container.resolve(ReceiveStockUseCase).execute({ productId: product.id, quantity: stock }, by.user.id)
  return toProductResponse(
    await container.resolve(GetProductUseCase).execute(product.id),
    container.resolve<IMediaStorage>(TOKENS.MediaStorage),
  )
}

interface EdenResult<T> {
  data: T | null
  error: { status: unknown; value: unknown } | null
}

/** Unwraps a response that is expected to succeed, failing the test with the server's error otherwise. */
export function ok<T>(result: EdenResult<T>): T {
  if (result.error) throw new Error(`Expected success, got ${result.error.status}: ${JSON.stringify(result.error.value)}`)
  return result.data as T
}

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A real (1x1) PNG, so it passes the server's content sniffing. */
export const pngFile = (name = 'image.png') =>
  new File([Buffer.from(ONE_PIXEL_PNG, 'base64')], name, { type: 'image/png' })

/** Empties every table and the fake media store. Call in beforeEach. */
export async function resetDatabase(connection = sqlClient): Promise<void> {
  await assertConnectedTestDatabase(connection)
  const tables: { tablename: string }[] = await connection`select tablename from pg_tables where schemaname = 'public'`
  const names = tables.map((table) => `"${table.tablename}"`).join(', ')
  await connection.unsafe(`truncate table ${names} restart identity cascade`)
  fakeMedia.reset()
}
