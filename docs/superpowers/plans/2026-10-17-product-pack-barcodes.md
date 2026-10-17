# Pack Barcodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A product can carry extra pack barcodes (size ≥ 2, optional price); scanning one at the POS sells the pack as its own line while stock moves in pieces.

**Architecture:** Packs are part of the product aggregate (`ProductEntity.packs`), stored in a new `product_packs` table and loaded by the product repository. A pure module `domains/product-pack.ts` owns the pack rules and the price fallback, shared with the web as `@pos/api/packs`. Sale lines, quote lines and the cart carry `packId` + `packSize`; `SaleCheckout` stays the one place a bill is made.

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod; React, TanStack Query, zustand, i18next.

**Spec:** `docs/superpowers/specs/2026-10-17-product-pack-barcodes-design.md`

## Global Constraints

- Branch `ohmattpon/product-pack-barcodes`. Commit with `gitcz --non-interactive` only, one concern per commit, never `git commit`.
- Hexagonal + CQRS per `AGENTS.md`: rules in `domains/`, adapters translate only, use cases parse input with zod.
- v1 is additive only: new optional request fields, new response fields, no changed codes. Existing `products.barcode` and the `DUPLICATE` code for a product-vs-product barcode clash stay as they are.
- `calculateTotals` must not change. Money is integer satang ≤ `MAX_AMOUNT_SATANG`.
- Stock is in pieces. Every stock change goes through `IStockLedger` with `quantity × packSize`.
- Pack rules: barcode 1–64 chars; size integer 2–9999; price `null` or integer satang 0..`MAX_AMOUNT_SATANG`; at most 10 packs per product; a barcode is unique across product barcodes and pack barcodes, active or not.
- A pack line has no options; it still passes `resolveLineOptions` with no options (a required modifier group blocks it).
- No packs on table orders (`orders`).
- Migration is additive: new table, new columns with defaults (`pack_size` default 1, `pack_id` nullable).
- New error codes, all stable and translated in `src/locales/errors.ts` (th + en): `BARCODE_TAKEN` (409, `params.barcode`), `PACK_IN_USE` (409, `params.barcode`), `PACK_NOT_FOUND` (400, `params.packId`), `PACK_INACTIVE` (409, `params.barcode`), `PACK_WITH_OPTIONS` (400).
- All UI text through `t()` in the feature `locales.ts`, Thai template with `en satisfies typeof th`.
- Before done: `bun run typecheck`, `bun run test`, `bun run lint`; `bun run openapi:check` shows only additions and the project owner is told before the baseline is recorded.

## Review Focus

1. **Voiding a pack sale** must return `quantity × packSize` pieces, not `quantity`. → test in Task 4.
2. **Same product as a piece and as a pack in one cart** must be checked against stock as one total in pieces (server and web). → tests in Tasks 4 and 6.
3. **A pack edited or disabled after a quote was made** must still sell at the pinned price; a pack disabled before a non-quoted sale must be refused. → tests in Tasks 4 and 5.
4. **A product barcode changed to a value an existing pack uses** (or the reverse) must answer `BARCODE_TAKEN`, including two products saved at once. → integration test in Task 2.
5. **Deleting a pack that was sold** must answer `PACK_IN_USE` and leave the product unchanged (the whole save rolls back). → integration test in Task 3.

---

### Task 1: Pack rules in the domain

