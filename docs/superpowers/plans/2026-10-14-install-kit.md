# ชุดติดตั้ง (Install kit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เจ้าของร้านติดตั้ง EasyPOS ด้วยคำสั่งเดียวบน Docker ตั้งค่าเจ้าของและร้านครั้งแรกจากหน้าเว็บด้วยรหัสตั้งค่าครั้งเดียว สำรอง/กู้คืนข้อมูลได้ และมีเอกสารกับใบอนุญาต

**Architecture:** โมดูล API ใหม่ `setup` (use case `GetSetupStatus`, `CompleteSetup`; port `ISetupCode` ในหน่วยความจำ และ `IFirstRunGuard` ที่โมดูล `users` เป็นผู้ตอบ) รหัสตั้งค่าถูกสร้างและพิมพ์ใน log ตอนเริ่มเมื่อฐานไม่มีผู้ใช้ ที่เก็บรูปเป็นทางเลือก (`IMediaStorage.isEnabled()`) API บริการหน้าเว็บที่ build แล้วเองผ่านปลั๊กอิน `webPlugin` และชุด Docker Compose (`app` + `db` + `caddy` ทางเลือก) พร้อมสคริปต์ติดตั้ง/สำรอง/กู้คืน

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod · React 19, TanStack Query · Docker Compose, Caddy · bash และ PowerShell

**Spec:** `docs/superpowers/specs/2026-10-14-install-kit-design.md`

## ข้อปรับจาก spec (ตัดสินตอนวางแผน เพราะเห็นโค้ดจริงแล้ว)

| ใน spec | ในแผนนี้ | เหตุผล |
|---|---|---|
| พอร์ต 5433 ของนักพัฒนาย้ายไป `docker-compose.override.yml` | ย้ายไป `docker-compose.dev.yml` (ไม่โหลดอัตโนมัติ) และ `db:up` ระบุไฟล์เอง | ไฟล์ `override` ถูกโหลดเองเมื่อรัน `docker compose` ในชุดติดตั้ง จะเปิดพอร์ตฐานข้อมูลโดยไม่ตั้งใจ |
| รหัสผ่านเจ้าของยาวอย่างน้อย 10 ตัว | ยาว 10 ถึง 72 ตัวอักษร | `createUserSchema` จำกัดสูงสุด 72 อยู่แล้ว (ข้อจำกัดของการแฮช) |
| ไม่ได้ระบุค่า `CHECKOUT_MODE` ของชุดติดตั้ง | ติดตั้งใหม่ตั้ง `CHECKOUT_MODE=shifts` | ร้านใหม่ไม่มี client v1 เดิมต้องรองรับ และโหมดกะคือการทำงานปัจจุบัน |
| e2e ของหน้าตั้งค่า | ใช้ฐานและเซิร์ฟเวอร์ชุดที่สองแยกจากชุดหลัก (ฐาน `pos_e2e_setup`) | ชุดหลักต้อง seed สินค้า ซึ่งจะทำให้ไม่มีหน้าตั้งค่า |

## Global Constraints

- **ห้าม push เด็ดขาด** (`git push` ทุกรูปแบบ, `gh pr create`, `gh repo sync`) commit อยู่ในเครื่องแล้วรอเจ้าของโครงการ push เอง
- commit ด้วย `gitcz --non-interactive --type=<feat|fix|refactor|test|docs|style|perf|ci|chore> --scope=<scope> --subject="…" --body="…"` เท่านั้น ห้าม `git commit`/`--amend` ห้ามใช้ type `build` และ stage เฉพาะไฟล์ของ commit นั้น (ห้าม `git add -A` ห้าม stage `README.md` ที่เจ้าของแก้ค้างไว้ ยกเว้น Task 8 ที่ต้องเพิ่มลิงก์ ให้ตรวจ `git diff README.md` ก่อน)
- ท้าย `--body` ของทุก commit ใส่บรรทัด `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- ทำงานบน branch `ohmattpon/install-kit` ห้าม merge เข้า `main` ห้ามลบ branch
- **ห้ามบันทึก `test/openapi-baseline.json` และ `test/openapi-v2-baseline.json` ใหม่จนกว่าเจ้าของโครงการอนุมัติ** (Task 9)
- **ห้ามแตะ `.env` ของเจ้าของ** (ชี้ฐาน demo บน cloud) และห้ามรัน `db:seed`/`db:migrate` ที่อ่าน `.env` นั้น การทดลองติดตั้งจริงต้องทำใน worktree แยกที่มี `.env` ของตัวเอง พอร์ตและชื่อโปรเจกต์ Compose แยก
- ห้ามมีความลับในไฟล์ที่ commit (รหัสผ่าน คีย์ สตริงเชื่อมต่อจริง) `.env.example` เป็น placeholder เท่านั้น
- API: Hexagonal + CQRS หนึ่ง use case หนึ่งไฟล์ `execute()` รับ `unknown` แล้ว parse ด้วย zod, ติดต่อข้ามโมดูลผ่าน port + token (โมดูลหนึ่งห้ามแตะตารางของอีกโมดูล), repository ใช้ `currentExecutor()`, ข้อผิดพลาดเป็น domain error พร้อมข้อความไทยและ `code` คงที่
- `domains/` import ได้เฉพาะ `domains/` ด้วยกัน
- v1 เพิ่มได้อย่างเดียว ห้ามลบหรือเปลี่ยนชนิดช่องเดิม
- เว็บ: ข้อความทุกตัวผ่าน `t()` และ `features/<f>/locales.ts` (`en` ใช้ `satisfies typeof th`), query key ผ่าน key factory, คอมโพเนนต์ห้ามเรียก `api`/`unwrap` ตรง, import ข้าม feature ผ่าน `index.ts`
- คำสั่งตรวจ: `bun run typecheck`, `bun run test` (ต้องเปิด Docker DB: `bun run db:up`), `bun run lint`, `bun run e2e` รันจาก root ก่อนบอกว่าเสร็จต้องผ่าน `typecheck` และ `test`
- เขียนไฟล์ด้วยเครื่องมือ Write หรือสคริปต์ python ที่เก็บเป็นไฟล์ (heredoc ที่มีภาษาไทยและเครื่องหมายคำพูดมักพัง)

## Review Focus

1. **คนนอกยึดระบบก่อนเจ้าของ:** ตั้งค่าด้วยรหัสผิด/ไม่มีรหัส/รหัสของครั้งก่อน (หลังรีสตาร์ท) ต้องถูกปฏิเสธ และผิดครบ 5 ครั้งต้องล็อก แม้ส่งรหัสที่ถูกต้องในช่วงล็อก (Task 1)
2. **ตั้งค่าพร้อมกันสองคำขอ** ต้องได้เจ้าของคนเดียว อีกคำขอได้ `SETUP_DONE` ไม่ใช่ข้อผิดพลาดดิบของฐานข้อมูล (Task 1)
3. **ตั้งค่าแล้วทำซ้ำ:** หลังมีผู้ใช้ หน้าตั้งค่าห้ามเปิดช่องให้สร้างเจ้าของเพิ่ม และ `needsSetup` ต้องเป็น false (Task 1, 3)
4. **ไม่มีที่เก็บรูป:** ระบบเริ่มได้โดยไม่มี `MEDIA_URL`, สินค้าไม่มีรูปแสดงปกติ, การอัปโหลดรูปไม่ทำให้ระบบล้มแต่ตอบ `MEDIA_UNAVAILABLE`, และเว็บซ่อนส่วนอัปโหลด (Task 2)
5. **ให้บริการเว็บเอง:** เส้นทางที่ไม่ใช่ `/api` ต้องได้หน้าเว็บ (รวมเส้นทาง SPA เช่น `/today`) แต่เส้นทาง `/api/...` ที่ไม่มีอยู่ต้องได้ 404 แบบ JSON ไม่ใช่หน้าเว็บ และห้ามอ่านไฟล์นอกโฟลเดอร์ที่ build ได้ (`..`) (Task 4)

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/api/src/modules/setup/**` | use case ตั้งค่าครั้งแรก, port, ที่เก็บรหัสในหน่วยความจำ, controller |
| `apps/api/src/modules/users/adapters/repository/first-run-guard.drizzle.adapter.ts` | ตอบ `IFirstRunGuard`: ล็อกและนับผู้ใช้ |
| `apps/api/src/modules/web.plugin.ts` | บริการไฟล์เว็บที่ build แล้ว |
| `apps/web/src/features/setup/**` | หน้าตั้งค่าครั้งแรก |
| `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `Caddyfile`, `docker/entrypoint.sh`, `.dockerignore` | ชุดติดตั้ง |
| `scripts/{install,backup,restore}.{sh,ps1}` | ติดตั้ง สำรอง กู้คืน |
| `docs/install.md`, `LICENSE` | เอกสารและใบอนุญาต |
| `apps/api/src/__tests__/repo-secrets.test.ts` | สแกนความลับในไฟล์ที่ track |

---

### Task 1: API ตั้งค่าครั้งแรก (โมดูล `setup`)

**Files:**
- Create: `apps/api/src/modules/setup/setup.module.ts`
- Create: `apps/api/src/modules/setup/applications/ports/{setup-code,first-run-guard}.port.ts`
- Create: `apps/api/src/modules/setup/applications/schemas/setup-schemas.ts`
- Create: `apps/api/src/modules/setup/applications/usecases/{get-setup-status,complete-setup}.usecase.ts`
- Create: `apps/api/src/modules/setup/adapters/in-memory-setup-code.ts`
- Create: `apps/api/src/modules/setup/adapters/controllers/setup.controller.ts`, `schemas/setup.schema.ts`
- Create: `apps/api/src/modules/setup/announce-setup-code.ts`
- Create: `apps/api/src/modules/users/adapters/repository/first-run-guard.drizzle.adapter.ts`
- Test: `apps/api/src/modules/setup/applications/usecases/setup.usecases.test.ts`
- Test: `apps/api/src/modules/setup/adapters/in-memory-setup-code.test.ts`
- Test: `apps/api/src/__tests__/integration/setup.integration.test.ts`
- Modify: `modules/di-registrations.ts`, `modules/app.module.ts`, `modules/users/users.module.ts`, `src/index.ts`, `__tests__/mocks.ts`, `types.ts`

**Interfaces:**
- Consumes: `IUserRepository.create`, `IBranchRepository.findAll/update`, `IShopSettingsRepository.getForUpdate/save`, `TOKENS.PasswordHasher`, `TOKENS.UnitOfWork`, `UserEntity.normalizeUsername`
- Produces:
  - `ISetupCode { issue(): string; verify(candidate: string): 'accepted' | 'wrong' | 'locked' | 'not-issued'; retire(): void }`, `setupCodeToken`
  - `IFirstRunGuard { countUsers(): Promise<number>; lockAndCountUsers(): Promise<number> }`, `firstRunGuardToken`
  - `GetSetupStatusUseCase.execute(): Promise<{ needsSetup: boolean }>`
  - `CompleteSetupUseCase.execute(input: unknown): Promise<UserEntity>` (โยน `SETUP_DONE` 409, `SETUP_CODE_INVALID` 403, `SETUP_LOCKED` 403)
  - `announceSetupCode(): Promise<void>`
  - HTTP `GET /api/v1/setup`, `POST /api/v1/setup`

- [ ] **Step 1: ports**

`setup-code.port.ts`

```ts
export type SetupCodeCheck = 'accepted' | 'wrong' | 'locked' | 'not-issued'

/**
 * The one-time code that proves a person can read the server's log, which is what lets them make the
 * first owner. Held in memory: a restart issues a new one, and nothing is stored on disk.
 */
export interface ISetupCode {
  /** Makes a new code, forgetting the old one and any failed attempts, and returns it. */
  issue(): string
  verify(candidate: string): SetupCodeCheck
  /** Forgets the code once the shop is set up. */
  retire(): void
}

const setupCodeTokenSymbol: unique symbol = Symbol('ISetupCode')
export const setupCodeToken = setupCodeTokenSymbol.toString()
```

`first-run-guard.port.ts`

```ts
/** Whether the shop has anyone who can sign in yet. Answered by the users module from its own data. */
export interface IFirstRunGuard {
  countUsers(): Promise<number>
  /**
   * Counts the users after taking a lock held until the surrounding unit of work ends, so two setups at
   * the same moment cannot both see an empty shop.
   */
  lockAndCountUsers(): Promise<number>
}

const firstRunGuardTokenSymbol: unique symbol = Symbol('IFirstRunGuard')
export const firstRunGuardToken = firstRunGuardTokenSymbol.toString()
```

- [ ] **Step 2: zod** `setup-schemas.ts` (เปิด `modules/users/applications/schemas/user-schemas.ts` ก่อน ใช้ `username` ของ `createUserSchema` ซ้ำเพื่อให้กฎชื่อผู้ใช้ตรงกัน ถ้า `createUserSchema` เป็น `ZodObject` ใช้ `createUserSchema.shape.username` ถ้าไม่ใช่ให้ import ตัวสร้าง `username` ที่ไฟล์นั้นส่งออก หรือส่งออกเพิ่มจากไฟล์นั้นโดยไม่เปลี่ยนพฤติกรรม)

```ts
import { z } from 'zod'
import { createUserSchema } from '../../../users/applications/schemas/user-schemas'

