# Detailed Reports, Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the base every later report needs (per-line allocation of bill money, period comparison, bill-level filters) and ship the Overview, Products and Categories tabs on it.

**Architecture:** Each bill line gets its share of the bill total and VAT, fixed at sale time by one pure domain function, so line-based reports add up to the bill-based overview. New report routes are queries in the `sales` module, additive under `/api/v1/sales/reports`. The web reports page gains URL-backed filters, a comparison toggle and tabs.

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod; React, TanStack Query, react-i18next, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-29-detailed-reports-design.md`

This is part 1 of the spec's six. Later plans: (2) time of day and staff, (3) members and promotions, (4) discounts and voids, and all bills, (5) drill-down and Excel for the new tabs. The category filter in part 1 applies to the Products and Categories tabs only. Bill-level tabs get it in part 2, once line allocation has been in production.

## Global Constraints

- Money is integer satang end to end, and never above `MAX_AMOUNT_SATANG` (`domains/sale.domain.ts`).
- Never change `calculateTotals`.
- Voided bills count in no sales figure. Bills fall in the period of the day they were sold (`created_at`, shop `timeZone`).
- Date range: from ≤ to, at most 366 days (the existing `salesReportSchema` refine).
- Every new route is under `/api/v1/sales/reports`, `auth: { can: 'reports.read' }`, additive only. Lists return `{ items, total }` through `page()` with `limit` (1–500) and `offset`.
- Use cases are queries: `@injectable()`, a single `execute(input: unknown, actor, branchId)` that parses with zod first and calls `requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')`.
- Core files never import another module's ports. They declare a narrow port in `sales/applications/ports/`, and the providing module implements and binds it.
- Every text on screen goes through `t()` in `features/reports/locales.ts` (`th` template, `en satisfies typeof th`). Money goes through `useFormat()`. Tables use `DataTable` with a `priority` on every column. Screens work at 390, 768 and 1366px.
- Run the import check from AGENTS.md before every server commit.
- Before recording `server/test/openapi-baseline.json`, tell the project owner what changed (Tasks 5, 6, 7 and 8 change it).
- Commit only with `gitcz --non-interactive`, one concern per commit, on branch `ohmattpon/detailed-reports`.

**Plan decision (differs from the spec):** the spec stores `category_name` on the line. Storing it needs `SaleCheckout`, which is on the AGENTS.md fix list and too large to fix inside this work. Lines store `category_id` only, from `ProductEntity.categoryId` inside `Sale.complete`. Reports read the category's current name, so renaming a category relabels old figures under the same id. Raise this with the owner at the Task 3 review.

## Review Focus

1. A bill whose subtotal is 0 (every line free, or a 100% discount): allocation must give every line 0 and never divide by zero. Task 2 owns the test.
2. A bill with exclusive VAT, where the total is above the subtotal: line shares still add up to the bill's own `totalSatang` and `vatSatang` exactly. Task 2 owns the test.
3. Old bills sold before the migration, with null allocation: the Products and Categories reports must not drop them or show null money. Task 4 backfills them, and Task 7 asserts that a report over a backfilled bill equals the overview.
4. A previous period that starts before the shop's first bill: the comparison returns zeros, and `percentChange` returns `null`, so the web shows "no comparison" instead of an infinite %. Task 5 owns the test.
5. A product with no category, or whose category was deleted: it appears in one "No category" row and is never lost from the totals. Task 8 owns the test.

---

### Task 1: A sales-owned port for the shop time zone (fix-list item)

**Files:**
- Create: `server/src/modules/sales/applications/ports/report-time-zone.port.ts`
- Create: `server/src/modules/settings/adapters/report-time-zone.adapter.ts`
- Modify: `server/src/modules/settings/settings.module.ts` (bind the token)
- Modify: `server/src/modules/sales/applications/usecases/get-sales-report.usecase.ts`, `list-report-products.usecase.ts`, `list-report-branches.usecase.ts`, `get-promotion-report.usecase.ts` (inject the new port instead of `IShopSettingsRepository`)
- Modify: `server/src/__tests__/mocks.ts` (add `mockReportTimeZone(timeZone = 'Asia/Bangkok')`)
- Test: `server/src/modules/sales/applications/usecases/sales-report.usecases.test.ts`

**Interfaces:**
- Produces: `interface IReportTimeZone { timeZone(): Promise<string> }`, `reportTimeZoneToken = Symbol('IReportTimeZone').toString()`. Every later report use case injects this port.

