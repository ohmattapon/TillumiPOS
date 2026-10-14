# Cash Shifts Implementation Plan

> **For agentic workers:** Use the repository TDD rules for every behavior change. Implement the tasks in order; no task needs a parallel worker because API contracts, database migrations, checkout, and UI share generated types and state.

## Progress (2026-10-14)

- Implemented: versioned cash/card checkout, registers and shared shift lifecycle, append-only cash entries, v1 money-command retirement, permanent activation marker, idempotency, one-time cash refunds, shift/pos screens, localization, and separate OpenAPI baselines.
- Implemented (Task 5): bank QR inside a shift. Durable `shift_qr_attempts` reserved under the shift lock before the bank is called, the bank called with nothing locked, unknown outcomes kept for recovery (`POST /payments/qr/attempts/{id}/resolve`), a pure-read `GET /payments/qr/{id}` with a separate `refresh` command, the branch-wide paid-unclaimed list, late money sold in a later shift (origin shift and sale shift kept apart), and the counting rules (blocked by unresolved attempts and paid-unclaimed money, acknowledgement for QRs still waiting, close refused when money arrived during the count). Web: QR in shift mode, paying with money that already arrived, and the recovery panel on the shift page.
- Added beyond the spec, because the spec left no way out: an owner can **dismiss** a paid QR that will never get a sale (`POST /payments/qr/{id}/dismiss`, with a reason). Without it such a payment would keep its shift from ever being counted. Dismissed money stays on record as paid and can no longer pay for a sale. The spec's `IShiftQrAttempts` port is named `IQrAttemptRepository` and lives in the qr-payments module, next to `IQrShiftReadiness`.
- Implemented (Task 4): the shift report. Worked out live for an open shift, frozen in `shift_summaries` under the shift lock when counting starts, dropped when a count is cancelled, never rewritten after close; sales voided later are reported beside it (`GET /shifts/{id}/summary`). History is filtered by register and status and paged, with a detail view. Race tests cover checkout against start-counting, double close, and a currency change against opening a shift.
- Browser checks (`bun run e2e`, headless Chrome, two signed-in sessions): 11 pass. They found and fixed one defect: the pay button stayed enabled without an open shift. Not covered in a browser: QR recovery, cash refund, register management, order payment in a shift.
- Still required: shift times are shown in the browser's time zone, not the shift's `timeZone` snapshot; the history has no date-range filter in the web UI (the API accepts `from`/`to`).
- Bank QR in shift mode is tested against the fake SCB only. No real bank payment has been made through it; verify one before relying on it. See [cash-shift-cutover.md](../../cash-shift-cutover.md).

**Goal:** Add shared register shifts with an append-only cash ledger, versioned checkout, safe QR recovery, void cash refunds, and a POS workflow that keeps sales and drawer totals tied to an explicitly open shift.

**Estimated tasks:** 8 | **Touches:** API / PostgreSQL / Web / deployment docs

## Current Problem / Current Solution

The current v1 sale and QR flows have no register or shift linkage. Staff can share a register operationally, but there is no server record of who opened or closed the drawer, no cash count snapshot, and no safe way to recover QR payments when settlement and sale creation cross a closing boundary.

## Proposed Approach

Introduce branch-bound registers and persistent shift state, then expose register, shift, and checkout commands in API v2. Keep v1 behavior in legacy mode and require an explicit deployment mode before shift checkout can run. Route sale creation through the existing `SaleCheckout` port, adding shift linkage and cash ledger writes in the same unit of work. Add QR attempt recovery and explicit cash refunds, then connect the web POS and shift screens through feature APIs and localized UI.

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| Cashier checks out | Sale has no register shift | v2 command names an open shift; server validates and records it atomically |
| Staff count a shared drawer | No persistent count workflow | Any staff member can open/use a shift; close records expected, actual, variance, and actors |
| QR settles during closing | QR status and sale may diverge | Durable attempts retain unknown/paid-unclaimed state for recovery without issuing a second QR |
| Cash sale is voided | Stock and sale status change; physical refund is not represented | Owner records a separate one-time cash refund against an open shift |

## Assumptions & Risks

