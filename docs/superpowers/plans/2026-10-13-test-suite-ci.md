# ชุดทดสอบอัตโนมัติและ CI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** คำสั่ง `bun run test` ตรวจพฤติกรรม 36 ข้อของ API กับ PostgreSQL จริง และ GitHub Actions รัน typecheck, lint และการทดสอบทุกครั้งที่ push

**Architecture:** การทดสอบแบบ integration ด้วย `bun test` ไฟล์ preload สร้างฐานข้อมูล `pos_test` รัน migration และเปิดตัวจำลองที่เก็บรูป จากนั้นแต่ละไฟล์ทดสอบเปิดแอปบนพอร์ตสุ่มและเรียกผ่าน Eden client แบบมี type โดยล้างทุกตารางก่อนแต่ละกรณี

**Tech Stack:** Bun 1.4.3 (`bun:test`, `Bun.SQL`, `Bun.serve`), Elysia 1.4, `@elysiajs/eden`, Drizzle ORM 0.45, PostgreSQL 17, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-10-13-test-suite-ci-design.md`

## Global Constraints

- ห้ามแก้พฤติกรรมของโค้ดใน `apps/api/src` (ยกเว้นไฟล์ `*.test.ts` ที่เพิ่มใหม่) ถ้าการทดสอบเจอบั๊ก ให้บันทึกในหัวข้อ "บั๊กที่พบ" ท้ายไฟล์นี้ แล้วปักด้วย `test.failing`
- การทดสอบต้องไม่ส่งคำขอไป Cloudflare และ CI ต้องไม่ใช้ความลับ
- ชื่อฐานข้อมูลทดสอบคือ `pos_test` บน `localhost:5433` ฐานข้อมูล `pos` ต้องไม่ถูกแตะ
- จำนวนเงินเป็นสตางค์ อัตรา VAT ในการทดสอบคือ `VAT_RATE_BP=700` แบบรวมในราคา
- รันคำสั่งทั้งหมดจาก root ของ repo (`D:\POS`) เว้นแต่ระบุไว้ และต้องเปิดฐานข้อมูลด้วย `bun run db:up` ก่อน
- ค่าตั้งค่าจริงอยู่ใน `.env` ไฟล์เดียวที่ root (ดู `AGENTS.md`) ห้าม commit ไฟล์นั้นและโฟลเดอร์ `.wrangler` ส่วน `apps/api/.env.test` เป็นค่าทดสอบที่ไม่ใช่ความลับและ commit ได้
- ทำตาม `AGENTS.md`: commit ด้วย `gitcz --non-interactive` เท่านั้น ห้ามใช้ `git commit` โดยตรง และห้าม `git push` ทุกรูปแบบ เจ้าของโครงการเป็นผู้ push เอง
- ทุก commit ใส่ `--body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- ไฟล์ทดสอบในแผนนี้ไม่ใช่ command หรือ query จึงไม่อยู่ใต้กฎ CQRS และแผนนี้ไม่ย้ายโค้ดเดิมใน `service.ts`
- อนุญาต SQL test fixture ขอบเวลาหลังตรวจ cached-client guard เพื่อกำหนด precision แน่นอน ห้ามปัก `test.failing` จากการปัด microseconds ของ fixture

## Review Focus

1. ชี้ `DATABASE_URL` ไปฐานข้อมูลที่ไม่ใช่ฐานทดสอบ: ต้องปฏิเสธก่อนล้างข้อมูล (Task 1)
2. PostgreSQL ไม่ได้เปิด: ต้องได้ข้อความที่บอกให้รัน `bun run db:up` (Task 1)
3. จำนวนสินค้าในบิลเป็น 0 ติดลบ หรือทศนิยม: ต้องตอบ 422 และสต็อกไม่เปลี่ยน (Task 5)
4. ยอดรวมของบรรทัดเกินช่วงของ integer: ผู้ใช้ควรได้ข้อผิดพลาดระดับ 4xx แต่ปัจจุบันคาดว่าตอบ 500 (Task 5 ปักเป็นบั๊กที่รู้อยู่)
5. cookie ของ session ที่ถูกแก้หรือเป็นข้อความมั่ว: ต้องตอบ 401 ไม่ใช่ 500 (Task 2)

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/api/.env.test` (สร้าง) | ค่าตั้งค่าสำหรับทดสอบ commit ได้ |
| `apps/api/bunfig.toml` (สร้าง) | บอก `bun test` ให้โหลด preload |
| `apps/api/test/database.ts` (สร้าง) | ตรวจชื่อฐานข้อมูล สร้างฐานทดสอบ |
| `apps/api/test/media-server.ts` (สร้าง) | ตัวจำลองที่เก็บรูปในหน่วยความจำ |
| `apps/api/test/setup.ts` (สร้าง) | preload: ตั้ง `MEDIA_URL` สร้างฐานข้อมูล รัน migration |
| `apps/api/test/harness.ts` (สร้าง) | เปิดแอป สร้าง client ล้างข้อมูล และตัวช่วยเตรียมข้อมูล |
| `apps/api/test/harness.test.ts` (สร้าง) | ทดสอบโครงทดสอบเอง |
| `apps/api/src/modules/auth/auth.test.ts` (สร้าง) | ข้อ 1–6 |
| `apps/api/src/modules/catalog/products/products.test.ts` (สร้าง) | ข้อ 7–10 |
| `apps/api/src/modules/inventory/inventory.test.ts` (สร้าง) | ข้อ 11–14 |
| `apps/api/src/modules/sales/sales.test.ts` (สร้าง) | ข้อ 15–25 |
| `apps/api/src/modules/sales/void.test.ts` (สร้าง) | ข้อ 26–28 |
| `apps/api/src/modules/sales/summary.test.ts` (สร้าง) | ข้อ 29–31 |
| `apps/api/src/modules/catalog/products/images.test.ts` (สร้าง) | ข้อ 32–36 |
| `apps/api/package.json` (แก้) | เพิ่ม `@elysiajs/eden` เป็น devDependency |
| `package.json` (แก้) | เพิ่มสคริปต์ `lint` |
| `.github/workflows/ci.yml` (สร้าง) | CI |

การทดสอบส่วนใหญ่ตรวจพฤติกรรมที่มีอยู่แล้ว จึงคาดว่าผ่านตั้งแต่รอบแรก ถ้ากรณีใดล้มเหลว ให้ตรวจก่อนว่าการทดสอบผิดหรือโค้ดผิด ถ้าโค้ดผิดให้ทำตามข้อแรกของ Global Constraints การพิสูจน์ว่าการทดสอบจับบั๊กได้จริงอยู่ใน Task 8

---

### Task 0: commit งานที่มีอยู่เป็นจุดตั้งต้น

โค้ดทั้งหมดก่อนแผนนี้ยังไม่ได้ commit ต้องมีจุดตั้งต้นก่อน เพื่อให้ commit ของแต่ละ task แยกดูได้

**Files:** ทุกไฟล์ที่ยังไม่ได้ commit

- [ ] **Step 1: ตรวจว่าไม่มีความลับถูก stage**

```bash
git status --short --untracked-files=all
# Review every path; exclude secrets, builds and scratch before staging.
git add -A
git status --short | grep -E '(^|/)\.env$|\.dev\.vars$|\.wrangler/' && echo "STOP: secret staged" || echo "clean"
```

Expected: `clean` ถ้าได้ `STOP` ให้ `git reset` แล้วแก้ `.gitignore` ก่อน

- [ ] **Step 2: Commit**

```bash
gitcz --non-interactive --type=feat --subject="Add POS API, web app and media worker" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: โครงทดสอบ