- [ ] **Step 1:** Change the existing report use-case tests to construct the use cases with `mockReportTimeZone('Asia/Bangkok')`, and assert that the repository receives `timeZone: 'Asia/Bangkok'`.
- [ ] **Step 2:** Run `cd server && bun test src/modules/sales/applications/usecases/sales-report.usecases.test.ts`. Expected: FAIL (`mockReportTimeZone` is not exported).
- [ ] **Step 3:** Add the port, the settings adapter `SettingsReportTimeZone` (reads `IShopSettingsRepository.get()` and returns `timeZone`), the binding, and the mock. Switch the four use cases.
- [ ] **Step 4:** Run the same test, then `bun run test:unit` and the AGENTS.md import check. Expected: PASS. The check no longer lists these four files.
- [ ] **Step 5:** Commit `refactor(sales): read the report time zone through a sales-owned port`.

### Task 2: Allocate a bill's money across its lines

**Files:**
- Create: `server/src/domains/bill-allocation.ts`
- Test: `server/src/domains/bill-allocation.test.ts`

**Interfaces:**
- Produces: `allocateBillToLines(bill: { totalSatang: number; vatSatang: number }, lineTotals: readonly number[]): { totalSatang: number; vatSatang: number }[]`, in input order.

Each amount (`totalSatang`, then `vatSatang`) is split by the same weights, `lineTotals[i] / sum(lineTotals)`, using largest remainder: floor every share, then give the leftover satang one each to the largest fractional parts. Ties go to the lower index. When `sum(lineTotals)` is 0, every share is 0.

- [ ] **Step 1: Write the failing tests**

```ts
test('shares add up to the bill exactly', () => {
  const shares = allocateBillToLines({ totalSatang: 10000, vatSatang: 654 }, [3333, 3333, 3334])
  expect(shares.reduce((s, x) => s + x.totalSatang, 0)).toBe(10000)
  expect(shares.reduce((s, x) => s + x.vatSatang, 0)).toBe(654)
})
test('a discount is spread by line value', () => {
  expect(allocateBillToLines({ totalSatang: 900, vatSatang: 0 }, [600, 400]))
    .toEqual([{ totalSatang: 540, vatSatang: 0 }, { totalSatang: 360, vatSatang: 0 }])
})
test('leftover satang go to the largest remainders, lower index on a tie', () => {
  expect(allocateBillToLines({ totalSatang: 100, vatSatang: 0 }, [1, 1, 1]).map((x) => x.totalSatang)).toEqual([34, 33, 33])
})
test('exclusive VAT above the subtotal still sums to the bill', () => {
  const shares = allocateBillToLines({ totalSatang: 10700, vatSatang: 700 }, [5000, 5000])
  expect(shares).toEqual([{ totalSatang: 5350, vatSatang: 350 }, { totalSatang: 5350, vatSatang: 350 }])
})
test('a zero subtotal gives every line zero', () => {
  expect(allocateBillToLines({ totalSatang: 0, vatSatang: 0 }, [0, 0])).toEqual([{ totalSatang: 0, vatSatang: 0 }, { totalSatang: 0, vatSatang: 0 }])
})
test('one line takes the whole bill', () => {
  expect(allocateBillToLines({ totalSatang: 123, vatSatang: 8 }, [500])).toEqual([{ totalSatang: 123, vatSatang: 8 }])
})
```

- [ ] **Step 2:** Run `cd server && bun test src/domains/bill-allocation.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement with integer arithmetic only. Use `BigInt` for `amount * weight`, because both can reach `MAX_AMOUNT_SATANG`.
- [ ] **Step 4:** Run the test again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(sales): allocate a bill's total and VAT across its lines`.

### Task 3: Store each line's category and money share at sale time

**Files:**
- Modify: `server/src/infrastructure/database/schema/sales.ts` (`saleItems`: add `categoryId: integer()`, `allocatedTotalSatang: integer()`, `allocatedVatSatang: integer()`, all nullable, no foreign key, because these are snapshots)
- Create: `drizzle/0041_*.sql` via `bun run db:generate` (three `ALTER TABLE "sale_items" ADD COLUMN`, nothing else)
- Modify: `server/src/domains/sale.domain.ts` (`SaleItem` gains `categoryId: number | null`, `allocatedTotalSatang: number | null`, `allocatedVatSatang: number | null`. `Sale.complete` fills them, and the constructor defaults missing values to `null`)
- Modify: `server/src/modules/sales/adapters/repository/sale.drizzle.repository.ts` (insert and map the three columns)
- Test: `server/src/domains/sale.domain.test.ts`

