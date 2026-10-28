# Sales Page Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four bugs on the sales page: a pack sold in a shift is charged as one piece, a sale retried after a lost answer in legacy mode makes a second bill, a typed discount disappears when the cart is saved as an open order, and a network failure throws the till out of the order it is working on.

**Architecture:** Each bug is fixed where its rule already lives, with the smallest change that fixes it.
- **Pack in shift mode:** `CompleteSaleV2UseCase` passes `packId` on to `SaleCheckout`.
- **Bill made twice in legacy mode:** the v1 `POST /api/v1/sales` takes an optional `Idempotency-Key` header and runs through `CommandIdempotency`, as v2 already does.
- **Lost discount:** `SaveOrderDialog` warns that a typed discount is not kept with the order.
- **Thrown out of the order:** the till leaves an order only when the server says it is closed or not found (`orderIsGone` in `features/pos/lib`).

**Tech Stack:** Bun, TypeScript, Elysia, tsyringe, zod, React, TanStack Query, zustand, bun:test.

**Spec:** The sales-page review on 2026-10-27. Bugs 2 to 4 were reported to the owner as small. Bug 1 was found while planning (a probe confirmed `CompleteSaleV2UseCase` sends `[{"productId":1,"quantity":1}]` to the checkout for an input with `packId: 7`). The owner asked for a fix plan.

## Global Constraints

- Branch: `ohmattpon/sales-page-small-bugs`, created from an up-to-date `main` before any edit. Commit with `gitcz` only, one commit per task, and each commit leaves the branch working.
- Never change `calculateTotals`, the money rules in `SaleCheckout`, or quotes.
- **Contract:** the only contract change is Task 2's optional header on v1 `POST /sales`. It is additive, and the owner accepts it by approving this plan. Re-record the baseline only in Task 2 (`cd server && bun --env-file=.env.test test/openapi-snapshot.ts write`), and review the diff first: the only change allowed is that header.
- New user-facing text goes through `t()`, with both `th` and `en` in `features/pos/locales.ts`.
- Report finished work as described in AGENTS.md, "Reporting finished work".
- `bun run test` needs PostgreSQL. Do not start Podman or Docker without asking the owner.

## Review Focus

1. **A pack sold in a shift with a pinned price (quote).** Today this request fails with `QUOTE_MISMATCH`, because the quote holds the pack and the request lines do not. It must sell at the quoted pack price. Covered by the integration test in Task 1.
2. **The same idempotency key sent twice to v1 `POST /sales`.** It must return the first sale with the same receipt number, deduct stock once, and write one audit entry. Covered in Task 2.
3. **v1 `POST /sales` with no header.** It must behave exactly as before. Older clients and the scripts send no key. Covered in Task 2.
4. **A 401 (signed out) or 500 while the till is working on an order.** The till must keep the order. Only a 404 or a closed order makes it leave. Covered in Task 4.
5. **A discount typed as spaces only.** It is not a discount, so no warning is shown. Covered in Task 3.

---

### Task 1: A pack sold in a shift reaches the checkout

**Files:**
- Modify: `server/src/modules/sales/applications/usecases/complete-sale-v2.usecase.ts`
- Test: `server/src/modules/sales/applications/usecases/sales.usecases.test.ts`, `server/src/__tests__/integration/product-packs.integration.test.ts`

**Interfaces:**
- Produces: no signature change. The `lines` that `CompleteSaleV2UseCase` passes to `ISaleCheckout.checkout` now include `packId` (number or undefined), as in `CompleteSaleUseCase`.

- [ ] **Step 1: Write the failing unit test**

  Add `describe('CompleteSaleV2UseCase')` with `test('passes the pack of each line to the checkout')`. Use `mockSaleCheckout()` and `mockUnitOfWork()` from `__tests__/mocks.ts`, and a `CommandIdempotency` built over an in-memory `ICommandReceipts` as in `modules/audit/applications/usecases/sensitive-actions.test.ts:180`. Have the checkout return a sale from `factories.ts`. Call `execute` with `items: [{ productId: 1, quantity: 2, packId: 7 }]`, `shiftId: 3` and a UUID key, and assert:
  ```ts
  expect(checkout.checkout.mock.calls[0]![0].lines).toEqual([{ productId: 1, quantity: 2, optionIds: undefined, packId: 7 }])
  ```

- [ ] **Step 2: Write the failing integration test**

  In `product-packs.integration.test.ts`, add `test('a pack sold in a shift is charged and counted as the pack')`. Set `Bun.env.CHECKOUT_MODE = 'shifts'` and restore it afterwards, as in `shift-replay.integration.test.ts:4-22`. Open a shift. Create a product at 2500 with stock 24 and a pack of 6 at 13 000, the way this file creates packs. Call `apiV2.sales.post({ items: [{ productId, quantity: 1, packId }], payments: [cash 13_000], shiftId })` with a new key. Expect `totalSatang` to be 13 000, the one item to have `packSize` 6, and the stock to be 18. Repeat the sale with a quote made by `quotes.post` for the same line and expect it to succeed at the same total.