**Files:**
- Create: `apps/api/.env.test`, `apps/api/bunfig.toml`, `apps/api/test/database.ts`, `apps/api/test/media-server.ts`, `apps/api/test/setup.ts`, `apps/api/test/harness.ts`
- Test: `apps/api/test/harness.test.ts`
- Modify: `apps/api/package.json` (devDependency)

**Interfaces:**
- Produces (จาก `apps/api/test/harness.ts`):
  - `type Api` คือ Eden client ที่ชี้ `/api`
  - `interface Session { api: Api; user: User }`
  - `const PASSWORD: string`
  - `client(cookie?: string): Api`
  - `login(username: string, password?: string): Promise<Api>`
  - `signIn(role?: 'owner' | 'cashier', username?: string): Promise<Session>`
  - `seedProduct(by: Session, input?: Partial<CreateProduct> & { stock?: number }): Promise<Product>`
  - `ok<T>(result): T` คืน `data` หรือ throw ถ้าคำขอไม่สำเร็จ
  - `pngFile(name?: string): File` ไฟล์ PNG ขนาด 1×1 ที่ถูกต้อง
  - `resetDatabase(): Promise<void>`
  - `fakeMedia: { url: string; objects: Map<string, Blob>; setFailing(value: boolean): void; reset(): void }`
- Produces (จาก `apps/api/test/database.ts`): `assertTestDatabase(): string`, `assertConnectedTestDatabase(connection: SQL): Promise<void>`, `ensureTestDatabase(adminFactory?: (url: string) => SQL): Promise<void>`

- [ ] **Step 1: เพิ่ม Eden เป็น devDependency ของ API**

```bash
cd apps/api && bun add -d @elysiajs/eden && cd ../..
```

- [ ] **Step 2: เขียนการทดสอบของโครงทดสอบ (ยังไม่มีโครง จึงต้องล้มเหลว)**

สร้าง `apps/api/test/harness.test.ts`:

```ts
import { SQL } from 'bun'
import { beforeEach, describe, expect, test } from 'bun:test'
import { UsersService } from '../src/modules/users/service'
import { assertTestDatabase, ensureTestDatabase } from './database'
import { client, fakeMedia, ok, resetDatabase, signIn } from './harness'

beforeEach(() => resetDatabase())

describe('test harness', () => {
  test('serves the app over HTTP', async () => {
    expect(ok(await client().health.get())).toEqual({ status: 'ok' })
  })

  test('runs against the test database and the fake media server', () => {
    expect(assertTestDatabase()).toBe('pos_test')
    expect(Bun.env.MEDIA_URL).toBe(fakeMedia.url)
  })

  test('resetDatabase leaves no rows behind', async () => {
    await signIn('owner')
    expect(await UsersService.list()).toHaveLength(1)

    await resetDatabase()

    expect(await UsersService.list()).toHaveLength(0)
  })

  test('identity columns restart after a reset', async () => {
    const first = await signIn('owner')
    await resetDatabase()
    const second = await signIn('owner')

    expect(second.user.id).toBe(first.user.id)
  })
})

describe('database guard', () => {
  const original = Bun.env.DATABASE_URL

  test('refuses the development database', () => {
    Bun.env.DATABASE_URL = 'postgres://pos:pos@localhost:5433/pos'
    try {
      expect(() => assertTestDatabase()).toThrow('Refusing to run tests against database "pos"')
    } finally {
      Bun.env.DATABASE_URL = original
    }
  })

  test.each([
    'postgres://pos:pos@localhost:5433/other_test',
    'postgres://pos:pos@remote.example:5433/pos_test',
    'postgres://pos:pos@localhost:5432/pos_test',
  ])('refuses a non-exact target %s', (url) => {
    Bun.env.DATABASE_URL = url
    try { expect(() => assertTestDatabase()).toThrow('expected pos_test on localhost:5433') }
    finally { Bun.env.DATABASE_URL = original }
  })

  test('valid env cannot hide the cached connection database', async () => {
    Bun.env.DATABASE_URL = 'postgres://pos:pos@localhost:5433/pos_test'
    let truncated = false
    const wrongConnection = Object.assign(
      async () => [{ name: 'pos' }],
      { unsafe: async () => { truncated = true } },
    ) as unknown as SQL
    try {
      await expect(resetDatabase(wrongConnection)).rejects.toThrow('connected database "pos"')
      expect(truncated).toBe(false)
    } finally {
      Bun.env.DATABASE_URL = original
    }
  })

  test('explains how to start PostgreSQL when connection fails', async () => {
    const failingConnection = Object.assign(
      async () => { throw new Error('connection refused') },
      { close: async () => {} },
    ) as unknown as SQL
    await expect(ensureTestDatabase(() => failingConnection)).rejects.toThrow('bun run db:up')
  })
})
```

- [ ] **Step 3: รันให้เห็นว่าล้มเหลว**

Run: `bun run test`
Expected: FAIL ด้วยข้อความว่าไม่พบโมดูล `./database` หรือ `./harness`

- [ ] **Step 4: เขียนไฟล์ตั้งค่า**

สร้าง `apps/api/.env.test`:

```
# Loaded automatically by `bun test`. Local-only values, safe to commit.
DATABASE_URL=postgres://pos:pos@localhost:5433/pos_test
JWT_SECRET=test-only-secret-not-used-anywhere-else
MEDIA_TOKEN=test-media-token
# Replaced by test/setup.ts with the in-memory media server. Unroutable on purpose,
# so a broken setup can never reach a real bucket.
MEDIA_URL=http://127.0.0.1:9
VAT_RATE_BP=700
SHOP_TIME_ZONE=Asia/Bangkok
COOKIE_SECURE=false
```

สร้าง `apps/api/bunfig.toml`:

```toml
[test]
preload = ["./test/setup.ts"]
```

- [ ] **Step 5: เขียน `apps/api/test/database.ts`**

