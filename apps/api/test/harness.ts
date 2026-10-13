import { treaty } from '@elysiajs/eden'
import { app, type App } from '../src/app'
import { client as sqlClient } from '../src/libs/db'
import type { CreateProduct, Product } from '../src/modules/catalog/products/model'
import { ProductsService } from '../src/modules/catalog/products/service'
import { InventoryService } from '../src/modules/inventory/service'
import type { User } from '../src/modules/users/model'
import { UsersService } from '../src/modules/users/service'
import { assertConnectedTestDatabase } from './database'
import { fakeMedia } from './media-server'

export { fakeMedia }

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
  const user = await UsersService.create({ username, password: PASSWORD, displayName: username, role })
  return { api: await login(username), user }
}

let productCounter = 0

/** Creates a product (price 10.00, cost 6.00 unless overridden) and optionally receives opening stock. */
export async function seedProduct(
  by: Session,
  { stock = 0, ...input }: Partial<CreateProduct> & { stock?: number } = {},
): Promise<Product> {
  const n = ++productCounter
  const product = await ProductsService.create({
    sku: `SKU-${n}`,
    name: `Product ${n}`,
    priceSatang: 1000,
    costSatang: 600,
    ...input,
  })
  if (stock > 0) await InventoryService.receive({ productId: product.id, quantity: stock }, by.user.id)
  return ProductsService.getById(product.id)
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
