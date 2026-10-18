# โปรเฉพาะสินค้าและหมวด (product/category-scoped promotions)

## Goal

โปรโมชันเลือกได้ว่าใช้กับสินค้า/หมวดใด (Q1) โดยไม่ซ้อนส่วนลดกับโปรทั้งบิล (Q2):
scoped promo เป็นแค่ผู้เข้าชิงอีกตัว ระบบยังเลือกส่วนลดมากสุดเจ้าเดียวเหมือนเดิม

## Locked decisions (grill 2026-10-18)

Branch สำหรับลงมือ: แตกใหม่จาก `main` เป็น `ohmattpon/promotion-product-scope` (ยังไม่มีบน remote)

- Q1 A — หนึ่งโปรระบุได้ทั้งรายการสินค้าและหมวดหมู่
- Q2 A — ไม่ซ้อนกัน ใช้กฎ "ตัวที่ลดมากสุดชนะ" เดิม ไม่แก้โครง `calculateTotals`
- Q3 A — ส่วนลดคิดจากยอดของบรรทัดที่เข้าเกณฑ์เท่านั้น
- Q4 A — ฟอร์มโปรมีช่องค้นหา + ติ๊กเลือกสินค้า/หมวด (dropdown ธรรมดาใช้ไม่ได้เพราะสินค้า 150+ รายการ)
- Q5 A — โปรเดิม (scope ว่าง) = ทั้งบิลเหมือนเดิม ไม่ต้อง migrate ความหมายข้อมูล

## Approach

1. `PromotionRules` เพิ่ม `scope: { productIds: number[]; categoryIds: number[] } | null`
   (null/ว่าง = ทั้งบิล ตาม Q5) — interface นี้ server กับ web ใช้ร่วมกัน
2. `PromotionContext` เพิ่ม `lines: readonly { productId: number; categoryId: number | null; lineTotalSatang: number }[]`
3. `evaluatePromotion`: ถ้ามี scope แต่ไม่มีบรรทัดใดเข้าเกณฑ์ → ไม่เข้าเกณฑ์;
   ฐานส่วนลด = ยอดรวมบรรทัดที่เข้าเกณฑ์ (fixed: `min(value, ฐาน)`, percent: `round(ฐาน*value/10000)` + เพดานเดิม);
   เกณฑ์ `minSubtotalSatang` ยังเทียบยอดทั้งบิลเหมือนเดิม (พฤติกรรมเดิม, เข้ากันได้กับ Q5)
4. จุดประเมินมีแค่ 2 ที่และใช้ฟังก์ชันเดียวกัน: server `create-quote.usecase.ts`,
   web `use-best-promotion.ts` — ทั้งคู่มี cart lines อยู่แล้ว แค่ส่งเพิ่มพร้อม categoryId
5. categoryId ของบรรทัด: ถามผ่าน port ของ quotes เองทางเดียวทั้ง quote จากตะกร้าและจากออเดอร์
   (`IQuoteProducts.categoriesOf`, ดู Task 4) — ไม่ดึงจาก `ProductEntity` ที่ได้ผ่าน products repository
   เพราะ import นั้นอยู่ใน fix list ของ AGENTS.md; web หา categoryId จากข้อมูลสินค้าที่มีอยู่แล้ว
6. `create-quote.usecase.ts` อยู่ใน fix list (import port ของ products, members, settings, modifiers)
   และ AGENTS.md บังคับว่าแก้ไฟล์ใน fix list ต้องแก้จุดผิดกฎใน commit แยกก่อน → Task 4a ทำก่อน Task 4
7. DB: migration 0031 เพิ่ม `product_ids integer[]` + `category_ids integer[]` (nullable;
   null/ว่าง = ทั้งบิล) ไม่ใช้ FK (array FK ไม่ถนัด; ตรวจแค่จำนวนเต็มบวกใน entity)

## Assumptions

- `ProductEntity` มี `categoryId` (ตรวจแล้วบน `main`) — adapter ฝั่ง products ใช้ค่านี้ตอบ `categoriesOf`
- Quote จาก order (`order.items`) ไม่มี categoryId → ทั้งสองทางใช้ port ข้อ 5 เหมือนกัน
- `minSubtotalSatang` เทียบยอดทั้งบิล (ไม่ใช่ยอดส่วนที่เข้าเกณฑ์) — ถ้า owner อยากให้เทียบยอดส่วนที่เข้าเกณฑ์
  ต้องกลับมา grill ใหม่ เพราะกระทบโปรเดิม
