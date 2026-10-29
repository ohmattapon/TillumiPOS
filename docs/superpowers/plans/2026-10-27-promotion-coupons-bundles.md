# Promotion Coupons, Bundles, Limits and Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coupon codes, buy-X-get-Y bundles, usage limits (total and per member) and a per-promotion sales report, without stacking discounts or touching `calculateTotals`.

**Architecture:** Every rule about whether a promotion applies, and how much it gives, stays in `server/src/domains/promotion.domain.ts`. The web uses the same rules through `@pos/api/promotions`. Usage limits are checked in the `quotes` module (`CreateQuoteUseCase` and `QuoteClaims`) through a new consumer-owned port, `IPromotionUsage`, which the `promotions` module implements. That module locks the promotion row. The report is a new query in the `sales` module next to the existing sales reports.

**Tech Stack:** Bun, TypeScript, Elysia, Drizzle (PostgreSQL 17), tsyringe, zod, React, TanStack Query, zustand, bun:test.

**Spec:** `docs/superpowers/specs/2026-10-27-promotion-coupons-bundles-design.md`. The owner approved it on 2026-10-27, including every item under "ข้อที่ผมตัดสินใจเอง".

## Global Constraints

- **Branch:** `ohmattpon/promotion-coupons-bundles`, which already holds the spec. Fast-forward it to `origin/main` before Task 1.
- **Commits:** use `gitcz` only, one commit per task. Every commit passes `bun run typecheck`, `bun run test:unit`, `bun run test:web` and `bun run openapi:check`. A task that changes the contract records the baseline in that task.
- **Do not touch:** `calculateTotals` and the rule that a promotion and a typed discount never stack.
- **Migrations:** only `bun run db:generate`, additive. Never edit migrations that are already merged.
- **Lock order** becomes order → QR → quote → **promotion** → member → product. Update `AGENTS.md` in Task 3.
- **New error codes:** `PROMOTION_LIMIT_REACHED` (409), `COUPON_NOT_FOUND` (404), `COUPON_NOT_APPLICABLE` (400, `params.reason` ∈ `not_running`, `min_subtotal`, `members_only`, `exhausted`, `not_eligible`). Each code gets an entry in `src/locales/errors.ts` (th and en).
- **Constants:** coupon code `^[A-Z0-9-]{3,20}$`, stored upper-case and trimmed. `buy_quantity` and `free_quantity` are 1–99. `max_uses` and `max_uses_per_member` are ≥ 1 or null.
- **Reporting:** report every change as AGENTS.md "Reporting finished work" asks.
- **Database:** integration tests need PostgreSQL. Never start Podman/Docker without asking the owner.

## Review Focus

1. **QR money after a promotion fills up.** A QR is reserved, then other sales use up the last slot, then the money arrives. The sale must still be recorded with the promotion (Task 3 test `reserved quote sells even when the promotion is now full`).
2. **Two tills at once.** Both take the last slot of a limited promotion with cash at the same time. One bill gets the promotion and the other gets 409 (Task 3 integration test).
3. **A bundle over 9,999 units.** It must not allocate an array per unit, and it must not go slow (Task 1 test `bundle of 9999 units`).
4. **Coupon codes in lower case or with spaces.** A typed code matches the stored code (Task 1 and Task 4 tests).
5. **Voided bills.** A voided bill gives its slot back, both in the totals and per member (Task 3 test).

---

### Task 1: The rules: coupon match and bundle evaluation

**Files:**
- Modify: `server/src/domains/promotion.domain.ts`, `server/src/domains/sale.domain.ts` (`SalePromotion`), `server/src/modules/quotes/applications/usecases/create-quote.usecase.ts` (it builds `PromotionLine`s), `src/features/promotions/lib/promotion-lines.ts`
- Test: `server/src/domains/promotion.domain.test.ts`, `src/features/promotions/lib/promotion-lines.test.ts`