export const completeSetupSchema = z.object({
  setupCode: z.string().min(1).max(64),
  shopName: z.string().trim().min(1).max(100),
  branchName: z.string().trim().min(1).max(100),
  username: createUserSchema.shape.username,
  displayName: z.string().trim().min(1).max(100),
  // Longer than the 8 an owner may later give a cashier: this account can do everything.
  password: z.string().min(10).max(72),
})
```

- [ ] **Step 3: การทดสอบที่ล้มเหลว** `in-memory-setup-code.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { InMemorySetupCode } from './in-memory-setup-code'

describe('InMemorySetupCode', () => {
  test('nothing is accepted before a code is issued', () => {
    expect(new InMemorySetupCode().verify('ABC')).toBe('not-issued')
  })

  test('issues a 12 character code from a set without look-alike characters, and accepts exactly it', () => {
    const store = new InMemorySetupCode()
    const code = store.issue()

    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/)
    expect(store.verify(code)).toBe('accepted')
    expect(store.verify(code.toLowerCase())).toBe('accepted')
    expect(store.verify(` ${code} `)).toBe('accepted')
    expect(store.verify('WRONGWRONGWR')).toBe('wrong')
  })

  test('a new code replaces the old one and clears the failures', () => {
    const store = new InMemorySetupCode()
    const first = store.issue()
    for (let attempt = 0; attempt < 4; attempt++) store.verify('nope')

    const second = store.issue()

    expect(second).not.toBe(first)
    expect(store.verify(first)).toBe('wrong')
    expect(store.verify(second)).toBe('accepted')
  })

  test('five wrong tries lock it, even for the right code, until the lock runs out', () => {
    let now = 1_000_000
    const store = new InMemorySetupCode(() => now)
    const code = store.issue()

    for (let attempt = 0; attempt < 5; attempt++) expect(store.verify('nope')).toBe('wrong')

    expect(store.verify(code)).toBe('locked')
    now += 14 * 60_000
    expect(store.verify(code)).toBe('locked')
    now += 2 * 60_000
    expect(store.verify(code)).toBe('accepted')
  })

  test('a retired code is gone', () => {
    const store = new InMemorySetupCode()
    const code = store.issue()

    store.retire()

    expect(store.verify(code)).toBe('not-issued')
  })
})
```

- [ ] **Step 4: รันให้ล้มเหลว** `cd apps/api && bun --env-file=.env.test test src/modules/setup` Expected: FAIL (module ไม่พบ)

- [ ] **Step 5: ที่เก็บรหัส** `adapters/in-memory-setup-code.ts`

```ts
import { timingSafeEqual } from 'node:crypto'
import { injectable } from 'tsyringe'
import type { ISetupCode, SetupCodeCheck } from '../applications/ports/setup-code.port'

// No 0/O, 1/I/L: the code is read off a log and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LENGTH = 12
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60_000

@injectable()
export class InMemorySetupCode implements ISetupCode {
  private code: string | null = null
  private failures = 0
  private lockedUntil = 0

  constructor(private readonly now: () => number = Date.now) {}

  issue() {
    const bytes = crypto.getRandomValues(new Uint8Array(LENGTH))
    this.code = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
    this.failures = 0
    this.lockedUntil = 0
    return this.code
  }

  verify(candidate: string): SetupCodeCheck {
    if (this.code === null) return 'not-issued'
    if (this.now() < this.lockedUntil) return 'locked'

    const given = Buffer.from(candidate.trim().toUpperCase())
    const expected = Buffer.from(this.code)
    // Compared in constant time: a wrong length is simply wrong.
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      this.failures = 0
      return 'accepted'
    }

    this.failures++
    if (this.failures >= MAX_FAILURES) {
      this.lockedUntil = this.now() + LOCK_MS
      this.failures = 0
    }
    return 'wrong'
  }

  retire() {
    this.code = null
    this.failures = 0
    this.lockedUntil = 0
  }
}
```

(`constructor(now = Date.now)` มีค่าเริ่มต้น จึงใช้กับ tsyringe `registerSingleton` ได้เมื่อไม่มีพารามิเตอร์ที่ต้อง inject — ถ้า tsyringe บ่นเรื่องพารามิเตอร์ที่ไม่มี token ให้ลงทะเบียนด้วย `container.registerInstance(setupCodeToken, new InMemorySetupCode())`)

- [ ] **Step 6: mock และการทดสอบ use case ที่ล้มเหลว**

`__tests__/mocks.ts` เพิ่ม import `ISetupCode` (`../modules/setup/applications/ports/setup-code.port`), `IFirstRunGuard` และต่อท้ายไฟล์:

```ts
export const mockSetupCode = (): Mocked<ISetupCode> => ({
  issue: mock<ISetupCode['issue']>(() => 'ABCDEFGHJKMN'),
  verify: mock<ISetupCode['verify']>(() => 'accepted'),
  retire: mock<ISetupCode['retire']>(),
})

export const mockFirstRunGuard = (): Mocked<IFirstRunGuard> => ({
  countUsers: mock<IFirstRunGuard['countUsers']>(async () => 0),
  lockAndCountUsers: mock<IFirstRunGuard['lockAndCountUsers']>(async () => 0),
})
```

ต้องมี `mockBranchRepository`, `mockShopSettingsRepository`, `mockUserRepository`, `mockPasswordHasher`, `mockUnitOfWork` อยู่แล้วใน `mocks.ts`

`setup.usecases.test.ts`

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeBranch, makeUser } from '../../../../__tests__/factories'
import {
  mockBranchRepository,
  mockFirstRunGuard,
  mockPasswordHasher,
  mockSetupCode,
  mockShopSettingsRepository,
  mockUnitOfWork,
  mockUserRepository,
} from '../../../../__tests__/mocks'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { CompleteSetupUseCase } from './complete-setup.usecase'
import { GetSetupStatusUseCase } from './get-setup-status.usecase'

const input = {
  setupCode: 'ABCDEFGHJKMN',
  shopName: 'ร้านกาแฟบ้านสวน',
  branchName: 'สาขาหลัก',
  username: 'owner',
  displayName: 'สมชาย ใจดี',
  password: 'correct-horse-battery',
}

let guard: ReturnType<typeof mockFirstRunGuard>
let code: ReturnType<typeof mockSetupCode>
let users: ReturnType<typeof mockUserRepository>
let branches: ReturnType<typeof mockBranchRepository>
let settings: ReturnType<typeof mockShopSettingsRepository>
let useCase: CompleteSetupUseCase

beforeEach(() => {
  guard = mockFirstRunGuard()
  code = mockSetupCode()
  users = mockUserRepository()
  branches = mockBranchRepository()
  settings = mockShopSettingsRepository()
  users.create.mockImplementation(async (user) => makeUser({ ...user.toSnapshot(), id: 1 }))
  branches.findAll.mockResolvedValue([makeBranch({ id: 1, name: 'สาขาหลัก' })])
  branches.update.mockImplementation(async (branch) => branch)
  settings.getForUpdate.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
  settings.save.mockImplementation(async (value) => value)
  useCase = new CompleteSetupUseCase(guard, code, users, branches, settings, mockPasswordHasher(), mockUnitOfWork())
})

describe('GetSetupStatusUseCase', () => {
  test('a shop with nobody in it needs setup, and one with a user does not', async () => {
    const status = new GetSetupStatusUseCase(guard)

    expect(await status.execute()).toEqual({ needsSetup: true })
    guard.countUsers.mockResolvedValue(1)
    expect(await status.execute()).toEqual({ needsSetup: false })
  })
})

describe('CompleteSetupUseCase', () => {
  test('makes the owner, names the shop and the first branch, and retires the code', async () => {
    const owner = await useCase.execute(input)

    expect(owner).toMatchObject({ username: 'owner', role: 'owner', displayName: 'สมชาย ใจดี', branchId: 1 })
    expect(users.create.mock.calls[0]![1]).toBe('hashed:correct-horse-battery')
    expect(settings.save.mock.calls[0]![0].shopName).toBe('ร้านกาแฟบ้านสวน')
    expect(branches.update.mock.calls[0]![0].name).toBe('สาขาหลัก')
    expect(code.retire).toHaveBeenCalledTimes(1)
  })

  test('takes the lock before it looks, and refuses when there already is a user, writing nothing', async () => {
    guard.lockAndCountUsers.mockResolvedValue(1)

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'SETUP_DONE' })

    expect(code.verify).not.toHaveBeenCalled()
    expect(users.create).not.toHaveBeenCalled()
    expect(code.retire).not.toHaveBeenCalled()
  })

  test.each([
    ['wrong', 'SETUP_CODE_INVALID'],
    ['not-issued', 'SETUP_CODE_INVALID'],
    ['locked', 'SETUP_LOCKED'],
  ] as const)('a code that is %s is refused as %s and nothing is written', async (check, errorCode) => {
    code.verify.mockReturnValue(check)

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: errorCode })

    expect(users.create).not.toHaveBeenCalled()
    expect(settings.save).not.toHaveBeenCalled()
  })

  test.each([
    ['a short password', { password: 'short-pw' }],
    ['an empty shop name', { shopName: '   ' }],
    ['no code', { setupCode: '' }],
  ])('rejects %s before anything else', async (_label, overrides) => {
    await expect(useCase.execute({ ...input, ...overrides })).rejects.toBeInstanceOf(ZodError)
    expect(guard.lockAndCountUsers).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: use case**

`get-setup-status.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { firstRunGuardToken } from '../ports/first-run-guard.port'
import type { IFirstRunGuard } from '../ports/first-run-guard.port'

/** Query: whether the shop still has to be set up, which is when nobody has an account yet. */
@injectable()
export class GetSetupStatusUseCase {
  constructor(@inject(firstRunGuardToken) private readonly guard: IFirstRunGuard) {}

  async execute() {
    return { needsSetup: (await this.guard.countUsers()) === 0 }
  }
}
```

`complete-setup.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { UserEntity } from '../../../../domains/user.domain'
import { branchRepositoryToken } from '../../../branches/applications/ports/branch.repository'
import type { IBranchRepository } from '../../../branches/applications/ports/branch.repository'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import type { IPasswordHasher } from '../../../shared/ports/password-hasher.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { userRepositoryToken } from '../../../users/applications/ports/user.repository'
import type { IUserRepository } from '../../../users/applications/ports/user.repository'
import { firstRunGuardToken } from '../ports/first-run-guard.port'
import type { IFirstRunGuard } from '../ports/first-run-guard.port'
import { setupCodeToken } from '../ports/setup-code.port'
import type { ISetupCode } from '../ports/setup-code.port'
import { completeSetupSchema } from '../schemas/setup-schemas'

/**
 * Command: makes the first owner and names the shop. Works once: it is refused as soon as anyone has an
 * account, and until then only with the code the server printed in its log.
 */
@injectable()
export class CompleteSetupUseCase {
  constructor(
    @inject(firstRunGuardToken) private readonly guard: IFirstRunGuard,
    @inject(setupCodeToken) private readonly code: ISetupCode,
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(TOKENS.PasswordHasher) private readonly hasher: IPasswordHasher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(input: unknown): Promise<UserEntity> {
    const dto = completeSetupSchema.parse(input)

    const owner = await this.unitOfWork.run(async () => {
      // The lock comes first: of two setups at the same moment, the second sees the first one's owner.
      if ((await this.guard.lockAndCountUsers()) > 0)
        throw new DomainConflictError('ตั้งค่าร้านครั้งแรกเสร็จไปแล้ว', 'SETUP_DONE')

      const check = this.code.verify(dto.setupCode)
      if (check === 'locked')
        throw new DomainForbiddenError('กรอกรหัสตั้งค่าผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่', 'SETUP_LOCKED')
      if (check !== 'accepted')
        throw new DomainForbiddenError('รหัสตั้งค่าไม่ถูกต้อง ดูรหัสได้จาก log ของระบบ', 'SETUP_CODE_INVALID')

      const [branch] = await this.branches.findAll()
      if (!branch) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
      await this.branches.update(branch.with({ name: dto.branchName }))
      await this.settings.save((await this.settings.getForUpdate()).with({ shopName: dto.shopName }))

      return this.users.create(
        new UserEntity({
          id: 0,
          username: UserEntity.normalizeUsername(dto.username),
          displayName: dto.displayName,
          role: 'owner',
          branchId: branch.id,
          isActive: true,
        }),
        await this.hasher.hash(dto.password),
      )
    })

    // Only after the owner is committed: a rolled back setup keeps its code to try again.
    this.code.retire()
    return owner
  }
}
```

(ถ้า `DomainForbiddenError` รับพารามิเตอร์ต่างจาก `(message, code)` ให้ดู `domains/errors/domain-forbidden.error.ts` และปรับให้ตรง ถ้า `BranchEntity.with` ชื่ออื่น ให้ใช้ตามที่ `update-branch.usecase.ts` ใช้)

- [ ] **Step 8: adapter ตอบ `IFirstRunGuard` ในโมดูล users** `first-run-guard.drizzle.adapter.ts`

```ts
import { count, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { users } from '../../../../infrastructure/database/schema/users'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IFirstRunGuard } from '../../../setup/applications/ports/first-run-guard.port'

// One fixed key for the whole shop's first-run setup.
const SETUP_LOCK_KEY = 7_301_001

@injectable()
export class DrizzleFirstRunGuard implements IFirstRunGuard {
  async countUsers() {
    const [row] = await currentExecutor().select({ total: count() }).from(users)
    return row!.total
  }

