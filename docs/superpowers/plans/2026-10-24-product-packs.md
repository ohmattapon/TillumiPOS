# Product Packs (ขาย+รับเป็นลัง/แพ็ค) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สินค้าขายเป็นแพ็ค/ลังได้ (บาร์โค้ดลัง ราคาลัง ตัดสต็อกเป็นชิ้น) และรับเข้าเป็นลังได้ (แปลงเป็นชิ้นตอนบันทึก) โดยเขียนใหม่บน main ปัจจุบัน ใช้ branch เก่าเป็นต้นแบบเท่านั้น

**Estimated tasks:** 9 | **Estimated time:** ~6-10 h | **Touches:** DB / API / Frontend

## Current Problem / Current Solution

บน main ปัจจุบันไม่มี pack/case support เลย: รับของกรอกได้แค่จำนวนชิ้น (`StockDialog` label "จำนวนที่รับเข้า (ชิ้น)", `normalizeReceiptItems` ตรวจ integer ล้วน), ขายมีราคาปลีกเดียว × จำนวนชิ้น (`SaleEntity.complete()` ใช้ `product.priceSatang`, `CartLine` ไม่มี unit, `findByBarcode` เจอบาร์โค้ดเดียว) วิธีเดียววันนี้คือตั้ง "ลัง" เป็นสินค้าแยก SKU ซึ่งสต็อกไม่ผูกกัน

branch เก่า `origin/ohmattpon/product-pack-barcodes` เคยทำฝั่งขายไว้ครบแล้ว (~90 ไฟล์: ตาราง `product_packs`, domain `product-pack.ts`, checkout ขายแพ็ค, quote ปักแพ็ค, POS สแกนแพ็ค, ใบเสร็จ, ฟอร์มแก้แพ็ค) แต่ base เก่าตั้งแต่ยุค PR #35 และ**ไม่มีฝั่งรับเข้า**

## Proposed Approach

เขียนใหม่บน main ปัจจุบัน (ไม่ rebase/merge branch เก่า) โดยยึดดีไซน์เดิมเป็นต้นแบบ: ตาราง `product_packs` + `sale_items.pack_id/pack_size`, domain ตารางราคาแพ็ค, checkout แปลงแพ็ค→ชิ้นตอนตัดสต็อก, quote ปักแพ็ค, POS สแกนบาร์โค้ดลัง, ฟอร์มสินค้าแก้แพ็ค — แล้ว**เติมฝั่งรับเข้า**: schema รับเดี่ยว/รับ batch รับ `packId` ได้ แปลง `caseQty × pack.size` เป็นชิ้นตอนบันทึก พร้อมหมายเหตุข้อความว่า "รับ N ลัง" (ledger/movement ยังเป็นชิ้นล้วน ไม่แก้ตาราง)

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| สแกนบาร์โค้ดลังที่หน้า POS | หาสินค้าไม่เจอ | ลงตะกร้าเป็นแพ็ค ราคาแพ็ค ตัดสต็อก Nx ชิ้น |
| รับของ 2 ลัง × 12 ขวด | ต้องคูณเองกรอก 24 | กรอก 2 ลัง ระบบบันทึก +24 ชิ้น + หมายเหตุ |
| ใบเสร็จขายแพ็ค | ไม่มี | โชว์ชื่อสินค้า (แพ็ค 12) |
| โปรโมชันเปลี่ยนราคาแล้วขายด้วย quote เก่า | — | แพ็คขายราคาที่ปักไว้ (pinned) |

## Assumptions & Risks

