# โปรเฉพาะสินค้าและหมวด (product/category-scoped promotions)

## Goal

โปรโมชันเลือกได้ว่าใช้กับสินค้า/หมวดใด (Q1) โดยไม่ซ้อนส่วนลดกับโปรทั้งบิล (Q2):
scoped promo เป็นแค่ผู้เข้าชิงอีกตัว ระบบยังเลือกส่วนลดมากสุดเจ้าเดียวเหมือนเดิม

## Locked decisions (grill 2026-10-18, branch `ohmattpon/promotion-product-scope`)

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
5. categoryId ของบรรทัด: quotes ประกาศ consumer-owned port
   (`quotes/applications/ports/product-categories.port.ts`) ให้ products module implement
   + bind ใน `products.module.ts` (กฎ hexagonal ใหม่ใน AGENTS.md); web หา categoryId
   จากข้อมูลสินค้าที่มีอยู่แล้ว
6. DB: migration 0031 เพิ่ม `product_ids integer[]` + `category_ids integer[]` (nullable;
   null/ว่าง = ทั้งบิล) ไม่ใช้ FK (array FK ไม่ถนัด; ตรวจแค่จำนวนเต็มบวกใน entity)

## Assumptions

- `ProductEntity` มี `categoryId` (worker ตรวจตอนทำ Task 4; ถ้าไม่มีให้ดึงจาก category mapping เดิม)
- Quote จาก order (`order.items`) ไม่มี categoryId → ต้องผ่าน port ข้อ 5 เสมอ
- `minSubtotalSatang` เทียบยอดทั้งบิล (ไม่ใช่ยอดส่วนที่เข้าเกณฑ์) — ถ้า owner อยากให้เทียบยอดส่วนที่เข้าเกณฑ์
  ต้องกลับมา grill ใหม่ เพราะกระทบโปรเดิม
- ชื่อ scope ใน API response เป็น additive; ต้องแจ้ง owner ก่อน record baseline ใหม่ (กฎ repo)

## Risks

- `evaluatePromotion` เป็นโค้ดแชร์ server/web (`@pos/api/promotions`) — เปลี่ยน signature `PromotionContext`
  ต้องแก้ผู้เรียกทั้ง 2 ที่พร้อมกัน ห้ามแก้ทีละข้าง
- Checklist สินค้า 150+ รายการต้อง reuse pattern ตัวเลือกสินค้าเดิม (ห้ามเขียน product picker ใหม่)
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
| 4 | Quote-side: consumer port + products adapter + create-quote ส่ง lines + integration | — | 1 (context shape) | yes |
| 5 | Web: picker + use-best-promotion lines + locales + lib tests | — | 1 (shared types) | yes (lib first) |
| 6 | OpenAPI re-record + full verify | — | 2–5 | verify only |

Task 1–3 แตะไฟล์คนละชุดในโดเมนเดียวกันได้พร้อมกัน (contract คือ shape ที่ล็อกในแผนนี้);
Task 4 แตะ quotes/products; Task 5 แตะ web เท่านั้น

## Task 1 — Domain scope + eligible-base evaluation

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

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

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

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

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

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

## Task 4 — Quote-side category resolution + ส่ง lines

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

- RED: integration test quote — โปร scoped (เช่น เฉพาะหมวดเครื่องดื่ม) ชนะ/แพ้ตามยอด eligible lines;
  case ไม่มีบรรทัดเข้าเกณฑ์ → fallback โปรทั้งบิลหรือไม่มีโปรตามเดิม
- GREEN:
  - ประกาศ `IProductCategories` (ชื่อตามกติกา "ตั้งตามสิ่งที่ core ต้องการ ไม่ใช่เทคโนโลยี",
    เช่น `productCategoryMap(productIds): Promise<Map<number, number>>`)
    ใน `quotes/applications/ports/` + token ข้างกัน
  - products module implement เป็น adapter ใน `products/adapters/` + bind ใน `products.module.ts`
    (provider เป็นฝ่าย bind; consumer เป็นเจ้าของ port — ตาม AGENTS.md ใหม่)
  - `create-quote.usecase.ts` สร้าง context lines จาก `lines` ที่มี
    (`{ productId, categoryId, lineTotalSatang: unitPriceSatang * quantity }`;
    categoryId มาจาก priced product ถ้ามี ไม่งั้นถาม port) แล้วส่งเข้า `pickBestPromotion`
  - รัน import-check commands ใน AGENTS.md (test files excluded) ต้องว่างเปล่านอกเหนือ fix list
