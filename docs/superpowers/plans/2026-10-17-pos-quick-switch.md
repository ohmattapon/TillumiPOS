# Quick Staff Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff switch who is selling at a till with their name and a 4–6 digit PIN, keeping the cart, the shift and the till's register.

**Architecture:** A PIN hash lives on `users` (never on the entity; the entity only knows `hasPin`). PIN rules sit in `domains/pin.vo.ts`. Switching is a command (`SwitchUserUseCase`) behind `auth: true`, guarded by an in-memory `IPinGuard`; the auth controller starts the new session cookie exactly as login does. The web opens a lock screen from the POS page, and after a switch keeps the zustand cart, copies the register selection to the new user and drops every other cached query.

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod; React, TanStack Query, zustand, i18next.

**Spec:** `docs/superpowers/specs/2026-10-17-pos-quick-switch-design.md`

## Global Constraints

- Branch `ohmattpon/pos-quick-switch`, worktree `D:/worktrees/POS-quick-switch`. Never touch `D:/POS` (another session works there). Commit with `gitcz --non-interactive` only; body ends with the `Co-Authored-By` line.
- PIN: digits only, length 4 to 6. Stored only as a hash through the existing `IPasswordHasher`. Never in a log, an audit entry, a response or the JWT.
- Lockout: 5 wrong PINs for the same target user lock that target's PIN switch for 15 minutes. Full sign-in is unaffected.
- A wrong PIN answers **400**, never 401 (a 401 makes the web treat the till as signed out).
- Switch routes are `auth: true`; an anonymous request is refused. The switchable-users list exposes only `id` and `displayName`, sorted by display name, active users with a PIN only.
- Who may set a PIN: oneself (current password required); a `users.manage` holder for others, except a target with the owner role, whose PIN only that owner sets.
- Audit (inside the unit of work for writes): `user.pin_set`, `user.pin_cleared`, `auth.switch` (from, to). A wrong PIN writes `auth.switch_failed` outside a transaction, wrapped like `auth.login_failed` (never makes the request fail for another reason).
- No new server rules for the hand-over: quotes, QR payments, orders and shifts keep their current checks for whoever makes each request. Sessions are not revoked.
- Web after a switch: cart, member, discount (zustand `useCartStore`) kept; the till's current register written for the new user id (overwrite); every cached query except the signed-in user dropped, then the user refetched.
- Additive migration: nullable `users.pin_hash`. Name it with the next free number on `main`; check that its journal `when` is later than the previous entry's (0019's timestamp was set by hand — Drizzle silently skips a migration with an earlier `when`).
- v1 additive only. New error codes stable and translated in `src/locales/errors.ts` (en block, as the file does): `INVALID_PIN` (400), `PIN_INVALID` (400), `PIN_NOT_SET` (400), `PIN_LOCKED` (409), `OWNER_PIN_SELF_ONLY` (403).
- UI text through `t()` in feature `locales.ts` (th template, `en satisfies typeof th`). Lock screen and PIN pad work at 390 / 768 / 1366 px, touch targets ≥ 44 px (`h-11`/`size-11`), PIN pad usable by keyboard (digits, Backspace, Enter).
- Before done: `bun run typecheck`, `bun run lint`, `bun run test`; `bun run openapi:check` shows only additions and the project owner approves before the baseline is recorded.

## Review Focus

1. **A wrong PIN must not sign the current person out** — the response is 400, the session cookie is unchanged, `GET /auth/me` still returns the previous user. → integration test in Task 4.
2. **The sixth try after five wrong PINs is refused even with the right PIN**, and another user's switch still works. → use case test in Task 4.
3. **A user deactivated after setting a PIN** disappears from the list and cannot be switched to. → use case test in Task 4.
4. **Cart and register survive the switch** in the web: lines, member and discount unchanged; the new user id maps to the till's register. → web unit test in Task 5.
5. **A manager setting the owner's PIN is refused** (403 `OWNER_PIN_SELF_ONLY`) and the owner's own PIN change works. → use case test in Task 3.

