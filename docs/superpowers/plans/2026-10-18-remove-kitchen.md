# Remove Kitchen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every trace of the kitchen feature (server module, orders coupling, DB tables, settings flag, permission, web feature, docs) while keeping order line notes as plain editable notes.

**Estimated tasks:** 9 | **Estimated time:** ~60 min | **Touches:** API / DB migration / Web / OpenAPI baselines / living docs

## Current Problem / Current Solution

The system has a full kitchen subsystem: `server/src/modules/kitchen/` (~27 files: stations, category routing, tickets, send-to-kitchen), kitchen tables/enum in `schema/kitchen.ts`, a `kitchenEnabled` shop-settings flag, a `kitchen.write` permission, orders-module coupling through the `IKitchenTickets` port (sent-quantity tracking, note freeze, merge/split guards), a `src/features/kitchen` web feature (board, stations, send button), and kitchen error codes. The owner wants all of it gone; no kitchen history ever existed in production data, so no archive is needed.

## Proposed Approach

Delete the kitchen module, domain files, web feature, and schema tables; decouple orders (plain notes, no freeze, no merge/split guards, no `sentQuantity` in responses); drop the `kitchenEnabled` flag, `kitchen.write` permission, and kitchen error codes; ship one additive-style destructive migration `0030_remove_kitchen` (DROP TABLEs + DROP enum + DROP COLUMN, approved as destructive); re-record OpenAPI baselines after diff review; update living docs only (dated specs/plans under `docs/superpowers/` are history and stay untouched, as do old migration files and journal entries).

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| `POST /orders/:id/kitchen-send`, `GET /kitchen/tickets`, catalog kitchen-station routes | Served, in OpenAPI baseline | Gone; unknown routes answer 404 and are absent from the baseline |
| Edit an order line note after sending | `KITCHEN_LINE_SENT` 409 | Note edits always allowed (e.g. "หวานน้อย") |
| Merge/split with pending tickets or sent lines | `ORDER_KITCHEN_PENDING` / `ORDER_SPLIT_SENT` 409 | Merge/split never consult tickets; no such codes |
| Cancel / reduce / remove order items | Calls `kitchen.reconcile(...)` | No ticket calls at all |
| Order responses | Include `sentQuantity` per line | No `sentQuantity` field |
| Settings `GET`/`PATCH` | Carries `kitchenEnabled` | Field gone from schema, entity, API, and baseline |
| Web nav/routes | `/kitchen`, `/kitchen-stations`, sidebar items, settings toggle, category station picker, POS send button/sent badge/note lock | All removed; line notes stay editable in the cart |
| DB | `kitchen_*` tables, `kitchen_ticket_status` enum, `shop_settings.kitchenEnabled` | Dropped by `0030_remove_kitchen` |

## Assumptions & Risks

- **Assumed:** No production database ever held kitchen rows (owner stated "ไม่เคยมีประวัติ"); therefore DROP without archive is safe.
- **Assumed:** Dated docs under `docs/superpowers/specs|plans` are historical records and must NOT be rewritten; only living docs (README, guides) change.
- **Assumed:** Old migration files (`drizzle/0015_kitchen.sql`), journal entries, and snapshots are immutable history and stay as-is.
- **Risk:** If any shop DB actually contains kitchen rows, the DROP loses them — accepted per Q3; the migration is still one-directional by repo convention.
- **Risk:** `drizzle-kit generate` writes a non-monotonic journal `when` on skewed clocks (seen before); every task must check `when` monotonicity by hand.
- **Risk:** `openapi-snapshot.ts write` mode only rewrites the **v2** baseline; the v1 baseline still needs the explicit copy-over used previously, with diff review first.

## Impact

- Kitchen screens, routes, permissions, and API endpoints disappear entirely.
- Order editing gets simpler: notes always editable, no ticket reconciliation, no merge/split blocks.
- API contract change (removals) is recorded in both OpenAPI baselines after review.
- Dev and `pos_test` databases migrate forward; `pos_test` self-heals via the harness.

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Spawn separate sub-agents for independent lanes. Do not parallelize tasks that can race on the same files, migrations, generated artifacts, or shared state.