  async lockAndCountUsers() {
    await currentExecutor().execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_KEY})`)
    return this.countUsers()
  }
}
```

- [ ] **Step 9: HTTP**

`schemas/setup.schema.ts`

```ts
import { t } from 'elysia'

export const setupSchemas = {
  status: t.Object({ needsSetup: t.Boolean() }),
  complete: t.Object({
    setupCode: t.String({ minLength: 1, maxLength: 64 }),
    shopName: t.String({ minLength: 1, maxLength: 100 }),
    branchName: t.String({ minLength: 1, maxLength: 100 }),
    username: t.String({ minLength: 1, maxLength: 64 }),
    displayName: t.String({ minLength: 1, maxLength: 100 }),
    password: t.String({ minLength: 10, maxLength: 72 }),
  }),
}
```

`setup.controller.ts`

```ts
import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { env } from '../../../../libs/env'
import { auth, SESSION_COOKIE, SESSION_MAX_AGE } from '../../../auth.plugin'
import { userSchemas } from '../../../users/adapters/controllers/schemas/user.schema'
import { CompleteSetupUseCase } from '../../applications/usecases/complete-setup.usecase'
import { GetSetupStatusUseCase } from '../../applications/usecases/get-setup-status.usecase'
import { setupSchemas } from './schemas/setup.schema'

@injectable()
export class SetupElysiaController {
  constructor(
    @inject(GetSetupStatusUseCase) private readonly status: GetSetupStatusUseCase,
    @inject(CompleteSetupUseCase) private readonly complete: CompleteSetupUseCase,
  ) {}

  /** Open to anyone, on purpose: it is only for a shop with nobody in it, and the code guards the write. */
  getRoutes() {
    return new Elysia({ name: 'setup', prefix: '/setup', detail: { tags: ['Setup'] } })
      .use(auth)
      .get('/', () => this.status.execute(), {
        response: setupSchemas.status,
        detail: { summary: 'ร้านนี้ต้องตั้งค่าครั้งแรกหรือไม่' },
      })
      .post(
        '/',
        async ({ body, jwt, cookie }) => {
          const owner = await this.complete.execute(body)

          // Signs the new owner in, the same session the login route starts.
          cookie[SESSION_COOKIE]!.set({
            value: await jwt.sign({ sub: String(owner.id) }),
            httpOnly: true,
            sameSite: 'lax',
            secure: env.cookieSecure,
            path: '/',
            maxAge: SESSION_MAX_AGE,
          })
          return owner.toSnapshot()
        },
        {
          body: setupSchemas.complete,
          response: userSchemas.user,
          detail: { summary: 'ตั้งค่าร้านครั้งแรก: สร้างเจ้าของด้วยรหัสตั้งค่าจาก log' },
        },
      )
  }
}
```

`announce-setup-code.ts`

```ts
import { container } from 'tsyringe'
import { GetSetupStatusUseCase } from './applications/usecases/get-setup-status.usecase'
import { setupCodeToken } from './applications/ports/setup-code.port'
import type { ISetupCode } from './applications/ports/setup-code.port'

/** At start-up, a shop with nobody in it gets a setup code, printed where only the person running the server looks. */
export async function announceSetupCode() {
  const { needsSetup } = await container.resolve(GetSetupStatusUseCase).execute()
  if (!needsSetup) return

  const code = container.resolve<ISetupCode>(setupCodeToken).issue()
  const line = '='.repeat(60)
  console.log(`\n${line}\n EasyPOS: ร้านนี้ยังไม่ได้ตั้งค่า (first-run setup)\n SETUP CODE / รหัสตั้งค่า:  ${code}\n เปิดเว็บแล้วกรอกรหัสนี้ที่หน้าตั้งค่าครั้งแรก\n${line}\n`)
}
```

`setup.module.ts`

```ts
import { container } from 'tsyringe'
import { SetupElysiaController } from './adapters/controllers/setup.controller'
import { InMemorySetupCode } from './adapters/in-memory-setup-code'
import { setupCodeToken } from './applications/ports/setup-code.port'
import { CompleteSetupUseCase } from './applications/usecases/complete-setup.usecase'
import { GetSetupStatusUseCase } from './applications/usecases/get-setup-status.usecase'

// One instance for the whole process: the code and the failed tries live in it.
container.registerInstance(setupCodeToken, new InMemorySetupCode())
container.registerSingleton(GetSetupStatusUseCase)
container.registerSingleton(CompleteSetupUseCase)
container.registerSingleton(SetupElysiaController)
```

ต่อสาย: `users.module.ts` เพิ่ม `import { firstRunGuardToken } from '../setup/applications/ports/first-run-guard.port'`, `import { DrizzleFirstRunGuard } from './adapters/repository/first-run-guard.drizzle.adapter'` และ `container.register(firstRunGuardToken, { useClass: DrizzleFirstRunGuard })`; `di-registrations.ts` เพิ่ม `import './setup/setup.module'`; `app.module.ts` เพิ่ม `import { SetupElysiaController } from './setup/adapters/controllers/setup.controller'`, `const setupController = container.resolve(SetupElysiaController)` และ `.use(setupController.getRoutes())` ใน `appModule` ต่อจาก `.use(authController.getRoutes())`; `src/index.ts` เพิ่ม `import { announceSetupCode } from './modules/setup/announce-setup-code'` และ `await announceSetupCode()` หลัง `app.listen(...)` และ `console.log` สองบรรทัดเดิม; `types.ts` ไม่ต้องเพิ่ม (ใช้ `User` เดิม)

- [ ] **Step 10: รัน unit test ให้ผ่าน** `cd apps/api && bun --env-file=.env.test test src/modules/setup` Expected: PASS

- [ ] **Step 11: integration test** `setup.integration.test.ts`

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { container } from 'tsyringe'
import { baseUrl, client, ok, resetDatabase } from '../../../test/harness'
import { setupCodeToken, type ISetupCode } from '../../modules/setup/applications/ports/setup-code.port'

const store = () => container.resolve<ISetupCode>(setupCodeToken)
let code: string

const body = (overrides: Record<string, unknown> = {}) => ({
  setupCode: code,
  shopName: 'ร้านทดสอบ',
  branchName: 'สาขาแรก',
  username: 'owner',
  displayName: 'เจ้าของร้าน',
  password: 'correct-horse-battery',
  ...overrides,
})

beforeEach(async () => {
  // resetDatabase leaves the shop with a branch and nobody to sign in.
  await resetDatabase()
  code = store().issue()
})

describe('first-run setup', () => {
  test('an empty shop needs setup', async () => {
    expect(ok(await client().setup.get())).toEqual({ needsSetup: true })
  })

  test('the right code makes an owner who is signed in, names the shop and the branch, and ends the setup', async () => {
    const response = await fetch(`${baseUrl}/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ username: 'owner', role: 'owner', displayName: 'เจ้าของร้าน' })
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toContain('session=')

    const me = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: cookie.split(';')[0]! } })
    expect(me.status).toBe(200)
    const settings = await fetch(`${baseUrl}/settings`, { headers: { cookie: cookie.split(';')[0]! } })
    expect(await settings.json()).toMatchObject({ shopName: 'ร้านทดสอบ' })
    expect(ok(await client().setup.get())).toEqual({ needsSetup: false })
    expect((await client().auth.login.post({ username: 'owner', password: 'correct-horse-battery' })).status).toBe(200)
  })

  test('a wrong code, and no code issued, are refused and make no one', async () => {
    const wrong = await client().setup.post(body({ setupCode: 'WRONGWRONGWR' }))
    store().retire()
    const none = await client().setup.post(body())

    expect(wrong.error?.value).toMatchObject({ code: 'SETUP_CODE_INVALID' })
    expect(none.error?.value).toMatchObject({ code: 'SETUP_CODE_INVALID' })
    expect(ok(await client().setup.get())).toEqual({ needsSetup: true })
  })

  test('five wrong tries lock it, and then even the right code is refused', async () => {
    for (let attempt = 0; attempt < 5; attempt++) await client().setup.post(body({ setupCode: 'WRONGWRONGWR' }))

    const locked = await client().setup.post(body())

    expect(locked.error?.value).toMatchObject({ code: 'SETUP_LOCKED' })
    expect(ok(await client().setup.get())).toEqual({ needsSetup: true })
  })

  test('once done it cannot be done again, whatever the code', async () => {
    ok(await client().setup.post(body()))

    const again = await client().setup.post(body({ username: 'second' }))

    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'SETUP_DONE' })
  })

  test('two setups at the same moment make exactly one owner', async () => {
    const results = await Promise.all([
      client().setup.post(body({ username: 'first' })),
      client().setup.post(body({ username: 'second' })),
    ])

    expect(results.filter((result) => result.status === 200)).toHaveLength(1)
    expect(results.filter((result) => result.status === 409)).toHaveLength(1)
  })

  test('a short password is refused', async () => {
    const result = await client().setup.post(body({ password: 'short' }))

    expect(result.status).toBe(422)
  })
})
```

หมายเหตุ: `client().setup` ต้องใช้ได้ผ่าน `treaty` (เส้นทาง `/api/v1/setup`) ถ้าคอมไพล์ไม่ผ่านเพราะชนิด ให้ตรวจว่า `appModule` ต่อ `setupController` ในสายโซ่เดียวกับเส้นทางอื่น

- [ ] **Step 12: รันให้ผ่านและตรวจ**

Run: `cd apps/api && bunx tsc --noEmit && bun --env-file=.env.test test src/modules/setup src/__tests__/integration/setup.integration.test.ts` Expected: PASS ทุกกรณี (กรณี "พร้อมกัน" ต้องได้ 200 หนึ่งและ 409 หนึ่ง ถ้าได้ 500 แสดงว่าล็อกไม่ทำงาน ให้ตรวจ Step 8 ก่อนผ่อนเงื่อนไข)
Run: `bun run test` (จาก root) Expected: ผ่านทั้งชุด ถ้ามีการทดสอบเดิมที่ล้มเพราะ `app.module` มีเส้นทางใหม่ ให้ดูชื่อเส้นทางที่ชน

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/setup apps/api/src/modules/users apps/api/src/modules/di-registrations.ts apps/api/src/modules/app.module.ts apps/api/src/index.ts apps/api/src/__tests__
gitcz --non-interactive --type=feat --scope=setup --subject="add the first-run setup of the owner, guarded by a one-time code" --body="A shop with nobody in it prints a code in the server log. The owner and the shop name are made once, with that code, under a lock; five wrong tries lock it for fifteen minutes.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ที่เก็บรูปเป็นทางเลือก

**Files:**
- Modify: `apps/api/src/libs/env.ts`
- Modify: `apps/api/src/modules/shared/ports/media-storage.port.ts`, `shared/adapters/worker-media-storage.ts`
- Modify: `apps/api/src/modules/capabilities-v2.controller.ts`
- Modify: `apps/api/src/__tests__/mocks.ts` (`mockMediaStorage`), callers ที่ typecheck ชี้
- Modify: `apps/web/src/features/products/api.ts`, `components/ProductFormDialog.tsx`
- Test: `apps/api/src/modules/shared/adapters/worker-media-storage.test.ts`
- Test: `apps/api/src/__tests__/integration/capabilities.integration.test.ts` (หรือเพิ่มในไฟล์ที่ทดสอบ capabilities เดิม)

**Interfaces:**
- Produces:
  - `env.mediaUrl: string | null`, `env.mediaToken: string | null`
  - `IMediaStorage.isEnabled(): boolean`; `urlFor(key): string | null`
  - `GET /api/v2/capabilities` → `{ checkoutMode, imageStorage: 'enabled' | 'disabled' }`

- [ ] **Step 1: การทดสอบที่ล้มเหลว** `worker-media-storage.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { WorkerMediaStorage } from './worker-media-storage'

describe('WorkerMediaStorage', () => {
  test('without a Worker URL and token it is disabled, has no URLs, and refuses to store', async () => {
    const storage = new WorkerMediaStorage({ mediaUrl: null, mediaToken: null })

    expect(storage.isEnabled()).toBe(false)
    expect(storage.urlFor('a.png')).toBeNull()
    await expect(storage.put('a.png', new Blob(['x']))).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    await expect(storage.delete('a.png')).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
  })

  test('with both it builds public URLs from the Worker URL', () => {
    const storage = new WorkerMediaStorage({ mediaUrl: 'https://media.example.com', mediaToken: 'token' })

    expect(storage.isEnabled()).toBe(true)
    expect(storage.urlFor('products/1.png')).toBe('https://media.example.com/products/1.png')
  })

  test('a URL without a token is not enough', () => {
    expect(new WorkerMediaStorage({ mediaUrl: 'https://media.example.com', mediaToken: null }).isEnabled()).toBe(false)
  })
})
```

- [ ] **Step 2: รันให้ล้มเหลว** `cd apps/api && bun --env-file=.env.test test src/modules/shared/adapters/worker-media-storage.test.ts` Expected: FAIL

- [ ] **Step 3: โค้ด**

`env.ts` แทนสองบรรทัด `mediaUrl`/`mediaToken`:

```ts
  // Image Worker (apps/media), optional: without both the shop runs with no product images.
  // The trailing slash is dropped so keys can be appended.
  mediaUrl: (Bun.env.MEDIA_URL ?? '').replace(/\/+$/, '') || null,
  mediaToken: Bun.env.MEDIA_TOKEN || null,
```

`media-storage.port.ts`

```ts
/** Stores product images. Failures surface as DomainExternalServiceError with code MEDIA_UNAVAILABLE. */
export interface IMediaStorage {
  /** False when no image store is set up: there are no URLs and nothing can be stored. */
  isEnabled(): boolean
  /** Public URL a browser loads the object from; null when images are not set up. */
  urlFor(key: string): string | null
  put(key: string, file: Blob): Promise<void>
  delete(key: string): Promise<void>
}
```

`worker-media-storage.ts` (แทนทั้งไฟล์)

```ts
import { injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../domains/errors/domain-external-service.error'
import { env } from '../../../libs/env'
import type { IMediaStorage } from '../ports/media-storage.port'

const unavailable = () =>
  new DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้ หรือยังไม่ได้ตั้งค่าที่เก็บรูป', 'MEDIA_UNAVAILABLE')

interface MediaSettings {
  mediaUrl: string | null
  mediaToken: string | null
}

/** Talks to the image Worker in apps/media, which fronts the R2 bucket. */
@injectable()
export class WorkerMediaStorage implements IMediaStorage {
  // The settings are read when asked, so the environment decides and a test can pass its own.
  constructor(private readonly settings: MediaSettings = env) {}

  isEnabled() {
    return this.settings.mediaUrl !== null && this.settings.mediaToken !== null
  }

  urlFor(key: string) {
    return this.isEnabled() ? `${this.settings.mediaUrl}/${key}` : null
  }

  async put(key: string, file: Blob) {
    await this.request('PUT', key, { headers: { 'content-type': file.type }, body: file })
  }

  async delete(key: string) {
    await this.request('DELETE', key)
  }

  private async request(method: string, key: string, init: RequestInit = {}) {
    const url = this.urlFor(key)
    if (url === null) throw unavailable()

    const response = await fetch(url, {
      ...init,
      method,
      headers: { ...init.headers, authorization: `Bearer ${this.settings.mediaToken}` },
    }).catch(() => {
      throw unavailable()
    })
    if (!response.ok) {
      console.error(`Media ${method} ${key} failed: ${response.status} ${await response.text()}`)
      throw unavailable()
    }
  }
}
```

(ถ้า tsyringe บ่นเรื่องพารามิเตอร์ constructor ที่ไม่ใช่ token ให้ใช้ `@inject` ไม่ได้กับ object ธรรมดา: เปลี่ยนเป็นไม่มีพารามิเตอร์ใน constructor และเพิ่มเมธอด `static with(settings)` สำหรับทดสอบ หรือสร้างคลาสผ่าน factory ใน `shared.module.ts` ด้วย `container.register(TOKENS.MediaStorage, { useFactory: () => new WorkerMediaStorage() })`)

`capabilities-v2.controller.ts`

```ts
import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from './auth.plugin'
import type { IMediaStorage } from './shared/ports/media-storage.port'
import type { ICheckoutPolicy } from './shared/ports/checkout-policy.port'
import { TOKENS } from './tokens'

@injectable()
export class CapabilitiesV2Controller {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'v2.capabilities', prefix: '/capabilities' })
      .use(auth)
      .get(
        '/',
        async () => ({
          checkoutMode: (await this.policy.isShiftsEnabled()) ? ('shifts' as const) : ('legacy' as const),
          imageStorage: this.media.isEnabled() ? ('enabled' as const) : ('disabled' as const),
        }),
        {
          auth: true,
          response: t.Object({
            checkoutMode: t.Union([t.Literal('legacy'), t.Literal('shifts')]),
            imageStorage: t.Union([t.Literal('enabled'), t.Literal('disabled')]),
          }),
          detail: { summary: 'ความสามารถที่เปิดใช้ใน deployment นี้' },
        },
      )
  }
}
```

`mocks.ts` แก้ `mockMediaStorage`:

```ts
export const mockMediaStorage = (): Mocked<IMediaStorage> => ({
  isEnabled: mock<IMediaStorage['isEnabled']>(() => true),
  urlFor: mock<IMediaStorage['urlFor']>((key) => 'https://media.test/' + key),
  put: mock<IMediaStorage['put']>(async () => {}),
  delete: mock<IMediaStorage['delete']>(async () => {}),
})
```

แก้ที่อื่นที่ typecheck ชี้ (เช่น `fakeMedia`/`test/media-server.ts` ที่ implement `IMediaStorage` ถ้ามี, และผู้ใช้ `urlFor` ที่ต้องรับ `null`: `toProductResponse` ใช้ `imageKey ? media.urlFor(imageKey) : null` ซึ่งรับ `string | null` อยู่แล้ว)

- [ ] **Step 4: การทดสอบ capabilities** เพิ่มใน `apps/api/src/__tests__/integration/` (ไฟล์ใหม่ `capabilities.integration.test.ts`)

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { clientV2, ok, resetDatabase, signIn } from '../../../test/harness'

beforeEach(resetDatabase)

describe('capabilities', () => {
  test('reports the checkout mode and whether product images are set up', async () => {
    const owner = await signIn('owner')

    const capabilities = ok(await owner.apiV2.capabilities.get())

    // The test setup runs an in-memory image store, so images are set up.
    expect(capabilities).toEqual({ checkoutMode: expect.stringMatching(/legacy|shifts/), imageStorage: 'enabled' })
  })
})
```

(ใช้ import ที่มีจริงใน `test/harness`; ถ้าไม่ได้ใช้ `clientV2` ให้ลบ)

- [ ] **Step 5: เว็บ** `features/products/api.ts` เพิ่ม

```ts
import { apiV2 } from '@/lib/api'

/** Whether this shop has a place to keep product images: the upload is hidden when it has not. */
export const imageStorageQuery = queryOptions({
  queryKey: ['capabilities', 'image-storage'] as const,
  queryFn: async () => (await unwrap(apiV2.capabilities.get())).imageStorage,
  staleTime: Infinity,
})
```

(รวม import `apiV2` กับ `api, unwrap` เดิมในบรรทัดเดียว) และ `ProductFormDialog.tsx`: `const imageStorage = useQuery(imageStorageQuery).data` และครอบบล็อกอัปโหลดรูป (`<div className="col-span-2 flex items-center gap-4">…</div>` ที่มี `ProductImage` และปุ่มเลือกรูป) ด้วย `{imageStorage !== 'disabled' && (…)}` ถ้าที่เก็บรูปปิด รูปที่มีอยู่ไม่แสดงในฟอร์ม

- [ ] **Step 6: รันและตรวจ**

Run (root): `bun run typecheck`, `bun run test`, `bun run lint` Expected: ผ่าน
Run: `cd apps/api && bun run openapi:check` Expected: ล้มเหลวเพราะ `capabilities` ของ v2 และ `/setup` ของ v1 (รอ Task 9)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/web/src/features/products
gitcz --non-interactive --type=feat --scope=media --subject="make the image store optional, and say so in the capabilities" --body="Without an image Worker URL and token the shop runs with no product images: storing answers MEDIA_UNAVAILABLE, there are no image URLs, and the product form hides the upload.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: เว็บ: หน้าตั้งค่าครั้งแรก

**Files:**
- Create: `apps/web/src/features/setup/{api.ts,index.ts,locales.ts}`
- Create: `apps/web/src/features/setup/components/SetupPage.tsx`
- Modify: `apps/web/src/app/{App.tsx,i18n.ts}`, `apps/web/src/locales/errors.ts`

**Interfaces:**
- Consumes: `GET/POST /api/v1/setup` (Task 1), `authKeys.me` จาก `@/features/auth` (ผ่าน `index.ts`: เพิ่มการส่งออก `authKeys` ถ้ายังไม่มี)
- Produces: `setupStatusQuery`, `useCompleteSetup`, `SetupPage`, `setupLocales`, `setupKeys`

- [ ] **Step 1: `api.ts`**

```ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { authKeys } from '@/features/auth'
import { api, unwrap } from '@/lib/api'

export const setupKeys = {
  status: ['setup', 'status'] as const,
}

/** Whether the shop still has to be set up (nobody has an account). A failure counts as "no": the login page shows. */
export const setupStatusQuery = queryOptions({
  queryKey: setupKeys.status,
  queryFn: async () => (await unwrap(api.setup.get())).needsSetup,
  retry: false,
  staleTime: Infinity,
})

export interface SetupInput {
  setupCode: string
  shopName: string
  branchName: string
  username: string
  displayName: string
  password: string
}

export function useCompleteSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SetupInput) => unwrap(api.setup.post(input)),
    // The owner is signed in by the same answer, so the shell opens straight away.
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user)
      queryClient.setQueryData(setupKeys.status, false)
    },
  })
}
```

`features/auth/index.ts` เพิ่ม `authKeys` ในการส่งออกจาก `./api`

- [ ] **Step 2: `index.ts`**

```ts
export { setupKeys, setupStatusQuery } from './api'
export { SetupPage } from './components/SetupPage'
export { locales as setupLocales } from './locales'
```

- [ ] **Step 3: `locales.ts`**

```ts
const th = {
  title: 'ตั้งค่าร้านครั้งแรก',
  subtitle: 'สร้างบัญชีเจ้าของร้านและตั้งชื่อร้าน',
  codeNote: 'รหัสตั้งค่าแสดงอยู่ใน log ของระบบ: รัน "docker compose logs app" แล้วมองหา SETUP CODE',
  setupCode: 'รหัสตั้งค่า',
  shopName: 'ชื่อร้าน',
  branchName: 'ชื่อสาขาแรก',
  username: 'ชื่อผู้ใช้ของเจ้าของ',
  displayName: 'ชื่อที่แสดง',
  password: 'รหัสผ่าน',
  passwordHint: 'อย่างน้อย 10 ตัวอักษร',
  confirm: 'ยืนยันรหัสผ่าน',
  mismatch: 'รหัสผ่านสองช่องไม่ตรงกัน',
  submit: 'ตั้งค่าและเข้าสู่ระบบ',
  submitting: 'กำลังตั้งค่า…',
}

