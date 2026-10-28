# Offline Sales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The till keeps selling when the server cannot be reached: cash, card (recorded only) and static PromptPay. It prints a temporary receipt, and later syncs each sale exactly once. The server records each sale as it actually happened and flags price, promotion and stock differences for the owner.

**Architecture:**
- **Web:** a service worker (`vite-plugin-pwa`) keeps the app loadable offline. A catalog snapshot and an outbox live in IndexedDB (`idb`), in a new web feature `src/features/offline`. Totals are computed on the device with the same shared rules as the server (`@pos/api/pricing`, `/modifiers`, `/packs`, `/promotions`).
- **Server:** `POST /api/v2/offline-sales` creates the bill through `SaleCheckout` in a new `recorded` mode: the device's prices, no stock refusal, the receipt number of the day it was sold, and review flags. This runs through `CommandIdempotency`, keyed by the device's UUID.
- **Reports:** use `sold_at` (backfilled from `created_at`).

**Tech Stack:** Bun, TypeScript, Elysia, Drizzle (PostgreSQL 17), tsyringe, zod, React, TanStack Query, zustand, `vite-plugin-pwa` (Workbox), `idb`, `playwright-core` (e2e), bun:test.

**Spec:** `docs/superpowers/specs/2026-10-27-offline-sales-design.md`. The owner approved it on 2026-10-27, including every item under "ข้อที่ผมตัดสินใจเอง". It refers to the promotion and points designs, so this plan runs after those two.

## Global Constraints

- **Prerequisite:** `ohmattpon/sales-page-small-bugs`, `ohmattpon/promotion-coupons-bundles` and `ohmattpon/member-points` must already be in `origin/main`. Fast-forward this branch (`ohmattpon/offline-sales`, which already holds the spec and this plan) to `origin/main` before Task 0. If any of the three is missing, stop and ask the owner.
- **Commits:** `gitcz` only, one commit per task. Every commit passes `bun run typecheck`, `bun run test:unit`, `bun run test:web` and `bun run openapi:check`. A task that changes the contract records the OpenAPI baseline in that task, after reading the diff.
- **Feature switch:** offline selling stays off until the owner turns it on with the new shop setting `offline_sales_enabled` (default `false`, added in Task 2). Tasks 1–3 must not change anything a shop sees while the switch is off. The exception is the service worker, which only caches the app files.
- **One checkout path:** never write a second checkout. Every bill goes through `ISaleCheckout`. Never change `calculateTotals`. The server recomputes totals and refuses a sale whose totals differ from what the device sent.
- **Receipt numbers:** real receipt numbers still come only from `nextReceiptNo`, now taking the business day as a parameter. The offline number `OFF-<registerCode>-<6 digits>` is never a receipt number.
- **Append-only:** `offline_sale_rejections` and the review acknowledgements are insert-only.
- **Shift reports:** a late offline sale never changes `shift_summaries`.
- **Limits** (copy exactly):
  - 5,000 products for the snapshot
  - a snapshot older than 24 h stops offline selling
  - the outbox holds at most 500 sales
  - an oldest unsynced sale older than 24 h stops offline selling
  - the server accepts `soldAt` no more than 5 min in the future and no more than 48 h in the past
  - offline is detected after 2 consecutive network failures or 8 s timeouts
  - the health ping runs every 15 s while offline
- **New error codes:** `OFFLINE_SALE_REJECTED` (409, `params.reason`), `OFFLINE_PAYMENT_NOT_ALLOWED` (400) and `OFFLINE_SALES_DISABLED` (409). Add each to `src/locales/errors.ts`.
- **New permission:** `sales.offline_review`. Add it to `PERMISSION_GROUPS` (sales group) and to the web translations.
- **Dependencies:** add only `vite-plugin-pwa` and `idb` (as `dependencies` / `devDependencies` per their docs), with exact versions at least two weeks old.
- **Reporting:** report every change as AGENTS.md "Reporting finished work" asks. Never start Podman or Docker without asking the owner.

## Review Focus

1. **The tab is closed or reloaded mid-sale.** A sale whose IndexedDB write committed is in the outbox. A sale whose write failed was never shown as paid (Task 4).
2. **A retry after the server committed but the answer was lost.** It returns the first bill, never a second (Task 2, idempotency).
3. **Sync after the shift was closed.** The bill exists, is shown as late, and the original shift report is byte-for-byte unchanged (Task 2 integration).
4. **A sale from yesterday synced today.** It gets yesterday's next receipt number. Today's sequence is untouched (Tasks 1 and 2 integration).
5. **A 401 during sync.** Syncing stops, the outbox stays complete, and it resumes after sign-in. A 401 is never treated as a rejection (Task 5).

---

### Task 0: Remove sales → inventory port imports touched by this plan (fix-list item)