**Interfaces:**
- Produces:
  - `PROMOTION_KINDS = ['fixed', 'percent', 'bundle']`
  - `PromotionRules` gains `couponCode: string | null`, `buyQuantity: number | null`, `freeQuantity: number | null`, `maxUses: number | null` and `maxUsesPerMember: number | null`. The limits are carried but not evaluated here.
  - `PromotionLine` gains `unitPriceSatang: number`, `quantity: number` and `isPack: boolean`.
  - `PromotionContext` gains `couponCode: string | null`.
  - `export const normalizeCouponCode = (code: string): string` trims and upper-cases the code.
  - `export function couponIneligibility(rules: PromotionRules, context: PromotionContext): 'not_running' | 'min_subtotal' | 'members_only' | 'not_eligible' | null` is used in Task 4 for `params.reason`.
  - `SalePromotion` gains optional `couponCode?: string`, `buyQuantity?: number` and `freeQuantity?: number`.

- [ ] **Step 1: Write the failing tests** in `promotion.domain.test.ts`, in a new `describe('coupons and bundles')`:
  - `'a coupon promotion applies only with its code'`: no code gives not eligible, `'summer10 '` matches `SUMMER10`, and `OTHER` gives not eligible.
  - `'an automatic promotion that gives more beats the coupon'`: use `pickBestPromotion`.
  - `'buy 2 get 1 frees the cheapest of each full group'`: lines at 5500, 5000, 5000, 4500 and 4000 (each quantity 1, all in scope) give a discount of 5000.
  - `'pack lines do not count toward a bundle'`.
  - `'an incomplete first group is not eligible'`.
  - `'maxDiscountSatang caps a bundle'`.
  - `'bundle of 9999 units'`: one line with quantity 9999 at 1000 and buy 2 get 1 gives a discount of 3,333,000, and the test asserts it finishes in under 50 ms.
  - Entity validation (for the constructor):
    - a bundle without scope gives `INVALID_PROMOTION`
    - a bundle without buy/free gives `INVALID_PROMOTION`
    - a code that fails the regex gives `INVALID_PROMOTION`
    - `maxUsesPerMember` with `audience = 'everyone'` gives `INVALID_PROMOTION`
    - a bundle with `value = 0` is valid

- [ ] **Step 2: Run them and watch them fail**
  Run: `cd server && bun test src/domains/promotion.domain.test.ts`
  Expected: the new tests FAIL. The old tests pass, after adding the new fields as `null` to the existing fixtures. That is a setup change, not an assertion change.

- [ ] **Step 3: Implement**
  - `evaluatePromotion` checks the coupon right after `isActive`.
  - A bundle computes its discount from the in-scope, non-pack lines without expanding them into units. Walk the lines sorted by unit price, highest first, and track the position modulo `buy + free` in O(lines).
  - The entity constructor validates the new fields.
  - `create-quote.usecase.ts` fills `unitPriceSatang`, `quantity` and `isPack: line.packId !== null`, and passes `couponCode: null` for now (Task 4 wires it in).
  - The web `promotion-lines.ts` fills the same fields from the priced cart lines.
  - Until Task 2 stores the new fields, `promotion.drizzle.repository.ts` maps them as `null` and the web's promotion types mark them optional. This keeps this commit type-checking.

- [ ] **Step 4: Run the tests**
  Run: `cd server && bun test src/domains/promotion.domain.test.ts && cd .. && bun run typecheck && bun run test:unit && bun run test:web`
  Expected: all PASS.

- [ ] **Step 5: Commit**
  `gitcz --non-interactive --type=feat --scope=promotions --subject="evaluate coupon codes and buy-x-get-y bundles"`

### Task 2: Store and edit the new promotion fields

**Files:**
- Modify: `server/src/infrastructure/database/schema/promotions.ts`, `server/src/modules/promotions/adapters/repository/promotion.drizzle.repository.ts`, `server/src/modules/promotions/applications/schemas/promotion-schemas.ts`, `server/src/modules/promotions/adapters/controllers/promotion.controller.ts`
- Create: `drizzle/0036_*.sql` (generated)
- Test: `server/src/modules/promotions/applications/usecases/promotion.usecases.test.ts`, a new `server/src/__tests__/integration/promotion-coupons.integration.test.ts`

