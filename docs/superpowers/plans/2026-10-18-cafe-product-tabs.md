# แยกเมนูคาเฟ่กับสินค้าทั่วไปในหน้าสินค้า

## Steps
- [x] T1 เพิ่มประเภทสินค้าใน domain
- [x] T2 เพิ่มคอลัมน์และย้ายเฉพาะชุดคาเฟ่เดิมที่ตรวจสอบที่มาได้
- [x] T3 รองรับประเภทและตัวกรองใน API พร้อม audit/cache
- [x] T4 เพิ่มปุ่มสร้างเมนูคาเฟ่ แบบฟอร์ม และแท็บ
- [x] T5 ตรวจ migration, API, หน้าจอ และบันทึก OpenAPI

**เป้าหมาย:** แยกคาเฟ่กับสินค้าทั่วไปให้เห็นชัด โดยใช้แบบฟอร์มสร้างสินค้าด้วยตนเอง ไม่คืนตัวเลือกนำเข้าชุดสำเร็จรูป

**ขอบเขต:** 5 งาน ครอบคลุม domain / DB / API / web / tests; ยังไม่ประเมินเวลาจนผ่านการตรวจแผน

## ปัญหาปัจจุบันและแนวทางที่อนุมัติ

ปัจจุบันสินค้าทุกชนิดอยู่ในรายการเดียวกัน ไม่มีข้อมูลระบุประเภท ผู้ใช้เลือกให้แยกแท็บภายในหน้าสินค้า และอนุมัติปุ่ม **เพิ่มเมนูคาเฟ่** ทางซ้ายของ **เพิ่มสินค้า** ตามตำแหน่งที่วงไว้ในภาพ

- เพิ่ม `productType: 'normal' | 'cafe'` เป็นข้อมูลชัดเจน ไม่ตัดสินจากชื่อหรือหมวดหมู่
- ปุ่มใหม่เปิดแบบฟอร์มเดิมโดยตั้งประเภทเป็น `cafe`; ปุ่มเพิ่มสินค้าตั้งเป็น `normal`; ผู้ใช้แก้ประเภทในแบบฟอร์มได้
- รายการมีแท็บ **สินค้าทั่วไป / เมนูคาเฟ่** เปิดเริ่มต้นที่สินค้าทั่วไป ตัวกรองสถานะเดิมยังอยู่และทำงานภายในประเภทที่เลือก
- ผู้ใช้เลือกให้ย้ายชุดคาเฟ่เดิมเข้าแท็บคาเฟ่ โดยคงราคา ต้นทุน สต็อก ตัวเลือก และประวัติทั้งหมด
- API ที่ไม่ส่งตัวกรองยังคืนทั้งสองประเภท เพื่อไม่ทำให้ POS การสแกน และรายงานสินค้าสต็อกต่ำซ่อนเมนูคาเฟ่

| กรณี | ปัจจุบัน | หลังเปลี่ยน |
| --- | --- | --- |
| เพิ่มเครื่องดื่มเอง | ใช้เพิ่มสินค้า | ใช้เพิ่มเมนูคาเฟ่และประเภทเริ่มต้นคาเฟ่ |
| หาสินค้า | รายการรวม | แยกสองแท็บและกรองในฐานข้อมูล |
| แก้ประเภท | ไม่มีช่อง | ย้ายประเภทผ่านแบบฟอร์มเดิมได้ |
| ชุดคาเฟ่เดิม | อยู่ปนกัน | ย้ายเฉพาะสินค้าที่ตรวจสอบที่มาชุดเดิมได้ |

## ข้อกำหนดและความเสี่ยง

