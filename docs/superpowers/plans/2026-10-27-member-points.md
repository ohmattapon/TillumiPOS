# Member Points — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members earn points from what they pay and redeem them as a discount. Points live in an append-only ledger that survives voids, QR waits and two tills at once.

**Architecture:** The pure point rules live in `server/src/domains/member-points.ts` and are shared with the web as `@pos/api/points`. The `members` module owns the `member_point_movements` table and the cached `members.points_balance`. It implements three consumer-owned ports:
- `ICheckoutPoints` in `sales`, used by `SaleCheckout` and both void use cases
- `IQuotePoints` in `quotes`, used by `CreateQuoteUseCase` and `QuoteClaims`
- the existing member ports, unchanged

Redemption is pinned on the quote, like every other price. The discount sent to `calculateTotals` is the promotion or typed discount plus the points discount. The formula itself does not change.

**Tech Stack:** Bun, TypeScript, Elysia, Drizzle (PostgreSQL 17), tsyringe, zod, React, TanStack Query, zustand, bun:test.

**Spec:** `docs/superpowers/specs/2026-10-27-member-points-design.md`. The owner approved it on 2026-10-27, including every item under "ข้อที่ผมตัดสินใจเอง".

## Global Constraints

- **Branch:** `ohmattpon/member-points`, which already holds the spec. Before Task 1, fast-forward it to `origin/main`. If `ohmattpon/sales-page-small-bugs` is not in `main` yet, stop and ask the owner: both branches change `SaleCheckout` and the sale use cases.
- **Commits:** use `gitcz` only, one commit per task. Every commit passes `bun run typecheck`, `bun run test:unit`, `bun run test:web` and `bun run openapi:check`. A task that changes the contract records the OpenAPI baseline in that task, after reading the diff.
- **Never touch:** the `calculateTotals` formula, and the promotion-versus-typed-discount rule.
- **Migrations:** generated with `bun run db:generate`, additive only. Every new column has a default or is nullable. `points_enabled` defaults to `false`.
- **Movement table:** `member_point_movements` is insert-only. The port and the adapter have no update or delete. `points_balance` changes only in the same unit of work as a movement insert, and has a check `>= 0`.
- **Lock order stays:** order → QR → quote → (promotion) → member → product. Points are read and written under the member lock.
- **New error codes:** `POINTS_NOT_ENOUGH` (400 at quote time, 409 at checkout), `POINTS_REDEEM_INVALID` (400) and `POINTS_DISABLED` (400). Add each to `src/locales/errors.ts`.
- **New permission:** `members.points_adjust`. Add it to `PERMISSION_GROUPS` (`catalog` group) and to the web role-editor translations.
- **Shared alias:** `@pos/api/points` → `server/src/domains/member-points.ts`. Add it in all three places: `vite.config.ts`, `tsconfig.json` and `tsconfig.app.json`.
- **Reporting:** report every change as AGENTS.md "Reporting finished work" asks. Never start Podman or Docker without asking the owner.

## Review Focus

1. **QR money arrives after the points were spent elsewhere.** The points were taken when the QR was reserved, so the sale still records. This is Task 4 `'a QR-reserved redemption sells without checking the balance again'`.
2. **Voiding a bill whose earned points were already spent.** The balance becomes 0, not negative, and the shortfall is in the movement reason. This is Task 5.
3. **A cancelled or dismissed QR returns the reserved points exactly once.** This is Task 4.
4. **Shop settings change between the quote and the payment.** The quote's `points_rule` wins. This is Task 3.
5. **Redeeming more than the bill after the promotion.** It is capped by `maxRedeemable`, and a request over the cap is refused. This is Tasks 1 and 3.

---

### Task 0: Remove the sales → members port import (fix-list item)

`SaleCheckout` imports `members/applications/ports/member.repository`. That is a row in AGENTS.md "Code that still breaks these rules", and this plan touches the file, so it is fixed first, in its own commit.