**Interfaces:**
- Produces:
  - Columns: `coupon_code`, `buy_quantity`, `free_quantity`, `max_uses`, `max_uses_per_member`.
  - Enum value `bundle`.
  - Unique index `promotions_coupon_code_upper_unique` on `upper(coupon_code)`.
  - Check `promotions_value_positive` is replaced by `kind = 'bundle' OR value > 0`.
  - Check `promotions_bundle_quantities`: `kind <> 'bundle' OR (buy_quantity BETWEEN 1 AND 99 AND free_quantity BETWEEN 1 AND 99)`.
  - A duplicate coupon code gives `DomainConflictError` with code `COUPON_CODE_TAKEN`, translated in the adapter. Add it to `errors.ts`.
  - API: create, update and the responses carry `couponCode`, `buyQuantity`, `freeQuantity`, `maxUses` and `maxUsesPerMember`. All are optional on input.

- [ ] **Step 1: Write the failing tests**
  - Use cases:
    - `'creates a bundle promotion'`
    - `'creates a coupon promotion and stores the code upper-case'`
    - `'refuses a duplicate coupon code'` (the repository mock throws `COUPON_CODE_TAKEN`)
  - Integration:
    - `'a coupon promotion round-trips over HTTP'`
    - `'two promotions cannot share a coupon code in any case'`

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement.**
  Run `bun run db:generate` and read the SQL. It must only add the enum value, the columns, the index and swap the checks. If it holds anything else, stop and report.

- [ ] **Step 4: Migrate the test DB, run the tests and record the contract**
  - Run `bun run db:migrate`, the two test files, `bun run test:unit` and `bun run typecheck`.
  - Then run `cd server && bun --env-file=.env.test test/openapi-snapshot.ts write`. Check that `git diff server/test/` only adds the new optional fields on the promotion routes.

- [ ] **Step 5: Commit**
  `gitcz --non-interactive --type=feat --scope=promotions --subject="store coupon codes, bundle sizes and usage limits"`, with a body that mentions the additive OpenAPI change.

### Task 3: Usage limits

**Files:**
- Create: `server/src/modules/quotes/applications/ports/promotion-usage.port.ts` (`IPromotionUsage`, `promotionUsageToken`), `server/src/modules/promotions/adapters/repository/promotion-usage.drizzle.ts` (`DrizzlePromotionUsage`)
- Modify: `server/src/modules/promotions/promotions.module.ts` (binds the port), `create-quote.usecase.ts`, `server/src/modules/quotes/applications/services/quote-claims.ts`, `server/src/modules/promotions/adapters/controllers/promotion.controller.ts` (adds `usedCount` and `isExhausted` to responses), `AGENTS.md` (lock order and the limit rule)
- Test: `server/src/modules/quotes/applications/usecases/quote.usecases.test.ts`, `server/src/modules/quotes/applications/services/quote-claims.test.ts`, a new `server/src/__tests__/integration/promotion-limits.integration.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface IPromotionUsage {
    /** Completed (not voided) sales plus quotes reserved by a QR, for the promotion; byMember only when memberId is given. */
    countUses(promotionId: number, memberId: number | null): Promise<{ total: number; byMember: number }>
    /** Locks the promotion row (SELECT … FOR UPDATE) until the unit of work ends. */
    lockForUse(promotionId: number): Promise<void>
  }
  ```
- Also produces:
  - A pure helper in `promotion.domain.ts`: `export function hasUsesLeft(rules: PromotionRules, uses: { total: number; byMember: number }, hasMember: boolean): boolean`.
  - An error factory: `promotionLimitReached()` gives a `DomainConflictError` with code `PROMOTION_LIMIT_REACHED`.