```ts
import { SQL } from 'bun'

/** Refuse every URL except the exact local test target. */
export function assertTestDatabase(): string {
  const target = new URL(Bun.env.DATABASE_URL ?? 'postgres://unset/')
  const name = decodeURIComponent(target.pathname.slice(1))
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== 'localhost' ||
      target.port !== '5433' || name !== 'pos_test' || target.search || target.hash)
    throw new Error(`Refusing to run tests against database "${name}": expected pos_test on localhost:5433`)
  return name
}

/** Inspect the cached connection itself; mutable env cannot mask its actual database. */
export async function assertConnectedTestDatabase(connection: SQL): Promise<void> {
  assertTestDatabase()
  const [actual] = await connection`select current_database() as name`
  if (actual?.name !== 'pos_test')
    throw new Error(`Refusing to reset connected database "${actual?.name}"`)
}

/** Creates the test database on first use. */
export async function ensureTestDatabase(adminFactory = (url: string) => new SQL(url)): Promise<void> {
  const name = assertTestDatabase()
  const adminUrl = new URL(Bun.env.DATABASE_URL!)
  adminUrl.pathname = '/postgres'

  const admin = adminFactory(adminUrl.href)
  try {
    const existing = await admin`select 1 from pg_database where datname = ${name}`
    // CREATE DATABASE cannot take a bound parameter; the name was validated above.
    if (existing.length === 0) await admin.unsafe(`create database "${name}"`)
  } catch (cause) {
    throw new Error(
      `Cannot reach PostgreSQL at ${adminUrl.host}. Start it with "bun run db:up" from the repo root.`,
      { cause },
    )
  } finally {
    await admin.close()
  }
}
```

- [ ] **Step 6: เขียน `apps/api/test/media-server.ts`**

```ts
interface FakeMedia {
  url: string
  /** Stored objects by key, for assertions. */
  objects: Map<string, Blob>
  /** While true every request answers 503, as if the storage were down. */
  setFailing(value: boolean): void
  reset(): void
}

/** In-memory stand-in for the apps/media Worker: same contract, no network. */
function start(): FakeMedia {
  const objects = new Map<string, Blob>()
  let failing = false

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (failing) return new Response('unavailable', { status: 503 })
      const key = new URL(request.url).pathname.slice(1)

      if (request.method === 'GET') {
        const object = objects.get(key)
        return object ? new Response(object) : new Response(null, { status: 404 })
      }
      if (request.headers.get('authorization') !== `Bearer ${Bun.env.MEDIA_TOKEN}`)
        return new Response(null, { status: 401 })

      if (request.method === 'PUT') {
        objects.set(key, await request.blob())
        return Response.json({ key }, { status: 201 })
      }
      if (request.method === 'DELETE') {
        objects.delete(key)
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 405 })
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    objects,
    setFailing: (value) => {
      failing = value
    },
    reset: () => {
      objects.clear()
      failing = false
    },
  }
}

// Kept on globalThis so the preload script and every test file share one server,
// whichever way the test runner caches modules.
const shared = globalThis as typeof globalThis & { __posFakeMedia?: FakeMedia }

export const fakeMedia: FakeMedia = (shared.__posFakeMedia ??= start())
```

- [ ] **Step 7: เขียน `apps/api/test/setup.ts`**

```ts
import { ensureTestDatabase } from './database'
import { fakeMedia } from './media-server'

// Must happen before anything imports src/config/env, which reads the environment once.
Bun.env.MEDIA_URL = fakeMedia.url

await ensureTestDatabase()

const { migrate } = await import('drizzle-orm/bun-sql/migrator')
const { db } = await import('../src/db/client')
await migrate(db, { migrationsFolder: './drizzle' })
```

- [ ] **Step 8: เขียน `apps/api/test/harness.ts`**

```ts
import { treaty } from '@elysiajs/eden'
import { app, type App } from '../src/app'
import { client as sqlClient } from '../src/db/client'
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
export const client = (cookie?: string) => treaty<App>(origin, cookie ? { headers: { cookie } } : {}).api

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
```

- [ ] **Step 9: รันให้ผ่าน**

Run: `bun run test`
Expected: PASS ทุกกรณี harness และ guard พร้อม 8 กรณีเดิมใน `pricing.test.ts`

- [ ] **Step 10: ตรวจว่าฐานข้อมูลพัฒนาไม่ถูกแตะ**

Run: fingerprint comparison ตาม Task 8 Step 6 โดยเทียบ baseline ที่บันทึกก่อน Task 1
Expected: SHA256 ครบ schema/data/sequences ตรงกับ baseline

- [ ] **Step 11: typecheck และ commit**

```bash
bun run typecheck
git add apps/api/.env.test apps/api/bunfig.toml apps/api/test apps/api/package.json bun.lock
gitcz --non-interactive --type=test --subject="integration test harness on a dedicated PostgreSQL database"
```

---

### Task 2: ล็อกอินและสิทธิ์ (ข้อ 1–6 และ Review Focus ข้อ 5)

**Files:**
- Test: `apps/api/src/modules/auth/auth.test.ts`

**Interfaces:**
- Consumes: `client`, `login`, `signIn`, `seedProduct`, `ok`, `pngFile`, `resetDatabase`, `PASSWORD` จาก `apps/api/test/harness.ts`

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/modules/auth/auth.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { client, login, ok, PASSWORD, pngFile, resetDatabase, seedProduct, signIn } from '../../../test/harness'

beforeEach(() => resetDatabase())

describe('login', () => {
  test('starts a session and returns the user without any password field', async () => {
    const { api } = await signIn('owner', 'boss')

    expect(ok(await api.auth.me.get())).toEqual({
      id: expect.any(Number),
      username: 'boss',
      displayName: 'boss',
      role: 'owner',
      isActive: true,
    })
  })

  test('answers a wrong password and an unknown user identically', async () => {
    await signIn('owner', 'boss')

    const wrongPassword = await client().auth.login.post({ username: 'boss', password: 'wrong-password' })
    const unknownUser = await client().auth.login.post({ username: 'nobody', password: PASSWORD })

    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(unknownUser.error?.value).toEqual(wrongPassword.error?.value)
  })

  test('protected routes refuse requests without a session', async () => {
    const result = await client().catalog.products.get({ query: {} })

    expect(result.status).toBe(401)
    expect(result.error?.value).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  test('a garbage session cookie is refused, not an internal error', async () => {
    const result = await client('session=not-a-jwt').auth.me.get()

    expect(result.status).toBe(401)
  })
})

describe('roles', () => {
  test('a cashier is refused on every owner-only route', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')
    const product = await seedProduct(owner, { stock: 5 })
    const sale = ok(
      await cashier.api.sales.post({
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: product.priceSatang }],
      }),
    )
    const hour = 60 * 60 * 1000

    // Every body is valid, so a 403 can only come from the role check.
    const attempts = await Promise.all([
      cashier.api.users.get(),
      cashier.api.users.post({ username: 'newbie', password: PASSWORD, displayName: 'New', role: 'cashier' }),
      cashier.api.users({ id: owner.user.id }).patch({ displayName: 'Renamed' }),
      cashier.api.catalog.categories.post({ name: 'Drinks' }),
      cashier.api.catalog.products.post({ sku: 'NEW-1', name: 'New', priceSatang: 100 }),
      cashier.api.catalog.products({ id: product.id }).patch({ priceSatang: 1 }),
      cashier.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }),
      cashier.api.catalog.products({ id: product.id }).image.delete(),
      cashier.api.inventory.receive.post({ productId: product.id, quantity: 1 }),
      cashier.api.inventory.adjust.post({ productId: product.id, countedQty: 1 }),
      cashier.api.sales({ id: sale.id }).void.post({ reason: 'mistake' }),
      cashier.api.sales.summary.get({ query: { from: new Date(Date.now() - hour), to: new Date(Date.now() + hour) } }),
    ])

    expect(attempts.map((attempt) => attempt.status)).toEqual(attempts.map(() => 403))
  })

  test('deactivating a user ends their session and blocks new logins', async () => {
    const owner = await signIn('owner')
    const cashier = await signIn('cashier')

    ok(await owner.api.users({ id: cashier.user.id }).patch({ isActive: false }))

    expect((await cashier.api.auth.me.get()).status).toBe(401)
    await expect(login('cashier')).rejects.toThrow('failed with 401')
  })

  test('the last active owner cannot be deactivated or demoted', async () => {
    const owner = await signIn('owner')

    const deactivate = await owner.api.users({ id: owner.user.id }).patch({ isActive: false })
    const demote = await owner.api.users({ id: owner.user.id }).patch({ role: 'cashier' })

    expect(deactivate.status).toBe(409)
    expect(deactivate.error?.value).toMatchObject({ code: 'LAST_OWNER' })
    expect(demote.status).toBe(409)
    expect(ok(await owner.api.auth.me.get()).role).toBe('owner')
  })

  test('an owner can be demoted once another active owner exists', async () => {
    const first = await signIn('owner', 'first')
    const second = await signIn('owner', 'second')

    const demoted = ok(await first.api.users({ id: second.user.id }).patch({ role: 'cashier' }))

    expect(demoted.role).toBe('cashier')
  })
})
```

- [ ] **Step 2: รัน**

Run: `bun run test`
Expected: PASS ทุกกรณี ถ้ากรณีใดล้มเหลว ให้ทำตามข้อแรกของ Global Constraints

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/auth/auth.test.ts
gitcz --non-interactive --type=test --subject="login, sessions and role checks"
```

