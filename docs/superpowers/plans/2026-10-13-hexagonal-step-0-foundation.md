# Hexagonal ขั้น 0: โครงพื้นฐานและโมดูล categories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** วางโครง Hexagonal ของ `apps/api` (DI, domain error, unit of work, โครงโฟลเดอร์) และย้ายโมดูล `categories` เป็นโมดูลแรก เพื่อพิสูจน์ว่าแนวทางใช้ได้ก่อนย้ายโมดูลที่เหลือ

**Architecture:** ตามสไตล์ `D:\KPRU-CWIE\server`: entity ใน `src/domains`, โมดูลแบนที่มี `applications/{ports,schemas,usecases}` และ `adapters/{controllers,repository}`, DI ด้วย tsyringe โมดูลที่ยังไม่ย้ายคงเป็น `service.ts` เดิมและอยู่ร่วมกับโมดูลใหม่ได้

**Tech Stack:** Bun 1.4.3, Elysia 1.4, Drizzle ORM 0.45, tsyringe, reflect-metadata, zod 4, `bun:test`

**Spec:** `docs/superpowers/specs/2026-10-13-hexagonal-architecture-design.md` แผนนี้ครอบคลุมเฉพาะ "ขั้น 0" ในตารางลำดับการย้ายของ spec ขั้น 1–5 จะมีแผนแยก ซึ่งเขียนหลังขั้น 0 ผ่าน เพราะผลของขั้นนี้อาจเปลี่ยนวิธีทำขั้นถัดไป

## Global Constraints

- ทำตาม `AGENTS.md`: ทำงานบน branch `ohmattpon/hexagonal-architecture`, commit ด้วย `gitcz --non-interactive` เท่านั้น, ห้าม `git push`, ห้าม merge เข้า `main`
- ทุก commit ใส่ `--body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- สัญญาของ API ห้ามเปลี่ยน: เส้นทาง รูปร่างคำขอและคำตอบ สถานะ HTTP ค่า `code` และข้อความของข้อผิดพลาด
- การทดสอบ integration ที่มีอยู่: ย้ายไฟล์และแก้บรรทัด import ได้ ห้ามแก้ assertion ห้ามลบกรณี ห้ามเปลี่ยนสถานะ `test.failing`
- ไฟล์ใน `src/domains` ห้าม import Elysia, Drizzle, tsyringe, zod, `libs/`, `modules/`, `infrastructure/`
- ไฟล์ใน `applications/` ห้าม import Elysia, Drizzle, `infrastructure/` และไฟล์ใน `adapters/`
- รันคำสั่งจาก root ของ repo (`D:\POS`) เว้นแต่ระบุไว้ และต้องเปิดฐานข้อมูลด้วย `bun run db:up` ก่อน
- ทุก task จบเมื่อ `bun run typecheck`, `bun run lint` และ `bun run test` ผ่านครบ
- ห้ามแตะโมดูล `users`, `auth`, `products`, `inventory`, `sales` นอกจากบรรทัด import ที่ต้องแก้เพราะไฟล์ย้ายที่

## Review Focus

1. คำขอแก้หมวดหมู่ที่ body ว่าง (`{}`): ผู้ใช้คาดว่าได้หมวดหมู่เดิมกลับมา ไม่ใช่ข้อผิดพลาดภายใน (Task 8)
2. ชื่อหมวดหมู่ที่มีแต่ช่องว่าง หรือยาวเกิน 100 ตัวอักษร ที่เข้ามาโดยไม่ผ่าน HTTP: use case ต้องปฏิเสธเอง (Task 7)
3. งานสองชุดที่รันพร้อมกันใน `IUnitOfWork` ต่างชุดกัน: ชุดที่ล้มเหลวต้องไม่ทำให้อีกชุด rollback (Task 5)
4. แก้ชื่อหมวดหมู่ให้ซ้ำกับหมวดหมู่อื่น: ต้องได้ 409 `DUPLICATE` เหมือนตอนสร้าง (Task 1 และ 8)
5. ข้อผิดพลาดที่ไม่ใช่ domain error หลุดถึง `toErrorResponse`: ต้องคืน `null` เพื่อให้ตัวจัดการเดิมตอบ 500 ไม่ใช่เผยรายละเอียดภายใน (Task 4)

## ผลต่างพฤติกรรมที่ยอมรับ

| กรณี | ก่อนย้าย | หลังย้าย | เหตุผล |
|---|---|---|---|
| `PATCH /api/catalog/categories/:id` ด้วย body `{}` | Drizzle โยน "No values to set" และ API ตอบ 500 | ตอบ 200 พร้อมหมวดหมู่เดิม | พฤติกรรมเดิมเป็นบั๊กที่ไม่มีใครพึ่ง และโครงใหม่เขียนทั้ง entity กลับเสมอ |

ถ้าพบผลต่างอื่น ให้หยุดและรายงาน ห้ามเพิ่มในตารางนี้เอง

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/api/src/__tests__/integration/*.integration.test.ts` (ย้าย) | การทดสอบ integration ทั้งหมด |
| `apps/api/src/__tests__/integration/categories.integration.test.ts` (สร้าง) | พฤติกรรมของหมวดหมู่ก่อนและหลังย้าย |
| `apps/api/src/__tests__/integration/unit-of-work.integration.test.ts` (สร้าง) | พิสูจน์ transaction ข้าม repository |
| `apps/api/src/__tests__/mocks.ts`, `factories.ts` (สร้าง) | port จำลองและตัวสร้าง entity |
| `apps/api/test/openapi-snapshot.ts`, `openapi-baseline.json` (สร้าง) | เทียบเอกสาร OpenAPI ก่อนและหลัง |
| `apps/api/src/libs/env.ts`, `db.ts` (ย้ายจาก `config/`, `db/`) | ค่าตั้งค่าและตัวเชื่อมฐานข้อมูล |
| `apps/api/src/libs/transaction-context.ts`, `pg-error.ts`, `http-error.factory.ts` (สร้าง) | transaction ปัจจุบัน, รหัสข้อผิดพลาด PostgreSQL, แปลง domain error เป็น HTTP |
| `apps/api/src/infrastructure/database/**` (ย้ายจาก `db/`) | `columns.ts`, `migrate.ts`, `seed.ts`, `schema/index.ts`, `schema/categories.ts` |
| `apps/api/src/domains/errors/*.ts`, `category.domain.ts` (สร้าง) | domain error และ entity แรก |
| `apps/api/src/modules/tokens.ts`, `di-registrations.ts` (สร้าง) | DI token ร่วม และจุดลงทะเบียนโมดูล |
| `apps/api/src/modules/shared/**` (สร้าง) | port และ adapter ของ `IUnitOfWork` |
| `apps/api/src/modules/categories/**` (สร้าง) | โมดูลแรกในโครงใหม่ |
| `apps/api/src/modules/catalog/categories/**` (ลบ) | โค้ดเดิมของหมวดหมู่ |

---

### Task 0: เงื่อนไขก่อนเริ่มและ branch

- [ ] **Step 1: ตรวจว่าชิ้นงานที่ 1 อยู่ใน `main` แล้ว**

```bash
git switch main
git status --short
ls .github/workflows/ci.yml apps/api/test/harness.ts
bun run db:up
bun run typecheck && bun run lint && bun run test
```

Expected: `git status --short` ไม่มีผลลัพธ์, ไฟล์ทั้งสองมีอยู่ และทุกคำสั่งจบด้วย exit code 0
ถ้าข้อใดไม่ผ่าน ให้หยุดและรายงาน ห้ามเริ่มแผนนี้บนฐานที่ยังไม่พร้อม

- [ ] **Step 2: สร้าง branch**

```bash
git switch -c ohmattpon/hexagonal-architecture
```

---

### Task 1: ย้ายการทดสอบ integration และปักพฤติกรรมของหมวดหมู่

การทดสอบหมวดหมู่ที่มีอยู่ตรวจแค่สิทธิ์ ต้องปักพฤติกรรมให้ครบก่อนแตะโค้ด

**Files:**
- Create: `apps/api/test/move-integration-tests.ts` (ใช้ครั้งเดียวแล้วลบ)
- Move: ไฟล์ทดสอบที่ import `test/harness` จาก `apps/api/src/modules/**` ไป `apps/api/src/__tests__/integration/`
- Create: `apps/api/src/__tests__/integration/categories.integration.test.ts`
- Create: `apps/api/test/openapi-snapshot.ts`, `apps/api/test/openapi-baseline.json`
- Modify: `apps/api/package.json` (สคริปต์ `test:unit`, `openapi:check`), `package.json` ที่ root (สคริปต์ `test:unit`)

**Interfaces:**
- Produces: ข้อตกลงชื่อไฟล์ การทดสอบ integration อยู่ใน `src/__tests__/integration/` และลงท้าย `.integration.test.ts` การทดสอบ unit อยู่ข้างไฟล์ที่ทดสอบและลงท้าย `.test.ts`
- Produces: คำสั่ง `bun run openapi:check` (ใน `apps/api`) ที่ล้มเหลวเมื่อเอกสาร OpenAPI ต่างจาก baseline

- [ ] **Step 1: เขียนสคริปต์ย้ายไฟล์**

สร้าง `apps/api/test/move-integration-tests.ts`:

```ts
// One-off: moves every test that uses the HTTP harness into src/__tests__/integration.
import { mkdir, rename } from 'node:fs/promises'
import { basename, join } from 'node:path'

const target = 'src/__tests__/integration'
await mkdir(target, { recursive: true })

const harnessImport = /(['"])(?:\.\.\/)+test\/harness\1/g

for await (const path of new Bun.Glob('src/modules/**/*.test.ts').scan('.')) {
  const source = await Bun.file(path).text()
  if (!harnessImport.test(source)) continue // a unit test: stays next to its subject
  harnessImport.lastIndex = 0

  const destination = join(target, basename(path).replace(/\.test\.ts$/, '.integration.test.ts'))
  // Every file in the target folder sits three levels below apps/api.
  await Bun.write(path, source.replace(harnessImport, "'../../../test/harness'"))
  await rename(path, destination)
  console.log(`${path} -> ${destination}`)
}
```

- [ ] **Step 2: รันสคริปต์และลบทิ้ง**

```bash
cd apps/api
bun test/move-integration-tests.ts
find src/modules -name '*.test.ts'
git rm -q --cached test/move-integration-tests.ts 2>/dev/null; rm test/move-integration-tests.ts
cd ../..
```

Expected: สคริปต์พิมพ์รายการไฟล์ที่ย้าย และ `find` เหลือเฉพาะ `src/modules/sales/pricing.test.ts`

- [ ] **Step 3: ตรวจว่าการย้ายแก้เฉพาะบรรทัด import**

```bash
git add -A apps/api/src
git diff --cached -M --stat
git diff --cached -M | grep '^[+-]' | grep -v '^+++\|^---' | grep -v "test/harness'"
```

Expected: คำสั่งสุดท้ายไม่มีผลลัพธ์ (บรรทัดที่เปลี่ยนมีแต่บรรทัด import ของ harness)

- [ ] **Step 4: เขียนการทดสอบของหมวดหมู่**

สร้าง `apps/api/src/__tests__/integration/categories.integration.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { client, ok, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

describe('categories', () => {
  test('a created category gets defaults and exactly the public fields', async () => {
    const created = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))

    expect(created).toEqual({ id: expect.any(Number), name: 'เครื่องดื่ม', sortOrder: 0, isActive: true })
  })

  test('the list is ordered by sort order, then name, and includes inactive categories', async () => {
    const snacks = ok(await owner.api.catalog.categories.post({ name: 'Snacks', sortOrder: 2 }))
    ok(await owner.api.catalog.categories.post({ name: 'Drinks', sortOrder: 1 }))
    ok(await owner.api.catalog.categories.post({ name: 'Bakery', sortOrder: 2 }))
    ok(await owner.api.catalog.categories({ id: snacks.id }).patch({ isActive: false }))

    const listed = ok(await owner.api.catalog.categories.get())

    expect(listed.map((category) => [category.name, category.isActive])).toEqual([
      ['Drinks', true],
      ['Bakery', true],
      ['Snacks', false],
    ])
  })

  test('any signed-in user can list, anonymous users cannot', async () => {
    const cashier = await signIn('cashier')

    expect((await cashier.api.catalog.categories.get()).status).toBe(200)
    expect((await client().catalog.categories.get()).status).toBe(401)
  })

  test('a partial update changes only the given fields', async () => {
    const created = ok(await owner.api.catalog.categories.post({ name: 'Drinks', sortOrder: 3 }))

    const renamed = ok(await owner.api.catalog.categories({ id: created.id }).patch({ name: 'Beverages' }))
    const reordered = ok(await owner.api.catalog.categories({ id: created.id }).patch({ sortOrder: 7 }))

    expect(renamed).toEqual({ id: created.id, name: 'Beverages', sortOrder: 3, isActive: true })
    expect(reordered).toEqual({ id: created.id, name: 'Beverages', sortOrder: 7, isActive: true })
  })

  test('a duplicate name is a conflict on create and on rename', async () => {
    ok(await owner.api.catalog.categories.post({ name: 'Drinks' }))
    const snacks = ok(await owner.api.catalog.categories.post({ name: 'Snacks' }))

    const created = await owner.api.catalog.categories.post({ name: 'Drinks' })
    const renamed = await owner.api.catalog.categories({ id: snacks.id }).patch({ name: 'Drinks' })

    expect(created.status).toBe(409)
    expect(created.error?.value).toEqual({ code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' })
    expect(renamed.status).toBe(409)
    expect(renamed.error?.value).toEqual({ code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' })
    expect(ok(await owner.api.catalog.categories.get()).map((category) => category.name)).toEqual(['Drinks', 'Snacks'])
  })

  test('updating an unknown category is not found', async () => {
    const result = await owner.api.catalog.categories({ id: 9999 }).patch({ name: 'Ghost' })

    expect(result.status).toBe(404)
    expect(result.error?.value).toEqual({ code: 'NOT_FOUND', message: 'ไม่พบหมวดหมู่' })
  })

  test('an empty or over-long name is a validation error', async () => {
    const empty = await owner.api.catalog.categories.post({ name: '' })
    const tooLong = await owner.api.catalog.categories.post({ name: 'x'.repeat(101) })

    expect(empty.status).toBe(422)
    expect(empty.error?.value).toMatchObject({ code: 'VALIDATION' })
    expect(tooLong.status).toBe(422)
    expect(ok(await owner.api.catalog.categories.get())).toHaveLength(0)
  })

  test('a name of exactly 100 characters is accepted', async () => {
    const name = 'x'.repeat(100)

    expect(ok(await owner.api.catalog.categories.post({ name })).name).toBe(name)
  })
})
```

- [ ] **Step 5: รันกับโค้ดเดิม**

Run: `bun run test`
Expected: PASS ทุกกรณี รวมกรณีใหม่ 8 กรณี ถ้ากรณีใหม่ข้อใดล้มเหลว แปลว่าการทดสอบอธิบายพฤติกรรมเดิมผิด ให้แก้การทดสอบให้ตรงกับพฤติกรรมจริง ห้ามแก้โค้ด

- [ ] **Step 6: เขียนตัวเทียบเอกสาร OpenAPI**

สร้าง `apps/api/test/openapi-snapshot.ts`:

```ts
// Usage: bun --env-file=.env.test test/openapi-snapshot.ts write|check
// Guards the public contract while the internals are restructured.
import { app } from '../src/app'

const baselinePath = new URL('./openapi-baseline.json', import.meta.url)

// Key order is not part of the contract; sort so only real differences show up.
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortKeys(child)]),
  )
}

const response = await app.handle(new Request('http://localhost/openapi/json'))
const current = JSON.stringify(sortKeys(await response.json()), null, 2) + '\n'

if (Bun.argv[2] === 'write') {
  await Bun.write(baselinePath, current)
  console.log('OpenAPI baseline written')
} else {
  const baseline = await Bun.file(baselinePath).text()
  if (baseline !== current) {
    await Bun.write(new URL('./openapi-current.json', import.meta.url), current)
    console.error('OpenAPI document differs from test/openapi-baseline.json (current written to test/openapi-current.json)')
    process.exit(1)
  }
  console.log('OpenAPI document matches the baseline')
}
process.exit(0)
```

ใน `apps/api/package.json` เพิ่มสองบรรทัดนี้ในส่วน `scripts` ถัดจากบรรทัด `"test"`:

```json
    "test:unit": "bun --env-file=.env.test test src/domains src/libs src/modules",
    "openapi:check": "bun --env-file=.env.test test/openapi-snapshot.ts check",
```

ใน `package.json` ที่ root เพิ่มบรรทัดนี้ในส่วน `scripts` ถัดจากบรรทัด `"test"`:

```json
    "test:unit": "bun run --filter @pos/api test:unit",
```

เพิ่มบรรทัดนี้ท้ายไฟล์ `.gitignore` ที่ root:

```
apps/api/test/openapi-current.json
```

- [ ] **Step 7: บันทึก baseline จากโค้ดเดิม**

```bash
cd apps/api
bun --env-file=.env.test test/openapi-snapshot.ts write
bun run openapi:check
cd ../..
```

Expected: `OpenAPI baseline written` แล้ว `OpenAPI document matches the baseline`

- [ ] **Step 8: Commit**