- ชื่อ scope ใน API response เป็น additive; ต้องแจ้ง owner ก่อน record baseline ใหม่ (กฎ repo)

## Risks

- `evaluatePromotion` เป็นโค้ดแชร์ server/web (`@pos/api/promotions`) — เปลี่ยน signature `PromotionContext`
  ต้องแก้ผู้เรียกทั้ง 2 ที่พร้อมกัน ห้ามแก้ทีละข้าง
- `ProductPicker` ของ `pos` ใช้ไม่ได้: `pos` import `promotions` อยู่แล้ว ถ้า `promotions` import `pos` จะเป็นวง
  (AGENTS.md ห้าม) และมันเป็นตารางกดขาย ไม่ใช่ checklist → ใช้ pattern ของหน้าใบรับสินค้าเข้าแทน
  (`productsQuery({ q, limit: 20 })` จาก `@/features/products` + `useDebouncedValue` จาก `src/hooks/`),
  หมวดใช้ `categoriesQuery` จาก `@/features/categories` (ทั้งสอง feature ไม่ import `promotions` จึงไม่เป็นวง)
- `product_ids` / `category_ids` ไม่มี FK: สินค้าหรือหมวดที่ถูกปิดหรือหาไม่เจอจะยังอยู่ในโปร →
  ฟอร์มต้องแสดงรายการนั้นพร้อมป้ายบอกและปุ่มเอาออก ห้ามซ่อนเงียบ
- Import rules ใหม่เข้ม: consumer-owned ports, ห้าม import ข้าม module; รัน check commands ใน AGENTS.md
  ก่อน commit ทุกครั้ง
- `when` ของ migration ใหม่ต้องมากกว่า 1792328900004 (monotonic; บทเรียน clock-skew เดิม)

## Impact

- API: response promotion มีฟิลด์ scope เพิ่ม (additive); request create/update รับ scope ได้
- OpenAPI baseline ต้อง record ใหม่ (แจ้ง owner ก่อน)
- Web: ฟอร์มโปรมี picker เพิ่ม; การ์ด/ติ๊กสิทธิ์ไม่เกี่ยว
- Migration 0031 additive-only (คอลัมน์ nullable ใหม่ 2 ตัว)

## Task overview (parallel-first)

| # | Task | Can run together | Must wait for | TDD slice |
|---|------|------------------|---------------|-----------|
| 1 | Domain: scope + eligible-base + context.lines + tests | 2, 3 | — | yes (pure) |
| 2 | Migration 0031 + drizzle schema + repository + snapshot | 1, 3 | — | migration + focused repo tests |
| 3 | CRUD plumbing: zod + Elysia schemas + create/update usecases + tests | 1, 2 | — | yes |
| 4a | ย้าย create-quote ออกจาก port ข้ามโมดูล (fix list) เป็น consumer-owned ports 4 ตัว | 1, 2, 3, 5 | — | refactor (tests เดิมต้องผ่าน) |
| 4 | Quote-side: `categoriesOf` + create-quote ส่ง lines + integration | — | 1 (context shape), 4a | yes |
| 5 | Web: picker + use-best-promotion lines + locales + lib tests | — | 1 (shared types) | yes (lib first) |
| 6 | OpenAPI re-record + full verify | — | 2–5 | verify only |

Task 1–3 แตะไฟล์คนละชุดในโดเมนเดียวกันได้พร้อมกัน (contract คือ shape ที่ล็อกในแผนนี้);
Task 4a/4 แตะ quotes กับ adapters ของ products, members, settings, modifiers; Task 5 แตะ web เท่านั้น

## Task 1 — Domain scope + eligible-base evaluation

REQUIRED SUB-SKILL: Use mattpocock-skills:tdd