const en = {
  title: 'First-time setup',
  subtitle: 'Create the owner account and name the shop',
  codeNote: 'The setup code is in the system log: run "docker compose logs app" and look for SETUP CODE',
  setupCode: 'Setup code',
  shopName: 'Shop name',
  branchName: 'First branch name',
  username: 'Owner username',
  displayName: 'Display name',
  password: 'Password',
  passwordHint: 'At least 10 characters',
  confirm: 'Confirm password',
  mismatch: 'The two passwords do not match',
  submit: 'Set up and sign in',
  submitting: 'Setting up…',
} satisfies typeof th

export const locales = { th, en }
```

- [ ] **Step 4: `SetupPage.tsx`** (โครงเดียวกับ `LoginPage`)

```tsx
import { Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCompleteSetup } from '../api'

/** Shown instead of the login page while nobody has an account: makes the owner and names the shop. */
export function SetupPage() {
  const { t } = useTranslation('setup')
  const [form, setForm] = useState({
    setupCode: '',
    shopName: '',
    branchName: '',
    username: '',
    displayName: '',
    password: '',
    confirm: '',
  })
  const complete = useCompleteSetup()
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value })

  const mismatch = form.confirm !== '' && form.password !== form.confirm
  const canSubmit =
    Object.values(form).every((value) => value.trim() !== '') &&
    form.password.length >= 10 &&
    !mismatch &&
    !complete.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    const { confirm: _confirm, ...input } = form
    complete.mutate({ ...input, setupCode: input.setupCode.trim() })
  }

  const field = (key: keyof typeof form, label: string, options: { type?: string; autoFocus?: boolean; hint?: string } = {}) => (
    <div className="space-y-2">
      <Label htmlFor={`setup-${key}`}>{label}</Label>
      <Input
        id={`setup-${key}`}
        className="h-11 text-base"
        type={options.type ?? 'text'}
        value={form[key]}
        onChange={set(key)}
        autoFocus={options.autoFocus}
        autoComplete={key === 'password' || key === 'confirm' ? 'new-password' : 'off'}
        required
      />
      {options.hint && <p className="text-xs text-muted-foreground">{options.hint}</p>}
    </div>
  )

  return (
    <div className="flex min-h-svh items-center justify-center bg-sidebar p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Store className="size-6" />
          </span>
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">{t('codeNote')}</p>
            {field('setupCode', t('setupCode'), { autoFocus: true })}
            {field('shopName', t('shopName'))}
            {field('branchName', t('branchName'))}
            {field('username', t('username'))}
            {field('displayName', t('displayName'))}
            {field('password', t('password'), { type: 'password', hint: t('passwordHint') })}
            {field('confirm', t('confirm'), { type: 'password' })}
            {mismatch && <p className="text-sm text-destructive">{t('mismatch')}</p>}
            {complete.error && (
              <p role="alert" className="text-sm text-destructive">
                {complete.error.message}
              </p>
            )}
            <Button type="submit" className="h-11 w-full text-base" disabled={!canSubmit}>
              {complete.isPending ? t('submitting') : t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: ต่อเข้า `App`** `app/App.tsx`: `import { setupStatusQuery, SetupPage } from '@/features/setup'` และแทน

```tsx
  const me = useQuery(meQuery)

  if (me.isPending) return <p className="p-8 text-muted-foreground">{t('loading')}</p>
  // Settings need a session, so they are only requested once someone is signed in.
  if (!me.data) return <LoginPage />
```

ด้วย

```tsx
  const me = useQuery(meQuery)
  const setup = useQuery(setupStatusQuery)

  if (me.isPending || setup.isPending) return <p className="p-8 text-muted-foreground">{t('loading')}</p>
  // Settings need a session, so they are only requested once someone is signed in.
  if (!me.data) return setup.data ? <SetupPage /> : <LoginPage />
```

`app/i18n.ts`: `import { setupLocales } from '@/features/setup'` และ `setup: setupLocales.th,` / `setup: setupLocales.en,` ใน `th` และ `en` และ `locales/errors.ts` เพิ่มใน `errors.en`:

```ts
    SETUP_DONE: 'This shop is already set up.',
    SETUP_CODE_INVALID: 'The setup code is not right. It is printed in the system log.',
    SETUP_LOCKED: 'Too many wrong codes. Please wait 15 minutes and try again.',
```

- [ ] **Step 6: ตรวจ** `bun run typecheck && bun run lint && cd apps/web && bun test` Expected: ผ่าน (หน้าจอจริงตรวจที่ Task 7)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
gitcz --non-interactive --type=feat --scope=web --subject="show the first-run setup page while nobody has an account" --body="Asks for the setup code from the server log, the shop and branch names and the owner's account, then signs the owner in.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API บริการหน้าเว็บที่ build แล้ว

**Files:**
- Create: `apps/api/src/modules/web.plugin.ts`
- Test: `apps/api/src/modules/web.plugin.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `webPlugin(root: string | undefined): Elysia` — ไม่มี `root` = ไม่ทำอะไร; ที่ `WEB_DIST` ตั้งค่าใน `app.ts`

- [ ] **Step 1: การทดสอบที่ล้มเหลว** `web.plugin.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { webPlugin } from './web.plugin'

let root: string
let app: Elysia

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'easypos-web-'))
  await mkdir(join(root, 'assets'))
  await writeFile(join(root, 'index.html'), '<html>EasyPOS</html>')
  await writeFile(join(root, 'assets', 'app.js'), 'console.log(1)')
  // A file beside the web root that must never be reachable.
  await writeFile(join(root, '..', `${root.split(/[\\/]/).pop()}-secret.txt`), 'secret')
  app = new Elysia().get('/api/v1/health', () => ({ status: 'ok' })).use(webPlugin(root))
})

