# สิทธิ์ละเอียดและบันทึกการกระทำ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เจ้าของร้านตั้งบทบาทพร้อมสิทธิ์รายฟังก์ชันได้ และระบบเก็บประวัติการกระทำสำคัญด้านเงิน สต็อก และสิทธิ์ในตารางที่เขียนอย่างเดียว

**Architecture:** รายการสิทธิ์ตายตัวใน `domains/permission.vo.ts`; บทบาทและสิทธิ์เก็บในตาราง `roles`/`role_permissions` (โมดูล `roles`) ส่วน `users.role` (enum เดิม) ยังถูกเขียนต่อเพื่อความเข้ากันได้ของ v1 และ `users.role_id` เป็นของจริง; `AuthorizeSessionUseCase` โหลดสิทธิ์ผ่าน port แล้วทุกจุดเช็กด้วย `canDo`/`requirePermission`; `audit_logs` เขียนผ่าน port `IAuditLog` ในธุรกรรมของคำสั่ง

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod, React + TanStack Query + shadcn

**Spec:** `docs/superpowers/specs/2026-10-16-permissions-audit-log-design.md`

## Global Constraints

- commit ด้วย `gitcz --non-interactive --type=… --scope=… --subject="…" --body="…"` เท่านั้น (`build` ใช้ไม่ได้) stage เฉพาะไฟล์ของเรื่อง; ท้าย body ใส่ `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- ทำบน branch `ohmattpon/permissions-audit-log` (มีอยู่แล้ว) push ได้เฉพาะ branch นี้ (`git push -u origin ohmattpon/permissions-audit-log`) ห้ามเปิด PR/merge เอง
- API: Hexagonal + CQRS: use case หนึ่งไฟล์ต่อหนึ่ง action, `execute()` parse ด้วย zod เป็นขั้นแรก, query ห้ามมีผลข้างเคียง, `domains/` ห้าม import Elysia/Drizzle/tsyringe/zod, repository ใช้ `currentExecutor()`
- ข้อผิดพลาดเป็น domain error ที่มีข้อความไทยและ `code` คงที่; ไม่เพิ่มช่อง `message` ใน response
- เส้นทางใหม่อยู่ใต้ `/api/v1`; v1 เปลี่ยนแบบ additive เท่านั้น (ช่อง `role` เดิมต้องคงอยู่และความหมายเดิม); เส้นทางที่คืนรายการคืน `{ items, total }` ผ่าน `page()`; รายการที่โตไม่จำกัดรับ `limit`/`offset` และ port คืน `Page<T>`
- ต้องแจ้งเจ้าของโครงการก่อนบันทึก `apps/api/test/openapi-baseline.json` ใหม่
- เว็บ: อยู่ใน `features/<name>`, ข้อความทุกตัวผ่าน `t()` (th เป็นต้นแบบ, `en` ใช้ `satisfies typeof th`), คอมโพเนนต์ห้ามเรียก `api`/`unwrap` ตรง ๆ, ปุ่มและช่องกรอกสูง ≥ 44px (`h-11`), ตารางใช้ `DataTable` พร้อม `priority` ทุกคอลัมน์
- ชุดทดสอบเดิมทั้งหมดต้องผ่านโดยไม่แก้ assertion ที่มีอยู่
- ก่อนบอกว่าเสร็จ: `bun run typecheck`, `bun run test:unit`, `bun run lint`, และ `bun run test` (ต้องมี PostgreSQL; ถ้าไม่มีให้ CI รัน แล้วบอกชัดว่ายังไม่ได้รัน)

## Review Focus

1. ผู้ใช้เดิม role `cashier` ต้องไม่ได้สิทธิ์เพิ่ม และ `owner` ต้องไม่เสียสิทธิ์: Task 5 มีเทสต์ที่ไล่ทุกสิทธิ์
2. ถอดสิทธิ์/เปลี่ยนบทบาทแล้วต้องมีผลคำขอถัดไปทันที (ห้ามแคชสิทธิ์ใน JWT หรือหน่วยความจำ): Task 5 integration
3. เจ้าของที่ใช้งานได้คนสุดท้ายห้ามถูกถอดบทบาท `owner` ไม่ว่าผ่านเส้นทางผู้ใช้หรือบทบาท: Task 3
4. `resetDatabase` ของเทสต์ truncate ทุกตาราง บทบาทระบบจึงหายและทำให้ `signIn()` ทุกเทสต์ล้ม ต้องใส่กลับ: Task 2
5. การเขียน audit ต้องถอยพร้อมธุรกรรมของคำสั่ง และ log ห้ามมีความลับ (รหัสผ่าน hash): Task 7
6. `auth.login_failed` ล้มเหลวในการเขียนต้องไม่ทำให้ล็อกอินเป็น 500: Task 7

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/api/src/domains/permission.vo.ts` | `PERMISSIONS`, `Permission`, `isPermission`, กลุ่มสำหรับเว็บ |
| `apps/api/src/domains/authorization.ts` | `Actor`, `canDo`, `requirePermission` |
| `apps/api/src/domains/role.domain.ts` | `RoleEntity` (ชื่อ, ชุดสิทธิ์, บทบาทระบบ) |
| `apps/api/src/domains/audit-entry.vo.ts` | `AuditEntry` (ตัดค่าใหญ่, ห้ามช่องลับ) |
| `apps/api/src/domains/user.domain.ts` | เพิ่ม `roleId` (optional) |
| `apps/api/src/infrastructure/database/schema/{roles,audit-logs}.ts`, `users.ts` | ตารางใหม่ + `users.role_id` |
| `apps/api/drizzle/0017_permissions.sql` (+ journal, snapshot) | migration |
| `apps/api/src/modules/roles/**` | CRUD บทบาท, `IRoleDirectory`, `IRolePermissionReader` |
| `apps/api/src/modules/audit/**` | `IAuditLog`, adapter, `ListAuditLogsUseCase`, controller |
| `apps/api/src/modules/auth.plugin.ts`, `auth/.../authorize-session.usecase.ts` | macro `{ can }`, โหลดสิทธิ์ |
| use case/controller ที่มี `owner` เดิม (ตารางใน Task 5) | เปลี่ยนเป็นสิทธิ์ |
| `apps/web/src/features/{roles,audit}/**`, `features/auth`, `features/users`, `app/AppSidebar.tsx`, `locales/errors.ts` | เว็บ |

---

### Task 1: โดเมน: สิทธิ์ การตรวจสิทธิ์ บทบาท และ audit entry

**Files:**
- Create: `apps/api/src/domains/permission.vo.ts`, `apps/api/src/domains/permission.vo.test.ts`
- Create: `apps/api/src/domains/authorization.ts`, `apps/api/src/domains/authorization.test.ts`
- Create: `apps/api/src/domains/role.domain.ts`, `apps/api/src/domains/role.domain.test.ts`
- Create: `apps/api/src/domains/audit-entry.vo.ts`, `apps/api/src/domains/audit-entry.vo.test.ts`
- Modify: `apps/api/src/domains/user.domain.ts`, `apps/api/src/domains/user.domain.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSIONS: readonly Permission[]`, `type Permission`, `isPermission(v: unknown): v is Permission`, `PERMISSION_GROUPS: readonly { key: string; permissions: readonly Permission[] }[]`
  - `interface Actor { role: UserRole; permissions?: readonly Permission[] }`, `canDo(actor: Actor, permission: Permission): boolean`, `requirePermission(actor: Actor, permission: Permission, message?: string): void` (โยน `DomainForbiddenError` code `PERMISSION_DENIED`, params `{ permission }`)
  - `RoleEntity` props `{ id, name, systemKey: 'owner' | 'cashier' | null, permissions: readonly Permission[] }`; `RoleEntity.with({ name?, permissions? })`; `isSystem`, `isOwner`; `toSnapshot()`
  - `AuditEntry` props `{ action, entityType, entityId, summary, before?, after?, reason? }` ผ่าน `buildAuditEntry(props)`
  - `UserEntity.roleId: number | null` (props `roleId?: number | null`, default `null`; `with({ roleId })`; **ไม่อยู่ใน `toSnapshot()`** เพื่อให้ assertion เดิมไม่พัง)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม — `permission.vo.test.ts`**

```ts
import { describe, expect, test } from 'bun:test'
import { isPermission, PERMISSIONS, PERMISSION_GROUPS } from './permission.vo'

describe('permissions', () => {
  test('are unique and every one belongs to exactly one group', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length)
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions)
    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort())
  })

  test('are written as area.action', () => {
    for (const permission of PERMISSIONS) expect(permission).toMatch(/^[a-z]+\.[a-z]+$/)
  })

  test('isPermission accepts only the listed ones', () => {
    expect(isPermission('sales.void')).toBe(true)
    expect(isPermission('sales.fly')).toBe(false)
    expect(isPermission(7)).toBe(false)
  })
})
```

- [ ] **Step 2: เขียนเทสต์ที่ล้ม — `authorization.test.ts`, `role.domain.test.ts`, `audit-entry.vo.test.ts`**

```ts
// authorization.test.ts
import { describe, expect, test } from 'bun:test'
import { DomainForbiddenError } from './errors/domain-forbidden.error'
import { canDo, requirePermission } from './authorization'

describe('canDo', () => {
  test('an owner can do everything, with or without a listed permission', () => {
    expect(canDo({ role: 'owner' }, 'sales.void')).toBe(true)
    expect(canDo({ role: 'owner', permissions: [] }, 'audit.read')).toBe(true)
  })
  test('anyone else can do only what their role lists', () => {
    expect(canDo({ role: 'cashier' }, 'sales.void')).toBe(false)
    expect(canDo({ role: 'cashier', permissions: ['sales.void'] }, 'sales.void')).toBe(true)
    expect(canDo({ role: 'cashier', permissions: ['sales.void'] }, 'inventory.adjust')).toBe(false)
  })
})

describe('requirePermission', () => {
  test('passes silently when allowed', () => {
    expect(() => requirePermission({ role: 'owner' }, 'sales.void')).not.toThrow()
  })
  test('throws PERMISSION_DENIED naming the missing permission, with the caller message when given', () => {
    try {
      requirePermission({ role: 'cashier' }, 'sales.void', 'เฉพาะเจ้าของร้านเท่านั้น')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainForbiddenError)
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED', message: 'เฉพาะเจ้าของร้านเท่านั้น', params: { permission: 'sales.void' } })
    }
  })
  test('uses a default Thai message otherwise', () => {
    expect(() => requirePermission({ role: 'cashier' }, 'sales.void')).toThrow('ไม่มีสิทธิ์ใช้งานส่วนนี้')
  })
})
```