- Behavior:
  - `CreateQuoteUseCase` drops promotions with no uses left before calling `pickBestPromotion`, and does not lock anything.
  - In `QuoteClaims.lockForCheckout`, when the quote is `open` and has a promotion with a limit, it calls `lockForUse`, then `countUses`, and throws `PROMOTION_LIMIT_REACHED` if there are no uses left. A `reserved` quote skips this check.
  - `QuoteClaims.reserveForQr` runs the same check before reserving.

- [ ] **Step 1: Write the failing tests**
  - `'a full promotion is left out of a new quote'`
  - `'paying an open quote whose promotion filled up is refused with PROMOTION_LIMIT_REACHED'`
  - `'reserving a QR for a full promotion is refused'`
  - `'reserved quote sells even when the promotion is now full'`
  - `'per-member limit counts only that member'`
  - Integration:
    - `'a voided sale gives its use back'`
    - `'two concurrent cash sales on the last use: one bill, one 409'`. Fire both checkouts with `Promise.all` against the same quote setup (two quotes made before either sale).

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement**
  - The adapter counts uses with two SQL counts:
    - `sales` where `promotion_id = ?` and `status = 'completed'`
    - `price_quotes` where `status = 'reserved'` and `(promotion->>'id')::int = ?`, with the `member_id` filter when given
  - Add an expression index on `price_quotes ((promotion->>'id'))` in a generated migration.
  - Update the lock-order line in AGENTS.md ("Promotions and pinned prices" section) and add one bullet about limits and voided bills.

- [ ] **Step 4: Run the tests**
  Run: `bun run test:unit`, the three test files above and `bun run typecheck`.
  Then record the OpenAPI baseline, which now has `usedCount` and `isExhausted`.

- [ ] **Step 5: Commit**
  `gitcz --non-interactive --type=feat --scope=promotions --subject="enforce promotion usage limits under the promotion lock"`, with a body that explains why a reserved QR counts as a use.

### Task 4: Coupons in the quote API

**Files:**
- Modify: `server/src/modules/quotes/applications/schemas/*` (quote input), `create-quote.usecase.ts`, `server/src/infrastructure/database/schema/price-quotes.ts` (`coupon_code text`), the quote controller and schema, `server/src/domains/price-quote.domain.ts` (carries `couponCode`), `src/locales/errors.ts`
- Test: `quote.usecases.test.ts`, `promotion-coupons.integration.test.ts`

**Interfaces:**
- Consumes: `normalizeCouponCode` and `couponIneligibility` from Task 1, and `IPromotionUsage` from Task 3.
- Produces:
  - `POST /quotes` takes `couponCode?: string`.
  - If no promotion has that code, it answers `COUPON_NOT_FOUND`. A promotion that is inactive also counts as not found.
  - If the coupon's promotion is not eligible, or has no uses left, it answers `COUPON_NOT_APPLICABLE` with `params.reason`.
  - If the coupon is eligible but another promotion gives more, the quote carries the other promotion, and that is not an error.
  - The quote stores `couponCode`, and `SalePromotion.couponCode` is set when the chosen promotion is the coupon.

- [ ] **Step 1: Write the failing tests**
  - `'an unknown coupon is COUPON_NOT_FOUND'`
  - `'a coupon outside its hours is COUPON_NOT_APPLICABLE with reason not_running'`
  - `'a valid coupon gives its promotion and is pinned on the quote'`
  - `'a lower-case coupon matches'`
  - Integration: `'a sale made from a coupon quote stores the coupon code in its promotion snapshot'`

- [ ] **Steps 2–4: watch the tests fail, implement, run them, migrate and record the baseline**, as in Task 2.

- [ ] **Step 5: Commit**
  `gitcz --non-interactive --type=feat --scope=quotes --subject="price a cart with a coupon code"`

### Task 5: The promotion report

**Files:**
- Modify: `server/src/modules/sales/applications/ports/sales-report.repository.ts`, its Drizzle adapter, `server/src/modules/sales/adapters/controllers/sales-report.controller.ts` and the report schemas
- Create: `server/src/modules/sales/applications/usecases/get-promotion-report.usecase.ts` (`GetPromotionReportUseCase`, a query)
- Test: `server/src/modules/sales/applications/usecases/sales-report.usecases.test.ts`, `server/src/__tests__/integration/sales-reports.integration.test.ts`