---

### Task 3: สินค้า (ข้อ 7–10)

**Files:**
- Test: `apps/api/src/modules/catalog/products/products.test.ts`

**Interfaces:**
- Consumes: `signIn`, `seedProduct`, `ok`, `resetDatabase`, `type Session` จาก `apps/api/test/harness.ts`

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/modules/catalog/products/products.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const search = async (q: string) => ok(await owner.api.catalog.products.get({ query: { q } })).map((item) => item.name)

describe('products', () => {
  test('a created product is found by name, SKU and barcode', async () => {
    const created = ok(
      await owner.api.catalog.products.post({
        sku: 'DRK-001',
        barcode: '8850000000011',
        name: 'น้ำดื่ม 600 มล.',
        priceSatang: 1000,
      }),
    )
    await seedProduct(owner, { name: 'Something else' })

    expect(created).toMatchObject({ stockQty: 0, isActive: true, trackStock: true, imageUrl: null })
    expect(await search('น้ำดื่ม')).toEqual(['น้ำดื่ม 600 มล.'])
    expect(await search('drk-001')).toEqual(['น้ำดื่ม 600 มล.'])
    expect(await search('8850000000011')).toEqual(['น้ำดื่ม 600 มล.'])
  })

  test('duplicate SKU or barcode is a conflict', async () => {
    await seedProduct(owner, { sku: 'DUP-1', barcode: '111' })

    const sameSku = await owner.api.catalog.products.post({ sku: 'DUP-1', name: 'Other', priceSatang: 100 })
    const sameBarcode = await owner.api.catalog.products.post({
      sku: 'DUP-2',
      barcode: '111',
      name: 'Other',
      priceSatang: 100,
    })

    expect(sameSku.status).toBe(409)
    expect(sameSku.error?.value).toMatchObject({ code: 'DUPLICATE' })
    expect(sameBarcode.status).toBe(409)
  })

  test('inactive products are hidden unless explicitly requested', async () => {
    const active = await seedProduct(owner, { name: 'Active' })
    const retired = await seedProduct(owner, { name: 'Retired' })
    ok(await owner.api.catalog.products({ id: retired.id }).patch({ isActive: false }))

    const visible = ok(await owner.api.catalog.products.get({ query: {} }))
    const all = ok(await owner.api.catalog.products.get({ query: { includeInactive: true } }))

    expect(visible.map((item) => item.id)).toEqual([active.id])
    expect(all.map((item) => item.name)).toEqual(['Active', 'Retired'])
  })

  test('% and _ in a search term are matched literally', async () => {
    await seedProduct(owner, { name: '100% juice' })
    await seedProduct(owner, { name: '100 percent juice' })
    await seedProduct(owner, { name: 'a_b snack' })
    await seedProduct(owner, { name: 'axb snack' })

    expect(await search('100%')).toEqual(['100% juice'])
    expect(await search('a_b')).toEqual(['a_b snack'])
  })

  test('stock cannot be changed through the product update route', async () => {
    const product = await seedProduct(owner, { stock: 5 })

    // stockQty is not part of the update body; an unknown field must not slip through.
    await owner.api.catalog.products({ id: product.id }).patch({ name: 'Renamed', stockQty: 999 } as never)

    expect(ok(await owner.api.catalog.products({ id: product.id }).get()).stockQty).toBe(5)
  })
})
```

- [ ] **Step 2: รัน**

Run: `bun run test`
Expected: PASS ทุกกรณี

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/catalog/products/products.test.ts
gitcz --non-interactive --type=test --subject="product creation, search and visibility"
```

---

### Task 4: สต็อก (ข้อ 11–14)

**Files:**
- Test: `apps/api/src/modules/inventory/inventory.test.ts`

**Interfaces:**
- Consumes: `signIn`, `seedProduct`, `ok`, `resetDatabase`, `type Session` จาก `apps/api/test/harness.ts`

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/modules/inventory/inventory.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty
const movementsOf = async (productId: number) => ok(await owner.api.inventory.movements.get({ query: { productId } }))