```ts
// role.domain.test.ts
import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { RoleEntity } from './role.domain'

const make = (over: Partial<ConstructorParameters<typeof RoleEntity>[0]> = {}) =>
  new RoleEntity({ id: 3, name: 'ผู้จัดการ', systemKey: null, permissions: ['sales.void'], ...over })

describe('RoleEntity', () => {
  test('keeps permissions unique and sorted', () => {
    expect(make({ permissions: ['sales.void', 'inventory.adjust', 'sales.void'] }).permissions).toEqual(['inventory.adjust', 'sales.void'])
  })
  test.each([[''], ['   '], ['x'.repeat(61)]])('rejects the name %p', (name) => {
    expect(() => make({ name })).toThrow(DomainError)
  })
  test('trims the name', () => {
    expect(make({ name: '  ผู้จัดการ  ' }).name).toBe('ผู้จัดการ')
  })
  test('a system role is protected: it cannot be renamed, and the owner role keeps every permission', () => {
    const owner = make({ systemKey: 'owner', name: 'เจ้าของร้าน', permissions: [] })
    expect(owner.isSystem).toBe(true)
    expect(owner.isOwner).toBe(true)
    expect(() => owner.with({ name: 'อื่น' })).toThrow(expect.objectContaining({ code: 'ROLE_PROTECTED' }))
    expect(() => owner.with({ permissions: ['sales.void'] })).toThrow(expect.objectContaining({ code: 'ROLE_PROTECTED' }))
  })
  test('the cashier role may change its permissions but not its name', () => {
    const cashier = make({ systemKey: 'cashier', name: 'แคชเชียร์', permissions: [] })
    expect(cashier.with({ permissions: ['reports.read'] }).permissions).toEqual(['reports.read'])
    expect(() => cashier.with({ name: 'อื่น' })).toThrow(expect.objectContaining({ code: 'ROLE_PROTECTED' }))
  })
  test('a custom role can change both', () => {
    const changed = make().with({ name: 'หัวหน้ากะ', permissions: ['shifts.override'] })
    expect(changed).toMatchObject({ name: 'หัวหน้ากะ', permissions: ['shifts.override'] })
  })
})
```

```ts
// audit-entry.vo.test.ts
import { describe, expect, test } from 'bun:test'
import { buildAuditEntry, MAX_AUDIT_JSON_BYTES } from './audit-entry.vo'

const base = { action: 'sale.void', entityType: 'sale', entityId: '412', summary: 'ยกเลิกบิล' }

describe('buildAuditEntry', () => {
  test('keeps before and after as given when small', () => {
    expect(buildAuditEntry({ ...base, before: { status: 'completed' }, after: { status: 'voided' } })).toMatchObject({
      before: { status: 'completed' },
      after: { status: 'voided' },
    })
  })
  test('removes secret-looking fields at any depth', () => {
    const entry = buildAuditEntry({ ...base, after: { displayName: 'a', password: 'x', passwordHash: 'y', nested: { token: 'z', ok: 1 } } })
    expect(entry.after).toEqual({ displayName: 'a', nested: { ok: 1 } })
  })
  test('replaces a value larger than the limit with a marker instead of storing it', () => {
    const entry = buildAuditEntry({ ...base, after: { blob: 'x'.repeat(MAX_AUDIT_JSON_BYTES + 1) } })
    expect(entry.after).toEqual({ truncated: true })
  })
  test('rejects an empty action or summary', () => {
    expect(() => buildAuditEntry({ ...base, action: '' })).toThrow()
    expect(() => buildAuditEntry({ ...base, summary: '' })).toThrow()
  })
})
```

- [ ] **Step 3: รันให้เห็นว่าล้ม** — `cd apps/api && bun --env-file=.env.test test src/domains/permission.vo.test.ts src/domains/authorization.test.ts src/domains/role.domain.test.ts src/domains/audit-entry.vo.test.ts` → FAIL (module not found)

- [ ] **Step 4: เขียนโค้ด**

```ts
// permission.vo.ts
export const PERMISSION_GROUPS = [
  { key: 'sales', permissions: ['sales.void', 'qr.dismiss', 'reports.read'] },
  { key: 'catalog', permissions: ['products.write', 'categories.write', 'modifiers.write', 'promotions.write', 'members.write', 'tables.write', 'kitchen.write'] },
  { key: 'inventory', permissions: ['inventory.receive', 'inventory.adjust'] },
  { key: 'operations', permissions: ['registers.manage', 'branches.manage', 'branches.switch', 'shifts.override', 'settings.write'] },
  { key: 'admin', permissions: ['users.manage', 'roles.manage', 'audit.read'] },
] as const

export type Permission = (typeof PERMISSION_GROUPS)[number]['permissions'][number]

export const PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((group) => group.permissions)

export const isPermission = (value: unknown): value is Permission => PERMISSIONS.includes(value as Permission)
```

```ts
// authorization.ts
import { DomainForbiddenError } from './errors/domain-forbidden.error'
import type { Permission } from './permission.vo'
import type { UserRole } from './user-role.vo'

/** What the rules need to know about the person acting. `permissions` is absent for an actor built without a role lookup. */
export interface Actor {
  role: UserRole
  permissions?: readonly Permission[]
}

/** The owner role holds every permission, including ones added later, so it needs no list. */
export const canDo = (actor: Actor, permission: Permission): boolean =>
  actor.role === 'owner' || (actor.permissions?.includes(permission) ?? false)

export function requirePermission(actor: Actor, permission: Permission, message = 'ไม่มีสิทธิ์ใช้งานส่วนนี้'): void {
  if (!canDo(actor, permission)) throw new DomainForbiddenError(message, 'PERMISSION_DENIED', { permission })
}
```

```ts
// role.domain.ts
import { DomainError } from './errors/domain-error'
import { isPermission, type Permission } from './permission.vo'

export const MAX_ROLE_NAME_LENGTH = 60
export type SystemRoleKey = 'owner' | 'cashier'

export interface RoleEntityProps {
  /** 0 until stored. */
  id: number
  name: string
  systemKey: SystemRoleKey | null
  permissions: readonly Permission[]
}

const protectedRole = () => new DomainError('บทบาทของระบบแก้ไขส่วนนี้ไม่ได้', 'ROLE_PROTECTED')

/** A set of permissions people can be given. The two system roles are seeded and cannot be removed. */
export class RoleEntity {
  readonly id: number
  readonly name: string
  readonly systemKey: SystemRoleKey | null
  readonly permissions: readonly Permission[]

  constructor(props: RoleEntityProps) {
    const name = props.name.trim()
    if (name.length < 1 || name.length > MAX_ROLE_NAME_LENGTH)
      throw new DomainError(`ชื่อบทบาทต้องยาว 1 ถึง ${MAX_ROLE_NAME_LENGTH} ตัวอักษร`, 'INVALID_ROLE')
    if (!props.permissions.every(isPermission)) throw new DomainError('สิทธิ์ไม่ถูกต้อง', 'INVALID_ROLE')

    this.id = props.id
    this.name = name
    this.systemKey = props.systemKey
    this.permissions = [...new Set(props.permissions)].sort()
  }

  get isSystem() {
    return this.systemKey !== null
  }

  get isOwner() {
    return this.systemKey === 'owner'
  }

  with(changes: { name?: string; permissions?: readonly Permission[] }): RoleEntity {
    if (this.isSystem && changes.name !== undefined && changes.name.trim() !== this.name) throw protectedRole()
    if (this.isOwner && changes.permissions !== undefined) throw protectedRole()
    return new RoleEntity({
      id: this.id,
      name: changes.name ?? this.name,
      systemKey: this.systemKey,
      permissions: changes.permissions ?? this.permissions,
    })
  }

  toSnapshot(): RoleEntityProps {
    return { id: this.id, name: this.name, systemKey: this.systemKey, permissions: [...this.permissions] }
  }
}
```

```ts
// audit-entry.vo.ts
import { DomainError } from './errors/domain-error'

export const MAX_AUDIT_JSON_BYTES = 8 * 1024
const SECRET_KEY = /password|hash|secret|token/i

export interface AuditEntryProps {
  action: string
  entityType: string
  entityId: string
  summary: string
  before?: unknown
  after?: unknown
  reason?: string | null
}

export interface AuditEntry {
  action: string
  entityType: string
  entityId: string
  summary: string
  before: unknown
  after: unknown
  reason: string | null
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, inner]) => [key, scrub(inner)]),
    )
  return value
}

function bounded(value: unknown): unknown {
  if (value === undefined) return null
  const clean = scrub(value)
  return JSON.stringify(clean).length > MAX_AUDIT_JSON_BYTES ? { truncated: true } : clean
}

/** What gets recorded: the secret-looking fields are dropped and a value that is too large is replaced by a marker. */
export function buildAuditEntry(props: AuditEntryProps): AuditEntry {
  if (props.action.length < 1 || props.summary.length < 1) throw new DomainError('บันทึกการกระทำไม่ครบ', 'INVALID_AUDIT_ENTRY')
  return {
    action: props.action,
    entityType: props.entityType,
    entityId: props.entityId,
    summary: props.summary,
    before: bounded(props.before),
    after: bounded(props.after),
    reason: props.reason ?? null,
  }
}
```