---

### Task 1: PIN rule and `hasPin`

**Files:**
- Create: `server/src/domains/pin.vo.ts`, `server/src/domains/pin.vo.test.ts`
- Modify: `server/src/domains/user.domain.ts`, `server/src/domains/user.domain.test.ts` (if it exists; else add tests in the nearest user domain test)

**Interfaces:**
- Produces: `export function assertValidPin(pin: string): void` — throws `DomainError('PIN ต้องเป็นตัวเลข 4 ถึง 6 หลัก', 'INVALID_PIN')`; `PIN_PATTERN = /^\d{4,6}$/` (not exported beyond the file unless needed).
- Produces: `UserEntityProps.hasPin?: boolean` (absent = `false`), `UserEntity.hasPin: boolean`, included in `toSnapshot()`; not in `UserChanges` (a PIN changes only through the PIN use cases).

- [ ] **Step 1: Failing tests** — `assertValidPin` accepts `'1234'`, `'123456'`; throws `INVALID_PIN` for `'123'`, `'1234567'`, `'12a4'`, `' 1234'`, `''`, `'１２３４'` (full-width digits). A user built without `hasPin` has `hasPin === false`; `toSnapshot().hasPin` is present; `with({ displayName })` keeps `hasPin`.
- [ ] **Step 2: Run** `cd server && bun test src/domains/pin.vo.test.ts src/domains/user.domain.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Use `/^[0-9]{4,6}$/` (ASCII only).
- [ ] **Step 4: Run** the tests and `bun run test:unit` — PASS (fix existing exact snapshot expectations only by adding `hasPin: false`).
- [ ] **Step 5: Commit** — `--type=feat --scope=auth --subject="add the pin rule to the user domain"`

---

### Task 2: Store PIN hashes

**Files:**
- Modify: `server/src/infrastructure/database/schema/users.ts` (`pinHash: text()` nullable)
- Create: migration via `bun run db:generate` (needs a `.env` with `DATABASE_URL`; if missing in the worktree, write the SQL and journal entry by hand following `drizzle/0019_*` and `drizzle/meta/_journal.json`)
- Modify: `server/src/modules/users/applications/ports/user.repository.ts`, `server/src/modules/users/adapters/repository/user.drizzle.repository.ts`
- Test: `server/src/__tests__/integration/user-pins.integration.test.ts` (resolve the repository and `TOKENS.UnitOfWork` from the container, as other repository-level integration tests do)

**Interfaces:**
- Consumes: `UserEntity.hasPin` (Task 1)
- Produces on `IUserRepository`:
  - every read that builds a `UserEntity` sets `hasPin` from `pin_hash is not null`; `pin_hash` itself is never selected there
  - `findPinHash(userId: number): Promise<string | null>` — the only read of a PIN hash; null for no user, inactive user or no PIN
  - `setPinHash(userId: number, pinHash: string | null): Promise<void>` — throws `DomainNotFoundError('ไม่พบผู้ใช้')` when no row changed
  - `findSwitchable(): Promise<{ id: number; displayName: string }[]>` — active users with a PIN, ordered by display name then id
  - `findPasswordHashById(userId: number): Promise<string | null>` — for the "current password" check on one's own PIN

- [ ] **Step 1: Failing integration tests**: a new user has `hasPin false`; after `setPinHash(id, 'h')` → `findById(id).hasPin === true`, `findPinHash(id) === 'h'`; `setPinHash(id, null)` → `hasPin false`, `findPinHash null`; a deactivated user with a PIN → `findPinHash null` and absent from `findSwitchable`; `findSwitchable` ordered by display name; `setPinHash(9999, 'h')` → `DomainNotFoundError`.
- [ ] **Step 2: Run** `bun run test:api src/__tests__/integration/user-pins.integration.test.ts` — FAIL.
- [ ] **Step 3: Implement** schema, migration (additive, check the journal `when`), repository.
- [ ] **Step 4: Run** the new test and `src/__tests__/integration/users.integration.test.ts` (or the existing users integration file) — PASS.
- [ ] **Step 5: Commit** — `--type=feat --scope=users --subject="store a pin hash for each user"`

---

### Task 3: Set and clear PINs

**Files:**
- Create: `server/src/modules/users/applications/usecases/set-user-pin.usecase.ts`, `server/src/modules/auth/applications/usecases/set-own-pin.usecase.ts`
- Modify: `server/src/modules/users/applications/schemas/*` and `server/src/modules/auth/applications/schemas/auth-schemas.ts` (zod), `server/src/modules/users/adapters/controllers/user.controller.ts` + `schemas/user.schema.ts` (`hasPin: t.Boolean()` on the user response; `PUT /users/:id/pin`), `server/src/modules/auth/adapters/controllers/auth.controller.ts` + `schemas/auth.schema.ts` (`PUT /auth/me/pin`), the users and auth module files for DI
- Test: `server/src/modules/users/applications/usecases/users.usecases.test.ts`, `server/src/modules/auth/applications/usecases/auth.usecases.test.ts`, `server/src/__tests__/integration/user-pins.integration.test.ts`

**Interfaces:**
- Consumes: `assertValidPin` (Task 1); `setPinHash`, `findPasswordHashById`, `findById` (Task 2); `IPasswordHasher`, `IAuditLog`, `IUnitOfWork`, `requirePermission`.
- Produces:
  - `SetUserPinUseCase.execute(targetId: number, input: unknown, actor: { id: number; displayName: string; role; permissions }): Promise<UserEntity>` — Command. zod `{ pin: z.string().nullable() }`. `requirePermission(actor, 'users.manage')`; target missing → `DomainNotFoundError`; target role `owner` and `targetId !== actor.id` → `DomainForbiddenError('…', 'OWNER_PIN_SELF_ONLY')`; `pin` non-null → `assertValidPin`, hash, `setPinHash`; null → `setPinHash(null)`. Audit `user.pin_set` / `user.pin_cleared` (entity user, no PIN) in the same unit of work. Returns the updated user. Match the actor type the existing `UpdateUserUseCase` receives.
  - `SetOwnPinUseCase.execute(input: unknown, actor: { id: number; displayName: string }): Promise<UserEntity>` — Command. zod `{ currentPassword: z.string().min(1).max(200), pin: z.string().nullable() }`. Wrong current password → `DomainError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'INVALID_PASSWORD')` (400, not 401). Same validation, hashing and audit.
  - Routes: `PUT /api/v1/users/:id/pin` (`auth: { can: 'users.manage' }`, body `{ pin: string | null }`, response user) and `PUT /api/v1/auth/me/pin` (`auth: true`, body `{ currentPassword, pin }`, response user). Route schemas describe shape only (no length rules).

- [ ] **Step 1: Failing use case tests** (mock ports): manager sets a cashier's PIN `'4321'` → hasher called with `'4321'`, `setPinHash(id, <hash>)`, audit `user.pin_set` whose entry contains no `'4321'` and no hash; `pin: null` → `user.pin_cleared`; manager (not owner) targets an owner → `OWNER_PIN_SELF_ONLY` and no write (Review Focus 5); an owner sets their own PIN through `SetUserPinUseCase` → allowed; `'12'` → `INVALID_PIN`; actor without `users.manage` → `DomainForbiddenError`; own PIN with wrong current password → `INVALID_PASSWORD`, no write; own PIN with right password → write + audit.
- [ ] **Step 2: Failing integration tests**: `PUT /users/:id/pin` as owner → 200, `hasPin true` in the response and in `GET /users`; as a cashier → 403; `PUT /auth/me/pin` with the right password → 200, `GET /auth/me` shows `hasPin true`; wrong password → 400 `INVALID_PASSWORD` and the session still works.
- [ ] **Step 3: Run** `bun run test:unit` and the integration file — FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** the same — PASS.
- [ ] **Step 6: Commit** — `--type=feat --scope=users --subject="let staff and managers set pins"`

---

### Task 4: Switch staff with a PIN

**Files:**
- Create: `server/src/modules/auth/applications/ports/pin-guard.port.ts`, `server/src/modules/auth/adapters/in-memory-pin-guard.ts` (+ test), `server/src/modules/auth/applications/usecases/switch-user.usecase.ts`, `server/src/modules/auth/applications/usecases/list-switchable-users.usecase.ts`
- Modify: `server/src/modules/auth/auth.module.ts`, `adapters/controllers/auth.controller.ts`, `schemas/auth.schema.ts`, `applications/schemas/auth-schemas.ts`
- Test: `server/src/modules/auth/applications/usecases/auth.usecases.test.ts`, `server/src/__tests__/integration/auth-switch.integration.test.ts`; add a fake guard to `server/src/__tests__/mocks.ts`

**Interfaces:**
- Consumes: `findPinHash`, `findSwitchable`, `findActiveById` (Task 2); `IPasswordHasher`; `IAuditLog`.
- Produces:
  - `IPinGuard { check(userId: number): 'ok' | 'locked'; recordFailure(userId: number): void; recordSuccess(userId: number): void }`, token `pinGuardToken`. `InMemoryPinGuard(now: () => number = Date.now)` with `MAX_FAILURES = 5`, `LOCK_MS = 15 * 60_000` (same behaviour as `InMemoryPairingGuard`; separate class, separate counters). Registered as a singleton.
  - `ListSwitchableUsersUseCase.execute(): Promise<{ id: number; displayName: string }[]>` — Query.
  - `SwitchUserUseCase.execute(input: unknown, actor: { id: number; displayName: string }): Promise<UserEntity>` — Command. zod `{ userId: z.number().int().positive(), pin: z.string().min(1).max(20) }`. Order: guard `locked` → `DomainConflictError('…', 'PIN_LOCKED')` (no hash check); `findActiveById` + `findPinHash`; missing user / inactive / no PIN → `DomainError('…', 'PIN_NOT_SET')`; hasher verify fails → `recordFailure`, audit `auth.switch_failed` (outside a transaction, try/catch + `console.error` like login), `DomainError('PIN ไม่ถูกต้อง', 'PIN_INVALID')`; success → `recordSuccess`, audit `auth.switch` `{ from: actor id/name, to: target id/name }`, return the target user.
  - Routes: `GET /api/v1/auth/switch-users` (`auth: true`, response `page({ id, displayName })`) and `POST /api/v1/auth/switch` (`auth: true`, body `{ userId, pin }`, response = login's user response). On success the controller sets the session cookie exactly as `/login` does — extract one private helper in the controller used by both routes.

- [ ] **Step 1: Failing tests** — guard: 4 failures → `ok`, 5th → `locked`, after 15 min (moved clock) → `ok`, success resets the count, users are independent. Use case: right PIN → returns target, audit `auth.switch`; wrong → `PIN_INVALID`, `recordFailure`, audit `auth.switch_failed`; five wrong then right → sixth is `PIN_LOCKED` and the hasher is not called, another user still switches (Review Focus 2); target deactivated → `PIN_NOT_SET` and absent from `ListSwitchableUsersUseCase` (Review Focus 3); target without PIN → `PIN_NOT_SET`; audit entries never contain the PIN.
- [ ] **Step 2: Failing integration tests** — anonymous `GET /auth/switch-users` and `POST /auth/switch` → 401; list returns only `id` and `displayName` of active users with a PIN; switch with the right PIN → 200, a new session cookie, `GET /auth/me` with it returns the target; wrong PIN → **400** `PIN_INVALID`, no `Set-Cookie`, `GET /auth/me` with the old cookie still returns the previous user (Review Focus 1); a sale made after the switch records the target as cashier.
- [ ] **Step 3: Run** `bun run test:unit` and `bun run test:api src/__tests__/integration/auth-switch.integration.test.ts` — FAIL.
- [ ] **Step 4: Implement.** Reset the guard's state in the integration test setup (tests are independent).
- [ ] **Step 5: Run** the same plus the existing auth integration tests — PASS.
- [ ] **Step 6: Commit** — `--type=feat --scope=auth --subject="switch staff at the till with a pin"`

---

### Task 5: Lock screen and hand-over on the POS page (web)

**Files:**
- Create: `src/features/auth/lib/hand-over-session.ts` (+ test), `src/features/auth/components/SwitchStaffDialog.tsx`, `src/features/auth/components/PinPad.tsx`, `src/features/auth/lib/pin-input.ts` (+ test)
- Modify: `src/features/auth/api.ts`, `src/features/auth/index.ts`, `src/features/auth/locales.ts`, `src/features/shifts/store/register-selection.ts` (+ test), `src/features/shifts/index.ts`, `src/features/pos/components/PosPage.tsx`, `src/features/pos/locales.ts`, `src/locales/errors.ts`

**Interfaces:**
- Consumes: Task 4 routes.
- Produces:
  - `authKeys.switchUsers`; `switchUsersQuery` (`GET /auth/switch-users`, `staleTime: 0`); `useSwitchUser()` mutation (`POST /auth/switch`) whose `onSuccess(user)` runs `handOverSession(queryClient, authKeys.me)` and calls an `onHandOver(newUserId)` option.
  - `handOverSession(queryClient: QueryClient, meKey: QueryKey): Promise<void>` — removes every query except `meKey`, then invalidates `meKey` (unlike `forgetSession`, it never sets the user to null, so the shell never shows the login page).
  - `useRegisterSelectionStore.handOver(toUserId: number, registerId: number | undefined)` — writes `registerId` for `toUserId` (overwrite) when defined; no-op otherwise.
  - `appendDigit(pin: string, digit: string): string` (max 6, digits only), `removeDigit(pin: string): string`, `canSubmitPin(pin: string): boolean` (length 4–6).
  - `SwitchStaffDialog({ open, onOpenChange, onSwitched })`: full-screen on phones, name tiles (`h-11`+), the current user marked, then `PinPad` for the chosen user; Cancel returns without a PIN; error from the server shown with `role="alert"` (translated by code); a link "Sign in with password" that runs the existing logout (which clears the cart and register selection, as today) and shows the login page — the PIN switch is the path that keeps the cart. Users with no PIN never appear (server filters).
  - POS header (inside the existing `PageHeader` actions): current user's display name + "Switch staff" button (`aria-label`, `h-11`). On `onSwitched(newUserId)`: `handOver(newUserId, selectedRegisterId)`.
  - Locales: `auth` — `switch.title`, `switch.choose`, `switch.enterPin` (`'ใส่ PIN ของ {{name}}'`), `switch.cancel`, `switch.usePassword`, `switch.you`, `switch.empty`, `pin.backspace`, `pin.submit`; `pos` — `header.switchStaff` (`'สลับพนักงาน'` / `'Switch staff'`), `header.sellingAs` (`'กำลังขาย: {{name}}'` / `'Selling as {{name}}'`). Errors en: `PIN_INVALID` "Wrong PIN", `PIN_LOCKED` "Too many wrong PINs. Try again in 15 minutes", `PIN_NOT_SET` "This person has no PIN", `INVALID_PIN` "A PIN is 4 to 6 digits", `OWNER_PIN_SELF_ONLY` "Only the owner can set the owner's PIN", `INVALID_PASSWORD` (add only if not already present).

- [ ] **Step 1: Failing tests**: `handOverSession` keeps the me query, removes others and leaves me non-null; `handOver(7, 3)` sets selection `{ '7': 3 }` overwriting `{ '7': 1 }`, `handOver(7, undefined)` changes nothing; pin helpers (`appendDigit('123456','7') === '123456'`, `appendDigit('12','a') === '12'`, `canSubmitPin('123') === false`, `'1234'` true); a test that the cart store's lines, member and discount are unchanged after `handOverSession` + `handOver` (Review Focus 4).
- [ ] **Step 2: Run** `bun run test:web` — FAIL.
- [ ] **Step 3: Implement** the libs, hooks, dialog, PIN pad (keyboard: digits, Backspace, Enter), POS header, locales, error translations.
- [ ] **Step 4: Run** `bun run test:web`, `bun run typecheck`, `bun run lint` — PASS. Run `bun run screenshots` if it works in this environment; otherwise say so in the report (do not start databases or containers).
- [ ] **Step 5: Commit** — `--type=feat --scope=pos --subject="switch staff from the sales page"`

---

### Task 6: PIN settings (web)

**Files:**
- Create: `src/features/auth/components/OwnPinDialog.tsx`, `src/features/users/components/UserPinDialog.tsx`
- Modify: `src/features/auth/api.ts` (`useSetOwnPin`), `src/features/users/api.ts` (`useSetUserPin`, invalidate the users key factory), `src/app/AppSidebar.tsx` (user menu item "Set PIN" → `OwnPinDialog`), `src/features/users/components/UsersPage.tsx` (a "PIN" column/badge from `hasPin` with a `DataTable` `priority`, and a "Set PIN" action hidden for owner-role users other than the signed-in user), `src/features/auth/locales.ts`, `src/features/users/locales.ts`

**Interfaces:**
- Consumes: Task 3 routes and `hasPin` on user responses; `canSubmitPin` (Task 5) for client-side validation.
- Produces:
  - `OwnPinDialog`: current password field + PIN field (`inputMode="numeric"`, `autoComplete="off"`), "Remove PIN" when `me.hasPin`; buttons at the end of the form; errors `role="alert"`.
  - `UserPinDialog({ user })`: PIN field + "Remove PIN"; same rules.
  - Locales: `auth.pin.setOwn`, `auth.pin.currentPassword`, `auth.pin.newPin`, `auth.pin.remove`, `auth.pin.saved`, `auth.pin.hint` (`'ตัวเลข 4–6 หลัก ใช้สลับพนักงานที่หน้าขาย'` / `'4–6 digits, used to switch staff at the till'`); `users.columns.pin`, `users.pin.set`, `users.pin.none`, `users.actions.setPin`.

- [ ] **Step 1: Failing test** — a pure helper `canSetPinFor(target: { id: number; role: string }, me: { id: number }): boolean` in `src/features/users/lib/` (+ test): owner target and `target.id !== me.id` → false; owner target that is me → true; cashier target → true.
- [ ] **Step 2: Run** `bun run test:web` — FAIL.
- [ ] **Step 3: Implement** the helper, hooks, dialogs, sidebar item, users page column/action, locales.
- [ ] **Step 4: Run** `bun run test:web`, `bun run typecheck`, `bun run lint` — PASS.
- [ ] **Step 5: Commit** — `--type=feat --scope=users --subject="set pins from the account menu and the users page"`

---

### Task 7: Contract, docs and full suite

- [ ] **Step 1:** Add a short "### Quick staff switch" section to `AGENTS.md` (after "Permissions and audit"): PIN hash only on `users.pin_hash`, read only by `findPinHash`; the switch is `auth: true` and never a login method; wrong PIN is 400; `IPinGuard` 5 / 15 min per target, in memory (single instance, like the customer display); owner PIN only by the owner; the web keeps the cart and copies the register on hand-over. Commit as `docs`.
- [ ] **Step 2:** `bun run openapi:check` — expect additions only (`hasPin` on user responses, the four new routes). Stop and tell the project owner the list before recording; record only after they agree (`server/test/openapi-v2-baseline.json` via the script's `write`, and `openapi-baseline.json` by copying the generated `openapi-v1-current.json`, as commit `f7b78c0` did), in its own `test(api)` commit.
- [ ] **Step 3:** `bun run typecheck`, `bun run lint`, `bun run test` — PASS. Report the counts.