describe('inventory', () => {
  test('receiving adds stock and records the movement with its running balance', async () => {
    const product = await seedProduct(owner)

    const first = ok(await owner.api.inventory.receive.post({ productId: product.id, quantity: 10, note: 'PO-1' }))
    const second = ok(await owner.api.inventory.receive.post({ productId: product.id, quantity: 5 }))

    expect(first).toMatchObject({ type: 'receive', quantity: 10, balanceAfter: 10, note: 'PO-1', userId: owner.user.id })
    expect(second).toMatchObject({ type: 'receive', quantity: 5, balanceAfter: 15, note: null })
    expect(await stockOf(product.id)).toBe(15)
    // Newest first.
    expect((await movementsOf(product.id)).map((movement) => movement.balanceAfter)).toEqual([15, 10])
  })

  test('a stock count records the signed difference and sets the balance to the count', async () => {
    const product = await seedProduct(owner, { stock: 10 })

    const down = ok(await owner.api.inventory.adjust.post({ productId: product.id, countedQty: 7, note: 'damaged' }))
    const up = ok(await owner.api.inventory.adjust.post({ productId: product.id, countedQty: 12 }))

    expect(down).toMatchObject({ type: 'adjust', quantity: -3, balanceAfter: 7, note: 'damaged' })
    expect(up).toMatchObject({ type: 'adjust', quantity: 5, balanceAfter: 12 })
    expect(await stockOf(product.id)).toBe(12)
  })

  test('a count equal to the current balance is rejected and records nothing', async () => {
    const product = await seedProduct(owner, { stock: 10 })

    const result = await owner.api.inventory.adjust.post({ productId: product.id, countedQty: 10 })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'NO_CHANGE' })
    expect(await movementsOf(product.id)).toHaveLength(1)
  })

  test('products that do not track stock cannot be received or counted', async () => {
    const service = await seedProduct(owner, { trackStock: false })

    const receive = await owner.api.inventory.receive.post({ productId: service.id, quantity: 1 })
    const adjust = await owner.api.inventory.adjust.post({ productId: service.id, countedQty: 1 })

    expect(receive.status).toBe(400)
    expect(receive.error?.value).toMatchObject({ code: 'STOCK_NOT_TRACKED' })
    expect(adjust.status).toBe(400)
    expect(await movementsOf(service.id)).toHaveLength(0)
  })

  test('an unknown product is not found', async () => {
    const result = await owner.api.inventory.receive.post({ productId: 9999, quantity: 1 })

    expect(result.status).toBe(404)
  })
})
```

- [ ] **Step 2: รัน**

Run: `bun run test`
Expected: PASS ทุกกรณี

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/inventory/inventory.test.ts
gitcz --non-interactive --type=test --subject="stock receiving and stock counts"
```

---

### Task 5: การขาย (ข้อ 15–25 และ Review Focus ข้อ 3–4)

**Files:**
- Test: `apps/api/src/modules/sales/sales.test.ts`

**Interfaces:**
- Consumes: `signIn`, `seedProduct`, `ok`, `resetDatabase`, `type Session` จาก `apps/api/test/harness.ts`

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/modules/sales/sales.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty
const allSales = async () => ok(await owner.api.sales.get({ query: {} }))

describe('completing a sale', () => {
  test('computes totals, VAT and change, deducts stock and records the movements', async () => {
    const tea = await seedProduct(owner, { name: 'Tea', priceSatang: 2500, stock: 10 })
    const cake = await seedProduct(owner, { name: 'Cake', priceSatang: 5700, stock: 5 })

    const sale = ok(
      await cashier.api.sales.post({
        items: [
          { productId: tea.id, quantity: 2 },
          { productId: cake.id, quantity: 1 },
        ],
        discountSatang: 700,
        payments: cash(20000),
      }),
    )

    expect(sale).toMatchObject({
      status: 'completed',
      subtotalSatang: 10700,
      discountSatang: 700,
      totalSatang: 10000,
      vatSatang: 654, // 10000 * 7 / 107 = 654.2
      paidSatang: 20000,
      changeSatang: 10000,
      cashierId: cashier.user.id,
      cashierName: 'cashier',
    })
    expect(sale.receiptNo).toMatch(/^\d{8}-00001$/)
    expect(sale.items).toEqual([
      { productId: tea.id, productName: 'Tea', sku: tea.sku, unitPriceSatang: 2500, quantity: 2, lineTotalSatang: 5000 },
      { productId: cake.id, productName: 'Cake', sku: cake.sku, unitPriceSatang: 5700, quantity: 1, lineTotalSatang: 5700 },
    ])
    expect(sale.payments).toEqual(cash(20000))

    expect(await stockOf(tea.id)).toBe(8)
    expect(await stockOf(cake.id)).toBe(4)
    const [latest] = ok(await owner.api.inventory.movements.get({ query: { productId: tea.id } }))
    expect(latest).toMatchObject({ type: 'sale', quantity: -2, balanceAfter: 8, reference: sale.receiptNo })
  })

  test('repeated lines for one product are merged, keeping first-seen order', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
    const cake = await seedProduct(owner, { priceSatang: 2000, stock: 10 })

    const sale = ok(
      await cashier.api.sales.post({
        items: [
          { productId: tea.id, quantity: 1 },
          { productId: cake.id, quantity: 1 },
          { productId: tea.id, quantity: 2 },
        ],
        payments: cash(5000),
      }),
    )

    expect(sale.items.map((item) => [item.productId, item.quantity])).toEqual([
      [tea.id, 3],
      [cake.id, 1],
    ])
    expect(await stockOf(tea.id)).toBe(7)
  })

  test('a receipt keeps the name and price from the moment of sale', async () => {
    const tea = await seedProduct(owner, { name: 'Tea', priceSatang: 2500, stock: 10 })
    const sale = ok(
      await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(2500) }),
    )

    ok(await owner.api.catalog.products({ id: tea.id }).patch({ name: 'Green tea', priceSatang: 9900 }))

    const stored = ok(await owner.api.sales({ id: sale.id }).get())
    expect(stored.items[0]).toMatchObject({ productName: 'Tea', unitPriceSatang: 2500, lineTotalSatang: 2500 })
    expect(stored.totalSatang).toBe(2500)
  })

  test('receipt numbers stay consecutive across a failed sale', async () => {
    const tea = await seedProduct(owner, { stock: 2 })
    const sell = (quantity: number) =>
      cashier.api.sales.post({ items: [{ productId: tea.id, quantity }], payments: cash(100000) })

    const first = ok(await sell(1))
    expect((await sell(50)).status).toBe(409)
    const second = ok(await sell(1))

    const [firstDay, firstNumber] = first.receiptNo.split('-')
    const [secondDay, secondNumber] = second.receiptNo.split('-')
    // The counter restarts each business day; only compare within one day.
    if (firstDay === secondDay) expect(Number(secondNumber)).toBe(Number(firstNumber) + 1)
    else expect(secondNumber).toBe('00001')
  })

  test('a split payment that adds up exactly leaves no change', async () => {
    const tea = await seedProduct(owner, { priceSatang: 10000, stock: 1 })

    const sale = ok(
      await cashier.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [
          { method: 'promptpay', amountSatang: 6000 },
          { method: 'cash', amountSatang: 4000 },
        ],
      }),
    )

    expect(sale).toMatchObject({ paidSatang: 10000, changeSatang: 0 })
    expect(sale.payments).toHaveLength(2)
  })

  test('products that do not track stock sell without limit and leave no movement', async () => {
    const service = await seedProduct(owner, { trackStock: false, priceSatang: 100 })

    ok(await cashier.api.sales.post({ items: [{ productId: service.id, quantity: 999 }], payments: cash(99900) }))

    expect(await stockOf(service.id)).toBe(0)
    expect(ok(await owner.api.inventory.movements.get({ query: { productId: service.id } }))).toHaveLength(0)
  })
})