- [ ] **Step 5: เพิ่ม `roleId` ให้ `UserEntity` พร้อมเทสต์**

เพิ่มใน `user.domain.test.ts`:

```ts
test('carries the stored role id, defaulting to none, and it stays out of the snapshot', () => {
  expect(makeUser().roleId).toBeNull()
  const user = makeUser({ roleId: 4 })
  expect(user.roleId).toBe(4)
  expect(user.with({ displayName: 'ใหม่' }).roleId).toBe(4)
  expect(user.with({ roleId: 9 }).roleId).toBe(9)
  expect('roleId' in user.toSnapshot()).toBe(false)
})
```

แก้ `user.domain.ts`: `UserEntityProps` เพิ่ม `roleId?: number | null`; `UserChanges` เพิ่ม `'roleId'` ใน `Pick` ไม่ได้เพราะเป็น optional ให้เขียน `Partial<Pick<UserEntityProps, 'displayName' | 'role' | 'branchId' | 'isActive'>> & { roleId?: number | null }`; เพิ่ม `public readonly roleId: number | null`, กำหนด `this.roleId = props.roleId ?? null`, `with()` ส่ง `roleId: changes.roleId ?? this.roleId`; **ห้ามเพิ่มใน `toSnapshot()`** (ถ้า `toSnapshot` ถูกแก้ ให้ `UserEntityProps` ใน `makeUser` ยังพอดี)

- [ ] **Step 6: รันเทสต์ domains ให้ผ่าน** — `cd apps/api && bun --env-file=.env.test test src/domains` → PASS ทั้งหมด

- [ ] **Step 7: Commit** — `git add apps/api/src/domains && gitcz --non-interactive --type=feat --scope=permissions --subject="add permissions, roles and audit entries to the domain"`

---

### Task 2: ตาราง migration และการ seed บทบาทระบบ

**Files:**
- Create: `apps/api/src/infrastructure/database/schema/roles.ts`, `apps/api/src/infrastructure/database/schema/audit-logs.ts`
- Modify: `apps/api/src/infrastructure/database/schema/users.ts`, `.../schema/index.ts`
- Create: `apps/api/drizzle/0017_permissions.sql` (สร้างด้วย `bun run db:generate` แล้วแก้), `apps/api/drizzle/meta/0017_snapshot.json`, แก้ `drizzle/meta/_journal.json`
- Modify: `apps/api/test/harness.ts` (`resetDatabase`), สคริปต์ e2e/screenshots ที่ truncate (ค้นด้วย `grep -rn "truncate table" apps scripts test`)

**Interfaces:**
- Produces: ตาราง `roles(id, name unique, system_key unique nullable, created_at, updated_at)`, `role_permissions(role_id, permission)` PK คู่, `users.role_id` NOT NULL FK, `audit_logs(...)` ตามสเปกหัวข้อ 4; export `roles`, `rolePermissions`, `auditLogs` จาก schema index; ค่าคงที่ `SYSTEM_ROLE_IDS` ไม่มี (หา id ด้วย `system_key` เสมอ)

- [ ] **Step 1: เขียน schema**

```ts
// roles.ts
import { index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const roles = pgTable('roles', {
  id: id(),
  name: text().notNull().unique(),
  // Set only on the two roles the system ships with; they cannot be deleted.
  systemKey: text().unique(),
  ...timestamps,
})

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: integer()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permission] }), index().on(table.permission)],
)
```

```ts
// audit-logs.ts
import { bigint, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { branches } from './branches'
import { users } from './users'

/** Append-only: nothing in the code updates or deletes a row. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorId: integer().references(() => users.id),
    actorName: text().notNull(),
    branchId: integer().references(() => branches.id),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    summary: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    reason: text(),
  },
  (table) => [index().on(table.at), index().on(table.actorId, table.at), index().on(table.action, table.at)],
)
```

`users.ts`: เพิ่ม `roleId: integer().references(() => roles.id)` (nullable ในสคีมา TypeScript; migration ตั้ง NOT NULL ด้วย SQL — เพื่อให้ `CreateUserUseCase` เก่าที่ยังไม่ส่ง `roleId` ไม่ล้มตอน type-check ก่อน Task 3 ให้คง nullable ในสคีมาและให้ DB บังคับ) import `roles` จาก `./roles`; export ตารางใหม่จาก `schema/index.ts`

- [ ] **Step 2: สร้าง migration** — `cd apps/api && bun run db:generate -- --name permissions` แล้วแก้ไฟล์ SQL ที่ได้ให้มีลำดับนี้ (เติมต่อท้ายคำสั่ง `CREATE TABLE`/`ALTER` ที่ drizzle สร้าง; คั่นด้วย `--> statement-breakpoint`):

```sql
-- หลัง CREATE TABLE roles / role_permissions / audit_logs และ ALTER TABLE users ADD COLUMN role_id
INSERT INTO "roles" ("name", "system_key") VALUES ('เจ้าของร้าน', 'owner'), ('แคชเชียร์', 'cashier');--> statement-breakpoint
UPDATE "users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "system_key" = "users"."role"::text);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;
```

  ตรวจว่า FK ของ `users.role_id` ถูกเพิ่ม **หลัง** `CREATE TABLE roles` และคอลัมน์ถูกเพิ่มแบบ nullable ก่อน backfill

- [ ] **Step 3: แก้ `resetDatabase` ให้ใส่บทบาทระบบกลับ** — ใน `test/harness.ts` ต่อจากบรรทัด insert `branches`/`registers` เพิ่ม:

```ts
    await transaction.unsafe(`insert into roles (name, system_key) values ('เจ้าของร้าน', 'owner'), ('แคชเชียร์', 'cashier')`)
```

  ค้นสคริปต์อื่นที่ truncate ทุกตาราง (`grep -rn "truncate table" apps test scripts`) และเพิ่มบรรทัดเดียวกัน รวมถึงการ seed (`seed.ts`) ที่ต้องมีบทบาทอยู่แล้วจาก migration (ตรวจว่าไม่ซ้ำ)

- [ ] **Step 4: ตรวจ** — `cd apps/api && bun run typecheck`; ถ้ามี PostgreSQL: `bun run db:migrate` กับฐานทดสอบแล้ว `bun --env-file=.env.test test src/__tests__/integration/auth.integration.test.ts` (หรือไฟล์ที่ใกล้เคียงที่สุด) ต้องผ่านเหมือนก่อนแก้ ถ้าไม่มี PostgreSQL ให้แจ้งว่า migration ยังไม่ได้รันกับฐานจริง

- [ ] **Step 5: Commit** — `gitcz ... --type=feat --scope=permissions --subject="add roles, role permissions and audit log tables"`

---

### Task 3: ผู้ใช้ผูกกับบทบาท (โมดูล users) และ port `IRoleDirectory`

**Files:**
- Create: `apps/api/src/modules/users/applications/ports/role-directory.port.ts`
- Modify: `modules/users/adapters/repository/user.drizzle.repository.ts`, `modules/users/applications/schemas/user-schemas.ts`, `.../usecases/create-user.usecase.ts`, `.../usecases/update-user.usecase.ts`, `.../usecases/users.usecases.test.ts`, `modules/users/adapters/controllers/schemas/user.schema.ts`, `.../user.controller.ts`, `src/__tests__/mocks.ts` (เพิ่ม `mockRoleDirectory`)
- Modify (ที่สร้างผู้ใช้): `modules/setup/applications/usecases/complete-setup.usecase.ts`, `infrastructure/database/seed.ts`, `seed-demo.ts` เฉพาะถ้าพังตอน type-check (พวกนี้ส่ง `role` เดิมและยังใช้ได้)

**Interfaces:**
- Produces: `interface RoleRef { id: number; name: string; systemKey: 'owner' | 'cashier' | null }`; `IRoleDirectory { findById(id): Promise<RoleRef | null>; findBySystemKey(key: 'owner' | 'cashier'): Promise<RoleRef> }` + `roleDirectoryToken`; `CreateUserUseCase` constructor `(users, branches, hasher, roles: IRoleDirectory)`; `UpdateUserUseCase` constructor `(users, branches, hasher, unitOfWork, roles)`; input ของ create/update รับ `roleId` **หรือ** `role` เดิม (อย่างใดอย่างหนึ่ง; ถ้าส่งทั้งคู่ `roleId` ชนะ); response `user` เพิ่ม `roleId: integer`
- Consumes: `UserEntity.roleId` (Task 1)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** เพิ่มใน `users.usecases.test.ts` (และเพิ่ม `mockRoleDirectory` ใน `mocks.ts`: `{ findById: mock(async () => null), findBySystemKey: mock(async (key) => ({ id: key === 'owner' ? 1 : 2, name: key, systemKey: key })) }`):