**Files:**
- Create: `server/src/domains/product-pack.ts`, `server/src/domains/product-pack.test.ts`
- Modify: `server/src/domains/product.domain.ts`, `server/src/domains/product.domain.test.ts`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json` (alias `@pos/api/packs` → `server/src/domains/product-pack.ts`, same line style as `@pos/api/pricing`)

**Interfaces:**
- Produces (`product-pack.ts`, no framework imports):
  - `export interface ProductPack { id: number; barcode: string; size: number; priceSatang: number | null; isActive: boolean }` (`id` is 0 until stored)
  - `export const MAX_PACK_SIZE = 9999`, `export const MAX_PACKS_PER_PRODUCT = 10`
  - `export function assertValidPack(pack: ProductPack): void` — throws `DomainError(…, 'INVALID_PRODUCT')`
  - `export function packUnitPriceSatang(productPriceSatang: number, pack: Pick<ProductPack, 'size' | 'priceSatang'>): number` — `pack.priceSatang ?? size × productPriceSatang`
  - `export function packUnitCostSatang(productCostSatang: number, size: number): number` — `size × cost`
- Produces (`ProductEntity`):
  - `ProductEntityProps.packs?: ProductPack[]` (absent = `[]`); `readonly packs: readonly ProductPack[]`; `toSnapshot()` includes `packs` (copied)
  - `ProductChanges` gains `packs`
  - `findPack(packId: number): ProductPack | undefined`
  - `packForSale(packId: number): ProductPack` — throws `DomainError('…', 'PACK_NOT_FOUND', { packId })` or `DomainConflictError('…', 'PACK_INACTIVE', { barcode })`; also calls `assertActive()`

- [ ] **Step 1: Write failing tests** in `product-pack.test.ts`:
  - `packUnitPriceSatang(1500, { size: 6, priceSatang: null })` → `9000`; `(1500, { size: 6, priceSatang: 8500 })` → `8500`; `(1500, { size: 6, priceSatang: 0 })` → `0`
  - `packUnitCostSatang(1000, 24)` → `24000`
  - `assertValidPack` throws `INVALID_PRODUCT` for: barcode `''`, barcode of 65 chars, size `1`, size `10000`, size `2.5`, price `-1`, price `MAX_AMOUNT_SATANG + 1`; accepts size `2`, size `9999`, price `null`

  And in `product.domain.test.ts`:
  - a product with 11 packs throws `INVALID_PRODUCT`
  - two packs with the same barcode throw `DomainConflictError` code `BARCODE_TAKEN`, `params.barcode`
  - a pack barcode equal to the product's own barcode throws `BARCODE_TAKEN`
  - `new ProductEntity({...props without packs})).packs` equals `[]`
  - `with({ packs: [...] })` returns a new entity with those packs and leaves the original unchanged
  - `packForSale(99)` throws `PACK_NOT_FOUND` with `params.packId === 99`; an inactive pack throws `PACK_INACTIVE`; an inactive product throws `PRODUCT_INACTIVE`

- [ ] **Step 2: Run** `cd server && bun test src/domains/product-pack.test.ts src/domains/product.domain.test.ts` — expect failures (module not found / missing members).

- [ ] **Step 3: Implement** `product-pack.ts` and the `ProductEntity` changes. Validate packs in the constructor (each `assertValidPack`, count, barcode clashes) so an invalid product cannot exist. Add the three alias entries.

- [ ] **Step 4: Run** the same tests — PASS. Run `bun run test:unit` — PASS (existing factories build products without `packs`).

- [ ] **Step 5: Commit** — `gitcz --non-interactive --type=feat --scope=products --subject="add pack rules to the product entity"`

---

### Task 2: Store packs and look them up by barcode

**Files:**
- Modify: `server/src/infrastructure/database/schema/products.ts` (add `productPacks`), `server/src/infrastructure/database/schema/sales.ts` (`saleItems.packId`, `saleItems.packSize`), `server/src/infrastructure/database/schema/index.ts` if tables are re-exported there
- Create: migration via `bun run db:generate` → `drizzle/0020_*.sql` (+ meta)
- Modify: `server/src/modules/products/applications/ports/product.repository.ts`, `adapters/repository/product.drizzle.repository.ts`, `adapters/repository/product.cached.repository.ts`
- Create: `server/src/__tests__/integration/product-packs.integration.test.ts` — resolves `DrizzleProductRepository` and `TOKENS.UnitOfWork` from the tsyringe container and calls them inside `uow.run()` (the HTTP routes arrive in Task 3)

**Interfaces:**
- Consumes: `ProductPack`, `ProductEntity.packs` (Task 1)
- Produces:
  - table `product_packs`: `id`, `product_id` (FK products, not null), `barcode` text not null **unique**, `size` integer not null `check (size between 2 and 9999)`, `price_satang` integer null `check (price_satang >= 0)`, `is_active` boolean not null default true, timestamps; index on `product_id`
  - `sale_items.pack_id` integer null **FK → product_packs.id** (no cascade: this FK is what blocks deleting a sold pack); `sale_items.pack_size` integer not null default 1 `check (pack_size >= 1)`
  - Repository: every read (`findAll`, `findById`, `findManyForUpdate`) returns products with `packs` (ordered by pack id), loaded in **one** extra query for all returned product ids (no N+1)
  - `findAll({ code })` also matches an exact pack barcode (active or not); the product comes back once. Ordering for `code`: product-barcode hit first, then pack-barcode hit, then SKU
  - `create`/`update` write packs as a set: id 0 → insert, known id → update, stored id missing from the entity → delete. A pack id that belongs to another product → `DomainNotFoundError('…', 'PACK_NOT_FOUND')`
  - Before writing, inside the caller's transaction, take `pg_advisory_xact_lock` on one fixed key for barcodes, then refuse with `DomainConflictError('…', 'BARCODE_TAKEN', { barcode })` when any pack barcode equals another product's `barcode` or another product's pack, or the product's own barcode equals another product's pack barcode
  - FK violation from deleting a sold pack → `DomainConflictError('…', 'PACK_IN_USE', { barcode })`. Keep existing translations (`DUPLICATE`, `IN_USE`) for the other cases
  - Cached repository: its snapshot round-trip carries `packs` (it already uses `toSnapshot()`; verify the cached page rebuilds packs)

- [ ] **Step 1: Write failing integration tests** (real PostgreSQL, `resetDatabase` in setup):
  - create a product with packs `[{ barcode: '885000000006', size: 6, priceSatang: 8500 }, { barcode: '885000000024', size: 24, priceSatang: null }]` → `findById` returns both, ordered, with ids
  - `findAll({ branchId, code: '885000000006' })` returns that product, `total === 1`
  - a second product whose `barcode` is `'885000000006'` → `BARCODE_TAKEN`; a second product with a pack `'885000000006'` → `BARCODE_TAKEN`; changing the first product's own barcode to `'885000000024'` → `BARCODE_TAKEN`
  - two concurrent `update`s in separate units of work that each add pack barcode `'X1'` to different products: exactly one succeeds, the other gets `BARCODE_TAKEN` (Review Focus 4)
  - update with the 6-pack removed and a new pack added → stored set matches
- [ ] **Step 2: Run** `cd server && bun --env-file=.env.test test src/__tests__/integration/product-packs.integration.test.ts` — FAIL.
- [ ] **Step 3: Implement** schema, run `bun run db:generate`, read the generated SQL (additive only, defaults present), then the repository changes.
- [ ] **Step 4: Run** the new tests and `products.integration.test.ts` — PASS.
- [ ] **Step 5: Commit** — `gitcz --non-interactive --type=feat --scope=products --subject="store product packs and find them by barcode"`

---

### Task 3: Manage packs through the product API

**Files:**
- Modify: `server/src/modules/products/applications/schemas/product-schemas.ts`, `usecases/create-product.usecase.ts`, `usecases/update-product.usecase.ts`, `usecases/products.usecases.test.ts`
- Modify: `server/src/modules/products/adapters/controllers/schemas/product.schema.ts`, `product.presenter.ts`
- Modify: `server/src/__tests__/integration/products.integration.test.ts`, `server/src/__tests__/factories.ts` / `mocks.ts` if the product mock needs `packs`

**Interfaces:**
- Consumes: Task 1 entity, Task 2 repository behaviour
- Produces:
  - zod: `pack = z.object({ id: z.number().int().positive().optional(), barcode: z.string().min(1).max(64), size: z.number().int(), priceSatang: z.number().int().nullable(), isActive: z.boolean().optional() })`; `createProductSchema.packs = z.array(pack).max(10).optional()`; `updateProductSchema.packs` same (omitted = packs untouched; `[]` = remove all)
  - HTTP: `productSchemas.pack = t.Object({ id: t.Integer(), barcode, size: t.Integer(), priceSatang: t.Nullable(satang()), isActive: t.Boolean() })`; response `product.packs: t.Array(pack)`; `create.packs` / `update.packs` optional arrays of the request shape (id optional, isActive optional default true). Range rules stay in the domain, not the route schema
  - Audit: `product.create` `after.packs`, and `product.update` includes `packs` in the compared fields (`[{ barcode, size, priceSatang, isActive }]`)

- [ ] **Step 1: Write failing use case tests** (mock repository):
  - create with two packs passes them to `repository.create` with id 0 and `isActive: true`
  - update with `packs` omitted keeps existing packs; with `packs: []` saves none
  - update that changes a pack price records an audit entry whose `before.packs`/`after.packs` differ
  - create with `packs` of 11 items is rejected by zod
- [ ] **Step 2: Write failing HTTP integration tests**:
  - `POST /api/v1/products` with packs → 200, response `packs` has ids, `priceSatang: null` kept as null
  - `GET /api/v1/products?code=<pack barcode>` → the product
  - `PATCH` as a cashier (no `products.write`) → 403
- [ ] **Step 3: Run** `bun run test:unit` and the products integration test — FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** the same — PASS.
- [ ] **Step 6: Commit** — `gitcz --non-interactive --type=feat --scope=products --subject="manage packs in the product api"`

---

### Task 4: Sell packs through the checkout

**Files:**
- Modify: `server/src/domains/sale.domain.ts`, `sale.domain.test.ts`
- Modify: `server/src/modules/sales/applications/ports/sale-checkout.port.ts`, `services/sale-checkout.ts`, `services/sale-checkout*.test.ts` (add `sale-checkout-packs.test.ts`)
- Modify: `server/src/modules/sales/applications/schemas/sale-schemas.ts`, `usecases/void-sale.usecase.ts`, its test
- Modify: `server/src/modules/sales/adapters/repository/sale.drizzle.repository.ts` (`itemColumns` + insert), `sales-report.drizzle.repository.ts` (quantity in pieces)
- Modify: `server/src/modules/sales/adapters/controllers/schemas/sale.schema.ts`, presenters
- Test: `server/src/__tests__/integration/sales*.integration.test.ts` (add a pack sale)

**Interfaces:**
- Consumes: `ProductEntity.packForSale`, `packUnitPriceSatang`, `packUnitCostSatang` (Task 1); packs on locked products (Task 2)
- Produces:
  - `SaleItem.packId: number | null`, `SaleItem.packSize: number` (restored sales without them → `null` / `1` in the constructor)
  - `CompleteSaleInput.lines[].pack?: { id: number; size: number; unitPriceSatang: number }` — when present: `unitPriceSatang = pack.unitPriceSatang`, `unitCostSatang = packUnitCostSatang(product.costSatang, size)`, options must be empty
  - `CheckoutLine.packId?: number`
  - checkout request item (zod + Elysia): `packId: z.number().int().positive().optional()`; an item with `packId` and non-empty `options` → `DomainError('…', 'PACK_WITH_OPTIONS')`
  - sale response item: `packId: t.Nullable(t.Integer())`, `packSize: t.Integer()`
- Behaviour in `SaleCheckout` (non-quote path): line key is `productId:optionsKey:packId`; for a pack line call `lineOptions.resolve(productId, [])` (keeps the required-group rule), then after locking products `product.packForSale(packId)`; stock demand per product = Σ `quantity × size` across its lines; ledger `quantity: -(item.quantity × item.packSize)`
- Void: ledger `quantity: item.quantity × item.packSize`
- Report "quantity" per product = `sum(i.quantity * i.pack_size)`; cost sums stay `unit_cost × quantity` (unit cost is already per pack)

- [ ] **Step 1: Write failing domain tests** (`sale.domain.test.ts`): a line with `pack { id: 7, size: 6, unitPriceSatang: 8500 }` and quantity 2, product cost 1000 → item `unitPriceSatang 8500`, `unitCostSatang 6000`, `lineTotalSatang 17000`, `packId 7`, `packSize 6`, subtotal 17000; a normal line → `packId null`, `packSize 1`.
- [ ] **Step 2: Write failing checkout tests** (`sale-checkout-packs.test.ts`, mock ports):
  - stock 12, cart: 1 pack of 6 + 6 pieces → succeeds, ledger records `-6` and `-6` (or one `-12` if merged per product — assert the sum is `-12`)
  - stock 11, same cart → `INSUFFICIENT_STOCK` (Review Focus 2)
  - pack without price, product price 1500 → item unit price 9000
  - inactive pack → `PACK_INACTIVE`; unknown packId → `PACK_NOT_FOUND`; packId with options → `PACK_WITH_OPTIONS`
  - resolver throws the required-group error for `resolve(productId, [])` → checkout rejects with that error
  - same pack scanned on two request lines → one bill line with quantity 2
- [ ] **Step 3: Write failing void test**: voiding a bill with a pack line (qty 2, size 6) records ledger `+12` (Review Focus 1).
- [ ] **Step 4: Write failing integration test**: product stock 24 (receive via the inventory route), `POST /api/v1/sales` with `{ productId, packId, quantity: 1 }` → bill item `packSize 6`, `GET` product stock 18; void → 24. Then `PATCH /api/v1/products/:id` with `packs: []` → 409 `PACK_IN_USE`, and `GET` shows the pack still there (Review Focus 5).
- [ ] **Step 5: Run** `bun run test:unit` and the sales integration tests — FAIL.
- [ ] **Step 6: Implement**, including the repository columns and the report SQL.
- [ ] **Step 7: Run** the same — PASS.
- [ ] **Step 8: Commit** — `gitcz --non-interactive --type=feat --scope=sales --subject="sell product packs and move stock in pieces"`

---

### Task 5: Pin packs in quotes

**Files:**
- Modify: `server/src/domains/price-quote.domain.ts`, `price-quote.domain.test.ts`
- Modify: `server/src/modules/quotes/applications/schemas/quote-schemas.ts`, `usecases/create-quote.usecase.ts` + test, `adapters/controllers/schemas/quote.schema.ts`, `quote.presenter.ts`
- Modify: `server/src/modules/orders/applications/services/order-quote-source.ts` (order lines → `packId: null, packSize: 1`)
- Modify: `server/src/modules/sales/applications/services/sale-checkout.ts` (quote path), `sale-checkout-quotes.test.ts`

**Interfaces:**
- Consumes: Task 4 `CompleteSaleInput.lines[].pack`, `CheckoutLine.packId`
- Produces:
  - `QuoteLine.packId: number | null`, `QuoteLine.packSize: number`; the constructor normalizes stored lines without them to `null` / `1` (old jsonb rows)
  - `QuoteRequestLine.packId: number | null`; quote line key = `productId:optionsKey:packId` in both `quantities()` and `matches()`
  - quote request line: `packId: z.number().int().positive().optional()`; response line adds `packId`, `packSize`
  - `CreateQuoteUseCase.priceLines`: pack line → `product.packForSale`, `resolve(productId, [])`, `unitPriceSatang = packUnitPriceSatang(...)`, stock demand in pieces, `PACK_WITH_OPTIONS` as in Task 4
  - `SaleCheckout` quote path: a quote line with `packId` becomes a line with `pack { id, size: line.packSize, unitPriceSatang: line.unitPriceSatang }`; stock demand in pieces; `toQuoteLine` passes `packId ?? null`

- [ ] **Step 1: Write failing tests**:
  - domain: a quote with a pack line matches a request with the same `packId`, and does not match the same product without `packId`; a line restored without `packId`/`packSize` reads as `null`/`1`
  - create-quote: cart with one 6-pack (no price, product 1500) → quote line `unitPriceSatang 9000`, `packSize 6`, subtotal 9000
  - checkout with quote: the pack is disabled and its price changed after the quote → sale still succeeds at the quoted 9000 with `packSize 6` (Review Focus 3)
- [ ] **Step 2: Run** `bun run test:unit` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test:unit` and the quotes integration test — PASS.
- [ ] **Step 5: Commit** — `gitcz --non-interactive --type=feat --scope=quotes --subject="pin pack lines in price quotes"`