describe('rejecting a sale', () => {
  // Every rejection must leave stock and the receipt sequence untouched.
  const expectNothingRecorded = async (productId: number, stock: number) => {
    expect(await stockOf(productId)).toBe(stock)
    expect(await allSales()).toHaveLength(0)
  }

  test('insufficient stock', async () => {
    const tea = await seedProduct(owner, { stock: 2 })

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 3 }], payments: cash(3000) })

    expect(result.status).toBe(409)
    expect(result.error?.value).toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    await expectNothingRecorded(tea.id, 2)
  })

  test('a failing line rolls back the other lines of the same sale', async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    const cake = await seedProduct(owner, { stock: 1 })

    const result = await cashier.api.sales.post({
      items: [
        { productId: tea.id, quantity: 5 },
        { productId: cake.id, quantity: 2 },
      ],
      payments: cash(100000),
    })

    expect(result.status).toBe(409)
    await expectNothingRecorded(tea.id, 10)
  })

  test('inactive product', async () => {
    const tea = await seedProduct(owner, { stock: 5 })
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ isActive: false }))

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(1000) })

    expect(result.status).toBe(409)
    expect(result.error?.value).toMatchObject({ code: 'PRODUCT_INACTIVE' })
    await expectNothingRecorded(tea.id, 5)
  })

  test('unknown product', async () => {
    const result = await cashier.api.sales.post({ items: [{ productId: 9999, quantity: 1 }], payments: cash(1000) })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'PRODUCT_NOT_FOUND' })
    expect(await allSales()).toHaveLength(0)
  })

  test('underpayment', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(999) })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'UNDERPAID' })
    await expectNothingRecorded(tea.id, 5)
  })

  test('overpayment by a non-cash method', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })

    const result = await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      payments: [{ method: 'card', amountSatang: 1500 }],
    })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'OVERPAID' })
    await expectNothingRecorded(tea.id, 5)
  })

  test('discount larger than the subtotal', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 5 })

    const result = await cashier.api.sales.post({
      items: [{ productId: tea.id, quantity: 1 }],
      discountSatang: 1001,
      payments: cash(1000),
    })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'DISCOUNT_TOO_LARGE' })
    await expectNothingRecorded(tea.id, 5)
  })

  test.each([0, -1, 1.5])('quantity %p is a validation error', async (quantity) => {
    const tea = await seedProduct(owner, { stock: 5 })

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity }], payments: cash(1000) })

    expect(result.status).toBe(422)
    await expectNothingRecorded(tea.id, 5)
  })

  test('an empty cart or no payment is a validation error', async () => {
    const tea = await seedProduct(owner, { stock: 5 })

    const noItems = await cashier.api.sales.post({ items: [], payments: cash(1000) })
    const noPayment = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: [] })

    expect(noItems.status).toBe(422)
    expect(noPayment.status).toBe(422)
  })

  // Known bug, see "บั๊กที่พบ" at the end of the plan: the line total overflows the
  // integer column and surfaces as a 500. Remove `.failing` once it is fixed.
  test.failing('a line total beyond the integer range is a client error, not a crash', async () => {
    const jet = await seedProduct(owner, { priceSatang: 2_000_000_000, trackStock: false })

    const result = await cashier.api.sales.post({
      items: [{ productId: jet.id, quantity: 2 }],
      payments: cash(4_000_000_000),
    })

    expect(result.status).toBeGreaterThanOrEqual(400)
    expect(result.status).toBeLessThan(500)
  })
})

describe('concurrent sales', () => {
  test('never oversell and never reuse a receipt number', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 48 })

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 5 }], payments: cash(5000) }),
      ),
    )

    const succeeded = results.filter((result) => result.status === 200)
    const refused = results.filter((result) => result.status === 409)
    // Which requests win is timing-dependent; these totals are not.
    expect(succeeded).toHaveLength(9)
    expect(refused).toHaveLength(11)
    expect(await stockOf(tea.id)).toBe(3)

    const receiptNumbers = succeeded.map((result) => result.data!.receiptNo)
    expect(new Set(receiptNumbers).size).toBe(9)
  })
})
```

- [ ] **Step 2: รัน**

Run: `bun run test`
Expected: PASS ทุกกรณี โดยกรณี `test.failing` นับเป็นผ่านเมื่อเนื้อการทดสอบล้มเหลว ถ้า `bun test` รายงานว่ากรณี `test.failing` "ผ่านโดยไม่คาดคิด" แปลว่าระบบตอบ 4xx อยู่แล้ว ให้เปลี่ยน `test.failing` เป็น `test` และลบรายการนั้นออกจากหัวข้อ "บั๊กที่พบ"

- [ ] **Step 3: รันซ้ำสามรอบเพื่อตรวจว่าการทดสอบขายพร้อมกันคงที่**

Run: `bun run test && bun run test && bun run test`
Expected: PASS ทั้งสามรอบ

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/sales/sales.test.ts
gitcz --non-interactive --type=test --subject="sale totals, stock deduction, rejections and concurrency"
```

---

### Task 6: ยกเลิกบิลและสรุปยอดขาย (ข้อ 26–31)

**Files:**
- Test: `apps/api/src/modules/sales/void.test.ts`, `apps/api/src/modules/sales/summary.test.ts`

**Interfaces:**
- Consumes: `signIn`, `seedProduct`, `ok`, `resetDatabase`, `type Session` จาก `apps/api/test/harness.ts`

- [ ] **Step 1: เขียน `apps/api/src/modules/sales/void.test.ts`**

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty

const sellThree = async () => {
  const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
  const sale = ok(
    await owner.api.sales.post({
      items: [{ productId: tea.id, quantity: 3 }],
      payments: [{ method: 'cash', amountSatang: 3000 }],
    }),
  )
  return { tea, sale }
}