- **Assumed:** ดีไซน์เก่า (`product_packs`: barcode unique, size 2–9999, price nullable = null หมายถึง size×ราคาปลีก, สูงสุด 10 แพ็ค/สินค้า) ยังตรงความต้องการร้าน —เจ้าของยืนยันแล้วใน grill
- **Assumed:** migration number `0020_product_packs.sql` ของเก่าชนกับ main ปัจจุบัน → T1 ต้อง list `drizzle/` แล้วใช้เลขถัดไป
- **Risk:** main มีคอลัมน์/กฎใหม่ที่ของเก่าไม่รู้จัก (`products.productType`, `legacy-money-policy` ปิด V1 ใน shifts mode, shared ports, import-check) —งานเขียนใหม่ต้องผ่าน `bun run typecheck` + import-check ก่อนจบทุก task
- **Risk:** `sale_items` ปัจจุบันอาจมีคอลัมน์เพิ่มจากของเก่า —T1 ต้องอ่าน `schema/sales.ts` จริงก่อนเขียน migration
- **Risk:** OpenAPI baseline เปลี่ยน (additive เท่านั้น) —ห้าม re-record เอง ต้องขอ owner ก่อน (`bun run openapi:check` จะแดงจนกว่า owner จะอนุมัติ)

## Impact

- ตารางใหม่ `product_packs` + คอลัมน์ใหม่บน `sale_items` (additive, nullable + default)
- API v1 เพิ่มฟิลด์ optional (`packId`, รับเข้า `packId`) —ไม่ breaking
- หน้า POS/สินค้า/รับของมีตัวเลือกหน่วยเพิ่ม
- สต็อกยังเป็นหน่วยชิ้นเดียว ไม่มี double-counting (ขายแพ็ค×size, void คืน×size)

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Spawn separate sub-agents for independent lanes. Do not parallelize tasks that can race on the same files, migrations, generated artifacts, or shared state.

1. **DB migration + schema** - Lane A | Can run together: none (first) | Must wait for: none | TDD slice: migration up/down on scratch DB -> drizzle schema matches -> `bun run db:migrate`
2. **Domain rules + @pos/api/packs** - Lane A | Can run together: T3 | Must wait for: T1 (table shape) | TDD slice: pack validation/pricing tests -> pure functions -> unit test
3. **Product API CRUD + barcode lookup** - Lane B | Can run together: T2 | Must wait for: T1 | TDD slice: repo tests (pack join, barcode match, BARCODE_TAKEN, PACK_IN_USE) -> repository -> integration test
4. **Checkout sell packs + void** - Lane A | Can run together: T5, T6 | Must wait for: T2, T3 | TDD slice: usecase tests (demand×size, pinned price, PACK_WITH_OPTIONS, no packs on orders) -> sale-checkout -> unit test
5. **Quotes pin packs** - Lane A | Can run together: T4, T6 | Must wait for: T2 | TDD slice: quote tests (pin survives disable/delete) -> create-quote -> unit test
6. **Receiving by case (server)** - Lane B | Can run together: T4, T5 | Must wait for: T2 (pack size lookup) | TDD slice: schema+normalize tests (caseQty×size, note text) -> usecases -> unit test
7. **Web POS + product form + receipt** - Lane C | Can run together: T8 | Must wait for: T4 (API shape) | TDD slice: scan/cart pure-function tests -> components -> `bun run test:web`
8. **Web receiving UI** - Lane C | Can run together: T7 | Must wait for: T6 (API shape) | TDD slice: quantity-lib tests -> dialogs -> `bun run test:web`
9. **Contract + full suite + import check** - Sequential | Can run together: none | Must wait for: T1-T8 | TDD slice: docs-only exception -> `openapi:check` diff review + full `bun run test` + `typecheck` (baseline re-record needs owner approval)

### Task 1: DB migration + schema

**Files:**

- Create: `drizzle/<next>_product_packs.sql` (list `drizzle/` ก่อน ห้ามใช้ 0020 ซ้ำ)
- Modify: `server/src/infrastructure/database/schema/products.ts`, `server/src/infrastructure/database/schema/sales.ts`
- Test: scratch DB migrate up/down

**Parallelization:**

- Can run with: `none`
- Must wait for: `none`
- Race risk: migration numbering —งานอื่นห้ามแตะ `drizzle/` พร้อมกัน

Reference (read-only, ห้าม copy-paste ทั้งดุ้น): `git show origin/ohmattpon/product-pack-barcodes:drizzle/0020_product_packs.sql` —ตาราง `product_packs(id, product_id FK, barcode unique, size CHECK 2..9999, price_satang nullable CHECK >=0, is_active, timestamps)`, `sale_items` เพิ่ม `pack_id FK (no cascade) + pack_size DEFAULT 1 CHECK >=1`, index `product_id`