- ห้าม import `products/...` ตรง ๆ จาก quotes (ใช้ port ที่ประกาศเองเท่านั้น)

Files: `server/src/modules/quotes/applications/ports/product-categories.port.ts` (ใหม่),
`server/src/modules/products/adapters/*` (adapter ใหม่ 1 ไฟล์), `products.module.ts` (bind),
`server/src/modules/quotes/applications/usecases/create-quote.usecase.ts` + test/integration ที่เกี่ยว
Race risk: แตะ quotes/products — Task อื่นห้ามแตะ 2 module นี้พร้อมกัน (Task 1–3 ไม่แตะอยู่แล้ว)
Verify: quote integration tests; import-check commands ว่าง; `bun test src/modules/quotes`

## Task 5 — Web picker + use-best-promotion + locales

REQUIRED SUB-SKILL: Use superpowers:test-driven-development

- RED: test ของ lib ฟอร์ม (`promotion-form.test.ts` มีอยู่แล้ว — ต่อ pattern เดิม):
  แปลง scope form ↔ API (ids เป็นตัวเลข, ว่าง = null), validation ขั้นต่ำ
- GREEN:
  - `PromotionFormDialog.tsx` + `promotion-form.ts`: ช่องค้นหา + ติ๊กเลือกสินค้า (reuse product selector
    pattern เดิมของ repo — ห้ามเขียน picker ใหม่) และติ๊กเลือกหมวด; ว่างไว้ = ทั้งบิล (hint บอกชัด)
  - `use-best-promotion.ts`: context lines ใส่ `productId/categoryId/lineTotalSatang`
    จากข้อมูลตะกร้าที่มีอยู่แล้ว (ไม่มีให้ดึงเพิ่ม — ถ้าตะกร้าไม่มี categoryId ให้ดึงจาก products query ที่หน้านั้นใช้อยู่แล้ว)
  - locales th+en (`en satisfies typeof th`): label/hint ของ scope picker
- REFACTOR: แยก checklist เป็น component ย่อยถ้า dialog เกิน ~200 บรรทัด

Files: `src/features/promotions/components/PromotionFormDialog.tsx`,
`src/features/promotions/lib/promotion-form.ts` + test,
`src/features/promotions/hooks/use-best-promotion.ts`, `src/features/promotions/locales.ts`
Race risk: web-only ไม่ชน server tasks; รอ Task 1 เรื่อง shape ของ scope/context เท่านั้น
Verify: `bun test ./src/features/promotions`; `bun run typecheck`

## Task 6 — OpenAPI re-record + full verify

- แจ้ง owner ก่อน record baseline (กฎ repo: contract เปลี่ยนต้องบอกก่อน)
- Review diff ของ `openapi-v1-current.json` vs baseline: ต้องมีแค่ scope เพิ่มเติม (paths เดิม + ฟิลด์ใหม่)
  และลบอะไรออกไม่ได้ — ถ้ามี diff นอกเหนือ scope ให้หยุดแล้วถาม owner
- Copy current ทับ baseline (v1; v2 ผ่าน write mode ตามพฤติกรรม `openapi-snapshot.ts`), ลบไฟล์ current
- `bun run typecheck`, `bun run lint`, `bun run test` (API+web), `bun run openapi:check`
- `bun run screenshots` ดูฟอร์มโปรที่ 390/768/1366 (picker ไม่ล้นจอ)
- Import-check commands ใน AGENTS.md ต้องว่างเปล่านอกเหนือ fix list

Race risk: ทำคนเดียวท้ายสุด
Verify: ทุกคำสั่งข้างต้นเขียว