- RED: test ใน `server/src/domains/promotion.domain.test.ts` —
  scoped fixed/percent (ลดเฉพาะยอดบรรทัดที่เข้าเกณฑ์), scope ไม่ตรงบรรทัดใดเลย → ไม่เข้าเกณฑ์,
  scope ว่าง/null → เท่ายอดทั้งบิล (Q5, พฤติกรรมเดิมทุก case), tie-break id น้อยคงเดิม
- GREEN: `promotion.domain.ts` —
  `PromotionRules` + `scope`, `PromotionContext` + `lines`,
  `evaluatePromotion` คำนวณ eligible-base จากบรรทัดที่ `productIds.includes(productId) ||
  categoryIds.includes(categoryId)`; `minSubtotalSatang` เทียบ `subtotalSatang` ทั้งบิลเหมือนเดิม;
  `pickBestPromotion` ไม่เปลี่ยน (ใช้ discount ที่ evaluate คืนมา)
- REFACTOR: helper นับยอด eligible แยกฟังก์ชันถ้ายาว; entity `PromotionEntity` รับ/ตรวจ scope
  (array ของ int บวก, dedupe + sort แบบ weekdays; ว่าง = null)

Files: `server/src/domains/promotion.domain.ts`, `server/src/domains/promotion.domain.test.ts`
Race risk: ไม่มี (ไฟล์ของ task นี้เท่านั้น; shape ที่ได้คือ contract ให้ Task 3–5)
Verify: `bun test src/domains/promotion.domain.test.ts` (รันจาก `server/`)

## Task 2 — Migration 0031 + schema + repository

REQUIRED SUB-SKILL: Use mattpocock-skills:tdd

- แก้ `server/src/infrastructure/database/schema/promotions.ts`: `productIds: integer().array()`,
  `categoryIds: integer().array()` (nullable, คู่กับ entity: null = ทั้งบิล)
- `bun run db:generate` → ได้ `drizzle/0031_*.sql` + snapshot; ตรวจ `when` ใน `_journal.json`
  มากกว่า 1792328900004 (แก้ด้วยมือถ้า generate เขียนย้อนแบบ clock-skew เดิม)
- `bun run db:migrate` (dev) ต้องผ่าน
- Repository (`promotion.drizzle.repository.ts`) + snapshot (`promotion.snapshot.ts`):
  อ่าน/เขียน scope columns; test ระดับ repo ถ้ามี pattern เดิม (ดู test ของ promotions/usecases ประกอบ)

Files: `drizzle/0031_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0031_snapshot.json`,
`server/src/infrastructure/database/schema/promotions.ts`,
`server/src/modules/promotions/adapters/repository/promotion.drizzle.repository.ts`,
`server/src/modules/promotions/adapters/promotion.snapshot.ts`
Race risk: ชน Task 3 ถ้าแก้ไฟล์ repository เดียวกัน — Task 3 ห้ามแตะ 2 ไฟล์นี้
Verify: `bun run db:migrate`; focused promotion tests; JSON ของ snapshot ถูก parse ได้

## Task 3 — CRUD plumbing (schemas + usecases)

REQUIRED SUB-SKILL: Use mattpocock-skills:tdd

- RED: `promotion.usecases.test.ts` — create/update พร้อม scope (products+categories),
  scope มี id ติดลบ/ไม่ใช่ int → `INVALID_PROMOTION`, scope ว่าง → เก็บ null
- GREEN: `promotion-schemas.ts` (zod: `scope: z.object({ productIds: z.array(z.number().int().positive()).max(...), categoryIds: ... }).nullable().optional()`),
  Elysia `promotion.schema.ts` (request/response + ฟิลด์ scope),
  `create-promotion.usecase.ts` / `update-promotion.usecase.ts` ส่ง scope ผ่าน entity
  (validation ธุรกิจอยู่ใน entity อย่างเดียว ไม่ใส่ใน route schema)
- Controller ถ้า generic อยู่แล้วไม่ต้องแตะ (ตรวจก่อน)

Files: `server/src/modules/promotions/applications/schemas/promotion-schemas.ts`,
`adapters/controllers/schemas/promotion.schema.ts`,
`applications/usecases/create-promotion.usecase.ts`, `update-promotion.usecase.ts`,
`promotion.usecases.test.ts` (ห้ามแตะ repository/snapshot — ของ Task 2)
Race risk: ห้ามชน Task 2 (ไฟล์แยกกันตามรายการข้างบน)
Verify: `bun test src/modules/promotions` (จาก `server/`)