`sale-checkout.ts` imports `inventory/applications/ports/stock-ledger.port`. That import breaks the "Code that still breaks these rules" list in AGENTS.md.

**Files:**
- Create `server/src/modules/sales/applications/ports/checkout-stock.port.ts` (`ICheckoutStock` with `record(movement)`, mirroring what checkout uses).
- Create an adapter in `inventory/adapters` that delegates to the ledger.
- Bind it in `inventory.module.ts`.
- Update `mocks.ts` and the tests that build `SaleCheckout`.

- [ ] **Step 1:** Make the change. Behavior does not change. If the import check shows other foreign-port imports left in `sale-checkout.ts`, fix them the same way. If that is more than two more ports, stop and ask the owner.
- [ ] **Step 2:** Run `bun run test:unit && bun run typecheck` and the import check. Expected: no line for `sale-checkout.ts`.
- [ ] **Step 3:** Commit:
  `gitcz --non-interactive --type=refactor --scope=sales --subject="reach stock from checkout through a port the sales module owns"`

### Task 1: `sold_at` and receipt numbers by business day

**Files:**
- Modify `server/src/infrastructure/database/schema/sales.ts` and `server/src/modules/sales/adapters/repository/sale.drizzle.repository.ts` (`nextReceiptNo(branch, day?: string)`). `day` is `YYYY-MM-DD` in the shop time zone, and today when omitted.
- Modify `sales-report.drizzle.repository.ts`, `shift-sales-totals.drizzle.adapter.ts` and `member-sales-history.drizzle.adapter.ts`. Every date filter or grouping moves to `sold_at`.
- Create a generated migration. It adds `sold_at timestamptz` nullable, backfills `sold_at = created_at`, then sets `NOT NULL` and default `now()`, all in one migration as AGENTS.md describes. It also adds `source` (`online` | `offline`, default `online`), `offline_no` (nullable), `synced_by_id` (nullable FK), `review_flags text[]` (default `{}`), and a unique index on `offline_no` where it is not null.
- Tests: `sales-reports.integration.test.ts` and a new `server/src/__tests__/integration/offline-sales.integration.test.ts`.

**Interfaces:**
- `SaleEntity` and responses gain `soldAt`, `source`, `offlineNo` and `reviewFlags`. These are additive.

- [ ] **Step 1: Write the failing tests**
  - `'a receipt number for a past day continues that day's sequence'`
  - `'the sales report groups by soldAt'` (insert one sale whose `sold_at` is the day before its `created_at`)
- [ ] **Step 2:** Watch the tests fail, implement, migrate, then run the tests and record the baseline.
- [ ] **Step 3:** Commit:
  `gitcz --non-interactive --type=feat --scope=sales --subject="date sales by when they were sold"`

### Task 2: Recorded checkout and the sync API

**Files:**
- Modify `server/src/modules/sales/applications/ports/sale-checkout.port.ts`. `CheckoutRequest` gains an optional `recorded?: { soldAt: Date; offlineNo: string; cashierId: number; syncedBy: { id: number }; expected: { subtotalSatang: number; discountSatang: number; vatSatang: number; totalSatang: number }; promotion: { id: number; discountSatang: number } | null }`. Each line may carry `unitPriceSatang`; that already exists for orders.
- Modify `sale-checkout.ts`. In recorded mode:
  - **Prices:** take unit prices from the lines and flag `priceMismatch` when a line's price differs from the current product or pack price.
  - **Promotion:** evaluate the promotion with `evaluatePromotion` at `soldAt`, and flag `promotionMismatch` when it is not eligible or gives a different discount. In both cases still use the device's discount.
  - **Totals:** compute totals with `calculateTotals` and throw `OFFLINE_SALE_REJECTED { reason: 'totals_mismatch' }` if they differ from `expected`.
  - **Stock:** never refuse for stock. Record the movements, and flag `negativeStock` when a level goes below 0.
  - **Member:** do not require the member to be active.
  - **Payments:** QR payments and quotes give `OFFLINE_PAYMENT_NOT_ALLOWED`.
  - **Shift:** an `open` shift is used as usual. A `closing` or `closed` shift records the sale with flag `afterShiftClose` and does not touch the shift summary.
  - **Receipt number:** `nextReceiptNo(branch, soldDay)`.
  - **Audit:** write `sale.offline_recorded`.
  - **Points:** earn points per the points design.
- Create:
  - `server/src/modules/sales/applications/usecases/record-offline-sale.usecase.ts`. This command parses with zod and validates the `soldAt` window. A disabled switch gives `OFFLINE_SALES_DISABLED`. It runs in one unit of work through `CommandIdempotency` with action `sales.offline_record`. On `OFFLINE_SALE_REJECTED`, it writes an `offline_sale_rejections` row outside the failed unit of work, never swallowing the error, and rethrows.
  - The schema, the controller route `POST /api/v2/offline-sales` (`auth: true`, `idempotencyHeaders`) and the rejection table plus repository.
  - The shop setting `offline_sales_enabled` in the settings domain, schema, controller and web types.
