# One Branch Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the system run on one fixed branch (`MAIN`) and remove branches from every screen, without dropping tables or breaking API v1.

**Architecture:** On the server, `ResolveBranchUseCase` always returns `MAIN` (new port method `findMain()`). Creating a branch and closing `MAIN` are refused. `SaleCheckout` takes the receipt address and phone from shop settings and stores no branch name. Setup's `branchName` becomes optional. On the web, the `branches` feature shrinks to `branchesQuery` (still used by old receipts), and the branch store, header, switcher, page and every branch control go away.

**Tech Stack:** Bun, Elysia, Drizzle, tsyringe, zod, React, TanStack Query, zustand, react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-17-single-branch-design.md`

## Global Constraints

- No table or column is dropped or retyped. The only migration is a one-row update that reopens `MAIN`.
- API v1 changes are additive or relaxing only: new error codes `SINGLE_BRANCH_ONLY` (409) and `MAIN_BRANCH_REQUIRED` (409), optional `branchName` in setup. No route, field or permission is removed. `branches.manage` and `branches.switch` stay in `PERMISSION_GROUPS`.
- Do not record `server/test/openapi-baseline.json` without telling the owner first (Task 7 stops for this).
- Domain errors carry a Thai message and a stable code; every new code gets a translation in `src/locales/errors.ts`.
- Every user-facing text comes from `t()`. Remove locale keys that nothing uses any more, in both `th` and `en`.
- Commit with `gitcz` only, one concern per commit, stage files by name, end the body with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The agent runs `bun run test:unit`, `bun run test:web`, `bun run typecheck`, `bun run lint`. It never runs `bun run test`, `bun run e2e`, `bun run screenshots`, migrations or seeds (they need and change a database).
- No existing test assertion is edited to make a change pass unless the spec changes that contract; each such edit is named in the commit body with the reason.

## Review Focus

1. A request with `X-Branch-Id` set to another branch, or from a user assigned to another branch, still works and works in `MAIN` (Task 1).
2. Closing `MAIN` is refused even when other active branches exist, so the old "at least one active branch" check is not the only guard (Task 2).
3. A new bill stores `branchName: null` and the shop's address and phone even when `MAIN` has its own address (Task 3).
4. After the web change, no request sends `x-branch-id` and no query key or register selection depends on a branch id, so a value left in `localStorage` by the old build has no effect (Task 5).
5. Old bills without a stored heading still print their branch's name, address and phone (Task 5 keeps `branchesQuery` in `Receipt.tsx`; `receipt-heading.test.ts` stays unchanged).

---

### Task 1: Every request works in `MAIN`

**Files:**
- Modify: `server/src/modules/branches/applications/ports/branch.repository.ts`, `server/src/modules/branches/adapters/repository/branch.drizzle.repository.ts`, `server/src/modules/branches/applications/usecases/resolve-branch.usecase.ts`, `server/src/__tests__/mocks.ts` (add `findMain` to `mockBranchRepository`)
- Test: `server/src/modules/branches/applications/usecases/branches.usecases.test.ts`

**Interfaces:**
- Produces: `IBranchRepository.findMain(): Promise<BranchEntity | null>` (the branch with code `MAIN`). `ResolveBranchUseCase.execute(user, requested?)` keeps its signature and ignores both `requested` and `user.branchId`.

- [ ] **Step 1: Write failing tests** in the resolve-branch section: `works in MAIN without a header`, `works in MAIN when the header names another branch`, `works in MAIN for a user assigned to another branch without branches.switch` (all expect the returned id to be MAIN's), `answers BRANCH_NOT_FOUND when there is no MAIN`. Replace the existing tests that expect `BRANCH_FORBIDDEN` / `BRANCH_INACTIVE` from resolution; name them in the commit body.
- [ ] **Step 2: Run `bun run test:unit`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `findMain` in the port, the Drizzle adapter (`where code = 'MAIN'`) and the mock; make `ResolveBranchUseCase` return `findMain()` or throw `BRANCH_NOT_FOUND`. Remove the now unused imports. Update the class comment to say why the header is ignored.
- [ ] **Step 4: Run `bun run test:unit` and `bun run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** `--type=feat --scope=branches --subject="work in the MAIN branch for every request"`.

### Task 2: No second branch, and `MAIN` stays open

**Files:**
- Modify: `server/src/modules/branches/applications/usecases/create-branch.usecase.ts`, `update-branch.usecase.ts`, `src/locales/errors.ts`
- Create: `drizzle/0019_reopen_main_branch.sql`, journal entry in `drizzle/meta/_journal.json` (idx 19, tag `0019_reopen_main_branch`)
- Test: `branches.usecases.test.ts`