- [ ] **Step 0: Load the TDD discipline** —migration เป็น config-only exception ได้ แต่ต้อง verify ด้วย migrate จริง
- [ ] **Step 1: อ่านไฟล์จริงก่อน** —`schema/sales.ts` ปัจจุบัน (อาจมีคอลัมน์ใหม่กว่าของเก่า), list `drizzle/` หาเลขถัดไป
- [ ] **Step 2: เขียน migration + schema** —คง constraints เดิมทั้งหมด (barcode unique ข้ามทั้ง products+packs ผ่าน advisory lock ใน T3)
- [ ] **Step 3: Verify** —`bun run db:migrate` ผ่านบน scratch DB + rollback ได้

### Task 2: Domain rules + @pos/api/packs

**Files:**

- Create: `server/src/domains/product-pack.ts`, `server/src/domains/product-pack.test.ts`
- Modify: `server/src/domains/product.domain.ts` (props.packs, findPack, packForSale), export map `@pos/api/packs` (vite.config.ts + tsconfig.json + tsconfig.app.json ต้องตรงกัน 3 ที่)
- Test: `server/src/domains/product-pack.test.ts`

**Parallelization:**

- Can run with: `Task 3`
- Must wait for: `Task 1` (table shape)
- Race risk: `product.domain.ts` —T3 อ่านอย่างเดียวตอนนี้ ห้ามแก้พร้อมกัน (T3 แก้ repository ของมันเอง)

Reference: `git show origin/ohmattpon/product-pack-barcodes:server/src/domains/product-pack.ts` —`assertValidPack` (barcode 1–64, size int 2–9999, price null|0..MAX → `INVALID_PRODUCT`), `PACK_WITH_OPTIONS`, `packUnitPriceSatang` (null = size×ราคาปลีก), `packUnitCostSatang`, `MAX_PACKS_PER_PRODUCT=10`, `packForSale` (`PACK_NOT_FOUND{packId}`/`PACK_INACTIVE{barcode}`)

- [ ] **Step 0: Load the TDD discipline** —Use `superpowers:test-driven-development`
- [ ] **Step 1: Write the failing test** —validation ทุกกฎ + pricing (null price, cost overflow `AMOUNT_TOO_LARGE`)
- [ ] **Step 2: Run** —`bun test server/src/domains/product-pack.test.ts` (cwd `server/`) expect FAIL
- [ ] **Step 3: Implement** —pure functions เท่านั้น ห้าม import นอก `domains/`
- [ ] **Step 4: Run** —PASS
- [ ] **Step 5: Refactor + verify** —`bun run typecheck` สะอาด

### Task 3: Product API CRUD + barcode lookup

**Files:**

- Modify: `server/src/modules/products/adapters/repository/product.drizzle.repository.ts` (join packs 1 query เสริม, `code` match แพ็คบาร์โค้ด, diff by id, advisory-lock barcode, FK-violation → `PACK_IN_USE{barcode}`), usecase create/update product, `product-schemas.ts`
- Test: `server/src/__tests__/integration/products-packs.integration.test.ts` (ใหม่)

**Parallelization:**

- Can run with: `Task 2`
- Must wait for: `Task 1`
- Race risk: `product.domain.ts` เขียนโดย T2 —T3 ห้ามแก้ไฟล์นั้น (ใช้ `findPack/packForSale` ที่ T2 เตรียมไว้)

Reference: old branch `product.drizzle.repository.ts` —reads join packs (no N+1), `findAll({code})` ลำดับ product-barcode → active-pack → SKU, create/update diff (0=insert, หาย=delete, FK ต่างตัว=`PACK_NOT_FOUND`)

- [ ] **Step 0-5: TDD** —RED: insert pack + scan lookup + `BARCODE_TAKEN` (ชนบาร์โค้ดสินค้า/แพ็คอื่น) + `PACK_IN_USE` (ลบแพ็คที่เคยขาย) → GREEN → verify `bun test` ไฟล์นี้ (ต้องมี DB)