```ts
describe('roles on users', () => {
  test('a custom role id is stored, and the legacy role becomes cashier', async () => {
    roles.findById.mockResolvedValue({ id: 7, name: 'ผู้จัดการ', systemKey: null })
    repo.create.mockImplementation(async (entity) => makeUser({ ...entity.toSnapshot(), id: 5, roleId: entity.roleId }))
    const created = await new CreateUserUseCase(repo, branches, hasher, roles).execute(
      { username: 'manager', password: 'secret-password', displayName: 'ผู้จัดการ', roleId: 7 }, 1)
    expect(created.roleId).toBe(7)
    expect(created.role).toBe('cashier')
  })

  test('the owner role id makes the legacy role owner', async () => {
    roles.findById.mockResolvedValue({ id: 1, name: 'เจ้าของร้าน', systemKey: 'owner' })
    repo.create.mockImplementation(async (entity) => makeUser({ ...entity.toSnapshot(), id: 5, roleId: entity.roleId }))
    const created = await new CreateUserUseCase(repo, branches, hasher, roles).execute(
      { username: 'boss', password: 'secret-password', displayName: 'เจ้าของ', roleId: 1 }, 1)
    expect(created.role).toBe('owner')
  })

  test('the legacy role field still works and maps to the system role', async () => {
    repo.create.mockImplementation(async (entity) => makeUser({ ...entity.toSnapshot(), id: 5, roleId: entity.roleId }))
    const created = await new CreateUserUseCase(repo, branches, hasher, roles).execute(
      { username: 'somchai', password: 'secret-password', displayName: 'สมชาย', role: 'cashier' }, 1)
    expect(created.roleId).toBe(2)
  })

  test('an unknown role id is ROLE_NOT_FOUND and nothing is stored', async () => {
    roles.findById.mockResolvedValue(null)
    await expect(
      new CreateUserUseCase(repo, branches, hasher, roles).execute(
        { username: 'x1y', password: 'secret-password', displayName: 'x', roleId: 99 }, 1),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('moving the last active owner to a custom role is refused', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 1, role: 'owner', roleId: 1 }))
    repo.countActiveOwners.mockResolvedValue(1)
    roles.findById.mockResolvedValue({ id: 7, name: 'ผู้จัดการ', systemKey: null })
    await expect(
      new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles).execute(1, { roleId: 7 }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' })
  })
})
```

  (ตัวแปร `roles` ประกาศ `let roles: ReturnType<typeof mockRoleDirectory>` และสร้างใน `beforeEach`; เทสต์ `CreateUserUseCase`/`UpdateUserUseCase` เดิมแก้เฉพาะการสร้าง use case ให้ส่ง `roles` เพิ่ม ไม่แก้ assertion)

- [ ] **Step 2: รันให้เห็นว่าล้ม** — `bun --env-file=.env.test test src/modules/users` → FAIL

- [ ] **Step 3: เขียนโค้ด**

  `role-directory.port.ts`:

```ts
export interface RoleRef {
  id: number
  name: string
  systemKey: 'owner' | 'cashier' | null
}

/** What the users module needs to know about roles; the roles module answers. */
export interface IRoleDirectory {
  findById(id: number): Promise<RoleRef | null>
  /** The two system roles always exist, so this never returns null. */
  findBySystemKey(key: 'owner' | 'cashier'): Promise<RoleRef>
}

const roleDirectoryTokenSymbol: unique symbol = Symbol('IRoleDirectory')
export const roleDirectoryToken = roleDirectoryTokenSymbol.toString()
```

  `user-schemas.ts`: `createUserSchema` ทำ `role` เป็น `.optional()` และเพิ่ม `roleId: z.number().int().positive().optional()` พร้อม `.refine((v) => v.roleId !== undefined || v.role !== undefined, 'ต้องระบุบทบาท')`; `updateUserSchema` เพิ่ม `roleId` (อยู่ใน `.partial()` แล้วโดยธรรมชาติ)

  helper ร่วมใน `create-user.usecase.ts` (export) — ใช้ซ้ำใน update:

```ts
export async function resolveRole(roles: IRoleDirectory, input: { roleId?: number; role?: 'owner' | 'cashier' }) {
  if (input.roleId !== undefined) {
    const found = await roles.findById(input.roleId)
    if (!found) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
    return found
  }
  return roles.findBySystemKey(input.role!)
}
```

  `CreateUserUseCase.execute`: หลัง resolve สาขา → `const role = await resolveRole(this.roles, dto)` → สร้าง `UserEntity` ด้วย `role: role.systemKey === 'owner' ? 'owner' : 'cashier'`, `roleId: role.id`
  `UpdateUserUseCase.execute`: ภายใน unit of work ถ้า `changes.roleId !== undefined || changes.role !== undefined` ให้ `const role = await resolveRole(...)` แล้วใช้ `{ ...changes, role: legacy, roleId: role.id }` กับทั้ง `wouldStopBeingActiveOwner` และ `with` (ลบ `role` ที่ส่งมาแบบเดิมจาก `changes` ก่อนส่งให้ `with` เพื่อไม่ให้ซ้ำ)
  `user.drizzle.repository.ts`: เพิ่ม `roleId: users.roleId` ใน `columns` และใน `new UserEntity(...)` ส่ง `roleId: row.roleId`; `create`/`update` เขียน `roleId` ลงตาราง (entity.roleId; ถ้า `null` ให้โยน `DomainError('ต้องระบุบทบาท','INVALID_USER')` ก่อนเขียน); `countActiveOwners` ยังใช้ `users.role = 'owner'`
  `user.schema.ts`: `user` เพิ่ม `roleId: t.Integer()`; `create` ทำ `role` เป็น `t.Optional(role)` และเพิ่ม `roleId: t.Optional(t.Integer({ minimum: 1 }))`; `update` เพิ่ม `roleId` ใน `t.Partial`
  `user.controller.ts` และ `auth.controller.ts`: ฟังก์ชัน `toResponse` ของ users ต้องใส่ `roleId: entity.roleId ?? 0` ลงใน response (ถ้า controller เดิมคืน `toSnapshot()` ตรง ๆ ให้เปลี่ยนเป็น `{ ...entity.toSnapshot(), roleId: entity.roleId! }`)
  `users.module.ts`: ไม่ต้องแก้ (โทเคนของ `IRoleDirectory` ลงทะเบียนใน Task 4)

- [ ] **Step 4: รันเทสต์ให้ผ่าน** — `bun --env-file=.env.test test src/modules/users src/modules/auth src/modules/setup` → PASS; `bun run typecheck`

- [ ] **Step 5: Commit** — `--type=feat --scope=users --subject="give users a role id and keep the legacy role in step"`

---

### Task 4: โมดูล roles (CRUD บทบาท) และตัวอ่านสิทธิ์

**Files:**
- Create: `apps/api/src/modules/roles/roles.module.ts`
- Create: `modules/roles/applications/ports/role.repository.ts`, `.../ports/role-permission-reader.port.ts`
- Create: `modules/roles/applications/schemas/role-schemas.ts`
- Create: `modules/roles/applications/usecases/{list-roles,get-role,create-role,update-role,delete-role}.usecase.ts` + `roles.usecases.test.ts`
- Create: `modules/roles/adapters/repository/role.drizzle.repository.ts`, `.../adapters/role-directory.adapter.ts`
- Create: `modules/roles/adapters/controllers/role.controller.ts`, `.../schemas/role.schema.ts`
- Modify: `modules/di-registrations.ts`, `modules/app.module.ts`, `src/__tests__/mocks.ts` (`mockRoleRepository`), `src/__tests__/integration/roles.integration.test.ts` (create)

**Interfaces:**
- Produces:
  - `IRoleRepository { findAll(): Promise<RoleEntity[]>; findById(id): Promise<RoleEntity | null>; findByIdForUpdate(id): Promise<RoleEntity | null>; create(entity): Promise<RoleEntity> (DomainConflictError `ROLE_NAME_TAKEN`); update(entity): Promise<RoleEntity>; delete(id): Promise<void>; countUsers(id): Promise<number> }` + `roleRepositoryToken`
  - `IRolePermissionReader { permissionsOf(roleId: number): Promise<readonly Permission[]> }` + `rolePermissionReaderToken` (ประกาศใน `modules/auth/applications/ports/role-permission-reader.port.ts` ไม่ใช่ใน roles — ให้ auth เป็นเจ้าของ port ตามกฎการ import ข้ามโมดูล; roles adapter implement)
  - เส้นทาง: `GET /roles` (`auth: { can: 'roles.manage' }`, ใช้ `page()`), `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id`; response role `{ id, name, systemKey: 'owner'|'cashier'|null, permissions: string[], userCount: integer }`
- Consumes: `RoleEntity`, `canDo`

- [ ] **Step 1: เขียนเทสต์ use case ที่ล้ม** (`roles.usecases.test.ts`, port จำลองจาก `mockRoleRepository`):

```ts
describe('CreateRoleUseCase', () => {
  test('stores a custom role with unique permissions', async () => {
    repo.create.mockImplementation(async (e) => new RoleEntity({ ...e.toSnapshot(), id: 8 }))
    const created = await new CreateRoleUseCase(repo).execute({ name: 'ผู้จัดการ', permissions: ['sales.void', 'sales.void', 'reports.read'] })
    expect(created.permissions).toEqual(['reports.read', 'sales.void'])
    expect(created.systemKey).toBeNull()
  })
  test.each([
    ['an unknown permission', { name: 'x', permissions: ['sales.fly'] }],
    ['an empty name', { name: ' ', permissions: [] }],
    ['a name over 60 characters', { name: 'x'.repeat(61), permissions: [] }],
  ])('rejects %s', async (_l, bad) => {
    await expect(new CreateRoleUseCase(repo).execute(bad)).rejects.toThrow()
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('UpdateRoleUseCase', () => {
  test('replaces the whole permission set of a custom role', async () => {
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 8, name: 'ผู้จัดการ', systemKey: null, permissions: ['sales.void'] }))
    repo.update.mockImplementation(async (e) => e)
    const updated = await new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(8, { permissions: ['reports.read'] })
    expect(updated.permissions).toEqual(['reports.read'])
  })
  test('the owner role cannot be changed', async () => {
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 1, name: 'เจ้าของร้าน', systemKey: 'owner', permissions: [] }))
    await expect(new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(1, { permissions: ['sales.void'] })).rejects.toMatchObject({ code: 'ROLE_PROTECTED' })
  })
  test('a missing role is ROLE_NOT_FOUND', async () => {
    repo.findByIdForUpdate.mockResolvedValue(null)
    await expect(new UpdateRoleUseCase(repo, mockUnitOfWork()).execute(99, { name: 'x' })).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
  })
})

describe('DeleteRoleUseCase', () => {
  test('deletes an unused custom role', async () => {
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 8, name: 'ชั่วคราว', systemKey: null, permissions: [] }))
    repo.countUsers.mockResolvedValue(0)
    await new DeleteRoleUseCase(repo, mockUnitOfWork()).execute(8)
    expect(repo.delete).toHaveBeenCalledWith(8)
  })
  test('refuses a role someone holds', async () => {
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 8, name: 'ชั่วคราว', systemKey: null, permissions: [] }))
    repo.countUsers.mockResolvedValue(2)
    await expect(new DeleteRoleUseCase(repo, mockUnitOfWork()).execute(8)).rejects.toMatchObject({ code: 'ROLE_IN_USE' })
    expect(repo.delete).not.toHaveBeenCalled()
  })
  test('refuses a system role', async () => {
    repo.findByIdForUpdate.mockResolvedValue(new RoleEntity({ id: 2, name: 'แคชเชียร์', systemKey: 'cashier', permissions: [] }))
    await expect(new DeleteRoleUseCase(repo, mockUnitOfWork()).execute(2)).rejects.toMatchObject({ code: 'ROLE_PROTECTED' })
  })
})
```