```bash
bun run typecheck && bun run lint && bun run test
git add -A apps/api package.json .gitignore
git status --short
gitcz --non-interactive --type=test --scope=api --subject="move integration tests and pin category behaviour before restructuring" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ย้ายไฟล์โครงพื้นฐานไปตำแหน่งใหม่

ย้ายที่อย่างเดียว ไม่เปลี่ยนเนื้อหานอกจากบรรทัด import

**Files:**
- Move: `src/config/env.ts` → `src/libs/env.ts`
- Move: `src/db/client.ts` → `src/libs/db.ts`
- Move: `src/db/columns.ts`, `migrate.ts`, `seed.ts` → `src/infrastructure/database/`
- Move: `src/db/schema.ts` → `src/infrastructure/database/schema/index.ts`
- Move: `src/modules/catalog/categories/schema.ts` → `src/infrastructure/database/schema/categories.ts`
- Modify: ทุกไฟล์ที่ import ไฟล์ข้างบน, `apps/api/drizzle.config.ts`, `apps/api/package.json`

**Interfaces:**
- Produces: `src/libs/db.ts` ส่งออก `client`, `db`, `type Db`, `type Tx`, `type Executor` เหมือนเดิม
- Produces: `src/libs/env.ts` ส่งออก `env` เหมือนเดิม
- Produces: `src/infrastructure/database/schema/categories.ts` ส่งออกตาราง `categories`

- [ ] **Step 1: ย้ายไฟล์**

```bash
cd apps/api
mkdir -p src/libs src/infrastructure/database/schema
git mv src/config/env.ts src/libs/env.ts
git mv src/db/client.ts src/libs/db.ts
git mv src/db/columns.ts src/infrastructure/database/columns.ts
git mv src/db/migrate.ts src/infrastructure/database/migrate.ts
git mv src/db/seed.ts src/infrastructure/database/seed.ts
git mv src/db/schema.ts src/infrastructure/database/schema/index.ts
git mv src/modules/catalog/categories/schema.ts src/infrastructure/database/schema/categories.ts
cd ../..
```

- [ ] **Step 2: เขียนสคริปต์แก้ import**

สร้าง `apps/api/test/rewrite-imports.ts` (ใช้ครั้งเดียวแล้วลบ):

```ts
// One-off: points imports at the relocated infrastructure files.
// Old and new locations are both rooted at src/, so the leading ../ segments stay valid.
const rewrites: [RegExp, string][] = [
  [/\/config\/env(['"])/g, '/libs/env$1'],
  [/\/db\/client(['"])/g, '/libs/db$1'],
  [/\/db\/columns(['"])/g, '/infrastructure/database/columns$1'],
  [/\/db\/schema(['"])/g, '/infrastructure/database/schema$1'],
]

for (const pattern of ['src/**/*.ts', 'test/**/*.ts']) {
  for await (const path of new Bun.Glob(pattern).scan('.')) {
    const before = await Bun.file(path).text()
    const after = rewrites.reduce((text, [from, to]) => text.replace(from, to), before)
    if (after !== before) {
      await Bun.write(path, after)
      console.log(`rewrote ${path}`)
    }
  }
}
```

```bash
cd apps/api
bun test/rewrite-imports.ts
rm test/rewrite-imports.ts
cd ../..
```

- [ ] **Step 3: แก้ import ภายในไฟล์ที่ย้าย**

แก้ด้วยมือให้เป็นตามนี้ทุกบรรทัด:

`apps/api/src/libs/db.ts` สองบรรทัด import:

```ts
import { env } from './env'
import * as schema from '../infrastructure/database/schema'
```

`apps/api/src/infrastructure/database/migrate.ts`:

```ts
import { client, db } from '../../libs/db'
```

`apps/api/src/infrastructure/database/schema/index.ts` ทั้งไฟล์:

```ts
// Tables move here module by module during the hexagonal migration; the rest still live with their module.
export * from './categories'
export * from '../../../modules/users/schema'
export * from '../../../modules/catalog/products/schema'
export * from '../../../modules/inventory/schema'
export * from '../../../modules/sales/schema'
```

`apps/api/src/infrastructure/database/schema/categories.ts` บรรทัด import ของ columns:

```ts
import { id, timestamps } from '../columns'
```

`apps/api/src/infrastructure/database/seed.ts`: ทุก import ที่ขึ้นต้น `'../modules/` เปลี่ยนเป็น `'../../modules/` และ `import { client, db } from './client'` เปลี่ยนเป็น `import { client, db } from '../../libs/db'`

`apps/api/src/modules/catalog/categories/service.ts`:

```ts
import { categories } from '../../../infrastructure/database/schema/categories'
```

`apps/api/src/modules/catalog/products/schema.ts`:

```ts
import { categories } from '../../../infrastructure/database/schema/categories'
```

- [ ] **Step 4: แก้ค่าตั้งค่าที่อ้างตำแหน่งเดิม**

`apps/api/drizzle.config.ts`:

```ts
  schema: './src/infrastructure/database/schema/index.ts',
```

`apps/api/package.json`:

```json
    "db:migrate": "bun --env-file=../../.env src/infrastructure/database/migrate.ts",
    "db:seed": "bun --env-file=../../.env src/infrastructure/database/seed.ts",
```

`apps/api/test/setup.ts`: แก้คอมเมนต์ `src/config/env` เป็น `src/libs/env`

- [ ] **Step 5: ตรวจ**

```bash
ls apps/api/src/db apps/api/src/config 2>&1
grep -rn "config/env\|db/client\|db/columns\|db/schema" apps/api/src apps/api/test apps/api/drizzle.config.ts apps/api/package.json
bun run typecheck && bun run lint && bun run test
cd apps/api && bun run openapi:check && bun run db:generate && cd ../..
```

Expected: `ls` รายงานว่าไม่พบทั้งสองโฟลเดอร์, `grep` ไม่มีผลลัพธ์, ทุกคำสั่งผ่าน, `openapi:check` ตรงกับ baseline และ `db:generate` รายงาน `No schema changes`

- [ ] **Step 6: Commit**

```bash
git add -A apps/api
gitcz --non-interactive --type=refactor --scope=api --subject="move env, db and schema bootstrap into libs and infrastructure" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dependency Injection และการทดสอบ unit ที่ไม่ต้องมีฐานข้อมูล

**Files:**
- Modify: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/web/tsconfig.app.json`, `apps/api/src/app.ts`, `apps/api/test/setup.ts`, `apps/api/test/harness.ts`
- Create: `apps/api/src/modules/tokens.ts`
- Test: `apps/api/src/libs/di.test.ts`

**Interfaces:**
- Produces: `TOKENS` จาก `apps/api/src/modules/tokens.ts` เป็นอ็อบเจกต์ของ DI token ที่ใช้ร่วม เริ่มด้วย `TOKENS.UnitOfWork: string`
- Produces: `bun run test:unit` รันได้โดยไม่ต่อฐานข้อมูล

- [ ] **Step 1: เขียนการทดสอบที่พิสูจน์ว่า decorator และ DI ทำงานบน Bun**

สร้าง `apps/api/src/libs/di.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { container, inject, injectable } from 'tsyringe'

interface IGreeter {
  greet(name: string): string
}

const greeterToken = Symbol('IGreeter').toString()

@injectable()
class ThaiGreeter implements IGreeter {
  greet(name: string) {
    return `สวัสดี ${name}`
  }
}

@injectable()
class WelcomeUseCase {
  constructor(@inject(greeterToken) private readonly greeter: IGreeter) {}

  execute(name: string) {
    return this.greeter.greet(name)
  }
}

@injectable()
class WelcomeController {
  constructor(@inject(WelcomeUseCase) private readonly welcome: WelcomeUseCase) {}

  handle(name: string) {
    return this.welcome.execute(name)
  }
}

describe('dependency injection', () => {
  test('resolves a port by token and a use case by class', () => {
    const scope = container.createChildContainer()
    scope.register(greeterToken, { useClass: ThaiGreeter })

    expect(scope.resolve(WelcomeController).handle('ร้านค้า')).toBe('สวัสดี ร้านค้า')
  })

  test('a different adapter can be bound without touching the use case', () => {
    const scope = container.createChildContainer()
    scope.register<IGreeter>(greeterToken, { useValue: { greet: (name) => `Hello ${name}` } })

    expect(scope.resolve(WelcomeUseCase).execute('shop')).toBe('Hello shop')
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `bun run test:unit`
Expected: FAIL เพราะไม่พบแพ็กเกจ `tsyringe`

- [ ] **Step 3: ติดตั้ง dependency และเปิด decorator**

```bash
cd apps/api && bun add tsyringe reflect-metadata zod && cd ../..
```

ใน `apps/api/tsconfig.json` เพิ่มสองบรรทัดนี้ในกลุ่ม `// Environment setup & latest features` ถัดจากบรรทัด `"types": ["bun"],`:

```json
    // Required by tsyringe's constructor injection.
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
```

ใน `apps/web/tsconfig.app.json` ลบบรรทัด `"erasableSyntaxOnly": true,` และเพิ่มสามบรรทัดนี้ถัดจากบรรทัด `"strict": true,`:

```json
    // The API's source is type-checked here through the Eden `App` type, and it uses decorators.
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
```

- [ ] **Step 4: โหลด reflect-metadata ก่อนทุกอย่าง และทำให้การเตรียมฐานข้อมูลเกิดเมื่อจำเป็น**

`apps/api/src/app.ts` เพิ่มเป็นบรรทัดแรกของไฟล์:

```ts
import 'reflect-metadata'
```

`apps/api/test/setup.ts` แทนทั้งไฟล์ด้วย:

```ts
// Preloaded for every `bun test` run, including unit tests, so it must not need a database.
import 'reflect-metadata'
import { fakeMedia } from './media-server'

// Must happen before anything imports src/libs/env, which reads the environment once.
Bun.env.MEDIA_URL = fakeMedia.url
```

`apps/api/test/harness.ts`: เพิ่ม import สองบรรทัดนี้ต่อจาก import ที่มีอยู่ และแก้บรรทัด import ของ `./database` กับ `../src/libs/db` ให้เป็นตามนี้:

```ts
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { client as sqlClient, db } from '../src/libs/db'
import { assertConnectedTestDatabase, ensureTestDatabase } from './database'
```

แล้วเพิ่มบล็อกนี้ก่อนบรรทัด `app.listen(0)`:

```ts
// Integration tests reach the database through this module, so it is prepared here
// rather than in the preload script, which unit tests also load.
await ensureTestDatabase()
await assertConnectedTestDatabase(sqlClient)
await migrate(db, { migrationsFolder: './drizzle' })
```

- [ ] **Step 5: สร้างที่เก็บ token ร่วม**

สร้าง `apps/api/src/modules/tokens.ts`:

```ts
/** DI tokens for ports shared by more than one module. Module-owned tokens live beside their port. */
export const TOKENS = {
  UnitOfWork: Symbol('IUnitOfWork').toString(),
} as const
```

- [ ] **Step 6: รันให้ผ่าน**

Run: `bun run test:unit`
Expected: PASS กรณีใน `di.test.ts` 2 กรณี และ `pricing.test.ts` 8 กรณี

- [ ] **Step 7: พิสูจน์ว่าการทดสอบ unit ไม่ต้องมีฐานข้อมูล**

Run (PowerShell): `$env:DATABASE_URL='postgres://pos:pos@localhost:1/pos_test'; bun run test:unit; Remove-Item Env:DATABASE_URL`
Run (bash): `DATABASE_URL=postgres://pos:pos@localhost:1/pos_test bun run test:unit`
Expected: PASS เท่ากับ Step 6 แม้ฐานข้อมูลเข้าไม่ถึง

- [ ] **Step 8: ตรวจทั้งระบบ รวมถึง type ของหน้าเว็บ**

```bash
bun run typecheck && bun run lint && bun run test
cd apps/web && bun run build && cd ../..
cd apps/api && bun run openapi:check && cd ../..
```

Expected: ผ่านทั้งหมด ถ้า `@pos/web typecheck` ล้มเหลวด้วยข้อผิดพลาดเรื่อง decorator ใน `apps/api/src/libs/di.test.ts` ให้ตรวจว่าแก้ `tsconfig.app.json` ครบตาม Step 3

- [ ] **Step 9: Commit**

```bash
git add -A apps/api apps/web/tsconfig.app.json bun.lock
gitcz --non-interactive --type=build --scope=api --subject="add tsyringe, decorators and database-free unit test runs" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Domain error และการแปลงเป็น HTTP

**Files:**
- Create: `apps/api/src/domains/errors/domain-error.ts`, `domain-unauthorized.error.ts`, `domain-forbidden.error.ts`, `domain-not-found.error.ts`, `domain-conflict.error.ts`, `domain-external-service.error.ts`
- Create: `apps/api/src/libs/http-error.factory.ts`
- Test: `apps/api/src/libs/http-error.factory.test.ts`
- Modify: `apps/api/src/shared/plugins/error-handler.ts`

**Interfaces:**
- Produces: `class DomainError extends Error { readonly code: string; constructor(message: string, code?: string) }` ค่าเริ่มต้นของ `code` คือ `'BAD_REQUEST'`
- Produces: คลาสย่อยที่มี constructor แบบเดียวกันและค่าเริ่มต้นของ `code` ดังนี้ `DomainUnauthorizedError` = `'UNAUTHORIZED'`, `DomainForbiddenError` = `'FORBIDDEN'`, `DomainNotFoundError` = `'NOT_FOUND'`, `DomainConflictError` = `'CONFLICT'`, `DomainExternalServiceError` = `'EXTERNAL_SERVICE'`
- Produces: `toErrorResponse(error: unknown): { status: number; body: { code: string; message: string; errors?: unknown } } | null`

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/libs/http-error.factory.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { DomainConflictError } from '../domains/errors/domain-conflict.error'
import { DomainError } from '../domains/errors/domain-error'
import { DomainExternalServiceError } from '../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../domains/errors/domain-not-found.error'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'
import { toErrorResponse } from './http-error.factory'

describe('toErrorResponse', () => {
  test.each([
    [new DomainError('ยอดชำระไม่ครบ', 'UNDERPAID'), 400, 'UNDERPAID'],
    [new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ'), 401, 'UNAUTHORIZED'],
    [new DomainForbiddenError('ไม่มีสิทธิ์ใช้งานส่วนนี้'), 403, 'FORBIDDEN'],
    [new DomainNotFoundError('ไม่พบหมวดหมู่'), 404, 'NOT_FOUND'],
    [new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE'), 409, 'DUPLICATE'],
    [new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้', 'MEDIA_UNAVAILABLE'), 502, 'MEDIA_UNAVAILABLE'],
  ])('%p maps to its status and keeps code and message', (error, status, code) => {
    expect(toErrorResponse(error)).toEqual({ status, body: { code, message: error.message } })
  })

  test('each error class has a default code', () => {
    expect(new DomainError('x').code).toBe('BAD_REQUEST')
    expect(new DomainConflictError('x').code).toBe('CONFLICT')
    expect(new DomainExternalServiceError('x').code).toBe('EXTERNAL_SERVICE')
  })

  test('the error name is the class name, so logs identify the kind', () => {
    expect(new DomainNotFoundError('x').name).toBe('DomainNotFoundError')
    expect(new DomainNotFoundError('x')).toBeInstanceOf(DomainError)
  })

  test('a zod failure maps to 422 with the issues attached', () => {
    const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' })

    expect(toErrorResponse(result.error)).toEqual({
      status: 422,
      body: { code: 'VALIDATION', message: 'ข้อมูลไม่ถูกต้อง', errors: result.error!.issues },
    })
  })

  test.each([new Error('database exploded'), new TypeError('x is undefined'), 'a string', null, undefined])(
    'anything else (%p) is not translated, so internals never leak',
    (error) => {
      expect(toErrorResponse(error)).toBeNull()
    },
  )
})
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `bun run test:unit`
Expected: FAIL เพราะไม่พบโมดูล `../domains/errors/domain-conflict.error`

- [ ] **Step 3: เขียน domain error**

สร้าง `apps/api/src/domains/errors/domain-error.ts`:

```ts
/** A business rule was broken. `code` is the stable identifier clients switch on. */
export class DomainError extends Error {
  readonly code: string

  constructor(message: string, code = 'BAD_REQUEST') {
    super(message)
    this.name = this.constructor.name
    this.code = code
  }
}
```

สร้าง `apps/api/src/domains/errors/domain-unauthorized.error.ts`:

```ts
import { DomainError } from './domain-error'

export class DomainUnauthorizedError extends DomainError {
  constructor(message: string, code = 'UNAUTHORIZED') {
    super(message, code)
  }
}
```

สร้าง `apps/api/src/domains/errors/domain-forbidden.error.ts`:

```ts
import { DomainError } from './domain-error'

export class DomainForbiddenError extends DomainError {
  constructor(message: string, code = 'FORBIDDEN') {
    super(message, code)
  }
}
```

สร้าง `apps/api/src/domains/errors/domain-not-found.error.ts`:

```ts
import { DomainError } from './domain-error'

export class DomainNotFoundError extends DomainError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, code)
  }
}
```

สร้าง `apps/api/src/domains/errors/domain-conflict.error.ts`:

```ts
import { DomainError } from './domain-error'

export class DomainConflictError extends DomainError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, code)
  }
}
```

สร้าง `apps/api/src/domains/errors/domain-external-service.error.ts`:

```ts
import { DomainError } from './domain-error'

export class DomainExternalServiceError extends DomainError {
  constructor(message: string, code = 'EXTERNAL_SERVICE') {
    super(message, code)
  }
}
```

- [ ] **Step 4: เขียนตัวแปลง**

สร้าง `apps/api/src/libs/http-error.factory.ts`:

```ts
import { ZodError } from 'zod'
import { DomainConflictError } from '../domains/errors/domain-conflict.error'
import { DomainError } from '../domains/errors/domain-error'
import { DomainExternalServiceError } from '../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../domains/errors/domain-not-found.error'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'

export interface HttpErrorResponse {
  status: number
  body: { code: string; message: string; errors?: unknown }
}

// Most specific first; plain DomainError is the 400 fallback below.
const STATUS_BY_CLASS: [new (...args: never[]) => DomainError, number][] = [
  [DomainUnauthorizedError, 401],
  [DomainForbiddenError, 403],
  [DomainNotFoundError, 404],
  [DomainConflictError, 409],
  [DomainExternalServiceError, 502],
]

/**
 * The single place where domain failures become HTTP. Returns null for anything that is
 * not a deliberate business failure, so the caller answers with a generic 500.
 */
export function toErrorResponse(error: unknown): HttpErrorResponse | null {
  if (error instanceof ZodError)
    return { status: 422, body: { code: 'VALIDATION', message: 'ข้อมูลไม่ถูกต้อง', errors: error.issues } }
  if (!(error instanceof DomainError)) return null

  const status = STATUS_BY_CLASS.find(([errorClass]) => error instanceof errorClass)?.[1] ?? 400
  return { status, body: { code: error.code, message: error.message } }
}
```

- [ ] **Step 5: ต่อเข้ากับตัวจัดการข้อผิดพลาดของ Elysia**

ใน `apps/api/src/shared/plugins/error-handler.ts` เพิ่ม import:

```ts
import { toErrorResponse } from '../../libs/http-error.factory'
```

และเพิ่มสองบรรทัดนี้ถัดจากบรรทัด `if (error instanceof AppError) return status(...)`:

```ts
    const domainFailure = toErrorResponse(error)
    if (domainFailure) return status(domainFailure.status, domainFailure.body)
```

`AppError` เดิมยังอยู่เพื่อโมดูลที่ยังไม่ย้าย

- [ ] **Step 6: รันให้ผ่าน**

Run: `bun run test:unit`
Expected: PASS ทุกกรณีใน `http-error.factory.test.ts`

- [ ] **Step 7: ตรวจทั้งระบบและ commit**

```bash
bun run typecheck && bun run lint && bun run test
git add -A apps/api
gitcz --non-interactive --type=feat --scope=api --subject="add domain errors and their single HTTP translation point" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Unit of work

พิสูจน์ความเสี่ยงที่ใหญ่ที่สุดของ spec ตั้งแต่ขั้นนี้: transaction เดียวข้าม repository หลายตัวโดยไม่ส่ง transaction เป็นพารามิเตอร์

**Files:**
- Create: `apps/api/src/libs/transaction-context.ts`
- Create: `apps/api/src/modules/shared/ports/unit-of-work.port.ts`
- Create: `apps/api/src/modules/shared/adapters/drizzle-unit-of-work.ts`
- Create: `apps/api/src/modules/shared/shared.module.ts`, `apps/api/src/modules/di-registrations.ts`
- Test: `apps/api/src/__tests__/integration/unit-of-work.integration.test.ts`

**Interfaces:**
- Consumes: `TOKENS.UnitOfWork` จาก Task 3, `db`, `type Executor`, `type Tx` จาก `src/libs/db.ts`, ตาราง `categories` จาก `src/infrastructure/database/schema/categories.ts`
- Produces: `currentExecutor(): Executor` คืน transaction ปัจจุบัน หรือ `db` เมื่อไม่ได้อยู่ใน transaction
- Produces: `runInTransaction<T>(work: () => Promise<T>): Promise<T>`
- Produces: `interface IUnitOfWork { run<T>(work: () => Promise<T>): Promise<T> }`
- Produces: `import '.../modules/di-registrations'` ลงทะเบียนทุกโมดูลกับ container (เรียกซ้ำได้)

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/__tests__/integration/unit-of-work.integration.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { resetDatabase } from '../../../test/harness'
import { categories } from '../../infrastructure/database/schema/categories'
import { currentExecutor } from '../../libs/transaction-context'
import '../../modules/di-registrations'
import type { IUnitOfWork } from '../../modules/shared/ports/unit-of-work.port'
import { TOKENS } from '../../modules/tokens'

const unitOfWork = container.resolve<IUnitOfWork>(TOKENS.UnitOfWork)

// Stand-ins for two repositories: each call picks up whatever transaction is current.
const insert = (name: string) => currentExecutor().insert(categories).values({ name })
const storedNames = async () =>
  (await currentExecutor().select({ name: categories.name }).from(categories).orderBy(categories.name)).map(
    (row) => row.name,
  )

beforeEach(() => resetDatabase())

describe('unit of work', () => {
  test('commits every write made inside it', async () => {
    await unitOfWork.run(async () => {
      await insert('A')
      await insert('B')
    })

    expect(await storedNames()).toEqual(['A', 'B'])
  })

  test('returns the value of the work', async () => {
    expect(await unitOfWork.run(async () => 42)).toBe(42)
  })

  test('rolls back every write when the work throws, and rethrows the same error', async () => {
    const failure = new Error('stock ran out')

    const attempt = unitOfWork.run(async () => {
      await insert('A')
      await insert('B')
      throw failure
    })

    await expect(attempt).rejects.toBe(failure)
    expect(await storedNames()).toEqual([])
  })

  test('writes inside see each other before commit, writes outside do not', async () => {
    await unitOfWork.run(async () => {
      await insert('A')
      expect(await storedNames()).toEqual(['A'])
    })
  })

  test('a nested run joins the outer transaction', async () => {
    const attempt = unitOfWork.run(async () => {
      await unitOfWork.run(async () => {
        await insert('inner')
      })
      throw new Error('outer failed after the inner work finished')
    })

    await expect(attempt).rejects.toThrow('outer failed')
    expect(await storedNames()).toEqual([])
  })

  test('concurrent runs are isolated: one failing does not undo the other', async () => {
    const succeeding = unitOfWork.run(async () => {
      await insert('kept')
      await Bun.sleep(20)
      await insert('kept too')
    })
    const failing = unitOfWork.run(async () => {
      await insert('discarded')
      await Bun.sleep(5)
      throw new Error('this one fails')
    })

    await expect(failing).rejects.toThrow('this one fails')
    await succeeding
    expect(await storedNames()).toEqual(['kept', 'kept too'])
  })

  test('work outside any run writes straight to the database', async () => {
    await insert('direct')

    expect(await storedNames()).toEqual(['direct'])
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `bun run test`
Expected: FAIL เพราะไม่พบโมดูล `../../libs/transaction-context`

- [ ] **Step 3: เขียน transaction context**

สร้าง `apps/api/src/libs/transaction-context.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks'
import { db, type Executor, type Tx } from './db'

const activeTransaction = new AsyncLocalStorage<Tx>()

/** What repositories query through: the transaction in progress, or the plain connection. */
export const currentExecutor = (): Executor => activeTransaction.getStore() ?? db

/** Runs `work` in one transaction. A call made while one is already open joins it. */
export function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (activeTransaction.getStore()) return work()
  return db.transaction((tx) => activeTransaction.run(tx, work))
}
```

- [ ] **Step 4: เขียน port, adapter และการลงทะเบียน**

สร้าง `apps/api/src/modules/shared/ports/unit-of-work.port.ts`:

```ts
/**
 * Groups writes across several repositories into one all-or-nothing unit.
 * Repositories called inside `run` take part automatically; nothing is passed around.
 */
export interface IUnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>
}
```

สร้าง `apps/api/src/modules/shared/adapters/drizzle-unit-of-work.ts`:

```ts
import { injectable } from 'tsyringe'
import { runInTransaction } from '../../../libs/transaction-context'
import type { IUnitOfWork } from '../ports/unit-of-work.port'

@injectable()
export class DrizzleUnitOfWork implements IUnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return runInTransaction(work)
  }
}
```

สร้าง `apps/api/src/modules/shared/shared.module.ts`:

```ts
import { container } from 'tsyringe'
import { TOKENS } from '../tokens'
import { DrizzleUnitOfWork } from './adapters/drizzle-unit-of-work'

container.register(TOKENS.UnitOfWork, { useClass: DrizzleUnitOfWork })
```

สร้าง `apps/api/src/modules/di-registrations.ts`:

```ts
// Composition root: importing this file wires every migrated module into the container.
import './shared/shared.module'
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `bun run test`
Expected: PASS ทั้ง 7 กรณีของ `unit-of-work.integration.test.ts`

ถ้ากรณี `rolls back`, `a nested run joins` หรือ `concurrent runs are isolated` ล้มเหลว แปลว่า `AsyncLocalStorage` ไม่ส่งต่อบริบทผ่าน transaction ของไดรเวอร์ Bun SQL ตามที่ spec คาด ให้หยุดและรายงานตามหัวข้อ "ความเสี่ยง" ของ spec ห้ามทำ task ถัดไป

- [ ] **Step 6: รันซ้ำเพื่อตรวจว่าผลคงที่**

Run: `bun run test && bun run test && bun run test`
Expected: PASS ทั้งสามรอบ

- [ ] **Step 7: Commit**

```bash
bun run typecheck && bun run lint
git add -A apps/api
gitcz --non-interactive --type=feat --scope=api --subject="add unit of work so one transaction can span repositories" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Category entity

**Files:**
- Create: `apps/api/src/domains/category.domain.ts`
- Test: `apps/api/src/domains/category.domain.test.ts`

**Interfaces:**
- Consumes: `DomainError` จาก Task 4
- Produces:
  - `interface CategoryEntityProps { id: number; name: string; sortOrder: number; isActive: boolean }`
  - `class CategoryEntity` มี property แบบอ่านอย่างเดียวชื่อเดียวกับ props, `with(changes: Partial<Omit<CategoryEntityProps, 'id'>>): CategoryEntity` และ `toSnapshot(): CategoryEntityProps`
  - `id` เป็น `0` สำหรับ entity ที่ยังไม่ได้บันทึก

- [ ] **Step 1: เขียนการทดสอบ**

สร้าง `apps/api/src/domains/category.domain.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { CategoryEntity } from './category.domain'
import { DomainError } from './errors/domain-error'

const valid = { id: 1, name: 'เครื่องดื่ม', sortOrder: 0, isActive: true }

describe('CategoryEntity', () => {
  test('holds its properties', () => {
    expect(new CategoryEntity(valid).toSnapshot()).toEqual(valid)
  })

  test.each(['', 'x'.repeat(101)])('rejects a name of length %#: empty or over 100 characters', (name) => {
    expect(() => new CategoryEntity({ ...valid, name })).toThrow(DomainError)
  })

  test('accepts a name of exactly 100 characters', () => {
    expect(new CategoryEntity({ ...valid, name: 'x'.repeat(100) }).name).toHaveLength(100)
  })

  test.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-integer sort order (%p)', (sortOrder) => {
    expect(() => new CategoryEntity({ ...valid, sortOrder })).toThrow(DomainError)
  })

  test('accepts a negative sort order', () => {
    expect(new CategoryEntity({ ...valid, sortOrder: -1 }).sortOrder).toBe(-1)
  })

  test('with() returns a changed copy and leaves the original alone', () => {
    const original = new CategoryEntity(valid)

    const renamed = original.with({ name: 'ขนม', isActive: false })

    expect(renamed.toSnapshot()).toEqual({ id: 1, name: 'ขนม', sortOrder: 0, isActive: false })
    expect(original.toSnapshot()).toEqual(valid)
  })

  test('with() ignores undefined fields, so a partial update keeps the rest', () => {
    const changed = new CategoryEntity(valid).with({ name: undefined, sortOrder: 5 })

    expect(changed.toSnapshot()).toEqual({ ...valid, sortOrder: 5 })
  })

  test('with() enforces the same rules as the constructor', () => {
    expect(() => new CategoryEntity(valid).with({ name: '' })).toThrow(DomainError)
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `bun run test:unit`
Expected: FAIL เพราะไม่พบโมดูล `./category.domain`

- [ ] **Step 3: เขียน entity**

สร้าง `apps/api/src/domains/category.domain.ts`:

```ts
import { DomainError } from './errors/domain-error'

export interface CategoryEntityProps {
  /** 0 until the category has been stored. */
  id: number
  name: string
  sortOrder: number
  isActive: boolean
}

const MAX_NAME_LENGTH = 100

export class CategoryEntity {
  public readonly id: number
  public readonly name: string
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: CategoryEntityProps) {
    if (props.name.length < 1 || props.name.length > MAX_NAME_LENGTH)
      throw new DomainError(`ชื่อหมวดหมู่ต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`, 'INVALID_CATEGORY')
    if (!Number.isInteger(props.sortOrder))
      throw new DomainError('ลำดับการแสดงผลต้องเป็นจำนวนเต็ม', 'INVALID_CATEGORY')

    this.id = props.id
    this.name = props.name
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; undefined fields keep their current value. */
  with(changes: Partial<Omit<CategoryEntityProps, 'id'>>): CategoryEntity {
    return new CategoryEntity({
      id: this.id,
      name: changes.name ?? this.name,
      sortOrder: changes.sortOrder ?? this.sortOrder,
      isActive: changes.isActive ?? this.isActive,
    })
  }

  toSnapshot(): CategoryEntityProps {
    return { id: this.id, name: this.name, sortOrder: this.sortOrder, isActive: this.isActive }
  }
}
```

- [ ] **Step 4: รันให้ผ่านและ commit**

Run: `bun run test:unit`
Expected: PASS ทุกกรณีใน `category.domain.test.ts`

```bash
bun run typecheck && bun run lint
git add -A apps/api
gitcz --non-interactive --type=feat --scope=categories --subject="add the category entity" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Port, schema และ use case ของ categories

**Files:**
- Create: `apps/api/src/modules/categories/applications/ports/category.repository.ts`
- Create: `apps/api/src/modules/categories/applications/schemas/category-schemas.ts`
- Create: `apps/api/src/modules/categories/applications/usecases/list-categories.usecase.ts`, `create-category.usecase.ts`, `update-category.usecase.ts`
- Create: `apps/api/src/__tests__/mocks.ts`, `apps/api/src/__tests__/factories.ts`
- Test: `apps/api/src/modules/categories/applications/usecases/list-categories.usecase.test.ts`, `create-category.usecase.test.ts`, `update-category.usecase.test.ts`

**Interfaces:**
- Consumes: `CategoryEntity` จาก Task 6, `DomainNotFoundError` จาก Task 4
- Produces:
  - `interface ICategoryRepository { findAll(): Promise<CategoryEntity[]>; findById(id: number): Promise<CategoryEntity | null>; create(entity: CategoryEntity): Promise<CategoryEntity>; update(entity: CategoryEntity): Promise<CategoryEntity> }`
  - `categoryRepositoryToken: string`
  - `ListCategoriesUseCase.execute(): Promise<CategoryEntity[]>`
  - `CreateCategoryUseCase.execute(input: unknown): Promise<CategoryEntity>`
  - `UpdateCategoryUseCase.execute(id: number, input: unknown): Promise<CategoryEntity>`
  - `mockCategoryRepository()` จาก `src/__tests__/mocks.ts` และ `makeCategory(overrides?)` จาก `src/__tests__/factories.ts`

- [ ] **Step 1: เขียน port**

สร้าง `apps/api/src/modules/categories/applications/ports/category.repository.ts`:

```ts
import type { CategoryEntity } from '../../../../domains/category.domain'

export interface ICategoryRepository {
  /** Every category, active or not, ordered by sort order then name. */
  findAll(): Promise<CategoryEntity[]>
  findById(id: number): Promise<CategoryEntity | null>
  /** Stores a new category and returns it with its assigned id. Throws DomainConflictError on a duplicate name. */
  create(entity: CategoryEntity): Promise<CategoryEntity>
  /** Overwrites the stored category that has the entity's id. Throws DomainConflictError on a duplicate name. */
  update(entity: CategoryEntity): Promise<CategoryEntity>
}

const categoryRepositoryTokenSymbol: unique symbol = Symbol('ICategoryRepository')
export const categoryRepositoryToken = categoryRepositoryTokenSymbol.toString()
```

- [ ] **Step 2: เขียนตัวช่วยของการทดสอบ unit**

สร้าง `apps/api/src/__tests__/factories.ts`:

```ts
import { CategoryEntity, type CategoryEntityProps } from '../domains/category.domain'

export const makeCategory = (overrides: Partial<CategoryEntityProps> = {}) =>
  new CategoryEntity({ id: 1, name: 'เครื่องดื่ม', sortOrder: 0, isActive: true, ...overrides })
```

สร้าง `apps/api/src/__tests__/mocks.ts`:

```ts
import { mock, type Mock } from 'bun:test'
import type { ICategoryRepository } from '../modules/categories/applications/ports/category.repository'

/** A port whose every method is a bun mock with that method's signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches any method signature
type Mocked<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : T[K] }

export const mockCategoryRepository = (): Mocked<ICategoryRepository> => ({
  findAll: mock<ICategoryRepository['findAll']>(),
  findById: mock<ICategoryRepository['findById']>(),
  create: mock<ICategoryRepository['create']>(),
  update: mock<ICategoryRepository['update']>(),
})
```

- [ ] **Step 3: เขียนการทดสอบของ use case**

สร้าง `apps/api/src/modules/categories/applications/usecases/list-categories.usecase.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository } from '../../../../__tests__/mocks'
import { ListCategoriesUseCase } from './list-categories.usecase'

describe('ListCategoriesUseCase', () => {
  test('returns the repository result unchanged', async () => {
    const repo = mockCategoryRepository()
    const stored = [makeCategory({ id: 1 }), makeCategory({ id: 2, name: 'ขนม' })]
    repo.findAll.mockResolvedValue(stored)

    expect(await new ListCategoriesUseCase(repo).execute()).toBe(stored)
  })
})
```

สร้าง `apps/api/src/modules/categories/applications/usecases/create-category.usecase.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository } from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { CreateCategoryUseCase } from './create-category.usecase'

describe('CreateCategoryUseCase', () => {
  let repo: ReturnType<typeof mockCategoryRepository>
  let useCase: CreateCategoryUseCase

  beforeEach(() => {
    repo = mockCategoryRepository()
    repo.create.mockImplementation(async (entity) => makeCategory({ ...entity.toSnapshot(), id: 7 }))
    useCase = new CreateCategoryUseCase(repo)
  })

  test('stores a new active category and returns it with its id', async () => {
    const created = await useCase.execute({ name: 'เครื่องดื่ม', sortOrder: 3 })

    expect(created.toSnapshot()).toEqual({ id: 7, name: 'เครื่องดื่ม', sortOrder: 3, isActive: true })
    expect(repo.create.mock.calls[0]![0].toSnapshot()).toEqual({ id: 0, name: 'เครื่องดื่ม', sortOrder: 3, isActive: true })
  })

  test('sort order defaults to 0', async () => {
    expect((await useCase.execute({ name: 'ขนม' })).sortOrder).toBe(0)
  })

  test.each([
    ['a missing name', {}],
    ['an empty name', { name: '' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['a non-string name', { name: 42 }],
    ['a fractional sort order', { name: 'ขนม', sortOrder: 1.5 }],
    ['input that is not an object', 'ขนม'],
  ])('rejects %s without touching the repository', async (_label, input) => {
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('ignores fields a caller must not set, such as isActive and id', async () => {
    const created = await useCase.execute({ name: 'ขนม', isActive: false, id: 99 })

    expect(created.isActive).toBe(true)
    expect(repo.create.mock.calls[0]![0].id).toBe(0)
  })

  test('lets a duplicate-name conflict from the repository through', async () => {
    const conflict = new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')
    repo.create.mockRejectedValue(conflict)

    await expect(useCase.execute({ name: 'ขนม' })).rejects.toBe(conflict)
  })
})
```

สร้าง `apps/api/src/modules/categories/applications/usecases/update-category.usecase.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository } from '../../../../__tests__/mocks'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { UpdateCategoryUseCase } from './update-category.usecase'

describe('UpdateCategoryUseCase', () => {
  let repo: ReturnType<typeof mockCategoryRepository>
  let useCase: UpdateCategoryUseCase

  beforeEach(() => {
    repo = mockCategoryRepository()
    repo.findById.mockResolvedValue(makeCategory({ id: 4, name: 'เครื่องดื่ม', sortOrder: 2 }))
    repo.update.mockImplementation(async (entity) => entity)
    useCase = new UpdateCategoryUseCase(repo)
  })

  test('changes only the given fields', async () => {
    const updated = await useCase.execute(4, { name: 'น้ำ' })

    expect(updated.toSnapshot()).toEqual({ id: 4, name: 'น้ำ', sortOrder: 2, isActive: true })
    expect(repo.findById).toHaveBeenCalledWith(4)
  })

  test('can deactivate a category', async () => {
    expect((await useCase.execute(4, { isActive: false })).isActive).toBe(false)
  })

  test('an empty change set stores the category unchanged', async () => {
    const updated = await useCase.execute(4, {})

    expect(updated.toSnapshot()).toEqual({ id: 4, name: 'เครื่องดื่ม', sortOrder: 2, isActive: true })
  })

  test('an unknown id is not found, and nothing is written', async () => {
    repo.findById.mockResolvedValue(null)

    const attempt = useCase.execute(9999, { name: 'ผี' })

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบหมวดหมู่' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['a fractional sort order', { sortOrder: 0.5 }],
    ['a non-boolean isActive', { isActive: 'yes' }],
  ])('rejects %s before reading or writing', async (_label, input) => {
    await expect(useCase.execute(4, input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.findById).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('cannot change the id', async () => {
    const updated = await useCase.execute(4, { id: 99, name: 'น้ำ' })

    expect(updated.id).toBe(4)
  })
})
```

- [ ] **Step 4: รันให้เห็นว่าล้มเหลว**

Run: `bun run test:unit`
Expected: FAIL เพราะไม่พบโมดูล `./list-categories.usecase`

- [ ] **Step 5: เขียน schema ของ input**

สร้าง `apps/api/src/modules/categories/applications/schemas/category-schemas.ts`:

```ts
import { z } from 'zod'

const name = z.string().min(1).max(100)
const sortOrder = z.number().int()

// z.object() drops unknown keys, so callers cannot set id or (on create) isActive.
export const createCategorySchema = z.object({
  name,
  sortOrder: sortOrder.optional(),
})

export const updateCategorySchema = z
  .object({
    name,
    sortOrder,
    isActive: z.boolean(),
  })
  .partial()
```

- [ ] **Step 6: เขียน use case**

สร้าง `apps/api/src/modules/categories/applications/usecases/list-categories.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { categoryRepositoryToken } from '../ports/category.repository'
import type { ICategoryRepository } from '../ports/category.repository'

/** Query. */
@injectable()
export class ListCategoriesUseCase {
  constructor(@inject(categoryRepositoryToken) private readonly categories: ICategoryRepository) {}

  execute() {
    return this.categories.findAll()
  }
}
```

สร้าง `apps/api/src/modules/categories/applications/usecases/create-category.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { CategoryEntity } from '../../../../domains/category.domain'
import { categoryRepositoryToken } from '../ports/category.repository'
import type { ICategoryRepository } from '../ports/category.repository'
import { createCategorySchema } from '../schemas/category-schemas'

/** Command. */
@injectable()
export class CreateCategoryUseCase {
  constructor(@inject(categoryRepositoryToken) private readonly categories: ICategoryRepository) {}

  async execute(input: unknown) {
    const dto = createCategorySchema.parse(input)

    return this.categories.create(
      new CategoryEntity({ id: 0, name: dto.name, sortOrder: dto.sortOrder ?? 0, isActive: true }),
    )
  }
}
```

สร้าง `apps/api/src/modules/categories/applications/usecases/update-category.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { categoryRepositoryToken } from '../ports/category.repository'
import type { ICategoryRepository } from '../ports/category.repository'
import { updateCategorySchema } from '../schemas/category-schemas'

/** Command. */
@injectable()
export class UpdateCategoryUseCase {
  constructor(@inject(categoryRepositoryToken) private readonly categories: ICategoryRepository) {}

  async execute(id: number, input: unknown) {
    const changes = updateCategorySchema.parse(input)

    const existing = await this.categories.findById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบหมวดหมู่')

    return this.categories.update(existing.with(changes))
  }
}
```

- [ ] **Step 7: รันให้ผ่านและ commit**

Run: `bun run test:unit`
Expected: PASS ทุกกรณีของ use case ทั้งสามไฟล์

```bash
bun run typecheck && bun run lint
git add -A apps/api
gitcz --non-interactive --type=feat --scope=categories --subject="add category port, input schemas and use cases" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Adapter ของ categories และการเปลี่ยนเส้นทางให้ใช้โครงใหม่

**Files:**
- Create: `apps/api/src/libs/pg-error.ts`
- Create: `apps/api/src/modules/categories/adapters/repository/category.drizzle.repository.ts`
- Create: `apps/api/src/modules/categories/adapters/controllers/schemas/category.schema.ts`
- Create: `apps/api/src/modules/categories/adapters/controllers/category.controller.ts`
- Create: `apps/api/src/modules/categories/categories.module.ts`
- Modify: `apps/api/src/modules/di-registrations.ts`, `apps/api/src/modules/catalog/index.ts`, `apps/api/src/infrastructure/database/seed.ts`, `apps/api/src/__tests__/integration/categories.integration.test.ts`
- Delete: `apps/api/src/modules/catalog/categories/index.ts`, `model.ts`, `service.ts`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 4–7, `currentExecutor` จาก Task 5, plugin `auth` จาก `src/shared/plugins/auth.ts`, `idParams` จาก `src/shared/models.ts`
- Produces: `CategoryElysiaController.getRoutes()` คืน Elysia instance ที่มี prefix `/categories` ซึ่ง `modules/catalog/index.ts` นำไป `.use()`
- Produces: `isUniqueViolation(error: unknown): boolean` จาก `src/libs/pg-error.ts`

- [ ] **Step 1: เพิ่มการทดสอบของผลต่างที่ยอมรับ (ต้องล้มเหลวกับโค้ดเดิม)**

ใน `apps/api/src/__tests__/integration/categories.integration.test.ts` เพิ่มกรณีนี้ต่อท้ายใน `describe('categories', ...)`:

```ts
  test('an update with no fields returns the category unchanged', async () => {
    const created = ok(await owner.api.catalog.categories.post({ name: 'Drinks', sortOrder: 3 }))

    const unchanged = ok(await owner.api.catalog.categories({ id: created.id }).patch({}))

    expect(unchanged).toEqual(created)
  })
```

Run: `bun run test`
Expected: FAIL เฉพาะกรณีนี้ ด้วยสถานะ 500 (พฤติกรรมเดิมตามตาราง "ผลต่างพฤติกรรมที่ยอมรับ")

- [ ] **Step 2: เขียนตัวตรวจรหัสข้อผิดพลาดของ PostgreSQL**

สร้าง `apps/api/src/libs/pg-error.ts`:

```ts
const UNIQUE_VIOLATION = '23505'

// Drizzle wraps driver errors, so the PostgreSQL code lives on `cause`.
const codeOf = (error: unknown): unknown => {
  const source = (error as { cause?: unknown } | null)?.cause ?? error
  return (source as { errno?: unknown } | null)?.errno
}

export const isUniqueViolation = (error: unknown) => codeOf(error) === UNIQUE_VIOLATION
```

- [ ] **Step 3: เขียน repository**

สร้าง `apps/api/src/modules/categories/adapters/repository/category.drizzle.repository.ts`:

```ts
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { CategoryEntity } from '../../../../domains/category.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { categories } from '../../../../infrastructure/database/schema/categories'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { ICategoryRepository } from '../../applications/ports/category.repository'

const columns = {
  id: categories.id,
  name: categories.name,
  sortOrder: categories.sortOrder,
  isActive: categories.isActive,
}

// Same code and message the API has always answered for a duplicate value.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

@injectable()
export class DrizzleCategoryRepository implements ICategoryRepository {
  async findAll() {
    const rows = await currentExecutor()
      .select(columns)
      .from(categories)
      .orderBy(categories.sortOrder, categories.name)
    return rows.map((row) => new CategoryEntity(row))
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(categories).where(eq(categories.id, id))
    return row ? new CategoryEntity(row) : null
  }

  async create(entity: CategoryEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(categories).values(values).returning(columns)
      return new CategoryEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async update(entity: CategoryEntity) {
    const { id, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().update(categories).set(values).where(eq(categories.id, id)).returning(columns)
      // Only reachable if the row vanished between the use case's read and this write.
      if (!row) throw new DomainNotFoundError('ไม่พบหมวดหมู่')
      return new CategoryEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }
}
```

- [ ] **Step 4: ย้าย schema ของ HTTP**

สร้าง `apps/api/src/modules/categories/adapters/controllers/schemas/category.schema.ts` โดยเนื้อ schema ต้องเหมือน `modules/catalog/categories/model.ts` เดิมทุกช่อง:

```ts
import { t } from 'elysia'

const fields = {
  name: t.String({ minLength: 1, maxLength: 100 }),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
}

export const categorySchemas = {
  category: t.Object({ id: t.Integer(), ...fields }),
  create: t.Object({ name: fields.name, sortOrder: t.Optional(fields.sortOrder) }),
  update: t.Partial(t.Object(fields)),
}

export type CategoryResponse = typeof categorySchemas.category.static
```

- [ ] **Step 5: เขียน controller**

สร้าง `apps/api/src/modules/categories/adapters/controllers/category.controller.ts`:

```ts
import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { CategoryEntity } from '../../../../domains/category.domain'
import { idParams } from '../../../../shared/models'
import { auth } from '../../../../shared/plugins/auth'
import { CreateCategoryUseCase } from '../../applications/usecases/create-category.usecase'
import { ListCategoriesUseCase } from '../../applications/usecases/list-categories.usecase'
import { UpdateCategoryUseCase } from '../../applications/usecases/update-category.usecase'
import { categorySchemas, type CategoryResponse } from './schemas/category.schema'

// Entities never leave the API as-is: the response shape is a contract of its own.
const toResponse = (category: CategoryEntity): CategoryResponse => category.toSnapshot()

@injectable()
export class CategoryElysiaController {
  constructor(
    @inject(ListCategoriesUseCase) private readonly listCategories: ListCategoriesUseCase,
    @inject(CreateCategoryUseCase) private readonly createCategory: CreateCategoryUseCase,
    @inject(UpdateCategoryUseCase) private readonly updateCategory: UpdateCategoryUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'catalog.categories', prefix: '/categories' })
      .use(auth)
      .get('/', async () => (await this.listCategories.execute()).map(toResponse), {
        auth: true,
        response: t.Array(categorySchemas.category),
        detail: { summary: 'รายการหมวดหมู่' },
      })
      .post('/', async ({ body }) => toResponse(await this.createCategory.execute(body)), {
        auth: ['owner'],
        body: categorySchemas.create,
        response: categorySchemas.category,
        detail: { summary: 'เพิ่มหมวดหมู่' },
      })
      .patch('/:id', async ({ params, body }) => toResponse(await this.updateCategory.execute(params.id, body)), {
        auth: ['owner'],
        params: idParams,
        body: categorySchemas.update,
        response: categorySchemas.category,
        detail: { summary: 'แก้ไขหมวดหมู่' },
      })
  }
}
```

- [ ] **Step 6: ผูก DI และเปลี่ยนเส้นทาง**

สร้าง `apps/api/src/modules/categories/categories.module.ts`:

```ts
import { container } from 'tsyringe'
import { CategoryElysiaController } from './adapters/controllers/category.controller'
import { DrizzleCategoryRepository } from './adapters/repository/category.drizzle.repository'
import { categoryRepositoryToken } from './applications/ports/category.repository'
import { CreateCategoryUseCase } from './applications/usecases/create-category.usecase'
import { ListCategoriesUseCase } from './applications/usecases/list-categories.usecase'
import { UpdateCategoryUseCase } from './applications/usecases/update-category.usecase'

container.register(categoryRepositoryToken, { useClass: DrizzleCategoryRepository })
container.registerSingleton(ListCategoriesUseCase)
container.registerSingleton(CreateCategoryUseCase)
container.registerSingleton(UpdateCategoryUseCase)
container.registerSingleton(CategoryElysiaController)
```

`apps/api/src/modules/di-registrations.ts` แทนทั้งไฟล์ด้วย:

```ts
// Composition root: importing this file wires every migrated module into the container.
import './shared/shared.module'
import './categories/categories.module'
```

`apps/api/src/modules/catalog/index.ts` แทนทั้งไฟล์ด้วย:

```ts
import { Elysia } from 'elysia'
import { container } from 'tsyringe'
import { CategoryElysiaController } from '../categories/adapters/controllers/category.controller'
import '../di-registrations'
import { products } from './products'

// Owns the /catalog namespace. Categories already come from the hexagonal module;
// products still use the legacy service until their own migration step.
export const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(container.resolve(CategoryElysiaController).getRoutes())
  .use(products)
```

- [ ] **Step 7: แก้ seed ให้ใช้ use case**

ใน `apps/api/src/infrastructure/database/seed.ts`:

เพิ่มเป็นบรรทัดแรกของไฟล์:

```ts
import 'reflect-metadata'
```

แทนบรรทัด `import { CategoriesService } from '../../modules/catalog/categories/service'` ด้วย:

```ts
import { container } from 'tsyringe'
import { CreateCategoryUseCase } from '../../modules/categories/applications/usecases/create-category.usecase'
import '../../modules/di-registrations'
```

และแทนสองบรรทัดที่เรียก `CategoriesService.create(...)` ด้วย:

```ts
  const createCategory = container.resolve(CreateCategoryUseCase)
  const drinks = await createCategory.execute({ name: 'เครื่องดื่ม', sortOrder: 1 })
  const snacks = await createCategory.execute({ name: 'ขนม', sortOrder: 2 })
```

- [ ] **Step 8: ลบโค้ดเดิมของหมวดหมู่**

```bash
git rm apps/api/src/modules/catalog/categories/index.ts apps/api/src/modules/catalog/categories/model.ts apps/api/src/modules/catalog/categories/service.ts
grep -rn "catalog/categories\|CategoriesService\|CategoryModel" apps/api/src apps/api/test apps/web/src
```

Expected: `grep` พบหนึ่งบรรทัดใน `apps/api/src/types.ts` ซึ่งส่งออก type `Category` ให้หน้าเว็บจากไฟล์ที่เพิ่งลบ แก้บรรทัดนั้นเป็นบรรทัดด้านล่าง แล้วรัน `grep` ซ้ำจนไม่มีผลลัพธ์:

```ts
export type { CategoryResponse as Category } from './modules/categories/adapters/controllers/schemas/category.schema'
```

- [ ] **Step 9: รันให้ผ่าน**

```bash
bun run typecheck && bun run lint && bun run test
cd apps/api && bun run openapi:check && cd ../..
cd apps/web && bun run build && cd ../..
```

Expected: ผ่านทั้งหมด รวมกรณี `an update with no fields` จาก Step 1 และเอกสาร OpenAPI ตรงกับ baseline

ถ้า `openapi:check` ล้มเหลว ให้เปิด `apps/api/test/openapi-current.json` เทียบกับ baseline ผลต่างใดก็ตามในเส้นทางของ `/api/catalog/categories` คือการเปลี่ยนสัญญา ต้องแก้ controller ให้กลับมาตรง ห้ามเขียน baseline ทับ

ถ้า `@pos/web typecheck` รายงานว่า `catalog.categories` ไม่มีใน type ของ client แปลว่า type ของ Eden ไม่ไหลผ่าน `getRoutes()` ให้หยุดและรายงานตามหัวข้อ "ความเสี่ยง" ของ spec

- [ ] **Step 10: ตรวจกฎของชั้น**

```bash
grep -rnE "from '(elysia|drizzle-orm|tsyringe|zod)|/(libs|modules|infrastructure)/" apps/api/src/domains --include=*.ts
grep -rnE "from '(elysia|drizzle-orm)|/infrastructure/|/adapters/" apps/api/src/modules/categories/applications --include=*.ts
```

Expected: ทั้งสองคำสั่งไม่มีผลลัพธ์

- [ ] **Step 11: ตรวจว่า seed ยังใช้ได้กับฐานข้อมูลว่าง**

```bash
docker compose exec -T db psql -U pos -d postgres -c "drop database if exists pos_seed_check" -c "create database pos_seed_check"
cd apps/api
DATABASE_URL=postgres://pos:pos@localhost:5433/pos_seed_check bun --env-file=../../.env src/infrastructure/database/migrate.ts
DATABASE_URL=postgres://pos:pos@localhost:5433/pos_seed_check bun --env-file=../../.env src/infrastructure/database/seed.ts
cd ../..
docker compose exec -T db psql -U pos -d pos_seed_check -tc "select name from categories order by sort_order"
docker compose exec -T db psql -U pos -d postgres -c "drop database pos_seed_check"
```

Expected: seed รายงานว่าสร้างเจ้าของร้านและสินค้าตัวอย่าง และคำสั่ง `select` แสดง `เครื่องดื่ม` กับ `ขนม`
(ตัวแปรใน process ชนะค่าในไฟล์ env จึงชี้ไปฐานข้อมูลชั่วคราวได้โดยไม่แตะฐาน `pos`)

- [ ] **Step 12: Commit**

```bash
git add -A apps/api
gitcz --non-interactive --type=refactor --scope=categories --subject="serve categories from the hexagonal module" --body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ตรวจด้วยตาและรายงานผลของขั้น 0

- [ ] **Step 1: ลองใช้งานจริง**

```bash
bun run dev
```

เปิด `http://localhost:5173` ล็อกอินเป็นเจ้าของร้าน แล้วตรวจว่า:

1. หน้าขายแสดงแถบหมวดหมู่ และกรองสินค้าตามหมวดหมู่ได้
2. หน้าสินค้าและสต็อก เปิดฟอร์มแก้ไขสินค้าแล้วตัวเลือกหมวดหมู่แสดงครบ
3. ขายสินค้าหนึ่งรายการจนได้ใบเสร็จ

- [ ] **Step 2: รายงานต่อเจ้าของโครงการ**

รายงานผลของสี่ข้อที่ขั้น 0 ต้องพิสูจน์ พร้อมหลักฐานจากผลการรันจริง:

| ข้อที่พิสูจน์ | หลักฐาน |
|---|---|
| decorator และ DI ของ tsyringe ทำงานบน Bun | ผลของ `di.test.ts` (Task 3) |
| transaction เดียวข้าม repository โดยไม่ส่งพารามิเตอร์ | ผลของ `unit-of-work.integration.test.ts` สามรอบ (Task 5) |
| type ของ Eden ยังครบเมื่อเส้นทางมาจากคลาส controller | ผล typecheck และ build ของหน้าเว็บ (Task 8) |
| สัญญาของ API ไม่เปลี่ยน | ผลของ `openapi:check` และการทดสอบ integration (Task 8) |

แจ้งด้วยว่า commit ทั้งหมดอยู่บน branch `ohmattpon/hexagonal-architecture` ในเครื่อง ยังไม่ได้ push และแผนของขั้น 1 (`users` และ `auth`) จะเขียนเมื่อเจ้าของโครงการยืนยันผลของขั้นนี้