**Interfaces:**
- Produces:
  - `GET /sales/reports/promotions?from&to&limit&offset` with `auth: { can: 'reports.read' }`.
  - It answers `page()` of `{ promotionId, name, bills, discountSatang, netSalesSatang }`.
  - It leaves out voided bills and uses the same date and time-zone rules as the existing reports. Rows are sorted by `discountSatang` descending, then id ascending.
  - `name` comes from the latest sale snapshot in the range.

- [ ] **Step 1: Write the failing tests**
  - Use case: `'validates the range like the other reports'`
  - Integration: `'sums bills, discount and net sales per promotion and leaves out voided bills'`

- [ ] **Steps 2–4: watch the tests fail, implement, run them and record the baseline.**

- [ ] **Step 5: Commit**
  `gitcz --non-interactive --type=feat --scope=sales --subject="report sales per promotion"`

### Task 6: The web

**Files:**
- Modify: `src/features/promotions/components/PromotionFormDialog.tsx`, `src/features/promotions/lib/promotion-form.ts` (+ test), `src/features/promotions/components/PromotionsPage.tsx`, `src/features/promotions/locales.ts`, `src/features/pos/store/cart.store.ts` (`couponCode: string`, `setCouponCode`, cleared by `clear` and `workOnOrder`), `src/features/pos/components/CartPanel.tsx`, `src/features/pos/components/PosPage.tsx` (passes `couponCode` in `quoteInput`), `src/features/pos/locales.ts`, `src/features/reports/components/ReportsPage.tsx`, `src/features/reports/api.ts`, `src/features/reports/lib/export-workbook.ts` (+ test), `src/features/reports/locales.ts`, `src/locales/errors.ts`
- Test: `promotion-form.test.ts`, `cart.store.test.ts`, `export-workbook.test.ts`

**Interfaces:**
- Consumes: the API fields from Tasks 2–5.
- Produces:
  - Form: when the kind is "ซื้อแถม", the value field is hidden and the buy and free fields are shown. Scope is required for a bundle.
  - Form: a coupon code field and two limit fields. Per member is only enabled when the audience is members.
  - List: shows `usedCount / maxUses`.
  - Cart: a "ใส่คูปอง" button opens a 44 px input. The code goes into the store, and the quote is asked again when it changes. The cart shows the coupon's error from its code (`COUPON_*`).
  - Reports: a "โปรโมชัน" tab with a `DataTable` (with priorities) and a "โปรโมชัน" sheet in the export.

- [ ] **Step 1: Write the failing tests**
  - `promotion-form`:
    - `'a bundle form maps to buyQuantity and freeQuantity and no value'`
    - `'a coupon code is trimmed and upper-cased'`
    - `'per-member limit is dropped when the audience is everyone'`
  - `cart.store`: `'clear and workOnOrder drop the coupon code'`
  - `export-workbook`: `'adds a promotions sheet with one row per promotion'`

- [ ] **Steps 2–4: watch the tests fail, implement, then run** `bun run test:web && bun run typecheck && bun run lint`.

- [ ] **Step 5: Check the screens**
  Run `bun run screenshots` (needs the e2e database) and look at the promotion form, the cart with a coupon, and the report tab at 390, 768 and 1366 px. Add the report tab to the e2e overflow page list if it is a new route.

- [ ] **Step 6: Commit**
  `gitcz --non-interactive --type=feat --scope=web --subject="add coupons, bundles, limits and the promotion report to the web"`

### Finish

- [ ] Run `bun run typecheck && bun run lint && bun run test && bun run openapi:check` and the import-check commands in AGENTS.md. Every new file in `applications/` must import only from its own module, `shared` or `domains`.
- [ ] Push with `git push -u origin ohmattpon/promotion-coupons-bundles`, then report the branch, the latest commit, the OpenAPI diff summary and the per-change notes.