- **Assumed:** Existing auth branch context and role checks are the source of branch and owner authority.
- **Assumed:** Existing SaleCheckout and UnitOfWork can be extended without bypassing stock, receipt, VAT, or QR claim rules.
- **Risk:** Concurrent checkout, close, currency change, and refund commands can duplicate or misstate drawer cash unless all adapters use the specified lock order and database constraints.
- **Risk:** API v1 and v2 generated types can diverge; keep separate controllers/schemas and do not regenerate the v1 OpenAPI baseline as a side effect.
- **Risk:** This is a multi-layer feature. Keep legacy mode the default and require explicit operator cutover after clients and pending QR payments are reviewed.

## Impact

- Existing v1 money requests keep their current contracts in legacy mode.
- New v2 checkout requests require a `shiftId` and `Idempotency-Key`.
- Migration adds registers, shifts, ledger, QR attempt, and command receipt storage; old sales remain unassigned.
- Web checkout is unavailable until a shift is open when the deployment uses shifts mode.

---

## Task Overview

> **Implementation tasks:** Follow test-first RED -> GREEN -> REFACTOR. Run targeted API or web tests for each slice, then the repository's required `bun run typecheck` and `bun run test` before declaring completion.
> **Parallelization:** Sequential. Each task changes shared API schemas, database types, checkout wiring, or the POS state consumed by the next task; parallel edits would race on migrations and inferred Eden types.

1. **Versioning and checkout mode** - Can run together: none | Must wait for: none | TDD slice: assert legacy/shifts routing policy -> implement config/policy/v2 composition -> targeted contract tests.
2. **Register, shift, and cash ledger core** - Can run together: none | Must wait for: Task 1 | TDD slice: domain/use case rules -> schema/repositories/commands -> unit and PostgreSQL concurrency tests.
3. **v2 sales and order checkout** - Can run together: none | Must wait for: Task 2 | TDD slice: reject missing/closed shift and retries -> extend shared SaleCheckout -> integration tests for atomic stock/sale/ledger behavior.
4. **Closing snapshot and shift queries** - Can run together: none | Must wait for: Task 2 | TDD slice: immutable cutoff and revision tests -> queries/controllers -> PostgreSQL race tests.
5. **Void cash refund and durable QR recovery** - Can run together: none | Must wait for: Tasks 3 and 4 | TDD slice: one-time refund and QR state transitions -> ports/adapters/API -> fake-SCB recovery tests.
6. **Web shift and register feature** - Can run together: none | Must wait for: Tasks 1-5 | TDD slice: state and money helper tests -> localized feature hooks/screens -> web checks and browser flow where available.
7. **Cutover and API documentation** - Can run together: none | Must wait for: Tasks 1-6 | TDD slice: config/schema contract checks -> migration/cutover guide and v2 OpenAPI snapshot -> review generated contract diffs.
8. **Full verification and delivery notes** - Can run together: none | Must wait for: Tasks 1-7 | TDD slice: run typecheck, full test suite, lint, and v1/v2 OpenAPI checks; record any unavailable live/browser/bank evidence.

## Task 1: Versioning and checkout mode

**Files:**

- Create or modify: `apps/api/src/libs/env.ts`, root `.env.example`, `apps/api/src/modules/app.module.ts`, `apps/api/src/modules/di-registrations.ts`
- Create: v2 composition/controller scaffolding and checkout-mode domain/application policy under `apps/api/src/modules/`
- Test: API unit and integration tests for legacy passthrough, required mode, and v1 retired commands

**Parallelization:**

- Can run with: none
- Must wait for: none
- Race risk: API root composition and inferred Eden types

- [ ] Read applicable TDD instructions and inspect auth/controller patterns.
- [ ] Add failing tests proving default legacy behavior and v2 command gating.
- [ ] Implement mode parsing and route policy without changing v1 command payloads.
- [ ] Run targeted API tests, then refactor.

## Task 2: Register, shift, and cash ledger core

**Files:**

- Create: `apps/api/src/domains/register.domain.ts`, `shift.domain.ts`, related tests/errors
- Create: `apps/api/src/modules/shifts/**` ports, schemas, use cases, controllers, repositories, module
- Create: `apps/api/src/infrastructure/database/schema/registers.ts`, `shifts.ts`, `shift-cash-entries.ts` and migration
- Modify: schema index, branch creation adapter/UOW, DI registration, API integration fixtures
- Test: unit use cases/entities and PostgreSQL integration for register constraints, shared actors, cash movement, and concurrency

**Parallelization:**

- Can run with: none
- Must wait for: Task 1
- Race risk: schema generation, migration ordering, shared mocks/factories

