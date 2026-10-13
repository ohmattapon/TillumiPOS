# Hexagonal ขั้น 1–5: ย้ายโมดูลที่เหลือ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้าย `users`, `auth`, `products`, `inventory` และ `sales` เป็น Hexagonal ตามแบบที่โมดูล `categories` พิสูจน์แล้วในขั้น 0 แล้วลบโค้ดแบบเดิมทั้งหมด

**Architecture:** เหมือนขั้น 0 ทุกประการ โมดูลที่ย้ายแล้วกับที่ยังไม่ย้ายอยู่ร่วมกันได้ระหว่างทาง

**Tech Stack:** Bun 1.4.3, Elysia 1.4, Drizzle ORM 0.45, tsyringe, zod 4, `bun:test`

**Spec:** `docs/superpowers/specs/2026-10-13-hexagonal-architecture-design.md`

**ต้นแบบ:** ทุกไฟล์ใหม่ทำตามรูปแบบของไฟล์คู่กันในโมดูล `apps/api/src/modules/categories` และ `apps/api/src/domains/category.domain.ts`

## ลักษณะของแผนนี้

แผนขั้น 0 ใส่โค้ดครบทุกบรรทัดเพราะเป็นการวางรูปแบบครั้งแรก แผนนี้ระบุสัญญา (ชื่อ ชนิดข้อมูล พฤติกรรม ข้อความและรหัสข้อผิดพลาด) และลำดับงาน ส่วนโค้ดเขียนตอนลงมือแบบทดสอบก่อน โดยยึดรูปแบบของ `categories` เหตุผลคือพฤติกรรมทุกข้อถูกกำหนดไว้แล้วด้วยการทดสอบ integration 79 กรณีและเอกสาร OpenAPI ที่ต้องไม่เปลี่ยน

## Global Constraints

- ทำตาม `AGENTS.md`: branch `ohmattpon/hexagonal-architecture`, commit ด้วย `gitcz --non-interactive` (ชนิดที่ใช้ได้: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `ci`, `chore`), ห้าม push, ห้าม merge
- ทุก commit ใส่ `--body="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- สัญญาของ API ห้ามเปลี่ยน ยกเว้นรายการในหัวข้อ "ผลต่างพฤติกรรมที่ยอมรับ"
- การทดสอบ integration ที่มีอยู่: แก้ได้เฉพาะบรรทัด import ห้ามแก้ assertion ห้ามลบกรณี ห้ามเปลี่ยนสถานะ `test.failing`
- กฎของชั้นตาม spec: `domains/` ห้าม import Elysia, Drizzle, tsyringe, zod, `libs/`, `modules/`, `infrastructure/` และ `applications/` ห้าม import Elysia, Drizzle, `infrastructure/`, `adapters/`
- ข้อความและค่า `code` ของข้อผิดพลาดทุกตัวต้องเหมือนโค้ดเดิมทุกตัวอักษร
- ทุกขั้นจบเมื่อคำสั่งทั้งหมดนี้ผ่าน แล้ว commit: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run openapi:check` (ใน `apps/api`), `bun run build` (ใน `apps/web`) และการตรวจกฎของชั้นด้วย `grep`
- ห้ามบันทึก `test/openapi-baseline.json` ทับ

## ผลต่างพฤติกรรมที่ยอมรับ

| กรณี | ก่อนย้าย | หลังย้าย |
|---|---|---|
| `PATCH /api/users/:id` ด้วย body `{}` | Drizzle ปฏิเสธการอัปเดตที่ไม่มีค่า API ตอบ 500 | ตอบ 200 พร้อมผู้ใช้เดิม |
| `PATCH /api/catalog/products/:id` ด้วย body `{}` | เหมือนข้างบน | ตอบ 200 พร้อมสินค้าเดิม |

