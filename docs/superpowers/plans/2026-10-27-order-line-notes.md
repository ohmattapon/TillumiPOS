# Order Line Notes Keep Their Own Line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A note belongs to its own units: adding a product never copies another line's note onto it, and merging bills never drops a note.

**Architecture:** An order line's identity becomes product + options + note (today it is product + options). Because `SaleCheckout` merges lines of the same product and options and charges the first line's price, the order keeps one rule: every line of the same product and options in one order has the same unit price, the price of the earliest such line. Both rules live in `mergeLines` in `server/src/domains/order.domain.ts`. The database unique constraint on order lines gains the note column (`NULLS NOT DISTINCT`).

**Tech Stack:** Bun, TypeScript, Drizzle (PostgreSQL 17), bun:test.

**Spec:** The bug found in review on 2026-10-27, as agreed with the project owner:
- "Latte ×1, note หวานน้อย" plus one plain latte must become two lines: `×1 หวานน้อย` and `×1` (no note). Today it becomes `×2 หวานน้อย`.
- Merging a bill with "latte, หวานน้อย" into one with "latte, ไม่ใส่น้ำแข็ง" must keep both notes on two lines. Today it gives `×2 หวานน้อย`.

## Global Constraints

- Branch: `ohmattpon/order-line-notes`, created from an up-to-date `main` before any edit. Commit with `gitcz` only, one concern per commit.
- Never change `calculateTotals`, `SaleCheckout`, quotes or the HTTP contract. `bun run openapi:check` must pass with no new baseline.
- Error codes stay as they are. No new code is added.
- Migration: generated with `bun run db:generate`, additive and safe on a live database. Do not edit migrations `0000`–`0034`.
- `bun run typecheck` and `bun run test` must pass before saying the work is done. `bun run test` needs PostgreSQL. Do not start Podman or Docker without asking the owner (use the Neon e2e setup if the owner prefers).

## Review Focus