- ห้ามลบข้อมูลสินค้า คืนหน้าต่างนำเข้าชุดสำเร็จรูป หรือเปลี่ยนกติกาตัวเลือกเริ่มต้น/การคิดเงิน
- Backfill ต้องใช้ทั้ง SKU ที่ตรงกับรายการ 20 รายการของชุดเดิม และหลักฐาน `audit_logs.action = 'cafe_menu.applied'` ซึ่ง `after.addedProducts` มี SKU นั้น ห้ามใช้เพียง prefix `CAFE-`, ชื่อ หรือหมวดหมู่
- หาก SKU ถูกแก้หรือไม่มีหลักฐาน audit ให้คง `normal` และเปิดให้เปลี่ยนประเภทเอง แทนการเดาประวัติ
- ใช้ migration ใหม่หลัง 0021; ไม่แก้ migration ที่ใช้งานแล้ว ตรวจ `when` ให้มากกว่า entry ก่อนหน้า และทดสอบกรณี ledger ข้าม checkout ด้วยฐานแยก ห้ามแก้ ledger ฐานจริงเพื่อบังคับให้ผ่าน
- แยก namespace cache รายการสินค้ารุ่นใหม่ ป้องกัน snapshot เก่าที่ไม่มีประเภทถูกอ่านผิด ไม่เติม fallback เพื่อกลบค่าประเภทที่ผิดใน core
- การเปลี่ยน OpenAPI เป็น additive: request เดิมที่ไม่ส่งประเภทต้องยังผ่าน และการไม่ส่ง list filter ต้องเหมือนเดิม
- Assertion E2E เดิมที่ห้ามทุกปุ่มชื่อเมนูคาเฟ่ขัดกับคำขอใหม่โดยตรง ต้องปรับเป็นอนุญาตปุ่มสร้างด้วยตนเอง แต่ยังห้ามหน้าต่างนำเข้าชุดสำเร็จรูป
- ทดสอบบนฐาน disposable เท่านั้น ไม่อ่านไฟล์ `.env*` ที่ถูกป้องกัน ไม่ reset ฐานจริง และไม่หยุด checkout อื่น

## ลำดับงานแบบ Parallel-first

ทุก implementation task: **REQUIRED SUB-SKILL: Use superpowers:test-driven-development** (ใช้ skill `test-driven-development` ที่มีใน session)

1. **T1 Domain** — Lane A | Can run together: T2 | Must wait for: ไม่มี | TDD slice: ประเภทและ snapshot → entity → unit test
2. **T2 DB/backfill** — Lane B | Can run together: T1 | Must wait for: ไม่มี | TDD slice: ฐานก่อนเพิ่มประเภท → migration → ยืนยันข้อมูลเดิม
3. **T3 API** — Lane A | Can run together: ไม่มี | Must wait for: T1,T2 | TDD slice: create/update/filter/audit → adapters → HTTP
4. **T4 Web** — Lane A | Can run together: ไม่มี | Must wait for: T3 | TDD slice: ปุ่ม/แท็บ/ย้ายประเภท → form/query → browser
5. **T5 Verification** — Sequential | Can run together: ไม่มี | Must wait for: T4 | TDD slice: regression ทั้งระบบ → แก้เฉพาะงานนี้ → ตรวจภาพ

## T1: ประเภทสินค้าใน domain

**ไฟล์:** แก้ `server/src/domains/product.domain.ts`, `product.domain.test.ts`, `server/src/__tests__/factories.ts`; เพิ่ม `product-type.vo.ts` และ `product-type.vo.test.ts` ใน domains เฉพาะเมื่อช่วยให้ validation อยู่จุดเดียว

**Dependencies:** ไม่มี; **Race risks:** T3 ห้ามแก้ domain/fixtures พร้อมกัน

- RED: ทดสอบสองประเภท ค่าผิด constructor validation, snapshot และ `with()` ที่คงค่าหรือย้ายประเภท
- GREEN: เพิ่ม named type/constants และ field ให้ immutable entity; ใช้ stable domain error เดิมที่เหมาะสม
- REFACTOR: ไม่เปลี่ยนสูตรเงินหรือ fields เดิม อัปเดต factory ตามสัญญาใหม่
- Verify: `bun run test:api src/domains/product.domain.test.ts` และ `bun run test:unit`

## T2: คอลัมน์และ migration ที่รักษาข้อมูล

**ไฟล์:** แก้ `server/src/infrastructure/database/schema/products.ts`; generate SQL และ snapshot/journal ใหม่ภายใต้ `drizzle/`; เพิ่ม `server/test/product-type-migration.test.ts`