เป็นบั๊กชนิดเดียวกับที่ยอมรับในขั้น 0 แต่ละกรณีต้องมีการทดสอบที่ล้มเหลวกับโค้ดเดิมก่อนย้าย ถ้าพบผลต่างนอกตารางนี้ ให้หยุดและรายงาน

## การตัดสินใจที่ต่างจาก spec

| เรื่อง | spec | แผนนี้ | เหตุผล |
|---|---|---|---|
| `ITokenIssuer` | เป็น port ร่วม | ไม่สร้าง การออกและตรวจ JWT อยู่ใน `auth.plugin.ts` และ controller ของ `auth` | cookie ของ session เป็นเรื่องของชั้น HTTP ล้วน use case ทำงานกับรหัสผู้ใช้ จึงไม่มีอะไรให้สลับ |
| การตั้งค่าร้าน | ไม่ได้ระบุ | เพิ่ม port `IShopSettings` (`vatRateBp`, `timeZone`) อ่านจาก env | use case การขายต้องไม่อ่าน env ตรง และชิ้นงานที่ 4 จะสลับไปอ่านจากฐานข้อมูลได้โดยไม่แตะ use case |

---

## ขั้น 1: `users` และ `auth`

### สัญญา

**Domain**

- `domains/user-role.vo.ts`: `USER_ROLES = ['owner', 'cashier'] as const`, `type UserRole`
- `domains/user.domain.ts`: `UserEntity { id, username, displayName, role, isActive }`
  - กฎ: `username` ยาว 3–32 ตรง `^[a-z0-9_.-]+$` (เก็บเป็นตัวพิมพ์เล็ก), `displayName` ยาว 1–100
  - `static normalizeUsername(raw)`, `with(changes)`, `toSnapshot()`
  - `wouldStopBeingActiveOwner(changes): boolean` จริงเมื่อเป็นเจ้าของร้านที่ใช้งานอยู่ และการเปลี่ยนทำให้ถูกปิดหรือไม่ใช่เจ้าของร้าน

**Port**

- `modules/users/applications/ports/user.repository.ts`: `IUserRepository`
  - `findAll()`, `findById(id)`, `findByIdForUpdate(id)`, `findActiveById(id)`
  - `findCredentialsByUsername(username): Promise<{ user: UserEntity; passwordHash: string } | null>`
  - `create(entity, passwordHash)`, `update(entity, passwordHash?)`, `countActiveOwners()`
  - ชื่อผู้ใช้ซ้ำ: `DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')`
- `modules/shared/ports/password-hasher.port.ts`: `IPasswordHasher { hash(plain), verify(plain, hash) }` token `TOKENS.PasswordHasher` adapter `BunPasswordHasher`

**Use case**

| Use case | พฤติกรรม |
|---|---|
| `ListUsersUseCase.execute()` | ผู้ใช้ทั้งหมดเรียงตาม id |
| `CreateUserUseCase.execute(input)` | ตรวจ `{ username, password (8–72), displayName, role }` เข้ารหัสรหัสผ่านแล้วบันทึก |
| `UpdateUserUseCase.execute(id, input)` | ใน `IUnitOfWork`: อ่านแบบล็อกแถว ไม่พบ → `DomainNotFoundError('ไม่พบผู้ใช้')` ถ้า `wouldStopBeingActiveOwner` และ `countActiveOwners() <= 1` → `DomainConflictError('ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน', 'LAST_OWNER')` รหัสผ่านใหม่ถูกเข้ารหัสเมื่อส่งมา |
| `LoginUseCase.execute(input)` | ชื่อผู้ใช้ไม่มี ถูกปิด หรือรหัสผ่านผิด → `DomainUnauthorizedError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')` ข้อความเดียวกันทุกกรณี |
| `AuthorizeSessionUseCase.execute(userId, roles)` | ไม่พบผู้ใช้ที่ใช้งานอยู่ → `DomainUnauthorizedError('กรุณาเข้าสู่ระบบ')` บทบาทไม่อยู่ใน `roles` → `DomainForbiddenError('ไม่มีสิทธิ์ใช้งานส่วนนี้')` `roles` เป็น `true` หมายถึงบทบาทใดก็ได้ |