- Tests: `sales.usecases.test.ts` (a new `describe('recorded checkout')`) and `offline-sales.integration.test.ts`.

- [ ] **Step 1: Write the failing tests**
  - `'records the device price and flags priceMismatch'`
  - `'refuses totals that do not add up and stores the rejection'`
  - `'sells past zero stock and flags negativeStock'`
  - `'a sale into a closed shift is flagged afterShiftClose and leaves the summary alone'`
  - `'soldAt too far ahead or too old is refused'`
  - `'a QR payment is OFFLINE_PAYMENT_NOT_ALLOWED'`
  - `'the same key twice returns the first bill'`
  - `'two concurrent posts with one key make one bill'`
  - `'an inactive cashier is refused'`
  - `'switch off gives OFFLINE_SALES_DISABLED'`
- [ ] **Steps 2–4:** Watch the tests fail, implement, run them, then record the baseline.
- [ ] **Step 5:** Commit:
  `gitcz --non-interactive --type=feat --scope=sales --subject="record a sale made offline exactly once"`

### Task 3: The snapshot endpoint and the service worker

**Files:**
- Create `server/src/modules/sales/applications/usecases/get-offline-snapshot.usecase.ts` (query). It needs consumer-owned ports for products, modifiers, promotions and settings. Declare them in `sales/applications/ports`, implement them in the owning modules, and reuse existing provider adapters where they fit.
- Add the route `GET /api/v2/offline/snapshot`, with a comment explaining why it is a single document and not `{ items, total }`.
- Add `vite-plugin-pwa` to `vite.config.ts`. It precaches the built app shell. API calls are never cached by the service worker.
- Create `src/features/offline/lib/snapshot-store.ts` using `idb`. It holds the snapshot store with its version and fetched time.
- Create `src/features/offline/api.ts`, holding the snapshot query that refreshes every 10 min while online and the switch is on.
- Tests: the use case test, `src/features/offline/lib/snapshot-store.test.ts` (use `fake-indexeddb` only if it is already available, otherwise inject the store), and `server/src/modules/web.plugin.test.ts`. The server keeps serving `sw.js` and `manifest` from `WEB_DIST`.

**Interfaces:**
- The snapshot is:
  ```ts
  { version: string; generatedAt: string;
    products: ({ id; name; sku; barcode; priceSatang; categoryId; trackStock; packs: { id; barcode; size; priceSatang; isActive }[]; modifierGroupIds })[];
    modifierGroups: (same shape the till reads today)[];
    promotions: (PromotionRules & { name })[];
    settings: { vatMode; vatRateBp; timeZone; currency; locale; receiptHeader };
    registers: { id; code }[] }
  ```
  - `promotions` holds only active, automatic promotions with no usage limit.
  - Cost is never included.
  - More than 5,000 products answers `OFFLINE_SALES_DISABLED { reason: 'catalog_too_large' }`.

- [ ] **Step 1: Write the failing tests**
  - `'the snapshot leaves out costs, coupons and limited promotions'`
  - `'over 5000 products is refused'`
  - `'snapshot store keeps one version and reports its age'`
- [ ] **Steps 2–4:** Watch the tests fail, implement, run them, record the baseline, then run `bun run build` to confirm `sw.js` is emitted.
- [ ] **Step 5:** Commit:
  `gitcz --non-interactive --type=feat --scope=web --subject="keep the app and a catalog snapshot available offline"`

### Task 4: Selling offline on the device

**Files:**
- Create `src/features/offline/lib/connectivity.ts`. This pure state machine counts network failures and timeouts, ignores HTTP errors, flips to offline after 2 failures, and back online on the first successful health ping.
- Create `src/features/offline/lib/outbox.ts`. It handles `add(sale)` in one IndexedDB transaction with the `offlineNo` counter, `list()` in sale order, `markRejected(key, reason)`, `remove(key)`, `count()` and the limit checks.
- Create `src/features/offline/lib/offline-sale.ts`. This pure function builds the outbox record from the cart, the snapshot and the payment, using the shared pricing rules.
- Create `src/features/offline/store/connectivity.store.ts` (zustand, holding only the state).
- Create `src/features/offline/components/OfflineBanner.tsx`.
- Modify `src/lib/api.ts`. Its client takes an injectable fetch, so failures reach the connectivity machine.
- Modify `src/features/pos/components/PosPage.tsx`, `PaymentDialog.tsx`, `ReceiptDialog.tsx` and `CartPanel.tsx`. When offline:
  - Price the cart from the snapshot.
  - Disable bank QR, orders, the member picker for new members, coupons and points redemption.
  - On confirm, write to the outbox first, and show the receipt only after the write succeeds.
  - The receipt title is "ใบรับเงินชั่วคราว" and it shows the `offlineNo`.