describe('voiding a sale', () => {
  test('marks it voided, restores stock and records the reversal', async () => {
    const { tea, sale } = await sellThree()

    const voided = ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'wrong item' }))

    expect(voided).toMatchObject({ status: 'voided', voidReason: 'wrong item', totalSatang: 3000 })
    expect(voided.voidedAt).toBeInstanceOf(Date)
    expect(voided.items).toEqual(sale.items)
    expect(await stockOf(tea.id)).toBe(10)
    const [latest] = ok(await owner.api.inventory.movements.get({ query: { productId: tea.id } }))
    expect(latest).toMatchObject({ type: 'void', quantity: 3, balanceAfter: 10, reference: sale.receiptNo })
  })

  test('cannot be done twice and does not restore stock twice', async () => {
    const { tea, sale } = await sellThree()
    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'wrong item' }))

    const again = await owner.api.sales({ id: sale.id }).void.post({ reason: 'again' })

    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'ALREADY_VOIDED' })
    expect(await stockOf(tea.id)).toBe(10)
  })

  test('an unknown sale is not found', async () => {
    const result = await owner.api.sales({ id: 9999 }).void.post({ reason: 'nothing' })

    expect(result.status).toBe(404)
  })

  test('a voided sale no longer counts in the summary', async () => {
    const { tea, sale } = await sellThree()
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 1000 }],
      }),
    )
    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'wrong item' }))

    const hour = 60 * 60 * 1000
    const summary = ok(
      await owner.api.sales.summary.get({ query: { from: new Date(Date.now() - hour), to: new Date(Date.now() + hour) } }),
    )

    expect(summary).toMatchObject({ saleCount: 1, totalSatang: 1000 })
  })
})
```

- [ ] **Step 2: เขียน `apps/api/src/modules/sales/summary.test.ts`**

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const HOUR = 60 * 60 * 1000
const around = (from: number, to: number) => ({ from: new Date(Date.now() + from), to: new Date(Date.now() + to) })
const summaryFor = async (range: { from: Date; to: Date }) => ok(await owner.api.sales.summary.get({ query: range }))

describe('sales summary', () => {
  test('adds up count, revenue, VAT, discount, profit and takings by method', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 1500, stock: 10 })
    // 2 x 25.00 - 5.00 discount = 45.00, paid 50.00 cash, change 5.00
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 2 }],
        discountSatang: 500,
        payments: [{ method: 'cash', amountSatang: 5000 }],
      }),
    )
    // 1 x 25.00 by PromptPay
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'promptpay', amountSatang: 2500 }],
      }),
    )

    expect(await summaryFor(around(-HOUR, HOUR))).toEqual({
      saleCount: 2,
      totalSatang: 7000,
      vatSatang: 294 + 164, // 4500 * 7 / 107 = 294.4 and 2500 * 7 / 107 = 163.6, rounded per sale
      discountSatang: 500,
      profitSatang: 7000 - 3 * 1500,
      byMethod: [
        { method: 'cash', amountSatang: 4500 },
        { method: 'promptpay', amountSatang: 2500 },
      ],
    })
  })

  test('cash takings are net of the change handed back', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 10 })
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 100000 }],
      }),
    )

    expect((await summaryFor(around(-HOUR, HOUR))).byMethod).toEqual([{ method: 'cash', amountSatang: 1000 }])
  })

  test('sales outside the requested period are excluded', async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 1000 }],
      }),
    )

    expect(await summaryFor(around(-48 * HOUR, -24 * HOUR))).toEqual({
      saleCount: 0,
      totalSatang: 0,
      vatSatang: 0,
      discountSatang: 0,
      profitSatang: 0,
      byMethod: [],
    })
  })

  test('the period end is exclusive', async () => {
    const tea = await seedProduct(owner, { stock: 10 })
    const sale = ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 1 }],
        payments: [{ method: 'cash', amountSatang: 1000 }],
      }),
    )

    const { client: sqlClient } = await import('../../db/client')
    const { assertConnectedTestDatabase } = await import('../../../test/database')
    const boundary = new Date('2026-01-15T10:00:00.000Z')
    await assertConnectedTestDatabase(sqlClient)
    // Fixture only: exact millisecond precision in both PostgreSQL and JS Date.
    await sqlClient`update sales set created_at = ${boundary} where id = ${sale.id}`
    const endingAtSale = await summaryFor({ from: new Date(boundary.getTime() - HOUR), to: boundary })
    const startingAtSale = await summaryFor({ from: boundary, to: new Date(boundary.getTime() + HOUR) })

    expect(endingAtSale.saleCount).toBe(0)
    expect(startingAtSale.saleCount).toBe(1)
  })
})
```

- [ ] **Step 3: รัน**

Run: `bun run test`
Expected: PASS ทุกกรณี ขอบเวลาใช้ fixture ที่กำหนด precision แน่นอน ห้ามบันทึก production bug หรือปัก `test.failing` จากการปัด microseconds ของ fixture

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/sales/void.test.ts apps/api/src/modules/sales/summary.test.ts
gitcz --non-interactive --type=test --subject="voiding sales and the sales summary"
```

---

### Task 7: รูปสินค้า (ข้อ 32–36)

**Files:**
- Test: `apps/api/src/modules/catalog/products/images.test.ts`

**Interfaces:**
- Consumes: `signIn`, `seedProduct`, `ok`, `pngFile`, `fakeMedia`, `resetDatabase`, `type Session` จาก `apps/api/test/harness.ts`

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/modules/catalog/products/images.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { fakeMedia, ok, pngFile, resetDatabase, seedProduct, signIn, type Session } from '../../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const keyOf = (imageUrl: string | null) => imageUrl!.slice(fakeMedia.url.length + 1)
const imageUrlOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).imageUrl

describe('product images', () => {
  test('an upload is stored and exposed as a loadable URL', async () => {
    const product = await seedProduct(owner)

    const updated = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    expect(updated.imageUrl).toStartWith(`${fakeMedia.url}/products/${product.id}/`)
    expect(updated.imageUrl).toEndWith('.png')
    expect(fakeMedia.objects.has(keyOf(updated.imageUrl))).toBe(true)
    expect((await fetch(updated.imageUrl!)).status).toBe(200)
    // The list endpoint must expose the same URL the POS screen renders.
    expect(ok(await owner.api.catalog.products.get({ query: {} }))[0]!.imageUrl).toBe(updated.imageUrl)
  })

  test('replacing an image uses a new key and removes the old object', async () => {
    const product = await seedProduct(owner)
    const first = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    const second = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    expect(second.imageUrl).not.toBe(first.imageUrl)
    expect([...fakeMedia.objects.keys()]).toEqual([keyOf(second.imageUrl)])
  })

  test('removing an image clears the URL and deletes the object', async () => {
    const product = await seedProduct(owner)
    ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))

    const cleared = ok(await owner.api.catalog.products({ id: product.id }).image.delete())

    expect(cleared.imageUrl).toBeNull()
    expect(fakeMedia.objects.size).toBe(0)
  })

  test('a file whose bytes are not an image is rejected even when it claims to be one', async () => {
    const product = await seedProduct(owner)
    const disguised = new File(['not an image'], 'photo.png', { type: 'image/png' })

    const result = await owner.api.catalog.products({ id: product.id }).image.put({ file: disguised })

    expect(result.status).toBe(422)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_FILE_TYPE' })
    expect(fakeMedia.objects.size).toBe(0)
    expect(await imageUrlOf(product.id)).toBeNull()
  })

  test('when storage is down the upload fails cleanly and the product is unchanged', async () => {
    const product = await seedProduct(owner)
    const before = ok(await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() }))
    fakeMedia.setFailing(true)

    const result = await owner.api.catalog.products({ id: product.id }).image.put({ file: pngFile() })

    expect(result.status).toBe(502)
    expect(result.error?.value).toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    fakeMedia.setFailing(false)
    expect(await imageUrlOf(product.id)).toBe(before.imageUrl)
  })

  test('an unknown product is not found and nothing is stored', async () => {
    const result = await owner.api.catalog.products({ id: 9999 }).image.put({ file: pngFile() })

    expect(result.status).toBe(404)
    expect(fakeMedia.objects.size).toBe(0)
  })
})
```

- [ ] **Step 2: รัน**