**Dependencies:** ไม่มี; **Race risks:** มีผู้เขียน migration เพียง lane นี้ ห้าม generate พร้อมงานอื่น

- RED: สร้างฐานทดสอบชื่อเฉพาะพร้อม schema ก่อนประเภทสินค้า; seed สินค้าชุดเดิมที่มี audit, SKU เหมือนแต่ไม่มี audit, สินค้าทั่วไป และข้อมูลราคา/ตัวเลือก/stock เดิม
- GREEN: เพิ่ม `product_type` พร้อม default `normal`, backfill เฉพาะหลักฐานครบตามข้อกำหนด แล้ว enforce ค่าที่อนุญาตและ NOT NULL โดยปลอดภัยกับข้อมูลเดิม
- แยกกรณี migration เดิมก่อน repair ถูกข้ามเพราะ ledger checkout อื่น: ถ้า preflight พบ dependency column หาย ให้รายงานชัด ไม่แก้เลขหรือเขียน ledger ย้อนหลัง
- ทดสอบ fresh install, upgrade, migrate ซ้ำไม่ย้ายสินค้าที่ผู้ใช้เปลี่ยนกลับเอง และข้อมูลราคา/ตัวเลือก/stock ไม่เปลี่ยน
- REFACTOR: ไม่ import runtime TypeScript ใน SQL; รายการ SKU ของ migration เป็น snapshot คงที่ของชุดที่มีอยู่ ณ วันเขียน
- Verify: `bun run test:api test/product-type-migration.test.ts` โดย guard ตรวจ test target ก่อนสร้าง/ลบเฉพาะฐาน disposable ของ test

## T3: API, repository, audit และ cache

**ไฟล์:** ภายใต้ `server/src/modules/products/` แก้ `applications/ports/product.repository.ts`, `applications/schemas/product-schemas.ts`, `applications/usecases/create-product.usecase.ts`, `update-product.usecase.ts`, `adapters/repository/product.drizzle.repository.ts`, `product.cached.repository.ts`, `adapters/controllers/schemas/product.schema.ts`; แก้ direct constructor ใน `server/src/modules/cafe-menu/applications/usecases/apply-cafe-menu.usecase.ts` ให้สินค้าที่ API นี้สร้างเป็นคาเฟ่

**Tests:** `products.usecases.test.ts`, `server/src/__tests__/integration/products.integration.test.ts`, `api-contract.integration.test.ts`, `server/src/modules/audit/applications/usecases/sensitive-actions.test.ts`; เพิ่ม cache test ข้าง adapter ตาม pattern เดิม

**Dependencies:** T1,T2; **Race risks:** schema/HTTP type ส่งผลต่อ T4 ต้องทำให้พร้อมก่อน

- RED: create ไม่ส่งประเภทได้ normal, explicit cafe, invalid value ถูกปฏิเสธ, update ไม่ส่งคงค่าเดิม, เปลี่ยนเฉพาะประเภทมี audit, list filter+total+pagination ตรงกัน, ไม่ส่ง filter เห็นทั้งสองประเภท
- GREEN: ใช้ validation ที่ core, optional input/filter ที่ HTTP, shared SQL predicate ก่อน limit/offset; audit อยู่ unit of work เดิม; cache key มี version ใหม่
- รองรับ backend importer เดิมโดยไม่เพิ่ม UI หรือเปลี่ยน dedupe ของมัน
- REFACTOR: controller ยังแปลงข้อมูลเท่านั้น ไม่เพิ่ม business rule; ไม่ใช้ heuristic จากชื่อสินค้า
- Verify: `bun run test:unit`; `bun run test:api src/__tests__/integration/products.integration.test.ts`; `bun run test:api src/__tests__/integration/api-contract.integration.test.ts`; `bun run typecheck`

## T4: ปุ่ม แบบฟอร์ม และสองแท็บ