1. **Delete server kitchen module + wiring** — Lane A | Can run with: 2, 3, 6 | Must wait for: none | TDD slice: route-absence tests (404) -> delete module -> `test:api -t kitchen` green by absence + typecheck
2. **Delete kitchen domains + permission + settings flag (entity)** — Lane B | Can run with: 1, 3, 6 | Must wait for: none | TDD slice: settings round-trip without `kitchenEnabled` + preset tests -> remove fields -> domain tests green
3. **Decouple orders from kitchen** — Lane C | Can run with: 1, 2, 6 | Must wait for: none | TDD slice: note-edit/merge/split/cancel tests without ticket mocks -> remove port/calls/guards/`sentQuantity` -> orders tests green
4. **DB migration 0030 + settings API field removal + mocks cleanup** — Lane D | Can run with: 6 | Must wait for: 1, 2, 3 (code refs to schema/ports gone first) | TDD slice: settings PATCH-rejects-`kitchenEnabled` + migrate-fresh check -> generate 0030, drop column/tables/enum -> integration tests green
5. **Delete web kitchen feature + app shell wiring** — Lane E | Can run with: 1, 2, 3, 6 | Must wait for: none | TDD slice: route/nav-absence test (bookmarked `/kitchen` redirects to `/`) -> delete feature + wiring -> `test:web` green
6. **Update web consumers (POS, categories, settings, setup, roles, errors, orders api)** — Lane F | Can run with: 1, 2, 3, 5 | Must wait for: none (different files from Task 5) | TDD slice: cart/note/categories behavior tests -> remove kitchen-gated UI + strings -> `test:web` green
7. **Re-record OpenAPI baselines** — Sequential | Can run with: none | Must wait for: 1–4 (server surface final) | docs/config exception: diff review + `openapi:check`, no behavior test
8. **Living-docs sweep** — Lane G | Can run with: 7 | Must wait for: none for grep; content depends on 1–6 | docs/config exception: grep + targeted edits
9. **Final full verification** — Sequential | Can run with: none | Must wait for: 1–8 | TDD slice: n/a (gate: typecheck + lint + test + openapi:check + residual grep)

---

### Task 1: Delete server kitchen module + wiring

**Files:**

- Delete: entire `server/src/modules/kitchen/` (27 files: `kitchen.module.ts`; usecases `create/update/list-kitchen-stations`, `set-category-station`, `send-order-to-kitchen`, `list-kitchen-tickets`, `mark-kitchen-ticket-done` + their tests; `applications/schemas/kitchen-schemas.ts`; ports `kitchen-ticket.repository.ts`, `kitchen-station.repository.ts`, `kitchen-routing.repository.ts`, `kitchen-order-refs.port.ts`; adapters `kitchen-tickets.drizzle.adapter.ts`, `kitchen-ticket.drizzle.repository.ts`, `kitchen-station.drizzle.repository.ts`, `kitchen-routing.drizzle.repository.ts`; controllers `kitchen-ticket.controller.ts`, `kitchen-catalog.controller.ts`, `schemas/kitchen.schema.ts`, `kitchen-ticket.presenter.ts`)
- Delete: `server/src/__tests__/integration/kitchen.integration.test.ts`
- Modify: `server/src/modules/di-registrations.ts:18` (remove `import './kitchen/kitchen.module'`)
- Modify: `server/src/modules/app.module.ts:13-14,37,41,52,75` (remove both controller imports, resolves, and `.use(...)` lines)
- Test: new `server/src/__tests__/integration/kitchen-removed.integration.test.ts` (asserts `POST /orders/:id/kitchen-send`, `GET /kitchen/tickets`, `GET /catalog/kitchen-stations` answer 404; asserts OpenAPI doc has no `kitchen` paths)

**Parallelization:**

- Can run with: `Task 2`, `Task 3`, `Task 5`
- Must wait for: `none`
- Race risk: none (only this task touches these files; `app.module.ts`/`di-registrations.ts` kitchen lines are uniquely owned here — no other task edits those files)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

