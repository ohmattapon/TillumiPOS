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
import { repositoryReadCacheToken, type IRepositoryReadCache } from '../src/modules/shared/ports/repository-read-cache.port'
import { TOKENS } from '../src/modules/tokens'
import { ReceiveStockUseCase } from '../src/modules/inventory/applications/usecases/receive-stock.usecase'
import type { UserResponse as User } from '../src/modules/users/adapters/controllers/schemas/user.schema'
import { CreateBranchUseCase } from '../src/modules/branches/applications/usecases/create-branch.usecase'
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

/** Root of the versioned API, for the few tests that need raw HTTP rather than the typed client. */
export const baseUrl = `${origin}/api/v1`

/** The branch every test starts with: the schema's own default, recreated after each reset. */
export const MAIN_BRANCH_ID = 1

/** Typed client for the API, optionally carrying a session cookie and the branch to work in. */
export const client = (cookie?: string, branchId?: number) => {
  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = cookie
  if (branchId !== undefined) headers['x-branch-id'] = String(branchId)
  const api = treaty<App>(origin, { headers }).api.v1
  // Eden's dynamic route proxy exposes a `then` property. Hide it so returning
  // this client from an async helper does not trigger Promise assimilation.
  return new Proxy(api, { get: (target, key) => key === 'then' ? undefined : Reflect.get(target, key) })
}

/** Typed client for the in-development v2 contract. */
export const clientV2 = (cookie?: string, branchId?: number) => {
  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = cookie
  if (branchId !== undefined) headers['x-branch-id'] = String(branchId)
  const api = treaty<App>(origin, { headers }).api.v2
  return new Proxy(api, { get: (target, key) => key === 'then' ? undefined : Reflect.get(target, key) })
}

export type Api = ReturnType<typeof client>
export type ApiV2 = ReturnType<typeof clientV2>

export interface Session {
  api: Api
  apiV2: ApiV2
  user: User
}

export const PASSWORD = 'test-password-1'

/** Logs in over HTTP and returns a client holding the session cookie. */
export async function login(username: string, password = PASSWORD, branchId?: number): Promise<Api> {
  return client(await loginCookie(username, password), branchId)
}

async function loginCookie(username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) throw new Error(`Login as "${username}" failed with ${response.status}`)
  return response.headers.getSetCookie()[0]!.split(';')[0]!
}

/**
 * Creates a user with the given role in a branch and logs them in. The session works in the user's own
 * branch unless `workingBranchId` says otherwise (only an owner may).
 */
export async function signIn(
  role: User['role'] = 'owner',
  username: string = role,
  { branchId = MAIN_BRANCH_ID, workingBranchId }: { branchId?: number; workingBranchId?: number } = {},
): Promise<Session> {
  const created = await container
    .resolve(CreateUserUseCase)
    .execute({ username, password: PASSWORD, displayName: username, role, branchId }, branchId)
  const cookie = await loginCookie(username, PASSWORD)
  return { api: client(cookie, workingBranchId), apiV2: clientV2(cookie, workingBranchId), user: created.toSnapshot() }
}

/** Creates another branch, e.g. to check that stock and receipts stay apart. */
export async function seedBranch(code = 'BKK', name = 'สาขากรุงเทพ') {
  return (await container.resolve(CreateBranchUseCase).execute({ code, name })).toSnapshot()
}

let productCounter = 0

/** Creates a product (price 10.00, cost 6.00 unless overridden) and optionally receives opening stock. */
export async function seedProduct(
  by: Session,
  { stock = 0, branchId = MAIN_BRANCH_ID, ...input }: Partial<CreateProduct> & { stock?: number; branchId?: number } = {},
): Promise<Product> {
  const n = ++productCounter
  const product = await container.resolve(CreateProductUseCase).execute({
    sku: `SKU-${n}`,
    name: `Product ${n}`,
    priceSatang: 1000,
    costSatang: 600,
    ...input,
  }, branchId)
  if (stock > 0)
    await container.resolve(ReceiveStockUseCase).execute({ productId: product.id, quantity: stock }, by.user.id, branchId)
  return toProductResponse(
    await container.resolve(GetProductUseCase).execute(product.id, branchId),
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
  await connection.begin(async (transaction) => {
    // Integration test files share one database; serialize resets so parallel files cannot truncate
    // after another test seeds data or race while recreating MAIN.
    await transaction`select pg_advisory_xact_lock(731092445)`
    const tables: { tablename: string }[] = await transaction`select tablename from pg_tables where schemaname = 'public'`
    const names = tables.map((table) => `"${table.tablename}"`).join(', ')
    await transaction.unsafe(`truncate table ${names} restart identity cascade`)
    // The schema ships with one branch; truncating removed it, so put it back for the next test.
    await transaction.unsafe(`insert into branches (code, name) values ('MAIN', 'สาขาหลัก')`)
    await transaction.unsafe(`insert into registers (branch_id, code, name) values (1, 'MAIN', 'เคาน์เตอร์หลัก')`)
  })
  // Truncating with SQL bypasses the repositories, so an enabled Redis cache would keep serving the rows just
  // removed. Rotate every cached group the same way a committed write does.
  const readCache = container.resolve<IRepositoryReadCache>(repositoryReadCacheToken)
  for (const group of ['categories', 'products', 'modifiers', 'settings'] as const) await readCache.changed(group)
  fakeMedia.reset()
}