1. **Different prices for the same item.** A latte was added at 50 baht, the shop changed the price to 55, then a latte with another note is added. Both lines must charge 50, otherwise paying merges them at the first price and the bill disagrees with the quote (`QUOTE_MISMATCH`). This is tested in Task 1 (domain) and Task 2 (over HTTP).
2. **A note edited to match another line.** If line B's note is edited to equal line A's note, the two lines become one (summed quantity, A's line id). The save must not hit the unique constraint. This is tested in Task 1 and Task 2.
3. **v1 routes by `productId`.** `PATCH/DELETE /orders/{id}/items/{productId}` with several plain lines must change only the first plain line (lowest line id), never all of them. This is tested in Task 1.
4. **Paying an order with two lines of the same product.** The order must produce one sale line with the summed quantity at the shared price, and stock must be deducted once for the total. This is tested in Task 2.
5. **A split of a line with a note.** The new order gets the note, and the price stays as quoted. This is covered by the existing split tests plus one assertion in Task 1.

---

### Task 1: The domain: notes in line identity, one price per item

**Files:**
- Modify: `server/src/domains/order.domain.ts` (`identity`, `mergeLines`, `plainLineOf`, `setQuantity`, `removeItem`, `setLineNote`, `quantitiesByLine`)
- Test: `server/src/domains/order.domain.test.ts`

**Interfaces:**
- Produces: `OrderEntity` keeps every public signature. Behavior changes:
  - Line identity is `lineIdentity(productId, options)` + `\u0000` + `(note ?? '')`. `lineIdentity` and `identityOf` stay exported unchanged, because they mean "the same item", which the price rule still uses.
  - `quantitiesByLine()` sums quantities per `lineIdentity` (product + options).

- [ ] **Step 1: Change the one existing assertion the owner approved to change**

  In `describe('หมายเหตุต่อบรรทัด')`, the test `'รวมออเดอร์ใช้หมายเหตุของปลายทางก่อน ถ้าว่างจึงใช้ของต้นทาง'` asserts the old note-dropping behavior. Rename it to `'รวมออเดอร์เก็บหมายเหตุของทั้งสองฝั่งแยกบรรทัด'` and expect, for product 10, two lines: `{ note: 'หวานน้อย', quantity: 1 }` and `{ note: 'เผ็ด', quantity: 1 }`. Product 11 stays as before. This is the only existing assertion that changes. The owner approved it by approving this plan. Mention it in the commit body.

- [ ] **Step 2: Write the failing tests** (new `describe('บรรทัดที่หมายเหตุต่างกัน')`, using `makeOrder`, `noteLine` and `codeOf` already in the file)

  ```ts
  test('เพิ่มสินค้าที่มีบรรทัดมีหมายเหตุอยู่แล้ว ได้บรรทัดใหม่ที่ไม่มีหมายเหตุ', () => {
    const order = makeOrder({ items: [noteLine({ lineId: 1, note: 'หวานน้อย' })] })
    const added = order.addItem({ productId: 10, productName: 'ชาเย็น', sku: 'TEA', unitPriceSatang: 3500 }, 1)
    expect(added.items.map((i) => [i.lineId, i.quantity, i.note])).toEqual([[1, 1, 'หวานน้อย'], [0, 1, null]])
  })

  test('บรรทัดใหม่ของสินค้าเดิมใช้ราคาของบรรทัดแรก แม้ราคาสินค้าเปลี่ยนแล้ว', () => {
    const order = makeOrder({ items: [noteLine({ lineId: 1, note: 'หวานน้อย', unitPriceSatang: 3500 })] })
    const added = order.addItem({ productId: 10, productName: 'ชาเย็น', sku: 'TEA', unitPriceSatang: 4000 }, 1)
    expect(added.items.map((i) => i.unitPriceSatang)).toEqual([3500, 3500])
  })

  test('รวมออเดอร์ บรรทัดจากต้นทางใช้ราคาของปลายทางสำหรับสินค้าเดียวกัน', () => {
    // destination product 10 at 3500 note 'หวานน้อย'; source product 10 at 4000 note 'เผ็ด'
    // expect both resulting product-10 lines at 3500
  })

  test('แก้หมายเหตุให้ตรงกับอีกบรรทัด สองบรรทัดรวมเป็นบรรทัดแรก', () => {
    // items: lineId 1 note 'หวานน้อย' qty 1, lineId 2 note null qty 2
    // setLineNote(2, 'หวานน้อย') → [[1, 3, 'หวานน้อย']]
  })

  test('route ตาม productId แก้เฉพาะบรรทัดธรรมดาบรรทัดแรก', () => {
    // items: lineId 1 note 'หวานน้อย' qty 1, lineId 2 note null qty 1 (both plain, no options)
    // setQuantity(10, 5) → line 1 qty 5, line 2 qty 1
    // removeItem(10) → only line 2 is left
  })

  test('quantitiesByLine รวมจำนวนของสินค้าเดียวกันทุกหมายเหตุ', () => {
    // lineId 1 note 'a' qty 2, lineId 2 note null qty 3 → Map { identityOf(10, '') => 5 }
  })

  test('แยกบิล บรรทัดที่แยกไปเก็บหมายเหตุและราคาเดิม', () => {
    // lineId 1 note 'หวานน้อย' qty 2 at 3500, plus another line; splitOff([{ lineId: 1, quantity: 1 }])
    // created.items[0] has note 'หวานน้อย' and unitPriceSatang 3500
  })
  ```

- [ ] **Step 3: Run the tests and watch them fail**

  Run: `cd server && bun test src/domains/order.domain.test.ts`
  Expected: the new tests and the changed test FAIL. Every other test passes.

- [ ] **Step 4: Implement in `order.domain.ts`**

  - `identity(item)` returns the line identity including the note, as in Interfaces.
  - `mergeLines(items)`: first pass, record the `unitPriceSatang` of the first line of each `lineIdentity(productId, options)`. Second pass, set every line of that item to the recorded price, then merge by full identity (summing quantity and keeping the first line's `lineId`). Keep the existing quantity and `MAX_ORDER_LINES` checks. The `note: existing.note ?? item.note` fallback goes away, because merged lines now share a note.
  - `setLineNote` returns `this.change({ items: mergeLines(<items with the note changed>) })`.
  - `plainLineOf(productId)` becomes a lookup of the first item with that product and no options. `setQuantity` and `removeItem` resolve its `lineId`, then reuse `setQuantityOf(lineWithId(...))` / `removeWhere(lineWithId(...))`. If there is no plain line, they throw `ORDER_ITEM_NOT_FOUND` as today.
  - `quantitiesByLine()` sums per `lineIdentity`.
  - Update the doc comments of `addItem`, `absorb` and `mergeLines` to say that the note is part of the line and the price is per item.

- [ ] **Step 5: Run the tests and see them pass**

  Run: `cd server && bun test src/domains/order.domain.test.ts && bun run test:unit`
  Expected: all PASS. Use-case tests in `modules/orders/applications/usecases/*.test.ts` still pass unchanged. If one fails, stop and report it; do not edit its assertion.

- [ ] **Step 6: Do not commit yet**

  Saving two lines that differ only by note still breaks the database constraint, so Task 1 is committed together with Task 2 to keep every commit working.

### Task 2: Persistence: the unique constraint includes the note

**Files:**
- Modify: `server/src/infrastructure/database/schema/orders.ts:63`
- Create: `drizzle/0035_<generated>.sql` and `drizzle/meta/0035_snapshot.json` (generated, plus `_journal.json`)
- Test: `server/src/__tests__/integration/order-line-notes.integration.test.ts`

**Interfaces:**
- Consumes: Task 1's `OrderEntity` behavior.

- [ ] **Step 1: Write the failing integration tests** (in the existing `describe('a note on an order line')`, using `seedProduct`, `signIn`, `ok` from `test/harness`)

  - `'a plain unit added next to a noted line is its own line'`: open an order with 1 tea, note it `หวานน้อย`, then `items.post({ productId, quantity: 1 })`. Expect 2 lines: `[1, 'หวานน้อย']` and `[1, null]`.
  - `'two lines of one product are paid as one sale line at the first price'`: tea at 2500 with stock 10. Order 1 tea with note `หวานน้อย`. Change the product price to 3000 through the products API, as other integration tests do. Add 1 tea. Pay the order with cash 5000 (v1 `pay.post`). Expect the sale `totalSatang` to be 5000, one sale item with quantity 2 at 2500, and stock 8.
  - `'editing a note to match another line merges them'`: lines `หวานน้อย` ×1 and plain ×2. Patch the plain line's note to `หวานน้อย`. Expect 1 line with quantity 3 that keeps the first line's id.
  - `'merging bills keeps both notes'`: order A has tea `หวานน้อย`, order B has tea `เผ็ด`. `orders({ id: A }).merge.post({ sourceOrderId: B })`. Expect 2 tea lines with those notes.

- [ ] **Step 2: Run them and watch them fail**

  Run: `cd server && bun test src/__tests__/integration/order-line-notes.integration.test.ts`
  Expected: FAIL with a unique-constraint error (409 or 500) on the first test.

- [ ] **Step 3: Change the constraint**

  In `schema/orders.ts`, replace `unique().on(table.orderId, table.productId, table.optionsKey)` with `unique().on(table.orderId, table.productId, table.optionsKey, table.note).nullsNotDistinct()`. Extend the comment on `note` to say that two lines of one item differ by their note.

- [ ] **Step 4: Generate the migration and read it**

  Run: `bun run db:generate`
  Expected: one new `drizzle/0035_*.sql` that drops `order_items_order_id_product_id_options_key_unique` and adds the new constraint with `UNIQUE NULLS NOT DISTINCT("order_id","product_id","options_key","note")`, and nothing else. If it contains anything else, stop and report it.

- [ ] **Step 5: Migrate the test database and run the tests**

  Run: `bun run db:migrate`, then `cd server && bun test src/__tests__/integration/order-line-notes.integration.test.ts src/__tests__/integration/orders.integration.test.ts src/__tests__/integration/order-qr-hold.integration.test.ts`
  Expected: all PASS.

- [ ] **Step 6: Full verification**

  Run, from the repo root: `bun run typecheck && bun run lint && bun run test && bun run openapi:check`, plus the import-check commands from `AGENTS.md` ("Check the imports before every server commit").
  Expected: all pass, `openapi:check` reports no diff, and the import check prints nothing new.

- [ ] **Step 7: Commit (Tasks 1 and 2 together)**

  ```bash
  git add server/src/domains/order.domain.ts server/src/domains/order.domain.test.ts server/src/infrastructure/database/schema/orders.ts drizzle/0035_*.sql drizzle/meta/0035_snapshot.json drizzle/meta/_journal.json server/src/__tests__/integration/order-line-notes.integration.test.ts
  git diff --cached --stat
  gitcz --non-interactive --type=fix --scope=orders --subject="keep a line note on its own units" --body="<why: lines merged by product and options only, so adding a plain unit copied another line's note and merging bills dropped one. The note is now part of the line, every line of one item keeps the first line's price so checkout still charges the quoted amount, and the unique constraint includes the note. The merge-notes test now expects both notes, as approved by the owner.>"
  ```

- [ ] **Step 8: Push and report**

  `git push -u origin ohmattpon/order-line-notes`, then report the branch and the latest commit.

## Out of scope

These were found in the same review and are left for separate work:
- A typed discount is lost without a warning when the cart is saved as an open order.
- The sales page leaves the order after the order query fails 3 times in a row.
- In legacy (non-shift) mode, a one-step sale has no idempotency key, so a retry after a lost answer can record a second bill.