Create `kitchen-removed.integration.test.ts`: for each removed route, expect 404; expect the generated OpenAPI v1 document to contain no path with `kitchen`.

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the new test file only. Expected result: FAIL because the routes still exist (non-404), not because of setup/import errors.

- [ ] **Step 3: Implement the minimal code**

Delete the module directory, the kitchen integration test, and the wiring lines in `di-registrations.ts` / `app.module.ts`. No other behavior changes.

- [ ] **Step 4: Run the test and confirm it passes**

Rerun the new test file. Expected result: PASS. Then run `bun run test:unit` scoped to server domains/libs to catch dangling imports early.

- [ ] **Step 5: Refactor only after green**

No refactor expected (pure deletion). Rerun the new test file once more.

---

### Task 2: Delete kitchen domains + permission + settings flag (entity)

**Files:**

- Delete: `server/src/domains/kitchen.domain.ts`, `server/src/domains/kitchen.domain.test.ts`, `server/src/domains/kitchen-station.domain.ts`, `server/src/domains/kitchen-station.domain.test.ts`
- Modify: `server/src/domains/permission.vo.ts:3` (remove `'kitchen.write'` from the catalog group)
- Modify: `server/src/domains/shop-settings.domain.ts:30,36-39,70,93,127,146,167,202` (remove `kitchenEnabled` prop, constructor assignment, validation, snapshot/with support, and the four shop-type presets)
- Test: `server/src/domains/shop-settings.domain.test.ts:30,54,107,162-165` (drop `kitchenEnabled` fixtures; presets `cafe`/`restaurant`/`retail`/`other` without the flag; keep a case asserting unknown/extra feature flags are rejected or ignored per existing convention)

**Parallelization:**

- Can run with: `Task 1`, `Task 3`, `Task 5`
- Must wait for: `none`
- Race risk: none (only this task touches these domain files; `shop-settings.domain.test.ts` is not touched by any other task)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing test**

Update `shop-settings.domain.test.ts` first: presets without `kitchenEnabled`, plus an explicit test that constructing with `kitchenEnabled` no longer takes effect (field absent from snapshot). New kitchen-domain test files are deleted, not written (deletion verified by typecheck in Step 4).

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the settings domain test only. Expected result: FAIL on the new expectations (entity still carries the flag), not on setup errors.

- [ ] **Step 3: Implement the minimal code**

Delete the two kitchen domain files + tests; remove `kitchen.write`; remove `kitchenEnabled` everywhere in the settings entity.

- [ ] **Step 4: Run the test and confirm it passes**

Rerun the settings domain tests. Expected result: PASS. Then `bunx tsc -p server` (or repo typecheck scoped) to prove no remaining importers of the deleted domains.

- [ ] **Step 5: Refactor only after green**

No refactor (deletion). Rerun the settings domain tests.

---

### Task 3: Decouple orders from kitchen

**Files:**