---

### Task 6: Scan and price packs in the cart (web)

**Files:**
- Modify: `src/features/pos/store/cart.store.ts`, `cart.store.test.ts`
- Modify: `src/features/pos/lib/cart.ts`, `cart.test.ts`
- Modify: `src/features/pos/lib/customer-display.ts`, `customer-display.test.ts`
- Modify: `src/features/pos/components/ProductPicker.tsx`, `PosPage.tsx` (quote + sale requests send `packId`), `CartPanel.tsx` (show the pack label), `src/features/pos/hooks/use-cart-actions.ts`
- Modify: `src/features/pos/locales.ts`

**Interfaces:**
- Consumes: `packUnitPriceSatang` from `@pos/api/packs`; `Product.packs` from the API types (Task 3)
- Produces:
  - `CartLine.packId: number | null`; `cartLineKey(productId, optionIds, packId: number | null = null)` returns today's key when `packId` is null and `${today}:p${packId}` otherwise (old persisted keys stay valid)
  - `add(productId, optionIds = [], packId: number | null = null)`
  - `PricedLine.packId: number | null`, `PricedLine.packSize: number`; pack price via `packUnitPriceSatang`; a pack missing or inactive → `unavailable: true`; stock demand per product counts `quantity × packSize`; `itemCount` counts lines' `quantity` (packs, as on the receipt)
  - `CustomerDisplayInput.packLabel: (size: number) => string`; a pack line's display `name` is `` `${name} (${packLabel(size)})` ``
  - `pos` locales: `cart.pack` = `'แพ็ค {{size}}'` / `'pack of {{size}}'`, `picker.packNeedsOptions` = `'"{{name}}" ต้องเลือกตัวเลือกก่อน ขายแบบแพ็คไม่ได้'` / `'"{{name}}" needs options and cannot be sold as a pack'`, `picker.packNotInOrders` = `'ขายแบบแพ็คได้เฉพาะการขายหน้าร้าน ไม่ใช่ออเดอร์'` / `'Packs can only be sold at the till, not on an order'`