- [ ] **Step 2: รันให้ล้ม** — `bun --env-file=.env.test test src/modules/roles` → FAIL

- [ ] **Step 3: เขียนโค้ด**
  - `role-schemas.ts`: `createRoleSchema = z.object({ name: z.string().min(1).max(60), permissions: z.array(z.string()).max(60) })`; ตรวจ `isPermission` ใน `RoleEntity` (โยน `INVALID_ROLE` เป็น `DomainError`; ZodError สำหรับรูปแบบ); `updateRoleSchema = createRoleSchema.partial()`; `idSchema` ไม่ต้องมี (ใช้ `idParams`)
  - use case ทั้ง 5 ตามรูปแบบ `CreateCategoryUseCase` (คอมเมนต์ `/** Command. */` / `/** Query. */`); `UpdateRoleUseCase` และ `DeleteRoleUseCase` ครอบด้วย `unitOfWork.run` และใช้ `findByIdForUpdate`; ไม่พบ → `DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')`; ลบบทบาทระบบ → `DomainError('บทบาทของระบบลบไม่ได้', 'ROLE_PROTECTED')` (ตรวจก่อน `countUsers`); ถือโดยผู้ใช้ → `DomainConflictError('มีผู้ใช้ถือบทบาทนี้อยู่', 'ROLE_IN_USE')`
  - `role.drizzle.repository.ts`: `findAll` = เลือก `roles` เรียง id แล้วเลือก `role_permissions` ของทุก role แล้วประกอบ (2 query); `update` ลบแล้วใส่ `role_permissions` ของบทบาทนั้นทั้งชุดและอัปเดต `name`, `updated_at`; `create`/`update` แปลง unique violation ของ `roles.name` เป็น `DomainConflictError('ชื่อบทบาทซ้ำ', 'ROLE_NAME_TAKEN')` ด้วย `isUniqueViolation`; `countUsers` นับ `users.role_id` (repository นี้อยู่ในโมดูล roles จึงอ่านตาราง `users` ไม่ได้ตามกฎ ให้ใช้ port `IRoleUsage { countUsers(roleId) }` ที่โมดูล users เป็นผู้ตอบ: เพิ่มใน `modules/roles/applications/ports/role-usage.port.ts` และ adapter ใน `modules/users/adapters/repository/role-usage.drizzle.adapter.ts` ลงทะเบียนที่ `users.module.ts`; `DeleteRoleUseCase` inject `IRoleUsage` แทน `countUsers` ของ repository — แก้เทสต์ให้ตรงกัน)
  - `role-directory.adapter.ts` (implements `IRoleDirectory` ของ users และ `IRolePermissionReader` ของ auth): `findById`, `findBySystemKey` (ไม่พบ → โยน `Error('system role missing')` เพราะเป็นความผิดพลาดของการติดตั้ง), `permissionsOf` (บทบาท `owner` คืน `PERMISSIONS` ทั้งหมด; อื่น ๆ คืนแถวใน `role_permissions` ที่ `isPermission`)
  - controller ตามแบบ `CategoryElysiaController`; `userCount` ได้จาก `IRoleUsage`; `DELETE` คืน `{ ok: true }`
  - `roles.module.ts` ลงทะเบียน: `roleRepositoryToken`, `roleDirectoryToken`, `rolePermissionReaderToken`, use cases, controller; เพิ่ม `import './roles/roles.module'` ใน `di-registrations.ts` ก่อน `./users/users.module`; ต่อ `container.resolve(RoleElysiaController).getRoutes()` ใน `app.module.ts`

- [ ] **Step 4: เขียน integration test** `roles.integration.test.ts`:

```ts
test('an owner creates a role, gives it to a user, and the user can use exactly that permission', async () => {
  const owner = await signIn('owner')
  const role = ok(await owner.api.roles.post({ name: 'ผู้จัดการ', permissions: ['reports.read'] }))
  expect(role).toMatchObject({ name: 'ผู้จัดการ', permissions: ['reports.read'], systemKey: null, userCount: 0 })
  // (ใช้ owner.api.users.post({ ..., roleId: role.id }) แล้ว login เป็นผู้ใช้นั้น แล้ว assert reports ได้ ปรับสต็อกไม่ได้ — เพิ่มใน Task 5)
})
test('a cashier cannot manage roles', async () => {
  const cashier = await signIn('cashier')
  expect((await cashier.api.roles.get({ query: {} })).status).toBe(403)
})
test('the system roles exist, cannot be deleted, and a role held by a user cannot be deleted', async () => { /* list → 2 system roles; DELETE system → 409 ROLE_PROTECTED; create+assign+DELETE → 409 ROLE_IN_USE */ })
test('a duplicate name is ROLE_NAME_TAKEN', async () => { /* POST same name twice → second 409 ROLE_NAME_TAKEN */ })
```

  (เขียนเนื้อเทสต์สองข้อสุดท้ายให้ครบตามคอมเมนต์เมื่อทำ ใช้ `ok()` และตรวจ `status`/`error?.value` ตามรูปแบบใน `customer-display.integration.test.ts`)

- [ ] **Step 5: รัน** — `bun run test:unit` (ใน `apps/api`) → PASS; `bun run typecheck`; integration ถ้ามี PostgreSQL

- [ ] **Step 6: Commit** — `--type=feat --scope=roles --subject="manage custom roles and their permissions"`

---

### Task 5: บังคับสิทธิ์ทั้งระบบ (แทน `owner`)

**Files:**
- Create: `apps/api/src/modules/auth/applications/ports/role-permission-reader.port.ts`
- Modify: `modules/auth/applications/usecases/authorize-session.usecase.ts` (+ `auth.usecases.test.ts`), `modules/auth.plugin.ts`, `modules/auth/adapters/controllers/auth.controller.ts`, `.../schemas/auth.schema.ts`
- Modify (route guards + use-case guards): ไฟล์ในตารางด้านล่าง
- Create: `src/__tests__/integration/permissions.integration.test.ts`

**Interfaces:**
- Produces: `AuthUser = UserEntityProps & { roleId: number | null; permissions: readonly Permission[] }` (ส่งออกจาก `auth.plugin.ts`; คือ type ของ `user` ใน context); macro `auth: true | { can: Permission }`; `AuthorizeSessionUseCase.execute(userId, requirement: true | { can: Permission })` คืน `{ user: UserEntity, permissions: readonly Permission[] }`; `GET /auth/me` เพิ่มช่อง `permissions: string[]` และ `roleId`
- Consumes: `IRolePermissionReader`, `canDo`, `requirePermission`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** แก้/เพิ่มใน `auth.usecases.test.ts` (ส่วน `AuthorizeSessionUseCase`; เพิ่ม `mockRolePermissionReader` ใน `mocks.ts`):

```ts
test('loads the permissions of the user role and allows what they list', async () => {
  users.findActiveById.mockResolvedValue(makeUser({ roleId: 7 }))
  reader.permissionsOf.mockResolvedValue(['sales.void'])
  const { permissions } = await new AuthorizeSessionUseCase(users, reader).execute(1, { can: 'sales.void' })
  expect(permissions).toEqual(['sales.void'])
})
test('refuses a permission the role does not list with PERMISSION_DENIED', async () => {
  users.findActiveById.mockResolvedValue(makeUser({ roleId: 7 }))
  reader.permissionsOf.mockResolvedValue(['reports.read'])
  await expect(new AuthorizeSessionUseCase(users, reader).execute(1, { can: 'sales.void' })).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
    params: { permission: 'sales.void' },
  })
})
test('the owner passes any permission without a lookup of its list', async () => {
  users.findActiveById.mockResolvedValue(makeUser({ role: 'owner', roleId: 1 }))
  reader.permissionsOf.mockResolvedValue([])
  await expect(new AuthorizeSessionUseCase(users, reader).execute(1, { can: 'audit.read' })).resolves.toBeDefined()
})
test('any signed-in user passes true', async () => {
  users.findActiveById.mockResolvedValue(makeUser({ roleId: 2 }))
  reader.permissionsOf.mockResolvedValue([])
  await expect(new AuthorizeSessionUseCase(users, reader).execute(1, true)).resolves.toBeDefined()
})
```

  (เทสต์เดิมของ `AuthorizeSessionUseCase` ที่ส่ง `['owner']` ให้ปรับเฉพาะ **การเรียก** เป็นรูปแบบใหม่ — assertion เรื่อง 401/403 คงเดิม; ถ้ามีเทสต์ที่ตรวจข้อความ 403 เดิม `'ไม่มีสิทธิ์ใช้งานส่วนนี้'` ข้อความยังเหมือนเดิมเพราะ `requirePermission` ใช้ค่าเริ่มต้นเดียวกัน)

- [ ] **Step 2: เขียน `AuthorizeSessionUseCase` ใหม่**