- Modify `src/features/shifts`: block starting the count while the outbox is not empty.
- Modify `src/app/App.tsx`: sign-out does not clear the outbox, and it warns with the count.
- Modify the locales.
- Tests: `connectivity.test.ts`, `outbox.test.ts` (with an injected store), and `offline-sale.test.ts`. The last one checks that the totals equal `calculateTotals` for the same input, including packs, options and a promotion.

- [ ] **Step 1: Write the failing tests**
  - `'two network failures go offline, a 500 does not'`
  - `'a failed outbox write is not a sale'`
  - `'offline numbers continue after a reload'`
  - `'over 500 sales or a 24 h old sale stops selling'`
  - `'device totals equal the shared calculation'`
- [ ] **Steps 2–4:** Watch the tests fail, implement, then run `bun run test:web && bun run typecheck && bun run lint`.
- [ ] **Step 5:** Commit:
  `gitcz --non-interactive --type=feat --scope=pos --subject="sell for cash while the server cannot be reached"`

### Task 5: Sync

**Files:**
- Create `src/features/offline/lib/sync.ts`, a class that takes `{ outbox, post, now, schedule }` as constructor options per the AGENTS.md "Inject the world" rule.
  - It sends outbox records in order with the record's key as `Idempotency-Key`.
  - A 2xx removes the record.
  - A 409 `OFFLINE_SALE_REJECTED` marks the record rejected and continues with the next one.
  - A 401 stops the sync and raises `needsSignIn`.
  - A network error stops the sync and waits for the connectivity machine.
  - Other 4xx/5xx retry with backoff, keeping the same key.
- Create `src/features/offline/hooks/use-offline-sync.ts`, which wires the class to the connectivity store and the auth state. It runs on coming online and after sign-in.
- Tests: `sync.test.ts`, with fake timers via the injected `schedule`.

- [ ] **Step 1: Write the failing tests**
  - `'sends in order and removes each on success'`
  - `'a rejection is marked and the next one is sent'`
  - `'401 stops and keeps everything'`
  - `'a retry reuses the key'`
  - `'going offline mid-sync stops after the current request'`
- [ ] **Steps 2–4:** Watch the tests fail, implement, then run the tests.
- [ ] **Step 5:** Commit:
  `gitcz --non-interactive --type=feat --scope=pos --subject="sync offline sales when the server is back"`

### Task 6: Owner review

**Files:**
- Server:
  - `GET /api/v2/offline-sales/review?limit&offset` (`auth: { can: 'sales.offline_review' }`) returns `{ items, total }` of flagged sales and rejections, newest first.
  - `POST /api/v2/offline-sales/review/{id}/acknowledge` is a command that inserts an acknowledgement row and writes an audit entry. It does not edit the sale.
  - Add `sales.offline_review` to `permission.vo.ts`.
  - Show late offline sales in the shift detail, next to voids after close.
- Web:
  - Create `src/features/offline/components/OfflineReviewPage.tsx` with a `DataTable` (priorities on every column) and a route and sidebar entry shown only with the permission.
  - Add the page to the e2e overflow list.
  - Add the role-editor translation.
- e2e: in `e2e/run.ts`, add a scenario. Turn on the switch, open a shift, `context.setOffline(true)`, sell for cash, reload, `setOffline(false)`, then wait until the sale appears in the bill list with a real receipt number.

- [ ] **Step 1: Write the failing tests**
  - `'review lists flagged sales and rejections'`
  - `'acknowledging needs the permission and writes audit'`
  - The e2e scenario.
- [ ] **Steps 2–4:** Watch the tests fail, implement, then run them and `bun run e2e` (it needs its own database; ask the owner if it is not available). Record the baseline.
- [ ] **Step 5:** Run `bun run screenshots` and look at the banner, the temporary receipt and the review page at 390, 768 and 1366 px.
- [ ] **Step 6:** Commit:
  `gitcz --non-interactive --type=feat --scope=sales --subject="let the owner review offline sales"`

### Finish

- [ ] Update AGENTS.md with a new section "Offline sales". It covers the recorded checkout mode and its flags, `sold_at` for every report, the offline number versus the receipt number, the outbox surviving sign-out, and the limits. Commit as `docs`.
- [ ] Update `docs/user-guide.md`: what works offline, the temporary receipt, and the review page.
- [ ] Run `bun run typecheck && bun run lint && bun run test && bun run openapi:check` and the import-check commands.
- [ ] Push with `git push -u origin ohmattpon/offline-sales`, then report the branch, the latest commit, the OpenAPI diff summary and the per-change notes.