**Interfaces:**
- Produces: error codes `SINGLE_BRANCH_ONLY` (`DomainConflictError`, message `ระบบใช้ได้สาขาเดียว`) and `MAIN_BRANCH_REQUIRED` (`DomainConflictError`, message `ปิดสาขาหลักไม่ได้`).

- [ ] **Step 1: Write failing tests:** `refuses to create any branch` (`SINGLE_BRANCH_ONLY`, repository `create` never called); `refuses to close MAIN even when other branches are open` (`countActive` mocked to 2, expect `MAIN_BRANCH_REQUIRED`); `still lets MAIN's name change`. Replace existing create-branch success tests; name them in the commit body.
- [ ] **Step 2: Run `bun run test:unit`.** Expected: FAIL.
- [ ] **Step 3: Implement** both checks first in each use case (before any other work). Add the two codes to `src/locales/errors.ts` (Thai and English). Write the migration: `UPDATE "branches" SET "is_active" = true WHERE "code" = 'MAIN';` and its journal entry, following `0018_shop_features`.
- [ ] **Step 4: Run `bun run test:unit`, `bun run test:web`, `bun run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** two commits: the use cases + errors (`feat(branches): refuse a second branch and closing MAIN`), and the migration (`feat(branches): reopen MAIN if it was closed`, body: a closed MAIN would stop the shop with no screen left to reopen it).

### Task 3: Receipt header from the shop

**Files:**
- Modify: `server/src/modules/sales/applications/services/sale-checkout.ts` (lines around 138 and 181-183)
- Test: the existing `SaleCheckout` unit test file next to it (find with `Grep "SaleCheckout" server/src/**/*.test.ts`)

- [ ] **Step 1: Write the failing test** `a new bill takes the address and phone from the shop and stores no branch name`: the branch mock has its own address and phone; assert the saved sale has `branchName: null`, `shopAddress` and `shopPhone` equal to the shop settings values.
- [ ] **Step 2: Run `bun run test:unit`.** Expected: FAIL.
- [ ] **Step 3: Implement:** set `branchName: null`, `shopAddress: shop.address`, `shopPhone: shop.phone`; remove the `sellingBranch` lookup if nothing else uses it. Update any existing assertion that expected the branch values and name it in the commit body (the spec changes this contract).
- [ ] **Step 4: Run `bun run test:unit`, `bun run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** `--type=feat --scope=sales --subject="print the shop address and phone on new receipts"`.

### Task 4: Setup no longer asks for a branch name

**Files:**
- Modify: `server/src/modules/setup/applications/schemas/setup-schemas.ts`, `server/src/modules/setup/adapters/controllers/schemas/setup.schema.ts` (`t.Optional`), `complete-setup.usecase.ts`, `src/features/setup/components/SetupPage.tsx`, `src/features/setup/lib/setup-form.ts` (if it carries `branchName`), `src/features/setup/locales.ts`
- Test: `setup.usecases.test.ts`, `src/features/setup/lib/setup-form.test.ts`

- [ ] **Step 1: Write the failing test** `without a branch name, names MAIN after the shop`: omit `branchName`, expect `branches.update` called with the shop name. Keep the existing test that passes a branch name.
- [ ] **Step 2: Run `bun run test:unit`.** Expected: FAIL (zod rejects the missing field).
- [ ] **Step 3: Implement** the optional field and the default; remove the field, its state and its locale keys from the setup page and form helper. Update `setup-form.test.ts` only where it asserted the branch field; name it in the commit body.
- [ ] **Step 4: Run `bun run test:unit`, `bun run test:web`, `bun run typecheck`, `bun run lint`.** Expected: PASS.
- [ ] **Step 5: Commit** `--type=feat --scope=setup --subject="stop asking for the first branch name at setup"`.

### Task 5: The web has no working branch

**Files:**
- Delete: `src/lib/active-branch.ts`, `src/features/branches/components/BranchSwitcher.tsx`, `BranchesPage.tsx`, `BranchFormDialog.tsx`, `src/features/branches/hooks/use-active-branch.ts`, `src/features/branches/lib/*` (with their tests)
- Modify: `src/lib/api.ts` (no `x-branch-id`), `src/features/branches/index.ts` (exports only `branchesQuery`, `branchKeys`, `Branch`, locales if still used), `src/features/branches/api.ts` (drop the mutations), `src/app/App.tsx` (no `/branches` route, no `useActiveBranch()`), `src/app/AppSidebar.tsx` (no nav item, switcher or branch name line), `src/features/pos/components/PosPage.tsx`, `ProductPicker.tsx`, `src/features/shifts/components/ShiftsPage.tsx`, `src/features/shifts/store/register-selection.ts` (+ test), `src/features/members/components/MembersPage.tsx`, `src/features/reports/api.ts`, `ReportsPage.tsx`, `src/app/i18n.ts`
- Keep: `src/features/sales/components/Receipt.tsx` still reads `branchesQuery` for old bills (Review Focus 5).