- Delete: `server/src/modules/orders/applications/ports/kitchen-tickets.port.ts`, `server/src/modules/orders/adapters/repository/kitchen-order-refs.drizzle.adapter.ts`
- Modify: `server/src/modules/orders/orders.module.ts` (remove `DrizzleKitchenOrderRefs` import + `kitchenOrderRefsToken` registration; remove the cross-module import of the kitchen port)
- Modify (remove injection, calls, guards): `applications/usecases/cancel-order.usecase.ts` (drop `kitchen.reconcile(saved.id, new Map())`; keep plain cancel), `merge-orders.usecase.ts` (drop `hasPending` guard + `ORDER_KITCHEN_PENDING` + `moveTickets`), `split-order.usecase.ts` (drop `hasPending` guard + `ORDER_KITCHEN_PENDING` + sent-line check + `ORDER_SPLIT_SENT`), `remove-order-item.usecase.ts`, `remove-order-line.usecase.ts`, `set-order-item-quantity.usecase.ts`, `set-order-line-quantity.usecase.ts` (drop `reconcile` calls), `set-order-line-note.usecase.ts` (drop `sentByLine` freeze + `KITCHEN_LINE_SENT`; note always editable)
- Modify: `server/src/modules/orders/adapters/controllers/order.controller.ts:9-10,38,64,67,72-74` (remove kitchen injection and `sentByLine` enrichment; stop emitting `sentQuantity`)
- Modify: `server/src/modules/orders/adapters/controllers/schemas/order.schema.ts:27-30` (remove `sentQuantity`; reword "note for the kitchen" to a generic line note)
- Modify: `server/src/infrastructure/database/schema/orders.ts:60` (reword "A note for the kitchen..." comment to a generic note; no column change)
- Modify: `server/src/modules/orders/adapters/repository/order.drizzle.repository.ts:110` (reword "the till and the kitchen refer to it" comment; no logic change)
- Test: `applications/usecases/orders.usecases.test.ts` (remove `mockKitchenTickets` usage; constructors lose the kitchen arg; delete `ORDER_KITCHEN_PENDING`/`ORDER_SPLIT_SENT`/`reconcile` expectations; add: merge/split succeed where they previously threw, cancel performs no ticket call), `set-order-line-note.usecase.test.ts` (note edits always succeed; delete `KITCHEN_LINE_SENT` case), plus any `__tests__/integration/orders*.integration.test.ts` cases asserting kitchen guards or `sentQuantity`

**Parallelization:**

- Can run with: `Task 1`, `Task 2`, `Task 5`
- Must wait for: `none`
- Race risk: none (only this task touches orders module files; other tasks never edit orders files — Task 4 only generates the migration and edits settings/mocks files)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing test**

Update the orders usecase tests first: constructors without kitchen, note edit on a previously-"sent" line succeeds, merge/split with previously-pending state succeed, cancel/remove/quantity-change assert no ticket interaction. Keep one explicit test that `ORDER_KITCHEN_PENDING`, `ORDER_SPLIT_SENT`, `KITCHEN_LINE_SENT` are never thrown.

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the orders usecase tests only. Expected result: FAIL (constructors still demand kitchen / guards still throw), not setup errors.

- [ ] **Step 3: Implement the minimal code**

Delete the port + adapter; strip injection/calls/guards; remove `sentQuantity` from controller + response schema; reword the two comments. Do not change quantities/pricing/stock logic.

- [ ] **Step 4: Run the test and confirm it passes**

Rerun the orders usecase tests. Expected result: PASS with no new warnings.

- [ ] **Step 5: Refactor only after green**

Keep behavior unchanged; rerun the orders usecase tests.

---

### Task 4: DB migration 0030 + settings API field removal + mocks cleanup

**Files:**

- Modify: `server/src/infrastructure/database/schema/kitchen.ts` — DELETE FILE; remove `export * from './kitchen'` in `schema/index.ts:5`
- Modify: `server/src/infrastructure/database/schema/shop-settings.ts:28` (drop `kitchenEnabled` column)
- Generate: `drizzle/0030_remove_kitchen.sql` + `drizzle/meta/0030_snapshot.json` + `_journal.json` entry via `bun run db:generate`; hand-check the SQL contains only: DROP TABLE `kitchen_ticket_lines`, `kitchen_tickets`, `kitchen_category_stations`, `kitchen_stations`, DROP TYPE `kitchen_ticket_status`, DROP COLUMN `shop_settings.kitchenEnabled`; no unrelated diffs; journal `when` strictly greater than `1792328900003` (fix by hand if the clock skews, as seen before)
- Modify: `server/src/modules/settings/applications/schemas/settings-schemas.ts:38` (remove `kitchenEnabled`), `adapters/controllers/schemas/settings.schema.ts:20` (same), `adapters/repository/shop-settings.drizzle.repository.ts:28` (remove column mapping)
- Modify: `server/src/modules/settings/applications/usecases/settings.usecases.test.ts:58-67` (drop `kitchenEnabled` cases; add: PATCH with `kitchenEnabled` is rejected/ignored and GET never returns it), plus `__tests__/integration/settings.integration.test.ts` kitchen cases
- Modify: `server/src/__tests__/mocks.ts:21-24,29,184-188,257-278` (remove kitchen imports and `mockKitchenTickets`, `mockKitchenStationRepository`, `mockKitchenRoutingRepository`, `mockKitchenTicketRepository`, `mockKitchenOrderRefs`); update remaining importers (resolve via typecheck)
- Test: fresh-migration check — back up nothing (test DB is disposable); run the settings integration tests which migrate `pos_test` forward through 0030