- Picker: after the exact `code` fetch, match order is product barcode → active pack barcode (`product.packs.find(p => p.barcode === code && p.isActive)`) → SKU → single result. For a pack hit: if working on an order → toast `packNotInOrders`; else if `offeredGroups` is non-empty and `chooseOptions(groups, [])` is null → toast `packNeedsOptions`; else if tracked stock < `pack.size` → existing `outOfStock` toast; else `add(product.id, [], pack.id)`

- [ ] **Step 1: Write failing tests**:
  - store: `add(5, [], 9)` twice → one line `{ productId: 5, packId: 9, quantity: 2 }`; `add(5)` → a separate line; `cartLineKey(5, [])` equals `'5:'` (unchanged)
  - `priceCart`: product price 1500, stock 12, lines `[pack 6 (no price) ×1, piece ×6]` → unit prices 9000 and 1500, `exceedsStock` false; with stock 11 → both lines `exceedsStock` true (Review Focus 2); pack price 8500 → line 8500; inactive pack → `unavailable` true and `canPay` false
  - `toDisplayState` with `packLabel: (n) => \`pack of ${n}\`` → line name `'Cola (pack of 6)'`
- [ ] **Step 2: Run** `bun run test:web` — FAIL.
- [ ] **Step 3: Implement** store, lib, picker, page mappings, cart panel label (`t('cart.pack', { size })` next to the name when `packSize > 1`).
- [ ] **Step 4: Run** `bun run test:web`, `bun run typecheck`, `bun run lint` — PASS.
- [ ] **Step 5: Commit** — `gitcz --non-interactive --type=feat --scope=pos --subject="scan and price packs in the cart"`