**Adapter**

- `modules/auth.plugin.ts`: ย้ายจาก `shared/plugins/auth.ts` ส่งออก `auth`, `SESSION_COOKIE`, `SESSION_MAX_AGE` เหมือนเดิม macro ตรวจ JWT แล้วเรียก `AuthorizeSessionUseCase` ค่า `user` ใน context ยังเป็นอ็อบเจกต์ `{ id, username, displayName, role, isActive }`
- `UserElysiaController` และ `AuthElysiaController` เส้นทางและ schema เหมือนเดิม
- ตาราง `users` ย้ายไป `infrastructure/database/schema/users.ts`

### Tasks

- [x] **1.1** เพิ่ม `users.integration.test.ts` ปักพฤติกรรมเดิม: สร้างแล้วได้เฉพาะช่องสาธารณะ, ชื่อผู้ใช้ถูกแปลงเป็นตัวพิมพ์เล็กและล็อกอินด้วยตัวพิมพ์ใหญ่ได้, ชื่อซ้ำ 409, รายการเรียงตาม id, แก้ชื่อแสดง, เปลี่ยนรหัสผ่านแล้วรหัสเก่าใช้ไม่ได้, แก้ผู้ใช้ที่ไม่มี 404, รหัสผ่านสั้นกว่า 8 ตัว 422 รันกับโค้ดเดิมต้องผ่าน แล้วเพิ่มกรณี body `{}` ที่ต้องล้มเหลวกับโค้ดเดิม
- [x] **1.2** Domain: `user-role.vo.ts`, `user.domain.ts` พร้อมการทดสอบ
- [x] **1.3** Port ร่วม `IPasswordHasher` กับ adapter และ port `IUserRepository`
- [x] **1.4** Use case ทั้งห้าตัวพร้อมการทดสอบด้วย port จำลอง (เพิ่ม `mockUserRepository`, `mockPasswordHasher`, `mockUnitOfWork`, `makeUser` ใน `__tests__/`)
- [x] **1.5** Adapter: repository, schema ของ HTTP, controller สองตัว, `auth.plugin.ts`, `users.module.ts`, `auth.module.ts` ย้ายตาราง แก้ import ในโมดูลเดิม, `seed.ts`, `types.ts` และโครงทดสอบ แล้วลบ `modules/users/{index,model,schema,service}.ts`, `modules/auth/{index,model}.ts`, `shared/plugins/auth.ts`
- [x] **1.6** ตรวจครบทุกข้อใน Global Constraints แล้ว commit

---

## ขั้น 2: `products`

### สัญญา

**Domain** `domains/product.domain.ts`: `ProductEntity { id, sku, barcode, name, categoryId, priceSatang, costSatang, trackStock, stockQty, isActive, imageKey }`

- กฎ: `sku` ยาว 1–64, `barcode` เป็น `null` หรือยาว 1–64, `name` ยาว 1–200, `priceSatang` และ `costSatang` เป็นจำนวนเต็มไม่ติดลบ
- `with(changes)` เปลี่ยนได้ทุกช่องยกเว้น `id`, `stockQty`, `imageKey`
- `assertSellable(quantity)`:
  - ปิดการขาย → `DomainConflictError('สินค้า "<ชื่อ>" ปิดการขายแล้ว', 'PRODUCT_INACTIVE')`
  - นับสต็อกและสต็อกน้อยกว่าจำนวน → `DomainConflictError('สินค้า "<ชื่อ>" เหลือ <สต็อก> ชิ้น ไม่พอขาย', 'INSUFFICIENT_STOCK')`

**Port**