- [ ] Add failing state-transition, bounds, permissions, and cash balance tests.
- [ ] Implement register lifecycle, shift lifecycle, append-only ledger, schema constraints, and MAIN register provisioning.
- [ ] Run targeted unit/integration tests and refactor.

## Task 3: v2 sales and order checkout

**Files:**

- Modify: `apps/api/src/domains/sale.domain.ts`, sale schema/repository, SaleCheckout port/service, `CompleteSaleUseCase`, `PayOrderUseCase`, v1/v2 sale controllers
- Create: command receipt schema/port/adapter and checkout idempotency tests
- Test: sale/order integration tests, duplicate key/body mismatch, branch/shift validation, atomic rollback

**Parallelization:**

- Can run with: none
- Must wait for: Task 2
- Race risk: checkout lock order and shared test fixtures

- [ ] Add failing tests for explicit shift, shared-shift staff, closed shift rejection, and safe replay.
- [ ] Implement v2 checkout through the existing SaleCheckout and one UOW.
- [ ] Run targeted tests and refactor.

## Task 4: Closing snapshot and shift queries

**Files:**

- Modify: `apps/api/src/modules/shifts/**`, `apps/api/src/modules/settings/**` and database shift summaries
- Test: history/current shift queries, closing revision, concurrent checkout-vs-closing, currency update guard, frozen snapshot

**Parallelization:**

- Can run with: none
- Must wait for: Task 2
- Race risk: same shifts files and migration state as Task 2; keep sequential

- [ ] Add failing tests for stale revision, unresolved QR blocker, and frozen closing snapshot.
- [ ] Implement start/cancel/confirm close and paginated shift summaries.
- [ ] Run targeted tests and refactor.

## Task 5: Void cash refund and durable QR recovery

**Files:**

- Modify: sales void flow and QR payment module through ports only
- Create: durable QR attempt schema/adapters, unclaimed paid QR query, refund use case, v2 endpoints
- Test: fake-SCB QR lifecycle, unknown outcome, late payment, one-time refund, cross-shift same-branch refund

**Parallelization:**

- Can run with: none
- Must wait for: Tasks 3 and 4
- Race risk: QR callbacks and checkout/close transactions; use only fake SCB in automated tests

- [x] Add failing refund and QR recovery integration tests.
- [x] Implement attempts, inquiry-driven paid status, recovery, and explicit cash refund.
- [x] Run targeted tests and refactor.

## Task 6: Web shift and register feature

**Files:**

- Create: `apps/web/src/features/shifts/**`
- Modify: `apps/web/src/app/App.tsx`, `AppSidebar.tsx`, i18n, POS/sales API hooks and error locales
- Read before UI changes: `DESIGN.md`
- Test: pure helpers/store tests and relevant web tests

**Parallelization:**

- Can run with: none
- Must wait for: Tasks 1-5 so Eden types and API contracts are stable
- Race risk: shared navigation/locales and generated API types

- [ ] Add failing store/helper and checkout gating tests.
- [ ] Implement localized register selection, open/current/close workflow, shift history, cash entries, refund and QR recovery surfaces.
- [ ] Run targeted web tests/lint and refactor.

## Task 7: Cutover and API documentation

**Files:**

- Modify: `README.md` or deployment documentation, `.env.example`, API OpenAPI v2 baseline only after contract review
- Create: migration/cutover checklist in `docs/`
- Test: config validation, migration from existing database, `openapi:check` and separate v2 snapshot

**Parallelization:**

- Can run with: none
- Must wait for: Tasks 1-6
- Race risk: environment examples, generated docs, OpenAPI baseline

- [ ] Add checks for safe default and irreversible shifts activation marker.
- [ ] Document backup, pending QR, client migration, and explicit legacy retirement.
- [ ] Run migration and OpenAPI checks; do not enable shifts mode automatically.

## Task 8: Full verification and delivery notes

**Files:**

- Review all feature files and final repository status
- Test: `bun run typecheck`, `bun run test`, `bun run lint`, API v1/v2 OpenAPI checks

**Parallelization:**

- Can run with: none
- Must wait for: Tasks 1-7
- Race risk: database state and generated OpenAPI snapshots

- [ ] Run all required checks and resolve failures.
- [ ] Record exact passed checks and any live SCB/device evidence not performed.
- [ ] Leave changes on the feature branch; never push or merge.