Run: `bun run test`
Expected: PASS ทุกกรณี

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/catalog/products/images.test.ts
gitcz --non-interactive --type=test --subject="product image upload, replacement and storage failure"
```

---

### Task 8: สคริปต์ lint, CI และการพิสูจน์ว่าการทดสอบจับบั๊กได้

**Files:**
- Modify: `package.json` (เพิ่มสคริปต์ `lint` ถัดจาก `typecheck`)
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: เพิ่มสคริปต์ `lint` ที่ root**

ใน `package.json` เพิ่มบรรทัดนี้ในส่วน `scripts` ถัดจากบรรทัด `"typecheck"`:

```json
    "lint": "bun run --filter @pos/web lint",
```

Run: `bun run lint`
Expected: จบด้วย exit code 0 (มีคำเตือนจากไฟล์ใน `components/ui` ได้ แต่ต้องไม่มี error)

- [ ] **Step 2: พิสูจน์ว่าการทดสอบขายพร้อมกันจับบั๊กได้**

ใน `apps/api/src/modules/catalog/products/service.ts` ฟังก์ชัน `lockByIds` ลบบรรทัด `.for('update')` ออกชั่วคราว แล้วรัน:

Run: `bun run test`
Expected: FAIL ที่กรณี `never oversell and never reuse a receipt number` (สำเร็จเกิน 9 รายการ หรือสต็อกติดลบ)

ถ้ายังผ่าน แปลว่าการทดสอบไม่ได้พิสูจน์การล็อกแถว ให้หยุดและรายงาน ห้ามทำขั้นถัดไป

- [ ] **Step 3: คืนโค้ดเดิมและยืนยัน**

```bash
git checkout apps/api/src/modules/catalog/products/service.ts
git status --short apps/api/src
bun run test
```

Expected: `git status` ไม่แสดงไฟล์ใดใน `apps/api/src` และการทดสอบ PASS ทั้งหมด

- [ ] **Step 4: เขียน `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: pos
          POSTGRES_PASSWORD: pos
          POSTGRES_DB: pos
        # Same host port as docker-compose.yml, so apps/api/.env.test works unchanged.
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U pos -d pos"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.3

      - run: bun install --frozen-lockfile

      - run: bun run typecheck
      - run: bun run lint
      - run: bun run test
```

- [ ] **Step 5: จำลองสภาพ CI ในเครื่อง**

Commit Task 8 ตาม Step 7 ก่อนขั้นนี้ เพื่อให้ committed HEAD มี workflow และ lint script แล้วตรวจใน checkout ใหม่ที่ไม่มี ignored local files:

```powershell
$ciCheckout = Join-Path $env:TEMP ("pos-ci-" + [guid]::NewGuid())
$ciHead = git rev-parse HEAD
git clone --no-local --no-hardlinks D:\POS $ciCheckout
if ($LASTEXITCODE -ne 0) { throw 'Clean checkout failed' }
$ciVariables = @('DATABASE_URL', 'JWT_SECRET', 'MEDIA_TOKEN', 'MEDIA_URL', 'VAT_RATE_BP', 'SHOP_TIME_ZONE', 'COOKIE_SECURE', 'NODE_ENV')
$priorEnv = @{}
foreach ($name in $ciVariables) {
  $priorEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
Push-Location $ciCheckout
try {
  git checkout --detach $ciHead
  if ($LASTEXITCODE -ne 0) { throw 'Checkout failed' }
  foreach ($path in @('node_modules', '.env', 'apps/api/.env', 'apps/media/.dev.vars')) {
    if (Test-Path $path) { throw "Unexpected local state: $path" }
  }
  bun install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Frozen install failed' }
  foreach ($check in @('typecheck', 'lint', 'test', 'test')) {
    bun run $check
    if ($LASTEXITCODE -ne 0) { throw "CI simulation failed: $check" }
  }
} finally {
  Pop-Location
  foreach ($name in $ciVariables) {
    [Environment]::SetEnvironmentVariable($name, $priorEnv[$name], 'Process')
  }
}
```

Expected: ทุกคำสั่งจบด้วย exit code 0 และการทดสอบสองรอบให้ผลเหมือนกัน ห้ามคัดลอก ignored `.env` หรือ dependencies เดิม ใช้เฉพาะ committed `.env.test` และ `.dev.vars.example` ล้าง inherited production environment ใน subprocess ก่อนรัน เก็บ checkout เป็นหลักฐานจนตรวจเสร็จ

- [ ] **Step 6: ตรวจว่าฐานข้อมูลพัฒนาไม่ถูกแตะ**

ก่อน Task 1 เก็บ baseline fingerprint ของ `pos` ครบ schema, data ทุกตารางและ sequence values โดยใช้ `pg_dump --no-owner --no-privileges` hash ข้อมูลในหน่วยความจำ ไม่พิมพ์ข้อมูลแถวหรือความลับ เก็บเพียง SHA256 ใน ignored ledger:

```powershell
$ledger = '.superpowers/sdd/2026-10-13-test-suite-ci'
# Controller recorded dev-before.sha256 before implementation.
# Helper strips comments, blank lines, randomized restrict/unrestrict markers,
# hashes all remaining pg_dump output including sequence setval statements.
& "$ledger/dev-fingerprint.ps1" -OutputPath "$ledger/dev-after.sha256"
if ((Get-Content "$ledger/dev-before.sha256") -ne (Get-Content "$ledger/dev-after.sha256")) {
  throw 'Development database schema/data/sequence fingerprint changed'
}
```

Expected: hash ตรงกับ baseline ก่อนเริ่ม implementation ห้ามใช้จำนวนแถวเก่าของบางตารางแทน fingerprint ถ้ามีการใช้งานฐานพัฒนาระหว่างงาน ให้รายงานและตรวจแยกก่อนกล่าวว่าข้อมูลไม่เปลี่ยน

- [ ] **Step 7: Commit**

```bash
git add package.json .github/workflows/ci.yml
gitcz --non-interactive --type=ci --subject="typecheck, lint and integration tests on GitHub Actions"
```

- [ ] **Step 8: ส่งต่อให้เจ้าของโครงการ**

รายงานว่า commit ทั้งหมดอยู่ในเครื่อง และ CI จะรันครั้งแรกเมื่อเจ้าของโครงการ `git push` เกณฑ์ข้อ "CI ผ่านบน GitHub อย่างน้อยหนึ่งครั้ง" ยังเปิดอยู่จนกว่าจะ push และตรวจผล

---

## บั๊กที่พบ

บันทึกบั๊กของโค้ดเดิมที่การทดสอบเปิดเผย แต่ละรายการต้องมีการทดสอบที่ปักด้วย `test.failing`

| # | อาการ | การทดสอบที่ปักไว้ | สถานะ |
|---|---|---|---|
| 1 | บรรทัดขายที่ราคา × จำนวนเกิน 2,147,483,647 สตางค์ ทำให้ฐานข้อมูลปฏิเสธและ API ตอบ 500 แทนข้อผิดพลาดระดับ 4xx | `sales.test.ts`: `a line total beyond the integer range is a client error, not a crash` | แก้แล้วในชิ้นงานที่ 3: `SaleEntity.complete` ปฏิเสธด้วย 400 `AMOUNT_TOO_LARGE` และการทดสอบเปลี่ยนจาก `test.failing` เป็น `test` |