**Interfaces:**
- Consumes: `allocateBillToLines` (Task 2).
- Produces: every new `sale_items` row has non-null `allocated_total_satang` and `allocated_vat_satang`, plus `category_id = products.category_id` at sale time.

- [ ] **Step 1:** Add tests: `Sale.complete` with two lines of 600 and 400, a discount of 100 and inclusive VAT gives items whose `allocatedTotalSatang` sum to `totalSatang` and whose `allocatedVatSatang` sum to `vatSatang`. Each item's `categoryId` equals its product's `categoryId`, including `null`.
- [ ] **Step 2:** Run `cd server && bun test src/domains/sale.domain.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Call `allocateBillToLines({ totalSatang, vatSatang }, items.map((i) => i.lineTotalSatang))` after `calculateTotals`. Generate the migration and check that it holds only the three `ADD COLUMN`s.
- [ ] **Step 4:** Run the domain test, `bun run test:unit` and `bun run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(sales): snapshot each line's category and share of the bill`.

### Task 4: Backfill the share on lines sold before Task 3

**Files:**
- Create: `server/src/infrastructure/database/backfill-sale-lines.ts` (exports `backfillSaleLines(batchSize = 500): Promise<number>`, which returns the number of sales updated. Run directly, it calls the function and logs the count)
- Modify: `package.json` (`"db:backfill:sale-lines": "bun --env-file=.env server/src/infrastructure/database/backfill-sale-lines.ts"`)
- Test: `server/src/__tests__/integration/backfill-sale-lines.integration.test.ts`

**Interfaces:**
- Consumes: `allocateBillToLines`.
- Produces: after it runs, no `sale_items` row has a null allocation. `category_id` stays null on old rows, and Task 8 resolves those.

Loop: in one transaction per batch, select up to `batchSize` sales that have any item with `allocated_total_satang is null`, ordered by id. Load their items ordered by id, allocate, and update each item. Stop when a batch is empty. This is idempotent, because a filled sale is never selected again.

- [ ] **Step 1:** Integration test: insert a sale with two items whose allocation columns are null (raw insert), run `backfillSaleLines(1)`, and assert both items' shares sum to the sale's total and VAT. A second run returns `0`.
- [ ] **Step 2:** Run `cd server && bun test src/__tests__/integration/backfill-sale-lines.integration.test.ts`. Expected: FAIL. This needs the test PostgreSQL, so ask the owner before starting Podman.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit `feat(sales): backfill line shares on bills sold before the snapshot`. In the body, say that the owner must run `bun run db:backfill:sale-lines` once per shop after migrating.

### Task 5: Compare with the previous period