afterAll(() => rm(root, { recursive: true, force: true }))

const get = (path: string) => app.handle(new Request(`http://localhost${path}`))

describe('webPlugin', () => {
  test('serves the page at the root and for any route of the web app', async () => {
    for (const path of ['/', '/today', '/products/12']) {
      const response = await get(path)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('<html>EasyPOS</html>')
    }
  })

  test('serves built files as they are', async () => {
    const response = await get('/assets/app.js')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('console.log(1)')
  })

  test('an API route is left to the API, and an unknown one is a 404, not the page', async () => {
    expect(await (await get('/api/v1/health')).json()).toEqual({ status: 'ok' })

    const unknown = await get('/api/v1/nope')
    expect(unknown.status).toBe(404)
    expect(await unknown.text()).not.toContain('EasyPOS')
  })

  test('cannot read outside the web root', async () => {
    const outside = `${root.split(/[\\/]/).pop()}-secret.txt`

    for (const path of [`/../${outside}`, `/%2e%2e/${outside}`, `/assets/../../${outside}`]) {
      const response = await get(path)
      expect(await response.text()).not.toBe('secret')
    }
  })

  test('without a web root it adds nothing', async () => {
    const bare = new Elysia().use(webPlugin(undefined))

    expect((await bare.handle(new Request('http://localhost/'))).status).toBe(404)
  })
})
```

- [ ] **Step 2: รันให้ล้มเหลว** `cd apps/api && bun --env-file=.env.test test src/modules/web.plugin.test.ts` Expected: FAIL (module ไม่พบ)

- [ ] **Step 3: โค้ด** `web.plugin.ts`

```ts
import { stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Elysia, NotFoundError } from 'elysia'

const isFile = async (path: string) => (await stat(path).catch(() => null))?.isFile() ?? false

/**
 * Serves the web app built into `root`, so one process is the whole shop: a file when the path names
 * one, otherwise index.html for the routes the app draws itself. Anything under /api or /openapi that
 * no route answered stays a 404.
 */
export function webPlugin(root: string | undefined) {
  const plugin = new Elysia({ name: 'web' })
  if (!root) return plugin

  const base = resolve(root)
  const index = Bun.file(join(base, 'index.html'))

  return plugin.get('/*', async ({ path }) => {
    if (path.startsWith('/api/') || path === '/api' || path.startsWith('/openapi')) throw new NotFoundError()

    let target: string
    try {
      target = resolve(base, `.${decodeURIComponent(path)}`)
    } catch {
      throw new NotFoundError()
    }
    // Never outside the folder that was built, whatever the path says.
    if (target !== base && !target.startsWith(base + sep)) throw new NotFoundError()

    if (await isFile(target)) {
      const file = Bun.file(target)
      // Built files carry a hash in their name, so they never change; the page itself must be re-read.
      return new Response(file, {
        headers: { 'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' },
      })
    }
    return new Response(index, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } })
  })
}
```

`app.ts`: `import { webPlugin } from './modules/web.plugin'` และต่อท้ายสายโซ่ `.use(v2Module)` ด้วย `.use(webPlugin(Bun.env.WEB_DIST))`

- [ ] **Step 4: รันให้ผ่านและตรวจ** `cd apps/api && bun --env-file=.env.test test src/modules/web.plugin.test.ts && bunx tsc --noEmit` Expected: PASS ถ้าไฟล์ลับถูกอ่านได้ ให้แก้การตรวจพาธ ห้ามผ่อนการทดสอบ

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/web.plugin.ts apps/api/src/modules/web.plugin.test.ts apps/api/src/app.ts
gitcz --non-interactive --type=feat --scope=api --subject="serve the built web app from the API when a web root is set" --body="One process is the whole shop: files by path, index.html for the routes the app draws, a JSON 404 for unknown API paths, and never a file outside the built folder.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ชุดติดตั้ง Docker Compose และสคริปต์ติดตั้ง

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `Caddyfile`, `docker-compose.dev.yml`
- Modify: `docker-compose.yml`, `package.json` (`db:up`), `.env.example`
- Create: `scripts/install.sh`, `scripts/install.ps1`

**Interfaces:**
- Produces: บริการ `db`, `app`, `caddy` (profile `https`); ตัวแปร `POSTGRES_PASSWORD`, `JWT_SECRET`, `PORT`, `COOKIE_SECURE`, `CHECKOUT_MODE`, `DOMAIN`, `MEDIA_URL`, `MEDIA_TOKEN`, `SCB_*`; คำสั่ง `scripts/install.sh [--domain <โดเมน>]`

- [ ] **Step 1: `Dockerfile`**

```dockerfile
# One image for the API and the built web app: the API serves the web files itself (see web.plugin.ts).
FROM oven/bun:1 AS app
WORKDIR /repo

# Dependencies first, so a code change does not reinstall them.
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/media/package.json apps/media/
RUN bun install --frozen-lockfile

COPY . .
RUN cd apps/web && bunx vite build

ENV NODE_ENV=production \
    WEB_DIST=/repo/apps/web/dist \
    PORT=3000
EXPOSE 3000
ENTRYPOINT ["/repo/docker/entrypoint.sh"]
```

`.dockerignore`

```
node_modules
**/node_modules
.git
.env
.env.*
!.env.example
backups
.superpowers
apps/web/dist
**/.wrangler
```

`docker/entrypoint.sh` (บรรทัดจบแบบ LF)

```sh
#!/bin/sh
set -e
cd /repo/apps/api
# Migrations are safe to repeat: the ones already applied are skipped.
bun src/infrastructure/database/migrate.ts
exec bun src/index.ts
```

- [ ] **Step 2: `docker-compose.yml`** (แทนทั้งไฟล์)

```yaml
# EasyPOS for a shop: `scripts/install.sh` writes .env and starts this. Developers add docker-compose.dev.yml
# (see `bun run db:up`) to reach the database from the host.
services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: pos
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pos}
      POSTGRES_DB: pos
    volumes:
      - pos-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pos -d pos"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://pos:${POSTGRES_PASSWORD:-pos}@db:5432/pos
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is not set: run scripts/install.sh, or copy .env.example to .env}
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
      CHECKOUT_MODE: ${CHECKOUT_MODE:-shifts}
      MEDIA_URL: ${MEDIA_URL:-}
      MEDIA_TOKEN: ${MEDIA_TOKEN:-}
      SCB_API_KEY: ${SCB_API_KEY:-}
      SCB_API_SECRET: ${SCB_API_SECRET:-}
      SCB_BILLER_ID: ${SCB_BILLER_ID:-}
      SCB_REF3_PREFIX: ${SCB_REF3_PREFIX:-}
      SCB_API_BASE_URL: ${SCB_API_BASE_URL:-}
    ports:
      - "${PORT:-3000}:3000"

  # Turned on with `--profile https` and DOMAIN set: gets and renews the certificate by itself.
  caddy:
    image: caddy:2-alpine
    profiles: ["https"]
    restart: unless-stopped
    depends_on:
      - app
    environment:
      DOMAIN: ${DOMAIN:?DOMAIN is not set}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data

volumes:
  pos-db:
  caddy-data:
```

ก่อนเขียนทับ ตรวจ `.env.example` ว่ามีชื่อตัวแปร SCB ตรงกัน (เช่น base URL ใช้ชื่ออะไร) และใช้ชื่อที่มีจริงใน `.env.example` และ `apps/api/src/libs/scb-config.ts`

`Caddyfile`

```
{$DOMAIN} {
	encode gzip
	reverse_proxy app:3000
}
```

`docker-compose.dev.yml`

```yaml
# For developers: lets the host reach the database (the tests and `bun run dev` use localhost:5433).
services:
  db:
    ports:
      # 5433 on the host: 5432 is often taken by a locally installed PostgreSQL.
      - "5433:5432"
```

`package.json` (root) แก้ `"db:up": "docker compose up -d db"` เป็น `"db:up": "docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db"`

`.env.example` เพิ่มหัวข้อ (ตัวแปรที่ชุดติดตั้งใช้ ทุกค่าเป็น placeholder):

```
# --- Install kit (docker-compose.yml) ---
# scripts/install.sh writes these for you. Set them by hand only if you start Compose yourself.
# Password of the database container (never published on a port).
POSTGRES_PASSWORD=your-database-password
# The web app is served by the API on this port.
# PORT=3000
# DOMAIN=pos.example.com   (with `docker compose --profile https up -d`, and COOKIE_SECURE=true)
```

และในหัวข้อ `MEDIA_URL`/`MEDIA_TOKEN` เพิ่มบรรทัดคอมเมนต์ `# Optional: leave both empty to run without product images.`

- [ ] **Step 3: `scripts/install.sh`**

```bash
#!/usr/bin/env bash
# Installs EasyPOS with Docker Compose: writes .env with fresh secrets, starts it, and prints the setup code.
#
#   scripts/install.sh                      http://localhost:3000
#   scripts/install.sh --domain pos.my.shop  HTTPS on that domain (ports 80 and 443 must be free and reach this machine)
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed. Install Docker first: https://docs.docker.com/get-docker/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose is not available." >&2; exit 1; }

secret() { head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

if [ -f .env ]; then
  echo ".env already exists: keeping it. Delete it first to make a fresh one."
else
  {
    echo "# Written by scripts/install.sh. Keep this file private: it holds the secrets of this shop."
    echo "POSTGRES_PASSWORD=$(secret 32)"
    echo "JWT_SECRET=$(secret 64)"
    echo "CHECKOUT_MODE=shifts"
    echo "PORT=3000"
    if [ -n "$DOMAIN" ]; then
      echo "DOMAIN=$DOMAIN"
      echo "COOKIE_SECURE=true"
    else
      echo "COOKIE_SECURE=false"
    fi
  } > .env
  chmod 600 .env 2>/dev/null || true
  echo "Wrote .env"
fi

PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2)"
PORT="${PORT:-3000}"
PROFILE=()
if grep -qE '^DOMAIN=.+' .env; then PROFILE=(--profile https); DOMAIN="$(grep -E '^DOMAIN=' .env | tail -1 | cut -d= -f2)"; fi

docker compose -f docker-compose.yml "${PROFILE[@]}" up -d --build

echo "Waiting for the system to start..."
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:${PORT}/api/v1/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "http://localhost:${PORT}/api/v1/health" >/dev/null 2>&1 || {
  echo "The system did not start. See: docker compose logs app" >&2; exit 1; }

URL="http://localhost:${PORT}"
[ -n "$DOMAIN" ] && URL="https://${DOMAIN}"
echo
echo "EasyPOS is running: ${URL}"
CODE="$(docker compose -f docker-compose.yml logs app 2>/dev/null | grep -o 'SETUP CODE[^:]*:  *[A-Z0-9]*' | tail -1 | grep -o '[A-Z0-9]*$' || true)"
if [ -n "$CODE" ]; then
  echo "First-time setup code: ${CODE}"
  echo "Open the address above and enter this code to create the owner account."
else
  echo "This shop is already set up: sign in at the address above."
fi
```

- [ ] **Step 4: `scripts/install.ps1`**