- `IProductRepository`: `findAll(query)`, `findById(id)`, `create(entity)`, `update(entity)` (ไม่แตะสต็อกและรูป), `findManyForUpdate(ids)` (เรียงตาม id และล็อกแถว), `adjustStock(id, delta): Promise<number | null>` (`null` เมื่อสินค้าไม่นับสต็อก), `setImageKey(id, key | null)`
  - ค่าซ้ำ → `DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')`
  - หมวดหมู่ที่อ้างถึงไม่มีอยู่ → `DomainConflictError('ข้อมูลนี้ถูกอ้างอิงอยู่ หรืออ้างถึงข้อมูลที่ไม่มีอยู่', 'IN_USE')`
- `modules/shared/ports/media-storage.port.ts`: `IMediaStorage { urlFor(key), put(key, file: Blob), delete(key) }` token `TOKENS.MediaStorage` adapter `WorkerMediaStorage` (ย้ายจาก `shared/media.ts`) ล้มเหลว → `DomainExternalServiceError('เชื่อมต่อที่เก็บรูปภาพไม่ได้ ลองใหม่อีกครั้ง', 'MEDIA_UNAVAILABLE')`

**Use case**

| Use case | พฤติกรรม |
|---|---|
| `ListProductsUseCase.execute(query)` | ค้นด้วย `q` (ชื่อหรือ SKU แบบไม่สนตัวพิมพ์ หรือบาร์โค้ดตรงตัว โดย `%` และ `_` เป็นตัวอักษร), `categoryId`, `includeInactive`, `limit` (ค่าเริ่มต้น 500), `offset` เรียงตามชื่อ |
| `GetProductUseCase.execute(id)` | ไม่พบ → `DomainNotFoundError('ไม่พบสินค้า')` |
| `CreateProductUseCase.execute(input)` | ค่าเริ่มต้น: `costSatang` 0, `trackStock` จริง, `stockQty` 0, `isActive` จริง |
| `UpdateProductUseCase.execute(id, input)` | ช่อง `stockQty` ใน input ถูกทิ้ง |
| `SetProductImageUseCase.execute(id, file)` | ตรวจว่าสินค้ามีอยู่ก่อน อัปโหลดด้วย key ใหม่ `products/<id>/<uuid>.<ext>` บันทึก key แล้วลบไฟล์เก่าแบบไม่ให้ความล้มเหลวของการลบกระทบคำขอ |
| `RemoveProductImageUseCase.execute(id)` | ล้าง key แล้วลบไฟล์แบบเดียวกัน |

controller แปลง entity เป็นคำตอบโดยเติม `imageUrl` จาก `IMediaStorage.urlFor`

### Tasks

- [x] **2.1** เพิ่มกรณี body `{}` ใน `products.integration.test.ts` ที่ต้องล้มเหลวกับโค้ดเดิม และกรณีหมวดหมู่ที่ไม่มีอยู่ → 409 `IN_USE` ที่ต้องผ่านกับโค้ดเดิม
- [x] **2.2** Domain `product.domain.ts` พร้อมการทดสอบ
- [x] **2.3** Port `IMediaStorage` กับ adapter และ port `IProductRepository`
- [x] **2.4** Use case หกตัวพร้อมการทดสอบ
- [x] **2.5** Adapter และการผูก ย้ายตาราง `products` แก้ผู้เรียกในโมดูลเดิม (`inventory`, `sales` เรียกผ่าน `IProductRepository` จาก container) แล้วลบ `modules/catalog/products/*`, `shared/media.ts`
- [x] **2.6** ตรวจครบแล้ว commit

---

## ขั้น 3: `inventory`

### สัญญา

**Domain** `domains/stock-movement.domain.ts`: `StockMovementEntity { id, productId, type, quantity, balanceAfter, reference, note, userId, createdAt }` ชนิด `receive | sale | void | adjust` กฎ: `quantity` เป็นจำนวนเต็มไม่เป็นศูนย์

**Port**