**Files:**
- Modify: `server/src/domains/sales-report.ts` (add `previousPeriod`, `percentChange`)
- Test: `server/src/domains/sales-report.test.ts`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json` (alias `@pos/api/reports` → `server/src/domains/sales-report.ts`)
- Modify: `server/src/modules/sales/applications/schemas/sales-report.schema.ts` (`compare: z.coerce.boolean().default(false)` on `salesReportSchema`)
- Modify: `get-sales-report.usecase.ts` (when `compare`, also call `reports.overview` for `previousPeriod(from, to)` and return `previous: calculateReportMetrics(prev.summary)`)
- Modify: `server/src/modules/sales/adapters/controllers/schemas/sales-report.schema.ts` (`query.compare: t.Optional(t.BooleanString())`, `overview.previous: t.Optional(metrics)`)
- Test: `sales-report.usecases.test.ts`

**Interfaces:**
- Produces: `previousPeriod(from: string, to: string): { from: string; to: string }` (same length, ending the day before `from`). `percentChange(current: number, previous: number): number | null` (basis points, rounded half away from zero; `null` when `previous` is 0). Overview response field `previous?: Metrics`.

- [ ] **Step 1:** Tests: `previousPeriod('2026-10-01','2026-10-28')` → `{ from: '2026-09-03', to: '2026-09-30' }`. `previousPeriod('2026-03-01','2026-03-01')` → `{ from: '2026-02-28', to: '2026-02-28' }`. `percentChange(11240, 10000)` → `1240`. `percentChange(0, 0)` → `null`. `percentChange(5, 0)` → `null`. `percentChange(9800, 10000)` → `-200`. Use case: with `compare: true`, the repository is called twice and `previous` is present. Without it, the repository is called once and `previous` is absent.
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement. Date math uses calendar dates as UTC midnight strings (no clock).
- [ ] **Step 4:** Run the tests, then `bun run openapi:check`. Expected: the tests pass. The OpenAPI check reports the new optional query and response fields. Tell the owner, then record it with `cd server && bun --env-file=.env.test test/openapi-snapshot.ts write` and check again.
- [ ] **Step 5:** Commit `feat(sales): compare a report with the period before it`.

### Task 6: Filter reports by cashier and by member or guest

**Files:**
- Modify: `sales-report.schema.ts` (application): `cashierId: z.coerce.number().int().positive().optional()`, `customer: z.enum(['member', 'guest']).optional()`
- Modify: `server/src/modules/sales/applications/ports/sales-report.repository.ts` (`SalesReportPeriod` gains `cashierId?: number`, `customer?: 'member' | 'guest'`; add `cashiers(period): Promise<{ cashierId: number; cashierName: string; bills: number }[]>`)
- Modify: `sales-report.drizzle.repository.ts` (`period_sales` adds `s.cashier_id = …` and `s.member_id is [not] null`; `cashiers` groups completed and voided sales by `cashier_id`, taking the name from the latest bill)
- Create: `server/src/modules/sales/applications/usecases/list-report-cashiers.usecase.ts` (`ListReportCashiersUseCase`)
- Modify: `sales-report.controller.ts` (`GET /cashiers` → `page(...)`, with `total` = number of rows; the HTTP `query` gains both fields on every report route)
- Test: `server/src/__tests__/integration/sales-reports.integration.test.ts` (extend the existing file if there is one, else create it)

**Interfaces:**
- Produces: `GET /api/v1/sales/reports/cashiers?from&to` → `{ items: { cashierId, cashierName, bills }[], total }`. Every report route accepts `cashierId` and `customer`.

- [ ] **Step 1:** Integration tests: two bills by cashier A (one with a member) and one by cashier B. The overview with `cashierId=A` has `saleCount` 2. With `customer=member` it has 1, and with `customer=guest` it has 2. `/cashiers` lists A with 2 bills and B with 1.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and `openapi:check`. Record after telling the owner.
- [ ] **Step 5:** Commit `feat(sales): filter reports by cashier and by member or guest`.

### Task 7: Product profit report

**Files:**
- Modify: port `sales-report.repository.ts`: add `ReportItem { productId; productName; sku; packSize; quantity; pieces; netSalesSatang; vatSatang; costSatang; profitSatang }` and `items(query: ReportPageQuery & { categoryId?: number | null; sort: ReportItemSort }): Promise<Page<ReportItem>>`, with `type ReportItemSort = 'quantity' | 'sales' | 'profit' | 'margin'`
- Modify: `sales-report.drizzle.repository.ts` (`items`: completed sales only, grouped by `product_id, pack_size`. `netSalesSatang = sum(allocated_total - allocated_vat)`, `costSatang = sum(unit_cost * quantity)`, `pieces = sum(quantity * pack_size)`. `categoryId` filters on `coalesce(i.category_id, p.category_id)`, where `null` means no category. Sort descending by the chosen key, then by `productId`; `margin` = profit / netSales, with netSales 0 sorted last)
- Create: `list-report-items.usecase.ts` (`ListReportItemsUseCase`; `sort` default `'quantity'`; `categoryId` accepts a number or the string `'none'` → `null`)
- Modify: controller (`GET /items`) and HTTP schemas
- Test: integration file from Task 6

The old `/products` route stays unchanged for existing clients.

**Interfaces:**
- Produces: `GET /api/v1/sales/reports/items?from&to&cashierId&customer&categoryId&sort&limit&offset` → `page(ReportItem)`.

- [ ] **Step 1:** Integration tests: one bill with a 10% discount, selling product X (one piece) and product X (a pack of 12). Two rows come back, with `packSize` 1 and 12. The sum of `netSalesSatang` over all rows equals the overview's `netSalesSatang`. `sort=profit` orders by profit. A bill whose lines were backfilled (Task 4) also matches the overview.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Reading `products.category_id` in SQL is allowed here, because the fallback applies only to rows saved before Task 3 and the column is part of the sale's own product reference. Leave a comment saying why.
- [ ] **Step 4:** Run the tests and `openapi:check`. Record after telling the owner.
- [ ] **Step 5:** Commit `feat(sales): report profit per product and pack size`.

### Task 8: Category report

**Files:**
- Create: `server/src/modules/sales/applications/ports/report-category-names.port.ts` (`IReportCategoryNames { namesFor(ids: readonly number[]): Promise<Map<number, string>> }`, `reportCategoryNamesToken`)
- Create: `server/src/modules/categories/adapters/report-category-names.adapter.ts` (bound in `categories.module.ts`)
- Modify: port `sales-report.repository.ts`: `categories(query: ReportPageQuery): Promise<Page<ReportCategorySums>>`, where `ReportCategorySums { categoryId: number | null; quantity; netSalesSatang; vatSatang; costSatang }`
- Modify: drizzle repository (group completed lines by `coalesce(i.category_id, p.category_id)`; order by netSales descending, then categoryId with nulls last)
- Create: `list-report-categories.usecase.ts` (adds `name` from the port, or `null` when missing or deleted, plus `profitSatang` and `shareBp` = netSales × 10000 / overview netSales, rounded down)
- Modify: controller (`GET /categories`), HTTP schemas, `mocks.ts`
- Test: `sales-report.usecases.test.ts` (unit, naming and share) and the integration file (grouping)

**Interfaces:**
- Produces: `GET /api/v1/sales/reports/categories` → `page({ categoryId: number | null; name: string | null; quantity; netSalesSatang; vatSatang; costSatang; profitSatang; shareBp })`. The web shows `name === null` as "No category".

- [ ] **Step 1:** Unit: given repository rows for categories 1, 2 and `null`, and names `{1: 'เครื่องดื่ม'}`, the result names category 1, gives category 2 `name: null` (deleted), and computes `shareBp` against the sum. Integration: a product with no category and a product in a deleted category both appear, and the sum of netSales equals the overview.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them, `bun run test:unit`, the import check and `openapi:check`. Record after telling the owner.
- [ ] **Step 5:** Commit `feat(sales): report sales and profit per category`.

### Task 9: Web filters, comparison and tabs

**Files:**
- Modify: `src/features/reports/lib/date-range.ts` (`ReportFilters` gains `cashierId?: number`, `customer?: 'member' | 'guest'`, `compare: boolean`)
- Create: `src/features/reports/lib/report-search-params.ts` (`readReportSearch(params: URLSearchParams): ReportFilters & { tab: ReportTab; categoryId?: number | 'none'; sort: ReportItemSort }` and `writeReportSearch(...)`, where `ReportTab = 'overview' | 'items' | 'categories' | 'promotions'`. Invalid values fall back to the defaults: this month, overview, sort by quantity)
- Test: `src/features/reports/lib/report-search-params.test.ts`
- Modify: `src/features/reports/api.ts` (queries for `items`, `categories`, `cashiers`, built from the existing `key()` factory)
- Modify: `ReportFilters.tsx` (cashier and member/guest selects, compare switch), `ReportsPage.tsx` (tabs from the URL; the summary shows `percentChange` from `@pos/api/reports` as ▲/▼ text with the previous value, and a dash when `null`)
- Create: `components/ItemsReport.tsx` (DataTable: product [primary], pack, quantity, net sales [secondary], cost [wide-only], profit, margin [wide-only]; sortable headers write `sort` to the URL; a category select), `components/CategoriesReport.tsx` (DataTable: name [primary], net sales [secondary], profit, margin, share [wide-only])
- Modify: `locales.ts` (both languages; plain wording, no middle dot)

**Interfaces:**
- Consumes: routes from Tasks 5–8, and `percentChange` from `@pos/api/reports`.

- [ ] **Step 1:** Tests for `readReportSearch` and `writeReportSearch`: a round trip keeps every field. `tab=bogus` gives `overview`. `cashierId=abc` drops the field. `categoryId=none` keeps `'none'`. `compare=1` gives `true`.
- [ ] **Step 2:** Run `bun test src/features/reports/lib/report-search-params.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the lib, then the components. Up/down colour always comes with ▲/▼ and the number (DESIGN.md: never colour alone).
- [ ] **Step 4:** Run `bun run typecheck`, `bun run lint` and `bun run test:web`. Expected: PASS. Add `/reports?tab=items` and `/reports?tab=categories` to the e2e overflow page list.
- [ ] **Step 5:** Commit `feat(reports): add filters, comparison and the product and category tabs`.

### Task 10: Full verification

- [ ] **Step 1:** Run `bun run typecheck`, `bun run test` (needs the database, so ask the owner first), `bun run openapi:check` and `bun run e2e`.
- [ ] **Step 2:** Run `bun run screenshots` and look at `/reports` at 390, 768 and 1366px, in light and dark themes.
- [ ] **Step 3:** Push `ohmattpon/detailed-reports` and report the branch and the last commit.