```powershell
# Installs EasyPOS with Docker Compose on Windows: writes .env with fresh secrets, starts it, prints the setup code.
#   .\scripts\install.ps1
#   .\scripts\install.ps1 -Domain pos.my.shop
param([string]$Domain = '')

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker is not installed. Install Docker Desktop first: https://docs.docker.com/get-docker/'
}

function New-Secret([int]$Length) {
  $chars = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  -join (1..$Length | ForEach-Object { $chars[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($chars.Length)] })
}

if (Test-Path .env) {
  Write-Host '.env already exists: keeping it. Delete it first to make a fresh one.'
} else {
  $lines = @(
    '# Written by scripts/install.ps1. Keep this file private: it holds the secrets of this shop.',
    "POSTGRES_PASSWORD=$(New-Secret 32)",
    "JWT_SECRET=$(New-Secret 64)",
    'CHECKOUT_MODE=shifts',
    'PORT=3000'
  )
  if ($Domain) { $lines += "DOMAIN=$Domain"; $lines += 'COOKIE_SECURE=true' } else { $lines += 'COOKIE_SECURE=false' }
  Set-Content -Path .env -Value $lines -Encoding ascii
  Write-Host 'Wrote .env'
}

$envLines = Get-Content .env
$port = ($envLines | Where-Object { $_ -match '^PORT=' } | Select-Object -Last 1) -replace '^PORT=', ''
if (-not $port) { $port = '3000' }
$domainLine = $envLines | Where-Object { $_ -match '^DOMAIN=.+' } | Select-Object -Last 1
$composeArgs = @('-f', 'docker-compose.yml')
if ($domainLine) { $composeArgs += @('--profile', 'https'); $Domain = $domainLine -replace '^DOMAIN=', '' }

docker compose @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) { Write-Error 'docker compose failed' }

Write-Host 'Waiting for the system to start...'
$up = $false
foreach ($attempt in 1..90) {
  try { Invoke-WebRequest -UseBasicParsing "http://localhost:$port/api/v1/health" | Out-Null; $up = $true; break }
  catch { Start-Sleep -Seconds 2 }
}
if (-not $up) { Write-Error 'The system did not start. See: docker compose logs app' }

$url = if ($Domain) { "https://$Domain" } else { "http://localhost:$port" }
Write-Host ''
Write-Host "EasyPOS is running: $url"
$log = docker compose -f docker-compose.yml logs app 2>$null | Out-String
$match = [regex]::Matches($log, 'SETUP CODE[^:]*:\s+([A-Z0-9]+)') | Select-Object -Last 1
if ($match) {
  Write-Host "First-time setup code: $($match.Groups[1].Value)"
  Write-Host 'Open the address above and enter this code to create the owner account.'
} else {
  Write-Host 'This shop is already set up: sign in at the address above.'
}
```

- [ ] **Step 5: ตรวจ**

Run: `docker compose -f docker-compose.yml config --quiet` (ต้องตั้ง `JWT_SECRET` ในสภาพแวดล้อมของคำสั่ง: `JWT_SECRET=x docker compose -f docker-compose.yml config --quiet`) Expected: ไม่มีข้อผิดพลาด; และ `JWT_SECRET=x DOMAIN=a.example docker compose -f docker-compose.yml --profile https config --quiet` ผ่าน
Run: `bash -n scripts/install.sh` Expected: ไม่มี error ไวยากรณ์
Run (PowerShell): `[System.Management.Automation.Language.Parser]::ParseFile('scripts/install.ps1',[ref]$null,[ref]$e)` แล้วตรวจ `$e` ว่างเปล่า

การติดตั้งจริงทดลองใน Task 7 (worktree แยก ห้ามรันสคริปต์ติดตั้งใน repo นี้เพราะ `.env` ที่มีอยู่คือฐาน demo ของเจ้าของ)

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker docker-compose.yml docker-compose.dev.yml Caddyfile package.json .env.example scripts/install.sh scripts/install.ps1
gitcz --non-interactive --type=feat --scope=install --subject="add the Docker Compose install and the one-command installer" --body="One image holds the API and the built web app. The installer writes .env with fresh secrets, starts the stack, waits for it and prints the setup code. The database is not published on a port; developers add docker-compose.dev.yml.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: สำรองและกู้คืน

**Files:**
- Create: `scripts/backup.sh`, `scripts/backup.ps1`, `scripts/restore.sh`, `scripts/restore.ps1`
- Modify: `.gitignore` (เพิ่ม `backups/`)

**Interfaces:**
- Produces: `scripts/backup.sh [โฟลเดอร์]` → `backups/easypos-YYYYMMDD-HHMMSS.sql.gz`; `scripts/restore.sh <ไฟล์> [--yes]`

- [ ] **Step 1: `scripts/backup.sh`**

```bash
#!/usr/bin/env bash
# Saves the whole database to backups/easypos-<date>-<time>.sql.gz. Safe to run while the shop is open.
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${1:-backups}"
mkdir -p "$DIR"
FILE="$DIR/easypos-$(date +%Y%m%d-%H%M%S).sql.gz"

# --clean --if-exists: the file can be loaded over a database that already has the tables.
docker compose -f docker-compose.yml exec -T db pg_dump -U pos -d pos --clean --if-exists --no-owner \
  | gzip > "$FILE"

# A dump that is only the gzip header means pg_dump failed.
if [ "$(wc -c < "$FILE")" -lt 200 ]; then
  rm -f "$FILE"
  echo "The backup failed: is the database running? (docker compose ps)" >&2
  exit 1
fi
echo "Backup saved: $FILE ($(du -h "$FILE" | cut -f1))"
echo "Keep a copy somewhere else too (another disk, or a cloud drive)."
```

- [ ] **Step 2: `scripts/restore.sh`**

```bash
#!/usr/bin/env bash
# Loads a backup made by scripts/backup.sh. It REPLACES everything in the database.
#   scripts/restore.sh backups/easypos-20261014-210000.sql.gz [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Usage: scripts/restore.sh <backup file> [--yes]" >&2; exit 2; }
gzip -t "$FILE" || { echo "$FILE is not a valid backup (the file is damaged)." >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  echo "This replaces ALL data in the shop's database with the contents of:"
  echo "  $FILE"
  read -r -p "Type YES to go on: " answer
  [ "$answer" = "YES" ] || { echo "Cancelled."; exit 1; }
fi

echo "Stopping the app..."
docker compose -f docker-compose.yml stop app
echo "Loading the backup..."
gunzip -c "$FILE" | docker compose -f docker-compose.yml exec -T db psql -U pos -d pos -v ON_ERROR_STOP=1 --quiet
echo "Starting the app (it brings the database up to date if the backup is from an older version)..."
docker compose -f docker-compose.yml start app
echo "Restored from $FILE"
```

- [ ] **Step 3: `scripts/backup.ps1` และ `scripts/restore.ps1`**

`backup.ps1`

```powershell
# Saves the whole database to backups\easypos-<date>-<time>.sql.gz. Safe to run while the shop is open.
param([string]$Directory = 'backups')
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

New-Item -ItemType Directory -Force -Path $Directory | Out-Null
$file = Join-Path $Directory ("easypos-{0}.sql.gz" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$full = Join-Path (Get-Location) $file

# The dump is compressed inside the container, so no text passes through the PowerShell pipeline.
docker compose -f docker-compose.yml exec -T db sh -c 'pg_dump -U pos -d pos --clean --if-exists --no-owner | gzip' > $full
if ($LASTEXITCODE -ne 0 -or (Get-Item $full).Length -lt 200) {
  Remove-Item $full -ErrorAction SilentlyContinue
  Write-Error 'The backup failed: is the database running? (docker compose ps)'
}
Write-Host "Backup saved: $file"
Write-Host 'Keep a copy somewhere else too (another disk, or a cloud drive).'
```

หมายเหตุ: การเปลี่ยนเส้นทางผลลัพธ์แบบไบนารีใน Windows PowerShell 5.1 (`>`) อาจทำให้ไฟล์เสีย ให้ตรวจ Step 5 และถ้าเสียให้เปลี่ยนเป็นเขียนไฟล์ในคอนเทนเนอร์แล้ว `docker compose cp db:/tmp/backup.sql.gz $full` แทน

`restore.ps1`

```powershell
# Loads a backup made by scripts\backup.ps1. It REPLACES everything in the database.
#   .\scripts\restore.ps1 backups\easypos-20261014-210000.sql.gz [-Yes]
param([Parameter(Mandatory = $true)][string]$File, [switch]$Yes)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path $File)) { Write-Error "File not found: $File" }
if (-not $Yes) {
  Write-Host "This replaces ALL data in the shop's database with the contents of: $File"
  if ((Read-Host 'Type YES to go on') -ne 'YES') { Write-Host 'Cancelled.'; exit 1 }
}

docker compose -f docker-compose.yml stop app
docker compose -f docker-compose.yml cp $File db:/tmp/restore.sql.gz
docker compose -f docker-compose.yml exec -T db sh -c 'gunzip -c /tmp/restore.sql.gz | psql -U pos -d pos -v ON_ERROR_STOP=1 --quiet && rm /tmp/restore.sql.gz'
if ($LASTEXITCODE -ne 0) { Write-Error 'The restore failed. The app is stopped: fix the cause, then start it with: docker compose start app' }
docker compose -f docker-compose.yml start app
Write-Host "Restored from $File"
```

และใน `backup.ps1` ใช้แนวเดียวกัน (เขียนในคอนเทนเนอร์แล้ว `docker compose cp`) แทนการ redirect เพื่อไม่ให้ไบนารีผ่าน pipeline ให้เขียนเป็น:

```powershell
docker compose -f docker-compose.yml exec -T db sh -c 'pg_dump -U pos -d pos --clean --if-exists --no-owner | gzip > /tmp/backup.sql.gz'
docker compose -f docker-compose.yml cp db:/tmp/backup.sql.gz $full
docker compose -f docker-compose.yml exec -T db rm -f /tmp/backup.sql.gz
```

(แทนบรรทัด `docker compose … > $full` ด้านบน)

- [ ] **Step 4: `.gitignore`** เพิ่มบรรทัด `backups/`

- [ ] **Step 5: ตรวจกับฐานจริงในเครื่อง (ฐาน Docker `pos-db-1` ของนักพัฒนา ไม่ใช่ฐาน demo)**

ฐานนักพัฒนาของคอนเทนเนอร์ `pos-db-1` อาจใช้ project/ชื่อบริการต่างจากไฟล์ compose นี้ ให้ทดลองด้วยโปรเจกต์ใหม่ที่แยกขาด:

```bash
export COMPOSE_PROJECT_NAME=easypos-backup-test POSTGRES_PASSWORD=test-only JWT_SECRET=x
docker compose -f docker-compose.yml up -d db
# wait for health, then make data to protect
docker compose -f docker-compose.yml exec -T db psql -U pos -d pos -c "create table probe(id int, note text); insert into probe values (1,'before backup');"
scripts/backup.sh /tmp/easypos-backups
docker compose -f docker-compose.yml exec -T db psql -U pos -d pos -c "insert into probe values (2,'after backup'); drop table probe;"
# restore (the app service is not running here: restore.sh stops/starts it, so start it first or run the psql step by hand)
```

Expected: ไฟล์ `.sql.gz` ใหญ่กว่า 200 ไบต์; หลังกู้คืน (`gunzip -c <ไฟล์> | docker compose -f docker-compose.yml exec -T db psql -U pos -d pos`) ตาราง `probe` กลับมาและมีแถวเดียว (`before backup`) จากนั้นล้างโปรเจกต์ทดลอง `docker compose -f docker-compose.yml down -v` ห้ามรันกับโปรเจกต์ของเจ้าของ

การทดลองสคริปต์ทั้งชุดบนระบบเต็มทำใน Task 7 (ข้อมูล demo ผ่านการติดตั้งจริง)

- [ ] **Step 6: Commit**

```bash
git add scripts/backup.sh scripts/backup.ps1 scripts/restore.sh scripts/restore.ps1 .gitignore
gitcz --non-interactive --type=feat --scope=install --subject="add the backup and restore scripts" --body="pg_dump through the database container into a dated gzip file, and a restore that asks before it replaces everything. They need only Docker.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ทดลองติดตั้งจริงและ e2e ของหน้าตั้งค่า

**Files:**
- Modify: `apps/web/e2e/run.ts`
- ไม่มีไฟล์ใหม่ใน repo (การทดลองติดตั้งทำใน worktree ชั่วคราวนอก repo)

**Interfaces:**
- Consumes: Task 1–6

- [ ] **Step 1: ทดลองติดตั้งแบบเต็มใน worktree แยก** (ห้ามทำใน repo หลัก)

```bash
git worktree add ../easypos-install-test HEAD
cd ../easypos-install-test
export COMPOSE_PROJECT_NAME=easypos-install-test
# .env is written by the installer with a spare port, so the shop's own ports and .env are never touched
printf 'PORT=3977\n' > /tmp/port.txt   # not used by the script; see the next line
```

เนื่องจาก `install.sh` เขียน `.env` เอง ให้สร้าง `.env` ที่มี `PORT=3977` ไว้ก่อนใน worktree (`install.sh` จะเก็บไฟล์เดิมและเติมไม่ได้ จึงเขียนครบตามที่สคริปต์ต้องการ):

```bash
cat > .env <<'EOF'
POSTGRES_PASSWORD=install-test-only-password
JWT_SECRET=install-test-only-secret-install-test-only-secret-0123456789
CHECKOUT_MODE=shifts
PORT=3977
COOKIE_SECURE=false
EOF
scripts/install.sh
```

Expected: สร้าง image สำเร็จ, สคริปต์พิมพ์ `EasyPOS is running: http://localhost:3977` และ `First-time setup code: <12 ตัว>`

- [ ] **Step 2: ตรวจพฤติกรรมจริงด้วย HTTP** (ใช้ `curl`, รหัสตั้งค่าจาก Step 1 แทน `$CODE`)