**Parallelization:**

- Can run with: `Task 6`
- Must wait for: `Task 1`, `Task 2`, `Task 3` (all code references to the kitchen schema/ports must be gone before the schema file is deleted and the migration generated)
- Race risk: migration generation (`db:generate` rewrites `_journal.json` + new snapshot) — no other task may run `db:generate` concurrently; only this task runs it

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing test**

Update settings usecase + integration tests first: `kitchenEnabled` absent from GET, PATCH with it rejected/ignored. (The migration itself is verified by inspection + migrate run, not by a behavior test.)

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the settings tests only. Expected result: FAIL (field still accepted/returned), not setup errors.

- [ ] **Step 3: Implement the minimal code**

Delete schema file + export, drop the column, update settings schemas/repo, clean `mocks.ts`, run `bun run db:generate`, verify SQL + journal monotonicity, run `bun run db:migrate` on dev.

- [ ] **Step 4: Run the test and confirm it passes**

Rerun settings usecase + integration tests. Expected result: PASS. If `pos_test` is stale (duplicate-column style errors from renumbering), drop it with the guarded throwaway-script pattern (`assertTestDatabase`, `WITH (FORCE)`) so the harness recreates and migrates 0000→0030, then rerun.

- [ ] **Step 5: Refactor only after green**

No refactor. Rerun the settings tests once more.

---

### Task 5: Delete web kitchen feature + app shell wiring

**Files:**