## Task 4a — create-quote ใช้ port ของ quotes เอง (แก้ fix list)

ทำก่อน Task 4 ใน commit แยก (`refactor(quotes)`) ตามกฎ fix list ของ AGENTS.md: ไม่เปลี่ยนพฤติกรรม

- ตอนนี้ `create-quote.usecase.ts` ใช้จากโมดูลอื่นแค่: `IProductRepository.findById(productId, branchId)`,
  `IMemberRepository.findById(id)`, `IShopSettingsRepository.get()` (ใช้แค่ `timeZone`, `vatMode`, `vatRateBp`)
  และ `ILineOptionsResolver.resolve(productId, optionIds)`
- ประกาศ port แคบ ๆ ใน `quotes/applications/ports/` (ไฟล์ละ port + token ข้างกัน):
  - `quote-products.port.ts` — `IQuoteProducts.findForQuote(productId, branchId): Promise<ProductEntity | null>`
  - `quote-members.port.ts` — `IQuoteMembers.findById(id): Promise<MemberEntity | null>`
  - `quote-shop-rules.port.ts` — `IQuoteShopRules.current(): Promise<{ timeZone; vatMode; vatRateBp }>`
  - `quote-line-options.port.ts` — `IQuoteLineOptions.resolve(productId, optionIds)` คืน shape เดิมของ resolver
- adapter อยู่ในโมดูลผู้ให้ และ bind ใน `<module>.module.ts` ของผู้ให้:
  `products/adapters/quote-products.adapter.ts`, `members/adapters/quote-members.adapter.ts`,
  `settings/adapters/quote-shop-rules.adapter.ts`, `modifiers/adapters/quote-line-options.adapter.ts`
  (adapter เรียก repository/resolver ของโมดูลตัวเอง)
- `quote.usecases.test.ts`: เปลี่ยนแค่การต่อ mock เข้ากับ token ใหม่ ห้ามแก้ assertion เดิม
- Verify: `bun test src/modules/quotes`, quote integration tests, import-check commands ใน AGENTS.md
  ต้องไม่มีบรรทัดของ `quotes/applications/usecases/create-quote.usecase.ts` แล้ว
- Race risk: แตะ `products.module.ts`, `members.module.ts`, `settings.module.ts`, `modifiers.module.ts`
  (เพิ่ม bind บรรทัดเดียว) — Task 1–3, 5 ไม่แตะไฟล์เหล่านี้

## Task 4 — Quote-side category resolution + ส่ง lines

REQUIRED SUB-SKILL: Use mattpocock-skills:tdd

- RED: integration test quote — โปร scoped (เช่น เฉพาะหมวดเครื่องดื่ม) ชนะ/แพ้ตามยอด eligible lines;
  case ไม่มีบรรทัดเข้าเกณฑ์ → fallback โปรทั้งบิลหรือไม่มีโปรตามเดิม; quote จากออเดอร์ได้ผลเดียวกับจากตะกร้า
- GREEN:
  - เพิ่ม `categoriesOf(productIds): Promise<Map<number, number | null>>` ใน `IQuoteProducts` (port จาก Task 4a)
    และใน `products/adapters/quote-products.adapter.ts`
  - `create-quote.usecase.ts` ถาม `categoriesOf` ครั้งเดียวต่อ quote สำหรับทั้งสองทาง (ตะกร้าและออเดอร์)
    แล้วสร้าง context lines `{ productId, categoryId, lineTotalSatang: unitPriceSatang * quantity }`
    ส่งเข้า `pickBestPromotion` (ไม่ดึง categoryId จาก `ProductEntity` ใน `priceLines` เพื่อให้มีทางเดียว)
  - รัน import-check commands ใน AGENTS.md (test files excluded) ต้องว่างเปล่านอกเหนือ fix list
- ห้าม import `products/...` ตรง ๆ จาก quotes (ใช้ port ที่ประกาศเองเท่านั้น)