```bash
curl -s localhost:3977/api/v1/setup                                  # {"needsSetup":true}
curl -s -o /dev/null -w "%{http_code}\n" localhost:3977/today          # 200 (the web app)
curl -s -o /dev/null -w "%{http_code}\n" localhost:3977/api/v1/nope    # 404
curl -s -X POST localhost:3977/api/v1/setup -H 'content-type: application/json' \
  -d '{"setupCode":"WRONGWRONGWR","shopName":"x","branchName":"x","username":"owner","displayName":"x","password":"0123456789ab"}'   # SETUP_CODE_INVALID
curl -s -c jar -X POST localhost:3977/api/v1/setup -H 'content-type: application/json' \
  -d "{\"setupCode\":\"$CODE\",\"shopName\":\"ร้านทดลอง\",\"branchName\":\"สาขาแรก\",\"username\":\"owner\",\"displayName\":\"เจ้าของ\",\"password\":\"0123456789ab\"}"
curl -s -b jar localhost:3977/api/v1/auth/me                         # the owner
curl -s localhost:3977/api/v1/setup                                  # {"needsSetup":false}
```

Expected: ตามคอมเมนต์ทุกบรรทัด และ `docker compose logs app` ไม่มี SETUP CODE ใหม่ หลังตั้งค่า

- [ ] **Step 3: ทดลองสำรอง กู้คืน และรีสตาร์ทที่ไม่ออกรหัสใหม่**

ใส่ข้อมูลหนึ่งอย่างผ่าน API (เช่น สร้างสินค้าด้วยคุกกี้ `jar`) → `scripts/backup.sh` → ลบสินค้านั้นหรือเปลี่ยนชื่อ → `scripts/restore.sh backups/<ไฟล์> --yes` → ตรวจว่าข้อมูลกลับมาและเข้าสู่ระบบได้เหมือนเดิม จากนั้น `docker compose restart app` แล้วตรวจ log ว่า **ไม่** มี `SETUP CODE` (ร้านตั้งค่าแล้ว)
Expected: ผ่านทั้งหมด บันทึกผลจริงลง `docs/summary.md` ใน Task 9

- [ ] **Step 4: ล้างการทดลอง**

```bash
docker compose -f docker-compose.yml down -v
cd -
git worktree remove --force ../easypos-install-test
```

- [ ] **Step 5: e2e ของหน้าตั้งค่าครั้งแรก** อ่าน `apps/web/e2e/run.ts` บรรทัด 1–135 (ค่าคงที่ `freshDatabase`, `runOnce`, `waitFor`, `check`, ตัวสร้างเซิร์ฟเวอร์) แล้วเพิ่มฟังก์ชัน `runSetupFlow(browser)` ที่:

1. สร้างฐาน `pos_e2e_setup` ใหม่ (copy ของ `freshDatabase` ที่รับชื่อ) แล้ว `migrate` ด้วย `DATABASE_URL` ของฐานนั้น (**ไม่รัน seed**)
2. เริ่ม API ชุดที่สองที่พอร์ต `API_PORT + 10` โดยเก็บ stdout (`stdout: 'pipe'`) และอ่าน `SETUP CODE` จากบรรทัด log ด้วย regex `/SETUP CODE[^:]*:\s+([A-Z0-9]{12})/` (รอไม่เกิน 30 วินาที) และ vite ชุดที่สองที่พอร์ต `WEB_PORT + 10` ด้วย `API_TARGET` ชี้ API ชุดที่สอง
3. เปิดหน้าเว็บ ตรวจด้วย `check(...)`:
   - เห็นหน้า "ตั้งค่าร้านครั้งแรก" ไม่ใช่หน้าเข้าสู่ระบบ
   - กรอกรหัสผิด + ข้อมูลอื่น → เห็นข้อความข้อผิดพลาด และยังอยู่หน้าตั้งค่า
   - กรอกรหัสถูก → เข้าสู่หน้าขาย (`heading` "ขายสินค้า") ด้วยชื่อร้านที่กรอก
   - รีโหลดหน้า → ยังเข้าสู่ระบบ (เซสชัน) และไม่เห็นหน้าตั้งค่าอีก
4. ปิดเซิร์ฟเวอร์ชุดที่สองและลบฐาน `pos_e2e_setup` ใน `finally` (ใช้ตัวช่วยฆ่า process ที่ไฟล์นี้มีอยู่แล้วสำหรับชุดแรก)

เรียก `runSetupFlow` ใน `main()` ก่อนเริ่มชุดหลัก และพิมพ์หัวข้อ `console.log('\nFirst-run setup:')`

- [ ] **Step 6: รัน** `bun run e2e` (จาก root) Expected: ผ่านทุกกรณี (เดิม + 4 ใหม่)

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e/run.ts
gitcz --non-interactive --type=test --scope=web --subject="add browser checks of the first-run setup page" --body="A second, empty database and server: the page asks for the setup code from the log, refuses a wrong one, signs the owner in with the right one and stays out of the way after a reload.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: เอกสาร ใบอนุญาต และการสแกนความลับ

**Files:**
- Create: `docs/install.md`, `LICENSE`
- Create: `apps/api/src/__tests__/repo-secrets.test.ts`
- Modify: `package.json` (`"license"`), `README.md` (ลิงก์และส่วนหัวใบอนุญาต; ดูข้อควรระวังด้านล่าง), `.env.example` (ถ้าการสแกนชี้)

**Interfaces:**
- Produces: การทดสอบ `repo-secrets` ที่ล้มเมื่อมีความลับในไฟล์ที่ track

- [ ] **Step 1: การทดสอบสแกนความลับที่ล้มเหลวก่อน (ตรวจว่าจับได้จริง)** `repo-secrets.test.ts`

```ts
import { describe, expect, test } from 'bun:test'

const root = new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

async function tracked(): Promise<string[]> {
  const out = await Bun.$`git -C ${root} ls-files`.text()
  return out.split('\n').filter(Boolean)
}

/** Connection strings are fine when the password is an obvious placeholder, or comes from a variable. */
const PLACEHOLDER = /^(pos|password|postgres|test|your-[a-z0-9-]*|<[^>]*>|\$\{[^}]*\}|%s|\.\.\.)$/i

export function findSecrets(path: string, text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/([^:@\s/'"`]+):([^@\s'"`]+)@/g)) {
    const password = match[2]!
    if (!PLACEHOLDER.test(password) && !password.startsWith('${') && !password.includes('<'))
      found.push(`${path}: a database connection string with a password`)
  }
  if (/AVNS_[A-Za-z0-9_-]{10,}/.test(text)) found.push(`${path}: an Aiven service password`)
  return found
}

describe('findSecrets', () => {
  test('flags a real password in a connection string, and an Aiven token', () => {
    // Built from pieces, so these examples are not themselves what the scanner is looking for.
    const url = `postgres://admin:${'S3cr3t'}Real@db.example.com:5432/x`
    expect(findSecrets('a.md', url)).toHaveLength(1)
    expect(findSecrets('a.md', ['AVNS', 'abcdefghijk123'].join('_'))).toHaveLength(1)
  })

  test('lets placeholders and variables through', () => {
    for (const url of [
      'postgres://pos:pos@localhost:5433/pos',
      'postgres://pos:${POSTGRES_PASSWORD:-pos}@db:5432/pos',
      'postgres://user:<password>@host/db',
      'postgres://user:your-password@host/db',
    ])
      expect(findSecrets('a.md', url)).toEqual([])
  })
})

describe('the repository', () => {
  test('tracks no .env or .dev.vars file', async () => {
    const files = (await tracked()).filter((path) => /(^|\/)(\.env|\.dev\.vars)$/.test(path))

    expect(files).toEqual([])
  })

  test('.env.example holds placeholders only', async () => {
    const text = await Bun.file(`${root}/.env.example`).text()
    const keys = ['SCB_API_KEY', 'SCB_API_SECRET', 'SCB_BILLER_ID', 'JWT_SECRET', 'MEDIA_TOKEN', 'POSTGRES_PASSWORD']

    for (const key of keys) {
      const line = text.split('\n').find((candidate) => candidate.startsWith(`${key}=`))
      if (line === undefined) continue
      const value = line.slice(key.length + 1).trim()
      expect(value === '' || value.startsWith('your-') || value.startsWith('replace-'), `${key} in .env.example`).toBe(true)
    }
  })

  test('no tracked text file carries a real database password or service token', async () => {
    const found: string[] = []
    for (const path of await tracked()) {
      if (/\.(png|jpe?g|webp|ico|woff2?|lockb?|gz|zip|pdf)$/i.test(path) || path.endsWith('bun.lock')) continue
      const file = Bun.file(`${root}/${path}`)
      if (!(await file.exists()) || file.size > 2_000_000) continue
      found.push(...findSecrets(path, await file.text()))
    }

    expect(found).toEqual([])
  })
})
```

- [ ] **Step 2: รันและแก้ถ้าจับได้จริง**

Run: `cd apps/api && bun --env-file=.env.test test src/__tests__/repo-secrets.test.ts`
Expected: ผ่านถ้า repo สะอาด ถ้า `.env.example` มีค่าจริงหรือไฟล์ใด track ความลับ ให้แก้ไฟล์นั้นเป็น placeholder (ห้ามผ่อนการทดสอบ) และถ้าการทดสอบจับสตริงของฐาน demo ในเอกสาร ให้แก้เอกสารเป็น `<รหัสผ่าน>`

- [ ] **Step 3: `LICENSE`** ดาวน์โหลดข้อความทางการ

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
head -3 LICENSE
```

Expected: บรรทัดแรกมี `GNU AFFERO GENERAL PUBLIC LICENSE` และ `Version 3, 19 November 2007` ถ้าดาวน์โหลดไม่ได้ ให้หยุดและรายงาน ห้ามเขียนข้อความใบอนุญาตเองจากความจำ

`package.json` (root) เพิ่ม `"license": "AGPL-3.0-only",` (ถ้ายังไม่มี) และ `README.md` เพิ่มท้ายไฟล์หัวข้อ:

```markdown
## ใบอนุญาต

EasyPOS เผยแพร่ภายใต้ [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0)
Copyright (C) 2026 ohmattapon

หากคุณแก้ไขซอฟต์แวร์นี้และให้ผู้อื่นใช้งานผ่านเครือข่าย ต้องเปิดซอร์สโค้ดฉบับที่แก้ไขให้ผู้ใช้เหล่านั้นตามเงื่อนไขของใบอนุญาต
```

และใต้หัวข้อ "เริ่มใช้งานในเครื่อง" เพิ่มย่อหน้าก่อนหน้า: `สำหรับร้านค้าที่ต้องการติดตั้งใช้งานจริง ดู [คู่มือติดตั้ง](docs/install.md)`

**ข้อควรระวัง:** `README.md` มีการแก้ของเจ้าของที่ยังไม่ commit ให้ `git diff README.md` ก่อน การเพิ่มสองส่วนนี้จะถูก commit พร้อมงานของเจ้าของในไฟล์เดียวกัน ให้ stage ไฟล์นี้เฉพาะเมื่อรายงานเจ้าของแล้วว่าจะรวมการแก้ของเขาไปด้วย (ระบุในรายงานสุดท้าย) หรือถ้าไม่ต้องการ ให้ข้ามการแก้ `README.md` และบอกเจ้าของให้เพิ่มสองส่วนนี้เอง

- [ ] **Step 4: `docs/install.md`** (เขียนเป็นภาษาไทย เนื้อหาตามนี้ครบทุกหัวข้อ)

````markdown
# คู่มือติดตั้ง EasyPOS สำหรับร้านค้า

คู่มือนี้ติดตั้ง EasyPOS ด้วย Docker บนเครื่องของร้านหรือ VPS ด้วยคำสั่งเดียว ข้อมูลทั้งหมดอยู่ในเครื่องของคุณเอง

## สิ่งที่ต้องมี

- เครื่องที่ติดตั้ง **Docker** (บน Windows/macOS ใช้ Docker Desktop) และ Docker Compose
- พื้นที่ว่างอย่างน้อย 2 GB และ RAM อย่างน้อย 1 GB
- ถ้าต้องการใช้ผ่านอินเทอร์เน็ตด้วย HTTPS: โดเมนที่ชี้มาที่เครื่องนี้ และพอร์ต 80 กับ 443 ที่เข้าถึงได้

## ติดตั้ง

ดาวน์โหลดหรือ clone โปรเจกต์ แล้วรันในโฟลเดอร์หลัก:

macOS / Linux:

```sh
scripts/install.sh
```

Windows (PowerShell):

```powershell
.\scripts\install.ps1
```

สคริปต์จะ

1. สร้างไฟล์ `.env` พร้อมรหัสลับที่สุ่มให้ (เก็บไฟล์นี้เป็นความลับ ห้ามส่งให้ใคร)
2. สร้างและเริ่มระบบด้วย Docker (ครั้งแรกใช้เวลาหลายนาที)
3. พิมพ์ที่อยู่เว็บและ **รหัสตั้งค่า** ให้

## ตั้งค่าร้านครั้งแรก

1. เปิดที่อยู่ที่สคริปต์พิมพ์ (ปกติ `http://localhost:3000`)
2. กรอก **รหัสตั้งค่า** ที่สคริปต์พิมพ์ให้ ชื่อร้าน ชื่อสาขาแรก และบัญชีเจ้าของ (รหัสผ่านอย่างน้อย 10 ตัวอักษร)
3. กด "ตั้งค่าและเข้าสู่ระบบ" ระบบจะพาเข้าหน้าขาย

ถ้าลืมรหัสตั้งค่า (ก่อนตั้งค่าเสร็จ) รันคำสั่งนี้เพื่อดูรหัส หรือรีสตาร์ทเพื่อรับรหัสใหม่:

```sh
docker compose logs app
docker compose restart app
```