### Task 4: Checkout sell packs + void

**Files:**

- Modify: `server/src/modules/sales/applications/ports/sale-checkout.port.ts` (`CheckoutLine.packId?`), `server/src/modules/sales/applications/services/sale-checkout.ts` (merge key + demand×size + ledger −qty×size), `server/src/domains/sale.domain.ts` (`SaleItem.packId/packSize`, pack branch price/cost), sale zod+Elysia schemas, `sale.drizzle.repository.ts`, `void-sale.usecase.ts` (+qty×size), `add-order-item` คงเดิม (no packs on orders —ห้ามแตะ)
- Test: `server/src/modules/sales/...` usecase tests + mocks

**Parallelization:**

- Can run with: `Task 5`, `Task 6`
- Must wait for: `Task 2`, `Task 3`
- Race risk: `sale-checkout.ts` —T5 (quote path) แก้คนละ hunk ได้ แต่ห้าม commit พร้อมกันโดยไม่ rebase; คุยกันก่อนแตะไฟล์นี้

Reference: old `sale-checkout.ts` L98–192 —`lineMergeKey(productId,optionIds,packId)`, `pinnedPack`, `packForSale`, demand `Σ qty×size`, `packUnitPriceSatang/Cost`, ledger `-(qty×packSize)`; `sale.domain.ts` L229–280 pack branch (options=[])

- [ ] **Step 0-5: TDD** —RED: ขายแพ็ค (stock−=qty×size, ราคาแพ็ค), pack+options → `PACK_WITH_OPTIONS`, void คืนชิ้น, order ห้ามแพ็ค → GREEN → `bun run test:unit`

### Task 5: Quotes pin packs

**Files:**

- Modify: `server/src/domains/price-quote.domain.ts` (`QuoteLine.packId/packSize`, merge key), `server/src/modules/quotes/.../create-quote.usecase.ts` (`priceLines`), `quote.schema.ts`, `quote.presenter.ts`, `orders/.../order-quote-source.ts` (force `packId:null` —คงพฤติกรรม no packs on orders)
- Test: quote usecase tests

**Parallelization:**

- Can run with: `Task 4`, `Task 6`
- Must wait for: `Task 2`
- Race risk: `sale-checkout.ts` quote path —ประสานกับ T4 (ดู race risk T4)

Reference: old `price-quote.domain.ts` + `create-quote.usecase.ts:priceLines` —merge by pack key, `packForSale`, demand ชิ้น, disabled/deleted pack ยังขายราคาปัก (`id:null` ถ้า `findPack` ไม่เจอ)

- [ ] **Step 0-5: TDD** —RED: pin ราคาแพ็ค + รอด disable/delete + demand ชิ้น → GREEN → unit test

### Task 6: Receiving by case (server)

**Files:**

- Modify: `server/src/modules/inventory/applications/schemas/inventory-schemas.ts` (`receiveStockSchema` + `packId?`), `server/src/modules/stock-receipts/applications/schemas/stock-receipt.schemas.ts` (item + `packId?`), `server/src/domains/stock-receipt.domain.ts` (`normalizeReceiptItems` รับ caseQty —ออกแบบ input เป็น `{productId, quantity, packId?}` แล้วคูณด้วย size จาก pack ที่ resolve ได้), `receive-stock.usecase.ts`, `receive-stock-batch.usecase.ts` (resolve pack → baseQty = qty×size, note ต่อท้าย `"รับ N ลัง (pack barcode)"`)
- Test: usecase + domain tests (ใช้ fake ports ใน `src/__tests__/mocks.ts`)

**Parallelization:**

- Can run with: `Task 4`, `Task 5`
- Must wait for: `Task 2` (pack size lookup ผ่าน `packForSale`)
- Race risk: none กับ T4/T5 (คนละ module) —ห้ามแก้ `stock_movements` schema (ledger ยังเป็นชิ้นล้วนตาม grill ข้อ 2)