**ไฟล์:** `src/features/products/components/ProductsPage.tsx`, `ProductFormDialog.tsx`, `src/features/products/api.ts`, `locales.ts`, `src/features/pos/lib/cart.test.ts` (typed fixture เท่านั้น), `e2e/run.ts`

**Dependencies:** T3; **Race risks:** lane เดียวแก้ `e2e/run.ts` และ locales ไม่แยก agent เขียนไฟล์เดียวกัน

- RED: E2E แสดงปุ่มเพิ่มเมนูคาเฟ่ซ้ายเพิ่มสินค้า; แต่ละปุ่มเปิด manual form พร้อม default ที่ถูกต้อง; tab filter และ empty state ไม่เปิด importer; edit ย้ายประเภทได้
- GREEN: ใช้ shared form, field ประเภทแก้ได้, tabs ใช้ `SegmentedTabs` เดิม, query/count keys รวมประเภท, เปลี่ยนแท็บ reset pagination, invalidate ผ่าน `productKeys.all`
- ปุ่มเพิ่มเมนูคาเฟ่ใช้สิทธิ์ `products.write` เหมือนเพิ่มสินค้า ไม่บังคับสิทธิ์เพิ่มหมวด/ตัวเลือกเพียงเพื่อสร้างสินค้า
- บันทึกสำเร็จแล้วเลือกแท็บตามประเภทที่บันทึกจริงเพื่อให้ผู้ใช้เห็นรายการใหม่ ไม่ใช้ default จากปุ่มทับข้อมูล edit
- ทุกข้อความผ่าน locales th/en และ controls ใหม่สูงอย่างน้อย 44px; หัวหน้าแถวปุ่มต้อง wrap ได้บนมือถือ
- REFACTOR: ไม่คืน `CafeMenuDialog` หรือ hook นำเข้าชุดสำเร็จรูป และไม่เปลี่ยน POS ให้กรองเพียงประเภทเดียว
- Verify: `bun run test:web`; `bun run typecheck`; `bun run e2e`

## T5: ตรวจครบและส่งมอบ

**ไฟล์:** `server/test/openapi-baseline.json` (generated หลังแจ้งเจ้าของ), `e2e/run.ts` เฉพาะ regression งานนี้; ติ๊ก Steps ในแผนนี้เท่านั้นตามงานเสร็จ

**Dependencies:** T4; **Race risks:** ห้ามรัน integration หลายไฟล์บนฐานร่วมพร้อมกัน; screenshot และ E2E ใช้ฐาน/พอร์ตแยกตาม harness

- RED/GREEN: ตรวจ regression create cafe/normal, ย้ายแท็บ, filter/count/paging, permissions, checkout ทั้งสองประเภท และ default options ยังถูกบันทึกในบิล
- แจ้งเจ้าของก่อน record baseline: มี optional request/filter และ response field เพิ่ม ไม่ลบ route/field/error เดิม ตรวจ diff จริงแล้วจึงบันทึก
- Verify: `bun run typecheck`, `bun run test:web`, `bun run test:unit`; integration ใน `server/src/__tests__/integration/` และ tests ใน `server/test/` รันทีละไฟล์ด้วย `bun run test:api <path-relative-to-server>` โดย canonical test config สำหรับ harness tests
- Verify: `bun run openapi:check`, `bun run lint`, `bun run build`, `bun run e2e`, `bun run screenshots`, `git diff --check`
- ตรวจภาพหน้าสินค้าปกติ/คาเฟ่/ว่างและ manual form ที่ 390,768,1366px ด้วยตา ระบุผล suite ที่ล้มเหลวจริง ห้ามกล่าวว่าผ่านครบจาก targeted test อย่างเดียว
- ฐานจริง: ให้ผู้ใช้รัน migration ผ่าน config ของตนหาก guard ไม่อนุญาต agent; ตรวจ schema และจำนวนสินค้าที่แยกจริงก่อนยืนยันใช้งานได้ ไม่แก้ไฟล์ secret/ไม่ reset ข้อมูล
- ไม่ commit หรือ push จากขั้นวางแผนนี้ และแผนไม่สั่ง worker ให้ commit/push