รหัสตั้งค่าใช้ได้ครั้งเดียว กรอกผิด 5 ครั้งจะถูกล็อก 15 นาที หลังตั้งค่าเสร็จหน้านี้ใช้อีกไม่ได้

## ใช้ผ่านอินเทอร์เน็ตด้วย HTTPS

```sh
scripts/install.sh --domain pos.ร้านของคุณ.com
```

(หรือ `.\scripts\install.ps1 -Domain ...`) ระบบจะขอและต่ออายุใบรับรองให้เอง ถ้าติดตั้งไปแล้ว ให้ใส่ `DOMAIN=` และ `COOKIE_SECURE=true` ใน `.env` แล้วรัน `docker compose --profile https up -d`

## สำรองข้อมูล

```sh
scripts/backup.sh
```

ได้ไฟล์ `backups/easypos-วันที่-เวลา.sql.gz` (Windows: `.\scripts\backup.ps1`) **เก็บสำเนาไว้นอกเครื่องนี้ด้วย** เช่นดิสก์อีกลูกหรือ cloud drive

ควรตั้งให้สำรองทุกคืน: บน Linux ใช้ cron (`0 2 * * * cd /path/to/easypos && scripts/backup.sh`) บน Windows ใช้ Task Scheduler เรียก `backup.ps1`

รูปสินค้าที่เก็บบน Cloudflare R2 ไม่อยู่ในไฟล์สำรองนี้

## กู้คืนข้อมูล

```sh
scripts/restore.sh backups/easypos-20261014-210000.sql.gz
```

(Windows: `.\scripts\restore.ps1 backups\...`) **คำสั่งนี้แทนที่ข้อมูลทั้งหมด** จะถามให้พิมพ์ `YES` ก่อน

## อัปเดตเวอร์ชัน

```sh
scripts/backup.sh
git pull
docker compose up -d --build
```

ระบบปรับโครงสร้างฐานข้อมูลให้เองตอนเริ่ม

## ตั้งค่าเพิ่มเติม (ไฟล์ `.env`)

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `PORT` | พอร์ตของเว็บ (ค่าเริ่มต้น 3000) |
| `DOMAIN`, `COOKIE_SECURE` | เปิด HTTPS (ดูหัวข้อด้านบน) |
| `MEDIA_URL`, `MEDIA_TOKEN` | เปิดรูปสินค้า (ต้องมี Cloudflare Worker ของ `apps/media`) ถ้าเว้นว่าง ระบบทำงานได้โดยไม่มีรูป |
| `SCB_API_KEY`, `SCB_API_SECRET`, `SCB_BILLER_ID`, `SCB_REF3_PREFIX` | เปิดการชำระ QR ของ SCB ตั้งค่าและทดสอบกับธนาคารก่อนใช้จริง |

แก้ `.env` แล้วรัน `docker compose up -d` เพื่อให้มีผล

## แก้ปัญหา

| อาการ | ทางแก้ |
|---|---|
| เปิดเว็บไม่ได้ | `docker compose ps` ดูว่า `app` และ `db` ทำงานอยู่ และ `docker compose logs app` ดูข้อความผิดพลาด |
| พอร์ต 3000 ถูกใช้อยู่ | ตั้ง `PORT=` ใน `.env` เป็นเลขอื่นแล้ว `docker compose up -d` |
| ไม่เห็นรหัสตั้งค่า | `docker compose logs app` แล้วหา `SETUP CODE` หรือ `docker compose restart app` |
| ต้องการเริ่มใหม่หมด (ลบข้อมูลทั้งหมด) | `docker compose down -v` แล้วลบ `.env` แล้วรันติดตั้งใหม่ ข้อมูลทั้งหมดจะหายถาวร |

## ใบอนุญาต

AGPL-3.0 ดูไฟล์ `LICENSE`
````

- [ ] **Step 5: ตรวจ** `bun run typecheck && bun run test` (รวม `repo-secrets`) Expected: ผ่าน

- [ ] **Step 6: Commit** (แยกสองอัน)

```bash
git add apps/api/src/__tests__/repo-secrets.test.ts
gitcz --non-interactive --type=test --scope=api --subject="scan the tracked files for passwords and tokens" --body="A real password in a connection string, an Aiven token, a tracked .env, or a value in .env.example that is not a placeholder fails the suite, so a leaked key cannot slip in again.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"

git add docs/install.md LICENSE package.json
gitcz --non-interactive --type=docs --scope=install --subject="add the install guide and the AGPL-3.0 licence" --body="Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: สัญญา OpenAPI (ต้องได้รับอนุมัติ) เอกสารสรุป และการตรวจครั้งสุดท้าย

**Files:**
- Modify (หลังอนุมัติเท่านั้น): `apps/api/test/openapi-baseline.json`, `apps/api/test/openapi-v2-baseline.json`
- Modify: `AGENTS.md`, `docs/superpowers/roadmap.md`, `docs/summary.md`

> **หยุดและถามเจ้าของโครงการก่อนบันทึก baseline** บอกว่า v1 เพิ่ม `GET /api/v1/setup` และ `POST /api/v1/setup` และ v2 เพิ่มช่อง `imageStorage` ใน `GET /api/v2/capabilities` (เพิ่มอย่างเดียว ไม่มีช่องถูกลบหรือเปลี่ยนชนิด)

- [ ] **Step 1: ตรวจว่าความต่างเป็นการเพิ่มอย่างเดียว**

Run: `cd apps/api && bun run openapi:check` (จะล้มเหลวและเขียน `test/openapi-v1-current.json`, `test/openapi-v2-current.json`) เทียบกับ baseline เดิมด้วยสคริปต์ที่นับคีย์ที่มีใน baseline แต่ไม่มีใน current ต้องได้ 0 ทั้งสองรุ่น ถ้าไม่ใช่ ให้หยุดและรายงาน

- [ ] **Step 2: หลังเจ้าของอนุมัติ** บันทึก baseline

```bash
cd apps/api
cp test/openapi-v1-current.json test/openapi-baseline.json
cp test/openapi-v2-current.json test/openapi-v2-baseline.json
rm test/openapi-v1-current.json test/openapi-v2-current.json
bun run openapi:check
```

Expected: `OpenAPI v1 and v2 documents match their baselines` และ commit ด้วย `gitcz --type=chore --scope=api --subject="record the OpenAPI baselines with the setup route and the image storage capability"` พร้อมเนื้อหาว่าเจ้าของอนุมัติและเป็นการเพิ่มอย่างเดียว

- [ ] **Step 3: เอกสาร**

`AGENTS.md`: ในตาราง "คำสั่งที่ใช้บ่อย" เพิ่มแถว `scripts/install.sh` (ติดตั้งชุดจริงด้วย Docker: สร้าง `.env` สุ่มความลับ เริ่มระบบ และพิมพ์รหัสตั้งค่า ห้ามรันใน repo ที่มี `.env` ของนักพัฒนา), `scripts/backup.sh`, `scripts/restore.sh`; เพิ่ม `setup` ในรายการ feature ของเว็บ และเพิ่มหัวข้อย่อยก่อน "### การชำระด้วย QR (SCB)":

```markdown
### การตั้งค่าครั้งแรกและการติดตั้ง

- ฐานที่ไม่มีผู้ใช้ถือว่ายังไม่ตั้งค่า: API ออก "รหัสตั้งค่า" (ในหน่วยความจำ ใช้ครั้งเดียว) พิมพ์ใน log ตอนเริ่ม การตั้งค่าครั้งแรก (`POST /setup`) ต้องใช้รหัสนี้ ล็อก 15 นาทีเมื่อผิด 5 ครั้ง และทำงานได้ครั้งเดียวภายใต้ advisory lock ห้ามเพิ่มทางลัดที่ข้ามรหัสนี้
- `db:seed` เป็นเครื่องมือของนักพัฒนาเท่านั้น ชุดติดตั้งไม่รัน และห้ามให้ repo มีรหัสผ่านเริ่มต้นของบัญชีจริง
- ที่เก็บรูปเป็นทางเลือก (`MEDIA_URL`/`MEDIA_TOKEN`): ใช้ `IMediaStorage.isEnabled()` และ `urlFor` ที่อาจเป็น `null` ห้ามสมมติว่ามีรูป
- `docker-compose.yml` ไม่เปิดพอร์ตฐานข้อมูลออกนอกเครื่อง นักพัฒนาใช้ `docker-compose.dev.yml` (ผ่าน `bun run db:up`)
- การทดสอบ `repo-secrets` สแกนไฟล์ที่ track หารหัสผ่านและโทเค็น
```

`docs/superpowers/roadmap.md` ข้อ 14 ลงท้ายด้วย `(เสร็จฝั่งโค้ดบน branch `ohmattpon/install-kit`: หน้าตั้งค่าครั้งแรกด้วยรหัสใน log, Docker Compose, สคริปต์ติดตั้ง/สำรอง/กู้คืน, คู่มือติดตั้งและ AGPL-3.0 ยังไม่มีตัวติดตั้ง Windows แบบดับเบิลคลิก ที่เก็บรูปในเครื่อง (ข้อ 13) และการรีเซ็ตรหัสผ่านเจ้าของที่ลืม)` และ `docs/summary.md` แถวข้อ 11–14 → แยกข้อ 14 เป็นเสร็จฝั่งโค้ด พร้อมผลการทดลองติดตั้งจริงจาก Task 7 และตัวเลขทดสอบจริง

- [ ] **Step 4: ตรวจทั้งโครงการ**

Run (root, Docker DB เปิดอยู่): `bun run typecheck`, `bun run test`, `bun run lint`, `cd apps/web && bunx vite build`, `bun run e2e`
Expected: ผ่านทั้งหมด (ถ้ายังไม่ได้รับอนุมัติ baseline `openapi:check` ล้มเหลว ให้รายงานตามจริง) บันทึกจำนวนการทดสอบจริงลง `docs/summary.md`

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/superpowers/roadmap.md docs/summary.md
gitcz --non-interactive --type=docs --scope=install --subject="record the install kit rules, roadmap and summary" --body="Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

| ข้อกำหนดใน spec | Task |
|---|---|
| รหัสตั้งค่าครั้งเดียวใน log, ผิด 5 ครั้งล็อก 15 นาที, เทียบเวลาคงที่ | 1 |
| `GET/POST /setup`, ล็อกอินให้, รหัสผ่าน ≥ 10, `SETUP_DONE`, advisory lock | 1 |
| เว็บ `/setup` และ `App` ตรวจ `needsSetup` | 3 |
| `db:seed` ยังเป็นของนักพัฒนา ชุดติดตั้งไม่รัน | 5 (entrypoint ไม่ seed), 9 (AGENTS) |
| `Dockerfile` หลายขั้น + `WEB_DIST` + API บริการเว็บ + fallback | 4, 5 |
| compose: `db` ไม่เปิดพอร์ต, `app` migrate อัตโนมัติ, `caddy` profile `https` + `COOKIE_SECURE` | 5 |
| `install.sh|ps1` สร้าง `.env` สุ่ม ไม่เขียนทับ รอระบบพร้อม พิมพ์ URL+รหัส | 5 |
| `MEDIA_URL/TOKEN` ไม่บังคับ, `imageStorage` ใน capabilities, เว็บซ่อนอัปโหลด | 2 |
| `backup.sh|ps1`, `restore.sh|ps1` (ถามยืนยัน หยุด/เริ่ม app) | 6 |
| `docs/install.md`, `LICENSE` AGPL-3.0, ลิงก์จาก README | 8 |
| การทดสอบสแกนความลับ | 8 |
| ทดสอบติดตั้ง/สำรอง/กู้คืนจริง | 7 |
| baseline OpenAPI หลังแจ้งเจ้าของ | 9 |

**2. Placeholder scan:** ไม่มี "TBD/TODO" จุดที่แผนบอกให้ "ตรวจแล้วปรับตามจริง" มีเฉพาะที่ผมไม่ได้เห็นโค้ดครบ (ชื่อตัวแปร SCB ใน `.env.example`, ลายเซ็น `DomainForbiddenError`, รูปทรง `createUserSchema`, การ inject พารามิเตอร์ใน constructor ของ tsyringe, โครง `run.ts` ช่วงต้น) ทุกจุดระบุสิ่งที่ห้ามผ่อน

**3. Type consistency:** `ISetupCode.issue/verify/retire`, `SetupCodeCheck`, `IFirstRunGuard.countUsers/lockAndCountUsers`, `setupCodeToken`, `firstRunGuardToken`, `GetSetupStatusUseCase`, `CompleteSetupUseCase`, `IMediaStorage.isEnabled/urlFor(string|null)`, `webPlugin(root)`, `imageStorageQuery`, `setupStatusQuery`, `useCompleteSetup` ใช้ชื่อเดียวกันทุก task

**4. Review Focus:** ครบห้าข้อ — ข้อ 1 (Task 1: unit `five wrong tries lock it…`, integration `a wrong code, and no code issued…` และ `five wrong tries lock it…`), ข้อ 2 (Task 1 integration `two setups at the same moment…`), ข้อ 3 (Task 1 `once done it cannot be done again…`, Task 7 รีโหลดแล้วไม่เห็นหน้าตั้งค่า), ข้อ 4 (Task 2: `WorkerMediaStorage` ทดสอบไม่มี URL/โทเค็น และเว็บซ่อนอัปโหลด; Task 7 ระบบเริ่มได้ในคอนเทนเนอร์ที่ไม่มี `MEDIA_URL`), ข้อ 5 (Task 4: `an API route is left to the API…` และ `cannot read outside the web root`)