- [ ] **Step 0-5: TDD** —RED: รับ 2 ลัง×12 → ledger +24 + note มีคำว่าลัง; pack ไม่มี → `PACK_NOT_FOUND`; quantity เกิน INT_MAX หลังคูณ → invalid → GREEN → `bun run test:unit`
- [ ] **Step 6: Import check** —core ห้าม `new Date()/crypto/process.env` (ใช้ port ที่มีอยู่); สั่งตรวจก่อนจบ task

### Task 7: Web POS + product form + receipt

**Files:**

- Modify: `src/features/pos/lib/scan.ts` (match pack barcode), `ProductPicker.tsx` (sellPack + guards: order open → toast, stock < size → outOfStock), `cart.store.ts` (`CartLine.packId`, key), `cart.ts` (priceCart + demand ชิ้น), `use-cart-actions.ts`, `CartPanel.tsx` (`แพ็ค {{size}}`), `customer-display.ts` (packLabel), `ProductFormDialog.tsx` + `lib/packs.ts` (PackRow editor, MAX 10), `Receipt.tsx` + `SaleDetailDialog.tsx` (`(แพ็ค {{size}})`), `sales/locales.ts`, `pos/locales.ts`
- Test: `cart.test.ts` / scan tests ข้างไฟล์

**Parallelization:**

- Can run with: `Task 8`
- Must wait for: `Task 4` (API shape `packId/packSize`)
- Race risk: `en` locale `satisfies typeof th` —เพิ่ม key ต้องใส่ทั้ง 2 ภาษาไม่งั้น typecheck แดง

Reference: old `scan.ts:matchScan` (product → active-pack → SKU), `cartLineKey`, `priceCart` (`packOf`, `demandByProduct`), `toPackRows/toPackInput`, placeholder `packAutoPrice`, ปุ่ม h-11, `role=alert`

- [ ] **Step 0-5: TDD** —RED: pure tests (matchScan ลำดับ, priceCart แพ็ค, key แยกไลน์) → GREEN → `bun run test:web` + `bun run lint`

### Task 8: Web receiving UI

**Files:**

- Modify: `src/features/products/components/StockDialog.tsx` (ตัวเลือกหน่วย ชิ้น/แพ็ค + preview รวมชิ้น auto), `src/features/stock-receipts/components/StockReceiptDraftPage.tsx` + `ReceiptQuantityInput.tsx` (คอลัมน์หน่วยต่อแถว), `products/locales.ts`, `stock-receipts/locales.ts`
- Test: quantity-lib tests ข้างไฟล์

**Parallelization:**

- Can run with: `Task 7`
- Must wait for: `Task 6` (API shape `packId`)
- Race risk: none กับ T7 (คนละ feature) —ห้าม import ข้าม feature นอกจาก `@/features/<name>` index

- [ ] **Step 0-5: TDD** —RED: เลือกแพ็คแล้ว preview = qty×size, ส่ง `packId` ใน payload → GREEN → `bun run test:web`
- [ ] **Step 6: จอ 3 ขนาด** —ตรวจ 390/768/1366 ไม่ overflow (ดู `DESIGN.md`); ปุ่ม/input สูงตามแถวของจอนั้น

### Task 9: Contract + full suite + import check (docs-only exception)

ไม่เขียน behavior test —verify ด้วยคำสั่งและรีวิว diff

- [ ] `bun run openapi:check` —diff ต้อง additive เท่านั้น (`packId/packSize` optional, route ใหม่ไม่มี) ถ้ามี breaking → หยุดแล้วถาม owner
- [ ] Import check (test files excluded) ต้องเงียบเกิน fix list —สั่งตาม `AGENTS.md` ส่วน Hexagonal rules
- [ ] `bun run typecheck` + `bun run test` (ต้องมี DB) + `bun run lint` เขียวทั้งหมด
- [ ] ห้าม re-record `openapi-baseline.json` เอง —ขอ owner อนุมัติก่อน (กฎ repo)
- [ ] ห้าม commit/push ในทุก task ของแผนนี้ (owner เปิด PR/merge เอง)