- [ ] **Step 3: Run both tests and watch them fail**

  Run: `cd server && bun test src/modules/sales/applications/usecases/sales.usecases.test.ts`
  Expected: the new test FAILS because `packId` is missing.
  The integration test is expected to fail with a total of 2500 and stock 23 (no quote), or with `QUOTE_MISMATCH` (with a quote).

- [ ] **Step 4: Implement**

  In `complete-sale-v2.usecase.ts`, map `({ productId, quantity, options, packId }) => ({ productId, quantity, optionIds: options, packId })`, the same as `complete-sale.usecase.ts`.

- [ ] **Step 5: Run the tests and see them pass**

  Run the two files from Step 3 and `bun run test:unit`. Expected: all PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add server/src/modules/sales/applications/usecases/complete-sale-v2.usecase.ts server/src/modules/sales/applications/usecases/sales.usecases.test.ts server/src/__tests__/integration/product-packs.integration.test.ts
  gitcz --non-interactive --type=fix --scope=sales --subject="pass the pack of a line to the checkout in shift mode" --body="<why: the v2 use case dropped packId, so in a shift a carton was sold as one piece at the piece price, and a sale with a pinned pack price failed with QUOTE_MISMATCH>"
  ```

### Task 2: A retried legacy sale does not make a second bill

**Files:**
- Modify: `server/src/libs/http-schemas.ts`, `server/src/modules/sales/adapters/controllers/sale.controller.ts`, `server/src/modules/sales/applications/usecases/complete-sale.usecase.ts`, `src/features/pos/api.ts`, `src/features/pos/components/PosPage.tsx`, `server/test/openapi-baseline.json` (the v1 baseline, re-recorded; `openapi-v2-baseline.json` must not change, and `openapi-v1-current.json` is never committed)
- Test: `server/src/modules/sales/applications/usecases/sales.usecases.test.ts`, `server/src/__tests__/integration/sales.integration.test.ts`

**Interfaces:**
- Produces:
  - `export const optionalIdempotencyHeaders = t.Object({ 'idempotency-key': t.Optional(t.String({ format: 'uuid' })) })` in `libs/http-schemas.ts`.
  - `CompleteSaleUseCase` constructor gains a third parameter `@inject(TOKENS.Idempotency) idempotency: CommandIdempotency`. `execute(input: unknown, cashier, branch, idempotencyKey?: string)`.
  - Scope `{ actorId: cashier.id, branchId: branch.id, action: 'sales.checkout', key }`, the same action as v2. A key reused across versions fails on the request hash (`IDEMPOTENCY_KEY_REUSED`), never replays the wrong sale.

- [ ] **Step 1: Write the failing unit tests** (in `describe('CompleteSaleUseCase')`)

  Pass the new constructor argument in the two existing `new CompleteSaleUseCase(...)` calls (lines 71 and 341). This is a setup change only, not an assertion change.
  - `test('a repeated idempotency key returns the first sale and checks out once')`: execute twice with the same key and the same input. Expect `checkout` to be called once and the two results to have the same `receiptNo`.
  - `test('without a key every call checks out')`: execute twice with no key. Expect `checkout` to be called twice.
  - `test('a key reused with another cart is refused')`: same key, different quantity. Expect `IDEMPOTENCY_KEY_REUSED`.

- [ ] **Step 2: Write the failing integration test**

  In `sales.integration.test.ts`, add `test('the same Idempotency-Key on v1 makes one sale')`. Post the same body twice with `{ headers: { 'idempotency-key': <uuid> } }`. Expect both answers to have the same `id` and `receiptNo`, stock to drop once, and the sales list `total` to rise by 1.

- [ ] **Step 3: Run and watch the tests fail**

  Run: `cd server && bun test src/modules/sales/applications/usecases/sales.usecases.test.ts`
  Expected: the new tests FAIL.

- [ ] **Step 4: Implement the server side**

  - In `execute`, after parsing the input: with no key, run exactly today's code. With a key, wrap the same checkout call in `this.idempotency.execute(scope, dto, command, (sale) => sale.toSnapshot(), async (snapshot) => restoreSaleSnapshot(snapshot))`, inside the same `unitOfWork.run`, as in `complete-sale-v2.usecase.ts`.
  - In the controller, add `headers: optionalIdempotencyHeaders` to the v1 `.post('/')` and pass `headers['idempotency-key']`.

- [ ] **Step 5: Implement the web side**

  - In `useCheckout` (`src/features/pos/api.ts`), the v1 branch passes `withIdempotencyKey(idempotencyKey)` when `idempotencyKey` is defined, and no header otherwise.
  - In `PosPage.tsx` `pay()`, send `idempotencyKey: paymentCommandKey.current` in both modes, so the `needsShift` condition goes away for the key only. The key already lives until the sale succeeds or the payment is cancelled.

- [ ] **Step 6: Re-record and review the contract**

  Run `cd server && bun --env-file=.env.test test/openapi-snapshot.ts write`, then check `git diff server/test/`. The only change allowed is an optional `idempotency-key` header parameter on v1 `POST /sales`. Then run `bun run openapi:check` and expect a pass.

- [ ] **Step 7: Run the tests**

  Run `bun run test:unit`, the integration file from Step 2 and `bun run typecheck`. Expected: all PASS.

- [ ] **Step 8: Commit**

  `git add` the files listed above, then:
  `gitcz --non-interactive --type=fix --scope=sales --subject="make a retried legacy sale return the first bill" --body="<why: v1 checkout had no idempotency, so a lost answer and a retry recorded two bills in legacy mode. The header is optional, so clients that send none behave as before. OpenAPI baseline re-recorded for this additive header, as approved in the plan.>"`

### Task 3: Warn that a typed discount is not kept with an open order

**Files:**
- Modify: `src/features/pos/components/SaveOrderDialog.tsx`, `src/features/pos/locales.ts`

**Interfaces:**
- Produces: locale key `saveOrder.discountNotKept`. TH: `ส่วนลดที่พิมพ์ไว้จะไม่ถูกเก็บกับออเดอร์ ให้ใส่อีกครั้งตอนชำระ`. EN: `The discount you typed is not kept with the order. Enter it again when paying.`

An order has no discount field, and adding one would change the order contract. So the fix only tells the cashier before the discount is lost, instead of storing it.

- [ ] **Step 1: Implement**

  Read `discount` from `useCartStore`. When `discount.trim() !== ''`, render `<p className="text-sm text-muted-foreground">{t('saveOrder.discountNotKept')}</p>` above the error line. Add both locale strings.

- [ ] **Step 2: Verify**

  Run `bun run typecheck && bun run lint && bun run test:web`. All must pass; the key check fails if `en` misses the key. There is no unit test, because the condition is a one-line display rule with no money logic.

- [ ] **Step 3: Commit**

  `gitcz --non-interactive --type=fix --scope=pos --subject="warn that a typed discount is not kept with an open order"`

### Task 4: Stay on the order through a network failure

**Files:**
- Create: `src/features/pos/lib/order-gone.ts`, `src/features/pos/lib/order-gone.test.ts`
- Modify: `src/features/pos/hooks/use-cart.ts:51`

**Interfaces:**
- Produces: `export function orderIsGone(order: { error: unknown; data?: { status: string } }): boolean`. It is true when `data.status !== 'open'`, or when `error` is an `ApiError` (from `@/lib/api`) with `status === 404`. It is false for any other error, including 401, 409, 500 and network errors that are not an `ApiError`.

- [ ] **Step 1: Write the failing tests** (`order-gone.test.ts`)

  - `'an open order is not gone'`: `{ error: null, data: { status: 'open' } }` gives false.
  - `'a paid, cancelled or merged order is gone'`: each status gives true.
  - `'a 404 means the order no longer exists'`: `new ApiError(404, 'ORDER_NOT_FOUND', 'x')` gives true.
  - `'a server error, sign-out or network failure keeps the order'`: `ApiError(500, …)`, `ApiError(401, …)` and `new TypeError('Failed to fetch')` each give false.
  - `'stale data with a failed refetch follows the data'`: `{ error: ApiError(500), data: { status: 'open' } }` gives false.

- [ ] **Step 2: Run and watch them fail**

  Run: `bun test src/features/pos/lib/order-gone.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `orderIsGone`, then use it**

  In `use-cart.ts`, `gone` becomes `orderId !== null && orderIsGone({ error: order.error, data: order.data })`. The `useEffect` that calls `clear()` is unchanged.

- [ ] **Step 4: Verify and commit**

  Run `bun test src/features/pos/lib/order-gone.test.ts && bun run typecheck && bun run test:web`. Expected: all PASS.
  `gitcz --non-interactive --type=fix --scope=pos --subject="keep working on an order through a network failure" --body="<why: any failed fetch of the order cleared the till, so a short outage threw the cashier out of the order. Only a 404 or a closed order does now.>"`

### Finish

- [ ] Run `bun run typecheck && bun run lint && bun run test && bun run openapi:check` and the import-check commands in AGENTS.md. Run `bun run screenshots` and look at the save-order dialog with a discount typed, at 390, 768 and 1366px.
- [ ] Push with `git push -u origin ohmattpon/sales-page-small-bugs`, then report the branch, the latest commit and the per-change explanations.