```ts
@injectable()
export class AuthorizeSessionUseCase {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(rolePermissionReaderToken) private readonly roles: IRolePermissionReader,
  ) {}

  async execute(userId: number, requirement: true | { can: Permission }) {
    // Looked up on every request, so deactivating a user or changing a role takes effect immediately.
    const user = Number.isInteger(userId) ? await this.users.findActiveById(userId) : null
    if (!user) throw new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ')

    const permissions = user.roleId === null ? [] : await this.roles.permissionsOf(user.roleId)
    if (requirement !== true) requirePermission({ role: user.role, permissions }, requirement.can)
    return { user, permissions }
  }
}
```

- [ ] **Step 3: แก้ `auth.plugin.ts`**: macro เป็น `auth: (requirement: true | { can: Permission }) => ({ resolve … })`; หลัง `AuthorizeSessionUseCase.execute(...)` ได้ `{ user, permissions }`, `snapshot = { ...user.toSnapshot(), roleId: user.roleId, permissions }` ส่งเป็น `user` ใน context (ส่วนที่เหลือของ `branch()` ใช้ `snapshot` เหมือนเดิม); ลบ import `UserRole`; ส่งออก `type AuthUser`
- [ ] **Step 4: `auth.controller.ts`/`auth.schema.ts`**: `me` response เป็น `userSchemas.user` ต่อด้วย `permissions: t.Array(t.String())` (ประกาศ `authSchemas.me = t.Composite([userSchemas.user, t.Object({ permissions: t.Array(t.String()) })])`); `login` ยังคืน `userSchemas.user` (ต้องใส่ `roleId`)
- [ ] **Step 5: แทนที่ guard ทุกจุดตามตาราง** (เส้นทาง: `auth: ['owner']` → `auth: { can: 'X' }`; use case: `if (actor.role !== 'owner') throw new DomainForbiddenError(MSG)` → `requirePermission(actor, 'X', MSG)` โดย `actor` ต้องมี `permissions`: ชนิด `Actor` จาก `domains/authorization`; เปลี่ยนชนิดพารามิเตอร์ `actor` ของ use case เหล่านั้นให้ `extends Actor` และให้ controller ส่ง `user` จาก context ตรง ๆ):

| ไฟล์ | สิทธิ์ |
|---|---|
| `branches/.../branch.controller.ts` (POST /, PATCH /:id) | `branches.manage` |
| `categories/.../category.controller.ts` (POST, PATCH) | `categories.write` |
| `inventory/.../inventory.controller.ts` `/receive` | `inventory.receive` |
| `inventory/.../inventory.controller.ts` `/adjust` | `inventory.adjust` |
| `kitchen/.../kitchen-catalog.controller.ts` (3 จุด) | `kitchen.write` |
| `members/.../member.controller.ts` (PATCH/PUT แก้สมาชิก) และ `update-member.usecase.ts` | `members.write` |
| `modifiers/.../modifier.controller.ts` (5 จุด) | `modifiers.write` |
| `products/.../product.controller.ts` (POST, PATCH, PUT/DELETE image) | `products.write` |
| `promotions/.../promotion.controller.ts` (2) และ `create-promotion`/`update-promotion` usecases | `promotions.write` |
| `qr-payments/.../qr-payment-v2.controller.ts` dismiss (+ `dismiss-qr-payment.usecase.ts`) | `qr.dismiss` |
| `sales/.../sale.controller.ts`, `sale-v2.controller.ts` (void, cash-refund) (+ `void-sale*.usecase.ts`) | `sales.void` |
| `sales/.../sales-report.controller.ts` (3) และ `get-sales-report`, `list-report-products`, `list-report-branches` usecases; รวม `GET /sales/summary` | `reports.read` |
| `settings/.../settings.controller.ts` (PUT/PATCH) | `settings.write` |
| `shifts/.../register.controller.ts` (2) | `registers.manage` |
| `tables/.../table.controller.ts` (2) | `tables.write` |
| `users/.../user.controller.ts` (ทุกเส้นทางที่เป็น owner) | `users.manage` |
| `branches/.../resolve-branch.usecase.ts` (`user.role !== 'owner'` เมื่อเลือกสาขาอื่น), `list-branches.usecase.ts` | `branches.switch` (ใช้ `canDo`) |
| `shifts/.../shift-lifecycle.usecases.ts` (บรรทัด `actor.role !== 'owner' && actor.id !== shift.closingStartedById`, สองจุด) และ interface `Actor` ในไฟล์นั้น | `shifts.override` (ใช้ `canDo(actor, 'shifts.override') \|\| actor.id === shift.closingStartedById`) |

  `members/create-member.usecase.ts` (ตรวจ `owner` หรือ `cashier`) เปลี่ยนเป็นไม่ต้องตรวจบทบาท (ทุกคนที่ล็อกอินทำได้ ตรงกับ `auth: true`)

  ค้นหาที่เหลือ: `grep -rn "role !== 'owner'\|role === 'owner'\|auth: \['owner'\]" apps/api/src --include=*.ts` ต้องเหลือเฉพาะ: `domains/user.domain.ts`, `domains/authorization.ts`, `users.drizzle.repository.ts` (นับเจ้าของ), `seed*.ts`, `complete-setup.usecase.ts` และไฟล์เทสต์
- [ ] **Step 6: Integration test** `permissions.integration.test.ts`:

```ts
test('the cashier system role does what it always did: sells, but cannot void, adjust stock or read reports', async () => {
  const owner = await signIn('owner'); const cashier = await signIn('cashier')
  const product = await seedProduct(owner, { stock: 5 })
  expect((await cashier.api.inventory.adjust.post({ productId: product.id, countedQty: 1, reason: 'x' })).status).toBe(403)
  expect((await cashier.api.sales.summary.get({ query: { from: '2026-01-01', to: '2026-01-02' } })).status).toBe(403)
})
test('a custom role grants exactly its permissions and the change applies on the next request', async () => {
  const owner = await signIn('owner')
  const role = ok(await owner.api.roles.post({ name: 'ผู้จัดการ', permissions: ['reports.read'] }))
  const manager = await signInWithRole('manager', role.id)   // helper ใหม่ใน harness: CreateUserUseCase ด้วย roleId แล้ว login
  expect((await manager.api.sales.summary.get({ query: { from: '2026-01-01', to: '2026-01-02' } })).status).toBe(200)
  expect((await manager.api.roles.get({ query: {} })).status).toBe(403)
  ok(await owner.api.roles({ id: role.id }).patch({ permissions: [] }))
  expect((await manager.api.sales.summary.get({ query: { from: '2026-01-01', to: '2026-01-02' } })).status).toBe(403)
})
test('/auth/me lists the permissions of the role', async () => { /* owner → 20 permissions; cashier → []; custom → its list */ })
test('the last active owner cannot be moved to another role', async () => { /* PATCH users/:id { roleId: custom } → 409 LAST_OWNER */ })
```

  เพิ่ม helper `signInWithRole(username, roleId, opts?)` ใน `test/harness.ts` คู่กับ `signIn`; ปรับพารามิเตอร์ของ `inventory.adjust` ให้ตรงสัญญาจริงตอนเขียน (ดู `inventory.controller.ts`)

- [ ] **Step 7: รัน** — `bun run test:unit` PASS; `bun run typecheck`; `bun run test` (PostgreSQL) — ต้องผ่านชุดเดิมทั้งหมดโดยไม่แก้ assertion เดิม
- [ ] **Step 8: Commit** — `--type=feat --scope=permissions --subject="enforce granular permissions instead of the owner role"`

---

### Task 6: โมดูล audit (บันทึกและอ่าน)

**Files:**
- Create: `modules/audit/audit.module.ts`, `modules/audit/applications/ports/audit-log.port.ts`, `modules/audit/applications/schemas/audit-schemas.ts`, `modules/audit/applications/usecases/list-audit-logs.usecase.ts` (+ `.test.ts`), `modules/audit/adapters/repository/audit-log.drizzle.repository.ts`, `modules/audit/adapters/controllers/audit.controller.ts`, `.../schemas/audit.schema.ts`
- Modify: `modules/tokens.ts` ไม่ต้อง (port อยู่ในโมดูล audit; โมดูลอื่นอ่านโทเคนจากไฟล์ port นี้ ตามกฎ "port ของโมดูลอื่น import ได้"), `di-registrations.ts`, `app.module.ts`, `__tests__/mocks.ts` (`mockAuditLog`)
- Create: `src/__tests__/integration/audit.integration.test.ts`

**Interfaces:**
- Produces:
  - `interface AuditActor { id: number | null; name: string }`; `IAuditLog { record(actor: AuditActor, branchId: number | null, entry: AuditEntry): Promise<void>; list(filter: AuditFilter, page: { limit: number; offset: number }): Promise<Page<AuditRecord>> }` + `auditLogToken`; `AuditRecord = AuditEntry & { id: number; at: Date; actorId: number | null; actorName: string; branchId: number | null }`; `AuditFilter { from?: Date; to?: Date; actorId?: number; action?: string; entityType?: string; entityId?: string }`
  - `GET /api/v1/audit-logs` (`auth: { can: 'audit.read' }`): query `from`, `to` (วันที่ `YYYY-MM-DD` ตามเขตเวลาร้าน — ใช้ตัวช่วยเดียวกับรายงานย้อนหลัง `get-sales-report.usecase.ts`; ถ้าไม่มี ให้ใช้ `new Date(from)`/`new Date(to)` แบบ half-open [from, to) ตาม UTC และระบุในคอมเมนต์), `actorId`, `action`, `entityType`, `entityId`, `limit` (≤ 200, ค่าเริ่ม 50), `offset`; คืน `{ items, total }` เรียง `at desc, id desc`
- Consumes: `buildAuditEntry`, `Page<T>` จาก `domains/page.ts`