Files: `server/src/modules/quotes/applications/ports/quote-products.port.ts`,
`server/src/modules/products/adapters/quote-products.adapter.ts`,
`server/src/modules/quotes/applications/usecases/create-quote.usecase.ts` + test/integration ที่เกี่ยว
Race risk: แตะ quotes/products — Task อื่นห้ามแตะ 2 module นี้พร้อมกัน (Task 1–3 ไม่แตะอยู่แล้ว)
Verify: quote integration tests; import-check commands ว่าง; `bun test src/modules/quotes`

## Task 5 — Web picker + use-best-promotion + locales

REQUIRED SUB-SKILL: Use mattpocock-skills:tdd

- RED: test ของ lib ฟอร์ม (`promotion-form.test.ts` มีอยู่แล้ว — ต่อ pattern เดิม):
  แปลง scope form ↔ API (ids เป็นตัวเลข, ว่าง = null), validation ขั้นต่ำ
- GREEN:
  - `PromotionFormDialog.tsx` + `promotion-form.ts`: ช่องค้นหาสินค้าแบบหน้าใบรับสินค้าเข้า
    (`productsQuery({ q: term, limit: 20, offset: 0 })` จาก `@/features/products`, `useDebouncedValue` จาก
    `src/hooks/use-debounced-value.ts`) + ติ๊กเลือก; หมวดติ๊กจาก `categoriesQuery` (`@/features/categories`);
    ว่างไว้ = ทั้งบิล (hint บอกชัด). ห้าม import `@/features/pos` (เป็นวง)
  - สินค้าที่เลือกไว้แสดงเป็นรายการแยกจากผลค้นหา (ชื่อจาก `productQuery(id)`); id ที่หาไม่เจอหรือปิดใช้งาน
    แสดงพร้อมป้ายบอกและปุ่มเอาออก ห้ามตัดทิ้งเงียบ — หมวดที่ปิดแล้วทำแบบเดียวกัน
  - `use-best-promotion.ts`: รับ `lines` เพิ่ม แล้วใส่ context lines `productId/categoryId/lineTotalSatang`
  - `src/features/pos/hooks/use-cart.ts` (ผู้เรียกเดียวของ `useBestPromotion`): ส่ง lines จากตะกร้า
    (categoryId จาก `productsById` ที่ hook นี้โหลดผ่าน `productQuery` อยู่แล้ว ทั้งตะกร้าและออเดอร์ ไม่ต้อง query เพิ่ม)
  - locales th+en (`en satisfies typeof th`): label/hint ของ scope picker
- REFACTOR: แยก checklist เป็น component ย่อยถ้า dialog เกิน ~200 บรรทัด

Files: `src/features/promotions/components/PromotionFormDialog.tsx` (+ component ย่อยของ picker ถ้าแยก),
`src/features/promotions/lib/promotion-form.ts` + test,
`src/features/promotions/hooks/use-best-promotion.ts`, `src/features/promotions/locales.ts`,
`src/features/pos/hooks/use-cart.ts`
Race risk: web-only ไม่ชน server tasks; รอ Task 1 เรื่อง shape ของ scope/context เท่านั้น
Verify: `bun test ./src/features/promotions`; `bun run typecheck`

## Task 6 — OpenAPI re-record + full verify

- แจ้ง owner ก่อน record baseline (กฎ repo: contract เปลี่ยนต้องบอกก่อน)
- Review diff ของ `openapi-v1-current.json` vs baseline: ต้องมีแค่ scope เพิ่มเติม (paths เดิม + ฟิลด์ใหม่)
  และลบอะไรออกไม่ได้ — ถ้ามี diff นอกเหนือ scope ให้หยุดแล้วถาม owner
- Copy current ทับ baseline (v1; v2 ผ่าน write mode ตามพฤติกรรม `openapi-snapshot.ts`), ลบไฟล์ current
- `bun run typecheck`, `bun run lint`, `bun run test` (API+web), `bun run openapi:check`
- `bun run screenshots` ดูฟอร์มโปรที่ 390/768/1366 (picker ไม่ล้นจอ, รายการที่หาไม่เจอแสดงป้าย)
- Import-check commands ใน AGENTS.md ต้องว่างเปล่านอกเหนือ fix list

Race risk: ทำคนเดียวท้ายสุด
Verify: ทุกคำสั่งข้างต้นเขียว