**Files:**
- Create: `server/src/modules/sales/applications/ports/checkout-members.port.ts` (`ICheckoutMembers`, `checkoutMembersToken`, with one method `findByIdForUpdate(id: number): Promise<MemberEntity | null>`)
- Create: `server/src/modules/members/adapters/repository/checkout-members.adapter.ts`, which delegates to the member repository
- Modify: `server/src/modules/members/members.module.ts` (binds the port), `sale-checkout.ts`, `src/__tests__/mocks.ts`, and the test files that build `SaleCheckout`

- [ ] **Step 1:** Make the change. No behavior changes, so the existing tests are the safety net.
- [ ] **Step 2:** Run `bun run test:unit && bun run typecheck` and the import-check commands. The line for `sale-checkout.ts` must be gone from the check output.
- [ ] **Step 3:** Commit: `gitcz --non-interactive --type=refactor --scope=sales --subject="read members at checkout through a port the sales module owns"`

### Task 1: Point rules

**Files:**
- Create: `server/src/domains/member-points.ts`, `server/src/domains/member-points.test.ts`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json` (alias)

**Interfaces:**
- Produces:
  ```ts
  export interface PointsRule { earnSatang: number; redeemSatang: number; minRedeem: number }
  export const POINT_MOVEMENT_KINDS = ['earn', 'redeem', 'void_earn', 'void_redeem', 'adjust'] as const
  export function assertValidPointsRule(rule: PointsRule): void          // earnSatang >= 100, redeemSatang >= 1, minRedeem >= 1, integers; INVALID_SETTINGS
  export function pointsEarned(totalSatang: number, rule: PointsRule): number   // floor(total / earnSatang), never negative
  export function maxRedeemable(payableSatang: number, balance: number, rule: PointsRule): number // min(balance, floor(payable / redeemSatang))
  export function pointsDiscountSatang(points: number, rule: PointsRule): number // points * redeemSatang
  export function assertRedeemable(points: number, payableSatang: number, balance: number, rule: PointsRule): void
  // 0 is always allowed; < minRedeem or > maxRedeemable → POINTS_REDEEM_INVALID with params { min, max }; > balance → POINTS_NOT_ENOUGH with params { balance }
  export function voidEarnPoints(earned: number, balance: number): { points: number; shortfall: number } // points = -min(earned, balance)
  ```
  Here `payableSatang` is the subtotal minus the promotion or typed discount.

- [ ] **Step 1: Write the failing tests**, one per function. Include:
  - `pointsEarned(9999, 25 baht)` is 3
  - `pointsEarned(10000, …)` is 4
  - redeem exactly the payable amount
  - redeem 1 under the minimum
  - redeem over the balance
  - `voidEarnPoints(40, 15)` is `{ points: -15, shortfall: 25 }`
- [ ] **Step 2:** Run `cd server && bun test src/domains/member-points.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement the functions and add the alias.
- [ ] **Step 4:** Run the tests and `bun run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `gitcz --non-interactive --type=feat --scope=members --subject="add the member point rules"`

### Task 2: Storage, settings and the ledger port

**Files:**
- Modify: `server/src/infrastructure/database/schema/members.ts`, `shop-settings.ts`, `sales.ts` and `price-quotes.ts`; the shop-settings domain, schema, repository and controller; `server/src/domains/sale.domain.ts` and `price-quote.domain.ts` (new snapshot fields)
- Create: `server/src/infrastructure/database/schema/member-point-movements.ts`, `drizzle/0036_*.sql` (generated), and `server/src/modules/members/adapters/repository/member-points.drizzle.repository.ts` (`DrizzleMemberPointsLedger`, implements both ports below)
- Create ports: `server/src/modules/sales/applications/ports/checkout-points.port.ts` and `server/src/modules/quotes/applications/ports/quote-points.port.ts`
- Test: `server/src/modules/settings/applications/usecases/settings.usecases.test.ts`, a new `server/src/__tests__/integration/member-points.integration.test.ts`

**Interfaces:**
- **Tables:**
  - `member_point_movements` has: `id`, `member_id` (FK), `kind` enum, `points` (check `<> 0`), `sale_id` (nullable FK), `quote_id` (nullable FK), `reason` (nullable), `created_by_id` and `created_at`.
  - Indexes: `(member_id, created_at)`.
  - Unique `(sale_id, kind)` where `sale_id IS NOT NULL`.
  - Unique `(quote_id, kind)` where `quote_id IS NOT NULL`.
  - Check: `kind = 'adjust' OR sale_id IS NOT NULL OR quote_id IS NOT NULL`.
- **Columns:**
  - `members.points_balance` int not null, default 0, check `>= 0`
  - `shop_settings`: `points_enabled`, `points_earn_satang`, `points_redeem_satang` and `points_min_redeem`
  - `sales`: `points_earned`, `points_redeemed`, `points_discount_satang`, `points_rule` (jsonb) and `points_balance_after` (nullable int)
  - `price_quotes`: `points_redeemed`, `points_discount_satang` and `points_rule`
- **Ports.** Both take the member lock as already held by the caller.
  ```ts
  // sales
  export interface ICheckoutPoints {
    balanceOf(memberId: number): Promise<number>
    record(entry: { memberId: number; kind: PointMovementKind; points: number; saleId: number | null; quoteId: number | null; reason: string | null; actorId: number }): Promise<{ balanceAfter: number }>
    findQuoteRedemption(quoteId: number): Promise<number | null>   // the redeem points held by a QR-reserved quote
  }
  // quotes: same record/balanceOf plus
  export interface IQuotePoints { balanceOf(memberId: number): Promise<number>; lockMember(memberId: number): Promise<void>; record(...same...): Promise<{ balanceAfter: number }> }
  ```
  `record` inserts one row and moves `points_balance` by the same amount, in the current executor. A unique violation becomes `DomainConflictError('POINTS_ALREADY_RECORDED')`.
- **Settings API:** carries the four new fields. `update-shop-settings` validates them with `assertValidPointsRule`.

- [ ] **Step 1: Write the failing tests**
  - Settings use case:
    - `'stores a valid points rule'`
    - `'refuses earnSatang under 100'`
  - Integration:
    - `'a movement moves the balance in the same transaction'`
    - `'the balance never goes negative'` (the database check)
    - `'a second earn for the same sale is POINTS_ALREADY_RECORDED'`
- [ ] **Step 2:** Watch the tests fail.
- [ ] **Step 3:** Implement. Run `bun run db:generate` and read the SQL: it must only add things. Run `bun run db:migrate`.
- [ ] **Step 4:** Run the tests, `bun run test:unit` and `bun run typecheck`. Record the OpenAPI baseline: only the settings fields are added.
- [ ] **Step 5:** Commit: `gitcz --non-interactive --type=feat --scope=members --subject="store member points in an append-only ledger"`

### Task 3: Earn and redeem through the quote and the checkout

**Files:**
- Modify: the quote input schema and controller (`redeemPoints?: number`), `create-quote.usecase.ts`, `server/src/modules/quotes/applications/services/quote-claims.ts`, `server/src/modules/sales/applications/services/sale-checkout.ts`, the sale presenters (v1 and v2), and `src/locales/errors.ts`
- Test: `quote.usecases.test.ts`, `quote-claims.test.ts`, `sales.usecases.test.ts`, `member-points.integration.test.ts`

**Interfaces:**
- **Quote:** with `redeemPoints > 0`, the cart needs a member and `points_enabled`. Otherwise the answer is `POINTS_DISABLED` or `MEMBER_REQUIRED`; reuse that code if it exists, else add it.
  - The quote reads the balance without a lock and runs `assertRedeemable` against `payable = subtotal − promotion discount`.
  - It pins `pointsRedeemed`, `pointsDiscountSatang` and `pointsRule`.
  - Quote `discountSatang` becomes promotion discount + points discount, and `totalSatang` follows from `calculateTotals`.
- **Checkout with a quote:**
  - After the member lock, if the quote is `open` and `pointsRedeemed > 0`, check `balanceOf >= pointsRedeemed`. Otherwise throw `POINTS_NOT_ENOUGH` (409). Then record `redeem` (−points, `saleId`).
  - If the quote is `reserved`, skip the check and the redeem row, because Task 4 recorded it at reservation.
  - Then, if `points_enabled` and the sale has a member, record `earn` with `pointsEarned(total, quote.pointsRule ?? current rule)` when it is above 0.
  - Store `points_*` and `points_balance_after` on the sale.
- **Checkout without a quote:** earns points, but cannot redeem. A redemption request without a quote cannot even be expressed, so no new check is needed.
- **Responses:** the sale (v1 and v2) adds `pointsEarned`, `pointsRedeemed`, `pointsDiscountSatang` and `pointsBalanceAfter`. The quote adds `pointsRedeemed` and `pointsDiscountSatang`.

- [ ] **Step 1: Write the failing tests**
  - `'a quote pins redeemed points and lowers the total'`
  - `'redeeming over the payable amount is POINTS_REDEEM_INVALID'`
  - `'redeeming with points switched off is POINTS_DISABLED'`
  - `'paying an open quote after the points were spent is POINTS_NOT_ENOUGH'`
  - `'a sale with a member earns floor(total / earnSatang)'`
  - `'the quote rule wins over a changed shop rule'`
  - `'points and a promotion stack'`
  - Integration: `'two concurrent sales redeeming the same points: one succeeds'`
- [ ] **Steps 2–4:** Watch the tests fail, implement, run them, then record the baseline.
- [ ] **Step 5:** Commit: `gitcz --non-interactive --type=feat --scope=sales --subject="earn and redeem member points at checkout"`

### Task 4: Hold points while a QR waits

**Files:**
- Modify: `quote-claims.ts` (`reserveForQr`, `cancelByReference`, `releaseByReference`) and any QR dismiss path that releases a quote
- Test: `quote-claims.test.ts`, `member-points.integration.test.ts`

**Interfaces:**
- **`reserveForQr`:** if the quote has `pointsRedeemed > 0`, lock the member (after the quote, before nothing else), check the balance, and record `redeem` with `quoteId`. If the balance is short, throw `POINTS_NOT_ENOUGH` (409).
- **Cancelled, dismissed or released quote:** a quote that held points records `void_redeem` (+points, `quoteId`) once. The `(quote_id, kind)` uniqueness makes a second call a no-op: catch `POINTS_ALREADY_RECORDED` and treat it as already returned.

- [ ] **Step 1: Write the failing tests**
  - `'reserving a QR takes the points'`
  - `'cancelling the QR gives them back once'`
  - `'a QR-reserved redemption sells without checking the balance again'`
  - `'reserving with too few points is refused'`
- [ ] **Steps 2–4:** Watch the tests fail, implement, run them.
- [ ] **Step 5:** Commit: `gitcz --non-interactive --type=feat --scope=quotes --subject="hold redeemed points while a QR waits"`

### Task 5: Void and manual adjustment

**Files:**
- Modify: `server/src/modules/sales/applications/usecases/void-sale.usecase.ts` and `void-sale-v2.usecase.ts`, `server/src/domains/permission.vo.ts`, and the members controller
- Create: `server/src/modules/members/applications/usecases/adjust-member-points.usecase.ts` (command), `list-member-points.usecase.ts` (query), and a members port method `listMovements(memberId, page): Page<PointMovement>`
- Test: `sales.usecases.test.ts`, `member.usecases.test.ts`, `member-points.integration.test.ts`

**Interfaces:**
- **Void:**
  - Records `void_earn` using `voidEarnPoints(sale.pointsEarned, balance)`. The reason holds the shortfall when it is above 0.
  - Records `void_redeem` (+`pointsRedeemed`) with `saleId`. This holds whether the redemption came from the checkout or from a QR-reserved quote.
  - Both rows go in the void's unit of work, together with an audit entry `member.points_voided`.
- **Adjust:** `POST /members/{id}/points/adjustments` `{ points: int ≠ 0, |points| ≤ 1,000,000, reason: 1–200 chars }`.
  - Route guard `auth: { can: 'members.points_adjust' }`, plus `requirePermission` in the use case.
  - A result below 0 is refused with `POINTS_NOT_ENOUGH`.
  - Writes audit `member.points_adjusted`.
- **History:** `GET /members/{id}/points?limit&offset` answers `{ items, total }`, newest first. Members get `pointsBalance` in their responses.

- [ ] **Step 1: Write the failing tests**
  - `'voiding returns redeemed points and removes earned ones'`
  - `'voiding when earned points were spent stops at zero and records the shortfall'`
  - `'adjusting needs members.points_adjust'`
  - `'an adjustment below zero is refused'`
  - Integration: `'the balance equals the sum of movements after sale, void and adjust'`
- [ ] **Steps 2–4:** Watch the tests fail, implement, run them, then record the baseline.
- [ ] **Step 5:** Commit: `gitcz --non-interactive --type=feat --scope=members --subject="void, adjust and list member points"`

### Task 6: The web

**Files:**
- Modify:
  - Settings: `src/features/settings/components/SettingsPage.tsx` and `locales.ts`, with a "แต้มสมาชิก" section that shows an example computed with `pointsEarned`
  - Cart: `src/features/pos/store/cart.store.ts` (`redeemPoints: number`, cleared by `clear`, `workOnOrder` and `setMember`), `src/features/pos/components/CartMember.tsx` (balance and a "แลกแต้ม" input with a "สูงสุด" button using `maxRedeemable`), `src/features/pos/components/PosPage.tsx` (`quoteInput` carries `redeemPoints`), and `src/features/pos/hooks/use-cart.ts`
  - Receipt: `src/features/sales/components/Receipt.tsx` shows the points discount, points earned and the balance after
  - Members: `src/features/members/components/MembersPage.tsx` gets a history tab and an adjust dialog shown only with the permission
  - Roles: the role-editor translation for `members.points_adjust`
  - `src/locales/errors.ts`
- Test: `cart.store.test.ts`, a new `src/features/pos/lib/points.test.ts` (if a cart helper is needed, keep it a pure function there), and the settings form test if one exists

**Interfaces:**
- Consumes: `@pos/api/points` and the API fields from Tasks 2–5.
- The cart preview shows the points discount, but the total charged is always the quote's.

- [ ] **Step 1:** Write the failing store and helper tests: `'changing member clears redeemPoints'` and `'max button uses maxRedeemable of the payable amount'`.
- [ ] **Steps 2–4:** Watch the tests fail, implement, then run `bun run test:web && bun run typecheck && bun run lint`.
- [ ] **Step 5:** Run `bun run screenshots` (needs the e2e database) and look at settings, the cart with a member, the members page and the receipt at 390, 768 and 1366 px.
- [ ] **Step 6:** Commit: `gitcz --non-interactive --type=feat --scope=web --subject="earn, redeem and review member points in the web"`

### Finish

- [ ] Update AGENTS.md: points stack with promotions and typed discounts, but promotion and typed discount still do not stack; the movement table is append-only; QR-reserved quotes hold their points. Commit as `docs`.
- [ ] Run `bun run typecheck && bun run lint && bun run test && bun run openapi:check` and the import-check commands.
- [ ] Push with `git push -u origin ohmattpon/member-points`, then report the branch, the latest commit, the OpenAPI diff summary and the per-change notes.