---

### Task 7: Edit packs in the product form and show them on receipts (web)

**Files:**
- Create: `src/features/products/lib/packs.ts`, `src/features/products/lib/packs.test.ts`
- Modify: `src/features/products/components/ProductFormDialog.tsx`, `src/features/products/locales.ts`, `src/features/products/api.ts` if the mutation types need it
- Modify: `src/features/sales/components/Receipt.tsx`, `SaleDetailDialog.tsx`, `src/features/sales/locales.ts`
- Modify: `src/locales/errors.ts` (the five new codes, th + en)

**Interfaces:**
- Consumes: Task 3 request/response shapes
- Produces:
  - `interface PackRow { id?: number; barcode: string; size: string; price: string; isActive: boolean }`
  - `toPackRows(packs: Product['packs']): PackRow[]` (price `''` when null, formatted through the same amount formatter the form uses for price)
  - `toPackInput(rows: PackRow[], parseAmount: (input: string) => number | null): { packs: PackInput[] } | { error: 'size' | 'price'; index: number }` — trims barcode, `size` must parse to an integer, empty price → `null`, rows with empty barcode and empty size are dropped
  - Form: a "Packs" section under the barcode field; each row has barcode, size, price (placeholder = auto price text), active switch, remove button (`aria-label`); "Add pack" button disabled at 10 rows; inputs `h-11`; row error shown with `role="alert"`
  - `sales` locales `receipt.pack` = `'(แพ็ค {{size}})'` / `'(pack of {{size}})'`; Receipt and SaleDetailDialog show it after `productName` when `item.packSize > 1`
  - `products` locales: `form.packs`, `form.addPack`, `form.packBarcode`, `form.packSize`, `form.packPrice`, `form.packAutoPrice` (`'อัตโนมัติ {{price}}'` / `'Auto {{price}}'`), `form.packActive`, `form.removePack`, `form.packSizeInvalid`, `form.packPriceInvalid`