- [ ] **Step 1: เขียนเทสต์ล้ม** `list-audit-logs.usecase.test.ts`: (a) ส่ง filter และ page ให้ port ตามที่แปลง/ตัดแล้ว (`limit` เกิน 200 → ZodError; ค่าเริ่ม 50/0); (b) คืนค่าที่ port คืนโดยไม่แก้; (c) `from` > `to` → `DomainError('INVALID_RANGE')`
- [ ] **Step 2: เขียนโค้ด**: use case `ListAuditLogsUseCase` (Query) ตรวจ input ด้วย zod; repository ใช้ `currentExecutor()` กับ `auditLogs` — `record` เป็น `insert` อย่างเดียว, `list` เป็น `select` + `count()` ที่เงื่อนไขเดียวกัน; **ห้ามมี method update/delete บน port หรือ adapter**; controller คืน `page(auditSchemas.record)` ซึ่ง `at` เป็น `t.Date()`; ต่อ `audit.module.ts` ลงทะเบียน `auditLogToken` → `DrizzleAuditLogRepository`, use case, controller; เพิ่มใน `di-registrations.ts` ก่อน `./sales/sales.module`
- [ ] **Step 3: integration** `audit.integration.test.ts`: เขียนผ่าน `container.resolve<IAuditLog>(auditLogToken).record(...)` โดยตรงแล้วอ่านผ่าน HTTP: owner อ่านได้ (200, เรียงใหม่ก่อน, กรอง `action` ได้), cashier 403, และ `before.password` ที่ฝากมาถูกตัดออก (ผ่าน `buildAuditEntry` ฝั่งผู้เรียก)
- [ ] **Step 4: รัน** `bun run test:unit`, `bun run typecheck` แล้ว commit — `--type=feat --scope=audit --subject="record and list audit log entries"`

---

### Task 7: บันทึก audit ในคำสั่งสำคัญ

**Files (Modify ทั้งหมด; แต่ละไฟล์เพิ่ม port `IAuditLog` เป็น dependency สุดท้ายของ constructor และเรียก `record` ภายใน unit of work เดิมของคำสั่ง):**
- `modules/sales/applications/usecases/void-sale.usecase.ts`, `void-sale-v2.usecase.ts`, และ use case คืนเงินสด (`grep -rn "cash-refund\|CashRefund" apps/api/src/modules/sales`)
- `modules/qr-payments/applications/usecases/dismiss-qr-payment.usecase.ts`
- `modules/products/applications/usecases/create-product.usecase.ts`, `update-product.usecase.ts`
- `modules/inventory/applications/usecases/receive-stock.usecase.ts`, `adjust-stock.usecase.ts`
- `modules/shifts/applications/usecases/shift-lifecycle.usecases.ts` (เมื่อ `actor.id !== shift.closingStartedById` และผ่าน `shifts.override`)
- `modules/users/applications/usecases/create-user.usecase.ts`, `update-user.usecase.ts`
- `modules/roles/applications/usecases/{create,update,delete}-role.usecase.ts`
- `modules/settings/applications/usecases/update-settings.usecase.ts` (ชื่อไฟล์จริงให้ `ls` ดู)
- `modules/auth/applications/usecases/login.usecase.ts` (`auth.login_failed`)
- เทสต์ use case ของแต่ละไฟล์ (เพิ่ม `mockAuditLog()` และ assertion ใหม่; **ไม่แก้ assertion เดิม** — ใช้ค่าเริ่มต้นของ mock ที่คืน `undefined`)

**Interfaces:**
- Consumes: `IAuditLog.record(actor, branchId, buildAuditEntry({...}))`
- Produces: รายการ `action` ตามสเปกหัวข้อ 4 ตรงตามตัวสะกด: `sale.void`, `sale.cash_refund`, `qr.dismiss`, `product.create`, `product.update`, `stock.receive`, `stock.adjust`, `shift.override_close`, `user.create`, `user.update`, `role.create`, `role.update`, `role.delete`, `settings.update`, `auth.login_failed`

- [ ] **Step 1: เขียนเทสต์ล้มต่อคำสั่ง** รูปแบบ (ตัวอย่าง `void-sale`; ทำเช่นเดียวกันทุกคำสั่งในรายการ):