- Delete: entire `src/features/kitchen/` (10 files: `index.ts`, `api.ts`, `locales.ts`, `lib/tickets.ts`, `lib/stations.ts` + tests, `components/TicketCard.tsx`, `KitchenBoardPage.tsx`, `KitchenStationsPage.tsx`)
- Delete: `src/features/pos/components/KitchenSendButton.tsx`
- Modify: `src/app/App.tsx:10,68-69` (remove kitchen imports + `/kitchen` and `/kitchen-stations` routes; keep `FeatureRoute` itself — other features still use it)
- Modify: `src/app/AppSidebar.tsx:101,118` (remove both kitchen nav items; drop unused `ChefHat`/`Utensils` icon imports if orphaned)
- Modify: `src/app/i18n.ts:7,43,67` (remove `kitchenLocales` import + `kitchen:` namespaces)
- Modify: `src/app/locales.ts:10-11,55-56` (remove `kitchen`/`kitchenStations` nav keys th+en)
- Modify: `src/features/settings/hooks/use-features.ts:4` (return `{ tables: boolean; modifiers: boolean }`; remove `kitchen`)
- Test: extend the web routing/visibility test that covers switched-off features (the `2026-10-18` shop-type plan's Task 6 area — route list / `useFeatures` test): assert `/kitchen` is not a known route (bookmarked URL redirects to `/`) and `useFeatures()` exposes no `kitchen` key

**Parallelization:**

- Can run with: `Task 1`, `Task 2`, `Task 3`, `Task 6`
- Must wait for: `none`
- Race risk: none (only this task deletes `src/features/kitchen/` and edits the listed shell files; Task 6 touches consumer files, never these lines — `use-features.ts` is owned here, consumers only call it)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing test**

Update the feature-visibility/routing test first: `/kitchen` unknown (redirects `/`), no `kitchen` key in `useFeatures()`.

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run that test file only via `bun run test:web` scoped. Expected result: FAIL (routes/keys still present).

- [ ] **Step 3: Implement the minimal code**

Delete the feature dir + send button; strip the shell wiring listed above. Do not redesign nav or settings layout.

- [ ] **Step 4: Run the test and confirm it passes**

Rerun the scoped web test, then full `bun run test:web`. Expected result: PASS, 0 fail.

- [ ] **Step 5: Refactor only after green**

No refactor. Rerun the scoped test.

---

### Task 6: Update web consumers (POS, categories, settings, setup, roles, errors, orders api)

**Files:**

- Modify: `src/features/pos/components/CartPanel.tsx:21,37-38,65-66,73,123,143,198` (remove `KitchenSendButton` import/usage, sent badge, locked-note UI, `features.kitchen` gates; `LineNote` stays always available for order lines)
- Modify: `src/features/pos/lib/cart.ts:25-27` + `cart.test.ts:229` (drop "kitchen has" units; keep the generic note field; if a `sentQuantity` cart field exists, remove it and its test)
- Modify: `src/features/pos/locales.ts:155,319-325` (remove `kitchen.send/sent/lockedNote/sentBadge`-style keys; keep generic `noteFor`/`notePlaceholder` keys for the plain editable note)
- Modify: `src/features/categories/components/CategoriesPage.tsx:26,40-43,60` (remove kitchen routing queries/mutation + station picker UI; delete dead `canRoute` logic)
- Modify: `src/features/categories/locales.ts:86-87` (`stationHint`/`noStation` keys removed th+en — check both language blocks)
- Modify: `src/features/settings/components/SettingsPage.tsx:84,116,192-195` (remove `kitchenEnabled` form state + toggle row; keep tables/modifiers switches untouched)
- Modify: settings locales `features.kitchen`/`features.kitchenHint` (th+en), setup locales `restaurant.hint` (`src/features/setup/locales.ts:45` — drop "kitchen orders" from the hint; retail hint already says no kitchen), roles locales `kitchen.write` labels (`src/features/roles/locales.ts:10,25`)
- Modify: `src/features/orders/api.ts:92,97` (reword note comments: no kitchen refusal), `src/locales/errors.ts:88-98` (remove all `KITCHEN_*`, `ORDER_KITCHEN_PENDING`, `ORDER_SPLIT_SENT` entries in BOTH language blocks)
- Test: existing `cart.test.ts`, categories/settings/setup/roles locale tests (key-parity th/en tests must still pass — `en satisfies typeof th` shape); add one cart test: line note editable with no kitchen state anywhere

**Parallelization:**

- Can run with: `Task 1`, `Task 2`, `Task 3`, `Task 5`
- Must wait for: `none` (disjoint files from Task 5; note Task 5 owns `use-features.ts` itself while this task only updates call sites — if both land, typecheck after all tasks catches any drift)
- Race risk: `src/features/pos/locales.ts` and `src/app/locales.ts` are edited by exactly one task each (this one owns pos locales; Task 5 owns app locales) — no overlap

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing test**

Add/adjust cart test (note editable, no kitchen concepts) and, if present, locale key-parity tests reflecting removed keys first.

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the scoped web test files. Expected result: FAIL (kitchen-gated note/lock still in code).

- [ ] **Step 3: Implement the minimal code**

Apply the consumer edits above. Keep all non-kitchen UI identical.

- [ ] **Step 4: Run the test and confirm it passes**

Rerun scoped files, then full `bun run test:web`. Expected result: PASS, 0 fail.

- [ ] **Step 5: Refactor only after green**

No behavior-preserving cleanup beyond deleting orphans created by this task's own edits (e.g. unused imports). Rerun scoped tests.

---

### Task 7: Re-record OpenAPI baselines

**Files:**

- Review: `server/test/openapi-v1-current.json`, `server/test/openapi-v2-current.json` (generated, gitignored) vs `server/test/openapi-baseline.json`, `server/test/openapi-v2-baseline.json`
- Record: both baseline files (see note below)

**Parallelization:**

- Can run with: `none`
- Must wait for: `Task 1`, `Task 2`, `Task 3`, `Task 4` (the served surface must be final)
- Race risk: baselines are generated artifacts — no other task touches them

**Docs/config-only exception:** no failing behavior test applies; the verification is the reviewed diff plus `bun run openapi:check`.

- [ ] **Step 1: Generate the diff**

Run `bun run openapi:check` (from the repo root; it runs the snapshot script in `check` mode). It writes the `*-current.json` files on mismatch. Diff them against the baselines and confirm the ONLY changes are: removed `kitchen`/`kitchen-stations`/`kitchen-send` paths and schemas, removed `kitchenEnabled` from settings GET/PATCH, removed `sentQuantity` from order responses, removed kitchen error codes. No unrelated additions.

- [ ] **Step 2: Record both baselines**

Note the trap: `openapi-snapshot.ts write` rewrites ONLY the v2 baseline ("v1 baseline preserved"). So: run `check` to regenerate current files, review the diff, then copy `openapi-v1-current.json` over `openapi-baseline.json` (the pattern used for the static-QR feature with owner approval — full removal was likewise owner-approved in grilling Q1) and run the script's `write` mode for v2, OR copy both current files over both baselines explicitly. Either way, both files must be updated from reviewed output only.

- [ ] **Step 3: Verify**

Rerun `bun run openapi:check`. Expected result: PASS ("match their baselines").

---

### Task 8: Living-docs sweep

**Files (discover, then edit only living docs):**

- Grep `[Kk]itchen` across: `README.md`, `DESIGN.md`, `docs/install.md`, `docs/cloudflare.md`, `docs/superpowers/roadmap.md`, and any other non-dated guide under `docs/`
- Explicitly OUT OF SCOPE (history, do not touch): everything under `docs/superpowers/specs/`, `docs/superpowers/plans/`, `drizzle/00*.sql` (incl. `0015_kitchen.sql`), `drizzle/meta/*`
- Likely edits: README feature table / setup section if it names the kitchen board or `kitchen.write`; roadmap items marking kitchen done (mark as removed, dated one-liner — do not rewrite history, just record the removal)

**Parallelization:**

- Can run with: `Task 7`
- Must wait for: `none` for the grep; final wording may depend on Tasks 1–6 outcomes
- Race risk: none (only this task edits living docs; plan/spec history untouched by every task)

**Docs/config-only exception:** prose edits have no behavior test; verification is the residual-grep review below.

- [ ] **Step 1: Inventory**

Run the grep and list every hit outside the out-of-scope paths.

- [ ] **Step 2: Edit living docs only**

Remove or reword kitchen references (routes, permissions, setup hints). Keep edits minimal and factual.

- [ ] **Step 3: Verify**

Re-grep; remaining hits must be ONLY in the out-of-scope history paths, `demo-product-catalog.json` ("Oriental Kitchen" product name — unrelated), or the word "kitchen" inside the new `0030_remove_kitchen` migration tag.

---

### Task 9: Final full verification

**Files:** none (gate only)

**Parallelization:**

- Can run with: `none`
- Must wait for: `Task 1`–`Task 8`
- Race risk: none

- [ ] **Step 1: `bun run typecheck`** — PASS, no errors in web, server, or workers.
- [ ] **Step 2: `bun run lint`** — PASS (only pre-existing warnings in untouched files).
- [ ] **Step 3: `bun run test`** — API + web, 0 fail (counts will be lower than the 1698/393 pre-removal baseline; that is expected — deletions, not regressions).
- [ ] **Step 4: `bun run openapi:check`** — PASS.
- [ ] **Step 5: Residual kitchen grep** — case-insensitive `kitchen` over the repo; allowed leftovers ONLY: `drizzle/0015_kitchen.sql` + older snapshots/journal entries, `docs/superpowers/specs|plans` history, the `0030_remove_kitchen` tag, "Oriental Kitchen" product data. Every other hit is a miss and must be fixed before handoff.
- [ ] **Step 6: Report** — what changed, what verification ran, residual risk. Do NOT commit or push (owner handles it).