- `IStockMovementRepository`: `create(entity)`, `findAll({ productId?, limit? })` (ใหม่สุดก่อน ค่าเริ่มต้น 100)
- `IStockLedger { record(input): Promise<StockMovementEntity | null> }` token `stockLedgerToken` ใช้โดยโมดูล `sales` ปรับยอดผ่าน `IProductRepository.adjustStock` แล้วบันทึกรายการเคลื่อนไหว คืน `null` เมื่อสินค้าไม่นับสต็อก ต้องเรียกภายใน `IUnitOfWork`

**Use case**

| Use case | พฤติกรรม |
|---|---|
| `ReceiveStockUseCase.execute(input, userId)` | ใน `IUnitOfWork`: ล็อกสินค้า ไม่พบ → `DomainNotFoundError('ไม่พบสินค้า')` ไม่นับสต็อก → `DomainError('สินค้านี้ไม่ได้ตั้งให้นับสต็อก', 'STOCK_NOT_TRACKED')` |
| `AdjustStockUseCase.execute(input, userId)` | เหมือนข้างบน ส่วนต่างเป็นศูนย์ → `DomainError('ยอดที่นับได้ตรงกับยอดในระบบอยู่แล้ว', 'NO_CHANGE')` |
| `ListStockMovementsUseCase.execute(query)` | |

### Tasks

- [x] **3.1** Domain พร้อมการทดสอบ
- [x] **3.2** Port และ `StockLedger` (ใน `applications/services/`) พร้อมการทดสอบ
- [x] **3.3** Use case สามตัวพร้อมการทดสอบ
- [x] **3.4** Adapter และการผูก ย้ายตาราง ให้ `sales` เดิมเรียก `IStockLedger` จาก container แล้วลบ `modules/inventory/{index,model,schema,service}.ts`
- [x] **3.5** ตรวจครบแล้ว commit

---

## ขั้น 4: `sales`

### สัญญา

**Domain** `domains/sale.domain.ts`

- `SaleEntity` เป็น aggregate: หัวบิล, `items: SaleItem[]`, `payments: SalePayment[]`
- `static SaleEntity.complete({ lines, discountSatang, payments, vatRateBp, cashier })` รวมกฎจาก `pricing.ts`:
  - ส่วนลดมากกว่ายอดรวม → `DomainError('ส่วนลดมากกว่ายอดรวมสินค้า', 'DISCOUNT_TOO_LARGE')`
  - VAT = ปัดเศษของ `ยอดสุทธิ × อัตรา / (10000 + อัตรา)`
  - ชำระไม่ครบ → `DomainError('ยอดชำระไม่ครบ', 'UNDERPAID')`
  - เงินทอนมากกว่าเงินสดที่รับ → `DomainError('ยอดชำระที่ไม่ใช่เงินสดเกินยอดที่ต้องจ่าย', 'OVERPAID')`
- `void(reason, by, at)`: บิลที่ยกเลิกแล้ว → `DomainConflictError('บิลนี้ถูกยกเลิกไปแล้ว', 'ALREADY_VOIDED')`
- กรณีทดสอบของ `pricing.test.ts` เดิมทั้ง 8 กรณีย้ายมาเป็นการทดสอบของไฟล์นี้

**Port**

- `ISaleRepository`: `nextReceiptNo()` (เลขรันรายวันแบบไม่ข้ามเลข ตามเขตเวลาร้าน), `create(sale)`, `findById(id)`, `findByIdForUpdate(id)`, `saveVoid(sale)`, `findHeaders({ from?, to?, limit? })` (ใหม่สุดก่อน ค่าเริ่มต้น 100), `summarize({ from, to })`
- `modules/shared/ports/shop-settings.port.ts`: `IShopSettings { vatRateBp: number; timeZone: string }` token `TOKENS.ShopSettings` adapter `EnvShopSettings`
- `modules/shared/ports/clock.port.ts`: `IClock { now(): Date }` token `TOKENS.Clock` adapter `SystemClock`

**Use case**