```ts
test('records who voided the sale, with the status before and after, in the same unit of work', async () => {
  // arrange: sale completed
  await useCase.execute(…)
  expect(audit.record).toHaveBeenCalledTimes(1)
  const [actorArg, branchArg, entry] = audit.record.mock.calls[0]!
  expect(actorArg).toEqual({ id: 5, name: 'สมหญิง' })
  expect(branchArg).toBe(1)
  expect(entry).toMatchObject({ action: 'sale.void', entityType: 'sale', entityId: '412',
    before: { status: 'completed' }, after: { status: 'voided' }, reason: 'คิดเงินผิด' })
})
test('writes nothing when the sale cannot be voided', async () => {
  // arrange: sale already voided → DomainError
  await expect(useCase.execute(…)).rejects.toThrow()
  expect(audit.record).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: เขียนโค้ด** ตามรูปแบบในแต่ละ use case: เรียก `await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({ action, entityType, entityId: String(id), summary: '…ข้อความไทย…', before, after, reason }))` **หลัง** การเขียนหลักสำเร็จและ **ภายใน** callback ของ `unitOfWork.run` เดียวกัน (ถ้าคำสั่งไม่มี unit of work และเขียนตารางเดียว ให้ครอบด้วย `unitOfWork.run` เพื่อให้ log กับข้อมูลถอยพร้อมกัน); ค่าที่เก็บ:
  - `product.update`: `before`/`after` เฉพาะช่องที่เปลี่ยนจาก `{ name, priceSatang, costSatang, isActive, categoryId, sku, barcode }`; ถ้าไม่มีช่องไหนเปลี่ยนไม่ต้องเขียน log
  - `stock.adjust`/`stock.receive`: `before: { qty }`, `after: { qty }` ของสาขานั้น พร้อม `reason`/`note`
  - `user.update`: `before`/`after` เฉพาะ `{ displayName, roleId, branchId, isActive }` ที่เปลี่ยน; **ห้ามใส่รหัสผ่านหรือ hash** (ถ้ามีการเปลี่ยนรหัสผ่าน ให้ `after: { passwordChanged: true }`)
  - `role.update`: `before`/`after` = `{ name, permissions }` ที่เปลี่ยน
  - `settings.update`: `before`/`after` เฉพาะช่องที่เปลี่ยน
  - `auth.login_failed`: ภายใน `LoginUseCase` เมื่อไม่พบผู้ใช้หรือรหัสผ่านผิด เรียก `audit.record({ id: null, name: username }, null, ...)` ด้วย `try/catch` ที่กลืนข้อผิดพลาดและ `console.error('audit: login_failed not recorded', error)` แล้ว **ยังโยน** `DomainUnauthorizedError` เดิมตามปกติ (เขียนนอกธุรกรรม)
- [ ] **Step 3: เทสต์ `LoginUseCase`**: (ก) ล็อกอินล้มเหลวเรียก `record` ด้วย `actor.id === null` และชื่อที่ลอง, ไม่มีรหัสผ่านใน `entry`; (ข) เมื่อ `audit.record` ปฏิเสธ (`mockRejectedValue(new Error('db'))`) ผลยังเป็น `DomainUnauthorizedError` ไม่ใช่ Error ของฐานข้อมูล
- [ ] **Step 4: integration** เพิ่มใน `audit.integration.test.ts`: (ก) owner ยกเลิกบิล → มีแถว `sale.void` ผู้กระทำตรง และ `before.status='completed'`; (ข) ปรับสต็อกที่ล้มเหลวด้วยข้อมูลผิด → ไม่มีแถว `stock.adjust` ใหม่; (ค) เปลี่ยนรหัสผ่านผู้ใช้ → แถว `user.update` ไม่มีสตริงรหัสผ่าน/hash (ค้นข้อความในค่า JSON ทั้งหมด); (ง) ล็อกอินผิด → แถว `auth.login_failed`
- [ ] **Step 5: รัน** `bun run test:unit`, `bun run typecheck`, `bun run test`; commit — `--type=feat --scope=audit --subject="record sensitive actions in the audit log"`

---

### Task 8: เว็บ: สิทธิ์ใน auth, หน้าบทบาท, หน้าประวัติ, ผู้ใช้

**Files:**
- Modify: `apps/web/src/features/auth/api.ts`, `.../index.ts`, `.../locales.ts` (ถ้ามี) — เพิ่ม `can(permission)` hook
- Create: `apps/web/src/features/roles/{api.ts,index.ts,locales.ts,components/RolesPage.tsx,components/RoleDialog.tsx,lib/permission-groups.ts(+test)}`
- Create: `apps/web/src/features/audit/{api.ts,index.ts,locales.ts,components/AuditPage.tsx,lib/describe-entry.ts(+test)}`
- Modify: `apps/web/src/features/users/**` (เลือกบทบาทจากรายการ), `apps/web/src/app/App.tsx` (เส้นทาง `/roles`, `/audit`), `apps/web/src/app/AppSidebar.tsx` (เมนูตามสิทธิ์), `apps/web/src/app/i18n.ts`, `apps/web/src/locales/errors.ts`
- Modify: ปุ่มที่ต้องซ่อนตามสิทธิ์ (ยกเลิกบิลใน `sales`, ปรับสต็อก/รับของใน `products`/`inventory`, เมนูรายงาน) — ค้นด้วย `grep -rn "role === 'owner'\|isOwner" apps/web/src`
- Modify: e2e รายการตรวจล้นแนวนอน (ค้น `apps/web/e2e` หรือ `scripts/e2e` ด้วยชื่อหน้าอื่น เช่น `/promotions`) เพิ่ม `/roles`, `/audit`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /roles`, `GET /audit-logs`, `permissions` และ `roleId` จาก `/auth/me`
- Produces: `useCan(permission: string): boolean` ส่งออกจาก `@/features/auth`; `roleKeys`, `rolesQuery()`, `useCreateRole()`, `useUpdateRole()`, `useDeleteRole()` ส่งออกจาก `@/features/roles`; `auditLogsQuery(filters)`

- [ ] **Step 1: ฟังก์ชันล้วน + เทสต์** — `lib/permission-groups.ts`: `groupPermissions(all: readonly string[]): { key: string; permissions: string[] }[]` ใช้ลำดับกลุ่มเดียวกับ `PERMISSION_GROUPS` ของ API (นำเข้าผ่าน `@pos/api/permissions`: เพิ่ม export path ใน `apps/api/package.json` `exports` เหมือน `@pos/api/promotions` และ re-export `PERMISSION_GROUPS`, `PERMISSIONS`, `canDo` จากไฟล์ `apps/api/src/permissions.ts`), เทสต์: ทุกสิทธิ์อยู่ในกลุ่มเดียว; `lib/describe-entry.ts`: `describeEntry(entry, t)` คืนข้อความย่อสำหรับแถว (ใช้ `summary` ที่ API ส่งมา ถ้ามี) + เทสต์ `before/after` ว่างไม่ทำให้พัง
- [ ] **Step 2: auth** — `useCan` อ่านจาก query ผู้ใช้ปัจจุบัน (`permissions` ใน `/auth/me`): `role === 'owner'` → true; อื่น ๆ → `permissions.includes(p)`; ไม่คัดลอกลง store
- [ ] **Step 3: หน้าบทบาท** `RolesPage`: `DataTable` คอลัมน์ ชื่อ (primary), จำนวนผู้ใช้ (secondary), จำนวนสิทธิ์ (wide-only), ปุ่มแก้ไข/ลบ (ปิดสำหรับบทบาทระบบตามที่ API ปฏิเสธ); `RoleDialog` ฟอร์ม ชื่อ + ช่องติ๊กสิทธิ์จัดกลุ่ม (แต่ละช่อง `h-11`, ป้ายอธิบายสิทธิ์จาก `t('roles:permission.<key>')`), ปุ่มบันทึกท้ายฟอร์ม; owner role แสดงสิทธิ์ทั้งหมดแบบ disabled
- [ ] **Step 4: หน้าประวัติ** `AuditPage`: ตัวกรองวันที่ (ช่วง), ผู้กระทำ, ชนิดเหตุการณ์ (select จาก list ของ action), `DataTable` คอลัมน์ เวลา (primary), ผู้กระทำ (primary), เหตุการณ์/สรุป (secondary), สาขา (wide-only), แถวกดขยายดู `before`/`after` เป็นตารางช่อง-ค่า; แบ่งหน้าด้วย `limit/offset`; ใช้ `useFormat()` สำหรับวันที่
- [ ] **Step 5: ผู้ใช้** — ฟอร์มสร้าง/แก้ผู้ใช้เปลี่ยนช่อง role เป็น select จาก `rolesQuery()` (ส่ง `roleId`); ตารางผู้ใช้แสดงชื่อบทบาทโดย map `roleId` กับ `rolesQuery`; ผู้ใช้ที่ไม่มี `roles.manage` แต่มี `users.manage` ต้องอ่านรายการบทบาทได้: เพิ่มเส้นทาง `GET /roles` ให้รับ `users.manage` ด้วย (ปรับ guard ใน Task 4 ให้ `canDo(actor,'roles.manage') || canDo(actor,'users.manage')` สำหรับ **GET** เท่านั้น — แก้ที่ controller ด้วย `auth: true` แล้วเช็กใน `ListRolesUseCase` ผ่าน `actor`)
- [ ] **Step 6: sidebar/ปุ่ม** — แสดงเมนู "บทบาทและสิทธิ์" เมื่อ `roles.manage`, "ประวัติการกระทำ" เมื่อ `audit.read`, ซ่อนเมนูรายงานเมื่อไม่มี `reports.read`; ปุ่มยกเลิกบิล ปรับสต็อก ฯลฯ ซ่อนเมื่อไม่มีสิทธิ์
- [ ] **Step 7: locales** — namespace `roles` และ `audit` (th/en, `satisfies typeof th`); เพิ่มคำแปลรหัส `PERMISSION_DENIED` (พร้อม `params.permission`), `ROLE_IN_USE`, `ROLE_NAME_TAKEN`, `ROLE_PROTECTED`, `ROLE_NOT_FOUND`, `INVALID_ROLE` ใน `locales/errors.ts`; ลงทะเบียน namespace ใน `app/i18n.ts`
- [ ] **Step 8: รัน** — `bun run typecheck`, `bun run lint`, `bun run test:unit`; `bun run e2e` และ `bun run screenshots` (ต้องมี PostgreSQL) ดูภาพ 390/768/1366px ของ `/roles`, `/audit`, dialog บทบาท
- [ ] **Step 9: Commit** (แยกตามเรื่อง: `feat(auth)` สิทธิ์ที่เว็บ, `feat(roles)`, `feat(audit)`, `feat(users)` เลือกบทบาท)

---

### Task 9: สัญญา OpenAPI เอกสาร และตรวจรวม

**Files:**
- Modify: `apps/api/test/openapi-baseline.json` (หลังแจ้งเจ้าของ), `AGENTS.md`, `docs/superpowers/roadmap.md`, `docs/summary.md`, `docs/superpowers/specs/2026-10-16-permissions-audit-log-design.md` (บันทึกส่วนที่ต่างจากสเปก)

- [ ] **Step 1: ตรวจสัญญา** — `cd apps/api && bun run openapi:check`; อ่าน diff แล้วยืนยันว่ามีแต่ (ก) เส้นทางใหม่ `/api/v1/roles`, `/api/v1/roles/{id}`, `/api/v1/audit-logs` (ข) ช่องใหม่แบบ additive `roleId`/`permissions` และ `roleId` ใน create/update user; ถ้าพบการลบ/เปลี่ยนชนิดช่องเดิม ให้หยุดและแก้โค้ดแทน
- [ ] **Step 2: แจ้งเจ้าของโครงการ** รายการ diff ข้างบนในข้อความถึงเจ้าของโครงการ **ก่อน** บันทึก baseline ใหม่ (`bun --env-file=.env.test test/openapi-snapshot.ts record` หรือคำสั่งที่ README ของไฟล์นั้นระบุ) แล้วรอการยืนยัน
- [ ] **Step 3: เอกสาร** — `AGENTS.md` เพิ่มหัวข้อ "สิทธิ์และบันทึกการกระทำ" (กฎ: ใช้ `requirePermission`/`auth: { can }` ห้ามเช็ก `role === 'owner'` ใหม่; เพิ่มสิทธิ์ที่ `permission.vo.ts` ที่เดียวและต้องเพิ่มคำแปลในเว็บ; ทุกคำสั่งที่อยู่ในรายการ audit ต้องเรียก `IAuditLog.record` ในธุรกรรมเดียวกัน; ห้ามมี update/delete บน `audit_logs`; `resetDatabase` ต้องใส่บทบาทระบบกลับ) ปรับ roadmap ข้อ 12 และ `docs/summary.md` ให้ตรงสถานะ
- [ ] **Step 4: ตรวจรวมทั้ง branch** — `bun run typecheck`, `bun run lint`, `bun run test` (ถ้ามี PostgreSQL), `bun run e2e`, `bun run screenshots`; รายงานชัดเจนว่าอะไรรันไม่ได้
- [ ] **Step 5: Commit และ push** — `gitcz` แยกเรื่องเอกสาร/baseline แล้ว `git push -u origin ohmattpon/permissions-audit-log` และรายงาน branch กับ commit ล่าสุด (ไม่เปิด PR เอง จนกว่าเจ้าของโครงการสั่ง)

---

## Self-Review

**ครอบคลุมสเปก:** สิทธิ์ 20 ตัวและการแมป → Task 1, 5; บทบาทระบบ/ตั้งเอง/กฎลบ/ชื่อซ้ำ → Task 1, 4; `users.role_id` และความเข้ากันได้ของ `role` → Task 2, 3; macro `{ can }` และ `PERMISSION_DENIED` → Task 5; `audit_logs` + port + รายการเหตุการณ์ + `GET /audit-logs` → Task 6, 7; เว็บ (roles, audit, users, sidebar, errors) → Task 8; OpenAPI/เอกสาร → Task 9.

**ส่วนที่ต่างจากสเปก (ต้องบันทึกในสเปกตอน Task 9):** (1) `/auth/me` คืน `roleId` กับ `permissions` แต่ไม่คืน `roleName` — เว็บ map ชื่อจากรายการบทบาท เพราะโมดูล users/auth ห้ามอ่านตารางบทบาทตรง; (2) `GET /roles` เปิดให้ผู้ใช้ที่มี `users.manage` อ่านได้ด้วย เพราะหน้าผู้ใช้ต้องเลือกบทบาท; (3) `UserEntity.toSnapshot()` ไม่มี `roleId` เพื่อรักษา assertion เดิม จึงส่ง `roleId` ผ่าน `entity.roleId` และ `AuthUser`.

**Placeholder scan:** เทสต์สองข้อใน Task 4 (`system roles… deleted`, `duplicate name`) และสามข้อใน Task 5 ระบุพฤติกรรมที่ต้องยืนยันเป็นคอมเมนต์ ผู้ลงมือต้องเขียนเนื้อเทสต์ตามรูปแบบของข้อแรกในไฟล์เดียวกัน; ชื่อไฟล์ use case ของ settings/คืนเงินสดให้ `ls`/`grep` ตามที่ระบุเพราะไม่ได้เปิดอ่านระหว่างเขียนแผน

**Type consistency:** `Actor`/`canDo`/`requirePermission` (Task 1) ใช้ในชื่อเดียวกันใน Task 5; `IRoleDirectory`/`RoleRef` (Task 3) ถูก implement ใน Task 4; `IRolePermissionReader.permissionsOf` (Task 4/5) ตรงกัน; `IAuditLog.record(actor, branchId, entry)` (Task 6) ตรงกับที่เรียกใน Task 7