- [ ] **Step 1: Write failing tests** in `packs.test.ts`: `toPackInput` drops a blank row, keeps `{ barcode: ' 885 ', size: '6', price: '' }` as `{ barcode: '885', size: 6, priceSatang: null, isActive: true }`, returns `{ error: 'size', index: 0 }` for size `'abc'`, `{ error: 'price', index: 1 }` for an unparsable price; `toPackRows` maps `priceSatang: null` to `''`.
- [ ] **Step 2: Run** `bun run test:web` — FAIL.
- [ ] **Step 3: Implement** the lib, form section, receipt label, error translations.
- [ ] **Step 4: Run** `bun run test:web`, `bun run typecheck`, `bun run lint` — PASS. Run `bun run screenshots` and look at the products page and product dialog at 390 / 768 / 1366 px.
- [ ] **Step 5: Commit** — `gitcz --non-interactive --type=feat --scope=products --subject="edit packs in the product form and print them on receipts"`

---

### Task 8: Contract check and full suite

- [ ] **Step 1:** `bun run openapi:check` — expect a diff containing only additions (`packs` on product, `packId` on sale/quote items, `packId`/`packSize` on sale and quote lines). Stop and tell the project owner the list before recording the baseline; record it only after they agree, in its own commit (`--type=test --scope=api --subject="record the openapi baseline with pack fields"`).
- [ ] **Step 2:** `bun run typecheck` and `bun run test` — PASS (database running). Report the counts.
- [ ] **Step 3:** If the AGENTS.md "Modifiers" or "Orders" bullets now misdescribe the code (a line is product + options + optional pack), add one bullet under "Promotions and pinned prices" or a new "Packs" heading stating: packs belong to the product, stock in pieces, pack lines carry no options and are not offered on orders. Commit as `docs`.