| Use case | พฤติกรรม |
|---|---|
| `CompleteSaleUseCase.execute(input, cashier)` | ใน `IUnitOfWork`: รวมบรรทัดที่เป็นสินค้าเดียวกันโดยคงลำดับที่เห็นครั้งแรก ล็อกสินค้าทั้งหมด สินค้าที่ไม่พบ → `DomainError('ไม่พบสินค้ารหัส <id>', 'PRODUCT_NOT_FOUND')` เรียก `assertSellable` ทุกบรรทัด สร้างบิลด้วย `SaleEntity.complete` ออกเลขใบเสร็จ บันทึก แล้วเรียก `IStockLedger.record` ชนิด `sale` ต่อบรรทัด |
| `VoidSaleUseCase.execute(id, input, user)` | ใน `IUnitOfWork`: อ่านแบบล็อกแถว ไม่พบ → `DomainNotFoundError('ไม่พบบิลขาย')` เรียก `void` บันทึก แล้วคืนสต็อกด้วย `IStockLedger.record` ชนิด `void` เรียงตามรหัสสินค้า |
| `ListSalesUseCase`, `GetSaleUseCase`, `GetSalesSummaryUseCase` | เหมือนเดิม สรุปยอดนับเฉพาะบิลที่สำเร็จในช่วง `[from, to)` และยอดเงินสดหักเงินทอน |

### Tasks

- [x] **4.1** Domain `sale.domain.ts` พร้อมการทดสอบ (รวม 8 กรณีเดิม)
- [x] **4.2** Port ร่วม `IShopSettings`, `IClock` กับ adapter และ port `ISaleRepository`
- [x] **4.3** Use case ห้าตัวพร้อมการทดสอบ
- [x] **4.4** Adapter และการผูก ย้ายตาราง แล้วลบ `modules/sales/{index,model,schema,service,pricing,pricing.test}.ts`
- [x] **4.5** ตรวจครบ รันการทดสอบสามรอบเพื่อดูว่าการขายพร้อมกันคงที่ แล้วทดลองตัดการล็อกแถวออกจาก `findManyForUpdate` ซึ่งการทดสอบขายพร้อมกันต้องล้มเหลว จากนั้นคืนโค้ดและ commit

---

## ขั้น 5: ลบโค้ดเดิมและปิดงาน

- [x] **5.1** ย้าย `shared/models.ts` ไป `libs/http-schemas.ts`, ย้ายตัวจัดการข้อผิดพลาดไป `modules/error-handler.plugin.ts` โดยตัดการรู้จัก `AppError` และรหัสของ PostgreSQL ออก, ลบ `shared/errors.ts` และโฟลเดอร์ `shared/` เดิม
- [x] **5.2** สร้าง `modules/app.module.ts` ที่ resolve controller ทุกตัวและรวมเส้นทาง (หมวดหมู่และสินค้าอยู่ใต้ `/catalog`) แล้วลบโฟลเดอร์ `modules/catalog`
- [x] **5.3** เขียนหัวข้อ CQRS และโครงสร้างโครงการใน `AGENTS.md` ใหม่ตามหัวข้อ "การแก้ `AGENTS.md`" ของ spec
- [x] **5.4** ตรวจเกณฑ์ว่าเสร็จของ spec ครบทุกข้อ: ไม่เหลือ `service.ts`, กฎของชั้นผ่านทุกโมดูล, diff ของไฟล์ทดสอบ integration เทียบกับก่อนเริ่มมีแต่บรรทัด import และกรณีที่เพิ่ม, เอกสาร OpenAPI ตรงกับเส้นฐาน
- [x] **5.5** เปิดหน้าเว็บในเบราว์เซอร์: ล็อกอิน ดูรายการสินค้าและบิล เปิดฟอร์มสินค้า (การขายและการยกเลิกบิลจริงให้เจ้าของโครงการลองเอง เพราะฐานข้อมูลพัฒนามีข้อมูลที่กำลังใช้งาน)
- [x] **5.6** Commit และรายงาน