**Interfaces:**
- Produces: `register-selection` keys by user only: `select(userId: number, registerId: number)`, `selectedRegisterId(selections, userId)`. Report queries take no branch id: `reportQuery(filters)`, `productsReportQuery(filters, offset)`.

- [ ] **Step 1: Write the failing test** in `register-selection.test.ts`: `remembers one register per user`; update the existing tests to the new signature (named in the commit body: the branch dimension is gone).
- [ ] **Step 2: Run `bun test ./src/features/shifts`.** Expected: FAIL.
- [ ] **Step 3: Implement** the store change, then remove the branch store, header, hook, switcher, page and their callers as listed. Members history and register lookups stop gating on `branch`; they use the signed-in user (`meQuery`) where they need to wait for a session. Reports read from the API without a branch header.
- [ ] **Step 4: Run `bun run test:web`, `bun run typecheck`, `bun run lint`, and `Grep "x-branch-id|useActiveBranch|active-branch|BranchSwitcher" src`.** Expected: all pass, and the grep finds nothing.
- [ ] **Step 5: Commit** `--type=refactor --scope=web --subject="drop the working branch from the web"`.

### Task 6: No branch controls left on screen

**Files:**
- Modify: `src/features/users/components/UsersPage.tsx`, `UserFormDialog.tsx` (no column, no field; create sends no `branchId`), `src/features/audit/components/AuditPage.tsx` (no branch column), `src/features/reports/components/ReportFilters.tsx`, `ReportsPage.tsx` (no scope select, no per-branch section), `src/features/reports/lib/export-workbook.ts` (+ test: no branches sheet, no scope row), `src/features/roles/components/*` (hide `branches.manage`, `branches.switch` from the editor), the matching `locales.ts` files

- [ ] **Step 1: Write the failing tests:** in `export-workbook.test.ts`, `has no branches sheet` and update the scope-row assertion (named in the commit body); for the role editor, if the permission list is built by a pure function, a test that it leaves out the two branch permissions; otherwise add a small pure `visiblePermissionGroups()` in `src/features/roles/lib/` with that test.
- [ ] **Step 2: Run `bun run test:web`.** Expected: FAIL.
- [ ] **Step 3: Implement** the removals and the role filter. Remove locale keys nothing uses.
- [ ] **Step 4: Run `bun run test:web`, `bun run typecheck`, `bun run lint`.** Expected: PASS.
- [ ] **Step 5: Commit** one commit per area: users, audit, reports, roles.

### Task 7: Seed, e2e, rules, contract

**Files:**
- Modify: `server/src/infrastructure/database/seed-demo.ts` (one branch: everything goes to `MAIN`), `e2e/run.ts` and `e2e/shots.ts` (no `/branches`, no first-branch-name step), `AGENTS.md` ("Branches" section: one fixed `MAIN` branch, header ignored, no second branch, `MAIN` never closed; the QR exception from the spec; the role editor hides the two branch permissions)

- [ ] **Step 1: Edit the seed, e2e scripts and `AGENTS.md`.** No test runs the demo seed; check it with `bun run typecheck`.
- [ ] **Step 2: Run `bun run typecheck`, `bun run lint`, `bun run test:unit`, `bun run test:web`.** Expected: PASS.
- [ ] **Step 3: Commit** three commits: seed (`chore`), e2e (`test`), AGENTS.md (`docs`).
- [ ] **Step 4: Stop and tell the owner** about the OpenAPI change (two new error codes, optional `branchName` in setup) before anyone runs `bun run openapi:check` / records the baseline. Do not record it.

### Task 8: Whole-branch verification

- [ ] **Step 1:** `bun run typecheck`, `bun run lint`, `bun run test:unit`, `bun run test:web` all pass.
- [ ] **Step 2:** `Grep -i "branch" src --glob "!**/*.test.*"` and read every remaining hit: each must be the old-receipt fallback, `branchesQuery`/types, or server-owned data on a bill.
- [ ] **Step 3:** Report what the agent did not run: `bun run test` (integration, needs a database), `bun run e2e`, `bun run screenshots`, `bun run openapi:check`, the new migration, and the demo reseed.
- [ ] **Step 4:** Do not push; ask the owner.
