# ย้ายโครงสร้าง API เป็น Hexagonal: เอกสารออกแบบ

- วันที่: 2026-10-13
- ชิ้นงานที่ 2 ใน `docs/superpowers/roadmap.md`
- สถานะ: รอเจ้าของโครงการตรวจ
- ต้นแบบของสไตล์: `D:\KPRU-CWIE\server` และ `D:\KPRU-CWIE\template_hexgonal.md`

## เป้าหมาย

เปลี่ยนโครงสร้างภายในของ `apps/api` จาก HMVC (ไฟล์ `service.ts` ต่อโมดูล) เป็น Hexagonal Architecture ตามสไตล์ของ KPRU-CWIE โดยพฤติกรรมที่มองเห็นจากภายนอกไม่เปลี่ยน

ผลที่ต้องการ:

- กฎธุรกิจอยู่ในชั้น domain และ use case ที่ไม่รู้จัก Elysia, Drizzle หรือบริการภายนอก
- ของภายนอกทุกตัว (ฐานข้อมูล ที่เก็บรูป เวลา การเข้ารหัสรหัสผ่าน) อยู่หลัง port จึงสลับตัวจริงได้โดยไม่แตะกฎธุรกิจ
- ทดสอบกฎธุรกิจได้โดยไม่ต้องมีฐานข้อมูล

## สิ่งที่อยู่นอกขอบเขต

- เปลี่ยนสัญญาของ API: เส้นทาง รูปร่างคำขอและคำตอบ สถานะ HTTP และค่า `code` ของข้อผิดพลาด ต้องเหมือนเดิมทุกจุด การปรับสัญญาเป็นชิ้นงานที่ 3
- เปลี่ยนโครงสร้างตารางหรือเพิ่ม migration
- เพิ่มฟีเจอร์ รวมถึงการชำระผ่าน SCB และที่เก็บรูปในเครื่อง ชิ้นนี้สร้าง port ไว้ให้ แต่มี adapter เท่าที่มีอยู่เดิม
- แก้หน้าเว็บ ยกเว้นการตั้งค่า TypeScript ที่จำเป็นต่อการตรวจ type
- แก้บั๊กที่บันทึกไว้ในแผนของชิ้นงานที่ 1 พฤติกรรมที่เป็นบั๊กต้องคงอยู่ และการทดสอบที่ปักด้วย `test.failing` ต้องให้ผลเหมือนเดิม

## เงื่อนไขก่อนเริ่ม

- ชิ้นงานที่ 1 (ชุดทดสอบและ CI) เสร็จและ merge เข้า `main` แล้ว
- ทำบน branch `ohmattpon/hexagonal-architecture` ที่แตกจาก `main`

## โครงสร้างเป้าหมาย

```
apps/api/src/
├── app.ts                         ประกอบแอปและส่งออก type App
├── index.ts                       เปิดเซิร์ฟเวอร์
├── domains/                       ชั้น domain รวมทุกโมดูล
│   ├── errors/                    domain-error.ts และชนิดย่อย
│   ├── money.vo.ts
│   ├── user.domain.ts
│   ├── user-role.vo.ts
│   ├── category.domain.ts
│   ├── product.domain.ts
│   ├── stock-movement.domain.ts
│   └── sale.domain.ts             รวม SaleItem, Payment และกฎคำนวณยอด
├── infrastructure/
│   └── database/
│       ├── schema/                ตาราง Drizzle ทั้งหมด (ย้ายจากโมดูล)
│       ├── columns.ts
│       ├── migrate.ts
│       └── seed.ts
├── libs/                          env.ts, db.ts, http-error.factory.ts, transaction-context.ts
├── modules/
│   ├── tokens.ts                  DI token ของ port ที่ใช้ร่วมหลายโมดูล
│   ├── app.module.ts              ลงทะเบียนทุกโมดูลและรวมเส้นทาง
│   ├── auth.plugin.ts             macro `auth` ของ Elysia
│   ├── shared/                    port และ adapter ที่ใช้ร่วม
│   ├── auth/
│   ├── users/
│   ├── categories/
│   ├── products/
│   ├── inventory/
│   └── sales/
└── __tests__/
    ├── integration/               การทดสอบ 36 ข้อจากชิ้นงานที่ 1
    ├── mocks.ts                   port จำลองสำหรับ unit test
    └── factories.ts               ตัวสร้าง entity สำหรับ unit test
```

โครงภายในโมดูล:

```
modules/<name>/
├── <name>.module.ts               ผูก port กับ adapter และลงทะเบียน use case
├── applications/
│   ├── ports/                     interface และ DI token
│   ├── schemas/                   zod schema ของ input แต่ละ use case
│   └── usecases/                  หนึ่งไฟล์ต่อหนึ่ง use case พร้อมไฟล์ทดสอบข้างกัน
└── adapters/
    ├── controllers/
    │   ├── <name>.controller.ts
    │   └── schemas/               schema ของ Elysia สำหรับ HTTP และ OpenAPI
    └── repository/
        └── <name>.drizzle.repository.ts
```

โมดูล `catalog` เดิมแตกเป็น `categories` และ `products` controller ของทั้งสองยังคงเส้นทาง `/api/catalog/categories` และ `/api/catalog/products`

## กฎของแต่ละชั้น

| ชั้น | import ได้ | ห้าม import |
|---|---|---|
| `domains/` | ไฟล์ใน `domains/` เท่านั้น | Elysia, Drizzle, tsyringe, zod, `libs/`, `modules/`, `infrastructure/` |
| `applications/` | `domains/`, port ของโมดูลตัวเองและของโมดูลอื่น, `modules/tokens.ts`, tsyringe, zod | Elysia, Drizzle, `infrastructure/`, ไฟล์ใน `adapters/` |
| `adapters/` | ทุกชั้นข้างบน, Elysia, Drizzle, `libs/`, `infrastructure/` | use case หรือ adapter ของโมดูลอื่นโดยตรง |

กฎเพิ่มเติม:

- กฎธุรกิจต้องอยู่ใน entity หรือ use case ห้ามอยู่ใน controller หรือ repository
- โมดูลเรียกข้ามกันผ่าน port ที่ inject ด้วย token เท่านั้น
- ชื่อไฟล์และคลาสตามแบบ KPRU-CWIE: `complete-sale.usecase.ts` กับ `CompleteSaleUseCase`, `sale.repository.ts` กับ `ISaleRepository` และ `saleRepositoryToken`, `sale.drizzle.repository.ts` กับ `DrizzleSaleRepository`, `sale.controller.ts` กับ `SaleElysiaController`

## Dependency Injection

- ใช้ `tsyringe` กับ `reflect-metadata` โดย import `reflect-metadata` เป็นบรรทัดแรกของ `app.ts`
- token ของ repository ประกาศในไฟล์ port ของโมดูล ส่วน token ของ port ที่ใช้ร่วมอยู่ใน `modules/tokens.ts`
- ไฟล์ `<name>.module.ts` ลงทะเบียน repository ด้วย `container.register(token, { useClass })` และลงทะเบียน use case กับ controller ด้วย `container.registerSingleton`
- เปิด `experimentalDecorators` และ `emitDecoratorMetadata` ใน `apps/api/tsconfig.json`
- หน้าเว็บตรวจ type ของโค้ด API ผ่าน type `App` จึงต้องเปิดสองตัวเลือกเดียวกันและเอา `erasableSyntaxOnly` ออกจาก `apps/web/tsconfig.app.json`

## Use case

- เป็นคลาส `@injectable()` ที่มีเมธอดเดียวคือ `execute()`
- `execute()` รับ input แบบ `unknown` และตรวจด้วย zod schema จาก `applications/schemas/` เป็นขั้นแรก ข้อมูลผู้กระทำ (ผู้ใช้ที่ล็อกอิน) ส่งเป็นพารามิเตอร์แยก
- แบ่งเป็น command (เปลี่ยนสถานะ) และ query (อ่านอย่างเดียว) ตามชื่อไฟล์ แต่ละ use case เป็นอย่างใดอย่างหนึ่งเท่านั้น
- command คืน entity ที่เป็นผลลัพธ์ query คืน entity หรือ read model ที่ประกาศใน port
- command ที่เขียนมากกว่าหนึ่งตาราง ครอบงานทั้งหมดด้วย `IUnitOfWork.run()`

## Transaction

การขายหนึ่งครั้งล็อกแถวสินค้า ตรวจสต็อก ออกเลขใบเสร็จ บันทึกบิล และตัดสต็อก ทั้งหมดต้องอยู่ใน transaction เดียวข้าม repository หลายตัว

- port `IUnitOfWork` มีเมธอดเดียว: `run<T>(work: () => Promise<T>): Promise<T>`
- adapter `DrizzleUnitOfWork` เปิด transaction ของ Drizzle แล้วเก็บไว้ใน `AsyncLocalStorage` ตลอดการทำงานของ `work`
- repository ทุกตัวขอตัวเชื่อมต่อจาก `libs/transaction-context.ts` ซึ่งคืน transaction ปัจจุบันถ้ามี หรือ `db` ถ้าไม่มี repository จึงไม่ต้องรับ transaction เป็นพารามิเตอร์ และ port ไม่มีชนิดข้อมูลของ Drizzle ปน
- `run()` ที่ซ้อนกันใช้ transaction ตัวนอก
- การล็อกแถวประกาศใน port ตรง ๆ: `IProductRepository.findManyForUpdate(ids)` คืนสินค้าเรียงตาม id และล็อกแถวจนจบ transaction

## Port ที่ใช้ร่วม

| Port | หน้าที่ | Adapter ในชิ้นนี้ |
|---|---|---|
| `IUnitOfWork` | ครอบงานหลายขั้นใน transaction เดียว | `DrizzleUnitOfWork` |
| `IClock` | เวลาปัจจุบัน และวันทำการตามเขตเวลาร้าน | `SystemClock` |
| `IPasswordHasher` | เข้ารหัสและตรวจรหัสผ่าน | `BunPasswordHasher` |
| `IMediaStorage` | เก็บ ลบ และสร้าง URL ของรูป | `WorkerMediaStorage` (ย้ายจาก `shared/media.ts`) |
| `ITokenIssuer` | ออกและตรวจ token ของ session | adapter ที่ครอบ `@elysiajs/jwt` |

## Domain

เงินทั้งหมดเป็นจำนวนเต็มหน่วยสตางค์เหมือนเดิม

| ไฟล์ | เนื้อหา |
|---|---|
| `money.vo.ts` | `MoneyVO` ครอบจำนวนสตางค์: ต้องเป็นจำนวนเต็มไม่ติดลบ มี `add`, `subtract`, `multiply` |
| `user.domain.ts`, `user-role.vo.ts` | `UserEntity` และบทบาท `owner` กับ `cashier` กฎ: ชื่อผู้ใช้เป็นตัวพิมพ์เล็ก |
| `category.domain.ts` | `CategoryEntity` |
| `product.domain.ts` | `ProductEntity` กฎ: ราคาและต้นทุนไม่ติดลบ, `canSell(quantity)` ตรวจสถานะเปิดขายและสต็อก |
| `stock-movement.domain.ts` | `StockMovementEntity` ชนิด `receive`, `sale`, `void`, `adjust` |
| `sale.domain.ts` | `SaleEntity` เป็น aggregate ของบรรทัดสินค้าและการชำระ รวมกฎจาก `sales/pricing.ts` เดิม: คำนวณยอดรวม ส่วนลด ยอดสุทธิ VAT แบบรวมในราคา ตรวจการชำระและเงินทอน และ `void(reason, by)` ที่ปฏิเสธบิลที่ยกเลิกแล้ว |

entity ตรวจกฎของตัวเองใน constructor และเมธอดที่เปลี่ยนสถานะ ตามแบบ `CompanyEntity` ของ KPRU-CWIE การทดสอบของ `pricing.ts` เดิมย้ายไปเป็นการทดสอบของ `sale.domain.ts` โดยกรณีทดสอบครบเท่าเดิม

## ข้อผิดพลาด

domain error ทุกตัวรับ `message` และ `code` ค่า `code` และข้อความต้องเหมือนที่ API ตอบอยู่ในปัจจุบัน

| คลาส | HTTP | ตัวอย่าง `code` ที่มีอยู่ |
|---|---|---|
| `DomainError` | 400 | `UNDERPAID`, `OVERPAID`, `DISCOUNT_TOO_LARGE`, `PRODUCT_NOT_FOUND`, `NO_CHANGE`, `STOCK_NOT_TRACKED` |
| `DomainUnauthorizedError` | 401 | `UNAUTHORIZED` |
| `DomainForbiddenError` | 403 | `FORBIDDEN` |
| `DomainNotFoundError` | 404 | `NOT_FOUND` |
| `DomainConflictError` | 409 | `INSUFFICIENT_STOCK`, `PRODUCT_INACTIVE`, `ALREADY_VOIDED`, `LAST_OWNER`, `DUPLICATE` |
| `DomainExternalServiceError` | 502 | `MEDIA_UNAVAILABLE` |

- `libs/http-error.factory.ts` เป็นจุดเดียวที่แปลง domain error เป็นคำตอบ HTTP รูปร่าง `{ code, message }` เหมือนเดิม
- ข้อผิดพลาดของ zod ใน use case แปลงเป็น 422 `VALIDATION` รูปร่างเดียวกับข้อผิดพลาดการตรวจของ Elysia
- ข้อผิดพลาดค่าซ้ำและ foreign key ของ PostgreSQL ถูก repository แปลงเป็น `DomainConflictError` ก่อนออกจาก adapter ชั้น HTTP จึงไม่ต้องรู้จักรหัสของ PostgreSQL

## Use case ของแต่ละโมดูล

| โมดูล | Command | Query |
|---|---|---|
| `auth` | `LoginUseCase` | `GetCurrentUserUseCase` |
| `users` | `CreateUserUseCase`, `UpdateUserUseCase` | `ListUsersUseCase` |
| `categories` | `CreateCategoryUseCase`, `UpdateCategoryUseCase` | `ListCategoriesUseCase` |
| `products` | `CreateProductUseCase`, `UpdateProductUseCase`, `SetProductImageUseCase`, `RemoveProductImageUseCase` | `ListProductsUseCase`, `GetProductUseCase` |
| `inventory` | `ReceiveStockUseCase`, `AdjustStockUseCase` | `ListStockMovementsUseCase` |
| `sales` | `CompleteSaleUseCase`, `VoidSaleUseCase` | `ListSalesUseCase`, `GetSaleUseCase`, `GetSalesSummaryUseCase` |

การออกจากระบบเป็นการลบ cookie ที่ controller ไม่มี use case

## Controller

- เป็นคลาส `@injectable()` ที่มี `getRoutes()` คืน plugin ของ Elysia ตามแบบ KPRU-CWIE
- schema ของ HTTP ย้ายจาก `model.ts` เดิมไป `adapters/controllers/schemas/` โดยเนื้อหาเหมือนเดิม เพื่อให้ OpenAPI และ type ของหน้าเว็บไม่เปลี่ยน
- controller แปลง entity เป็นรูปร่างคำตอบเดิม ห้ามส่ง entity ออกไปตรง ๆ ถ้ารูปร่างต่างจากคำตอบเดิม
- `app.ts` ต้องประกอบเส้นทางทั้งหมดใน expression เดียวก่อนส่งออก type `App` มิฉะนั้น Eden client จะไม่เห็นเส้นทาง

## การทดสอบ

- **การทดสอบ integration จากชิ้นงานที่ 1 คือเกณฑ์ยอมรับ** ย้ายไฟล์ไป `src/__tests__/integration/` และแก้ import ได้ แต่ห้ามแก้ assertion ห้ามลบกรณี และห้ามเปลี่ยนสถานะของ `test.failing`
- โครงทดสอบ (`harness.ts`) เปลี่ยนจากเรียก service เดิมเป็นเรียก use case ผ่าน container โดยตัวช่วยที่ส่งออกมีชื่อและพฤติกรรมเหมือนเดิม
- unit test ใหม่ใช้ `bun test`:
  - entity และ value object ทุกตัว: กรณีที่ผ่านและทุกกรณีที่ถูกปฏิเสธ
  - command ทุกตัว: ทดสอบกับ port จำลองจาก `__tests__/mocks.ts` ครอบคลุมกรณีสำเร็จและทุกกรณีที่ถูกปฏิเสธ
  - `http-error.factory.ts`: domain error ทุกชนิดได้สถานะและรูปร่างตามตาราง
- unit test ต้องรันได้โดยไม่มีฐานข้อมูล

## ลำดับการย้าย

ทุกขั้นจบเมื่อ `bun run typecheck`, `bun run lint` และ `bun run test` ผ่านครบ แล้ว commit แยก

| ขั้น | งาน | สิ่งที่ขั้นนี้พิสูจน์ |
|---|---|---|
| 0 | วางโครง: dependency, tsconfig, `domains/errors`, `libs/`, port ร่วม, `infrastructure/database`, container แล้วย้ายโมดูล `categories` | decorator และ DI ทำงานบน Bun, type ของ Eden ยังครบ, หน้าเว็บตรวจ type ผ่าน |
| 1 | `users` และ `auth` รวม `auth.plugin.ts` | การตรวจสิทธิ์ทำงานผ่าน use case |
| 2 | `products` รวมรูปสินค้า | port ของที่เก็บรูป |
| 3 | `inventory` | `IUnitOfWork` และการล็อกแถว |
| 4 | `sales` | transaction ข้ามสามโมดูล และการทดสอบขายพร้อมกันยังผ่าน |
| 5 | ลบไฟล์ `service.ts`, `model.ts`, `schema.ts` เดิมและโฟลเดอร์ `shared/` เดิม แก้ `AGENTS.md` | ไม่เหลือโค้ดสองแบบปนกัน |

ระหว่างขั้น 0 ถึง 4 โมดูลที่ย้ายแล้วกับที่ยังไม่ย้ายอยู่ร่วมกันได้ โมดูลเดิมเรียกโมดูลใหม่ผ่าน use case จาก container

ถ้าขั้น 0 พบว่า decorator, DI หรือ type ของ Eden ใช้ไม่ได้ตามที่ออกแบบ ให้หยุดและรายงานก่อนย้ายโมดูลอื่น

## การแก้ `AGENTS.md`

ในขั้น 5:

- แทนหัวข้อ CQRS ด้วยกฎของชั้นและกฎของ use case จากเอกสารนี้ รวมถึงข้อที่ command คืน entity
- แก้หัวข้อโครงสร้างโครงการ: เอาคำว่า HMVC ออก และอธิบายโครงใหม่

## เกณฑ์ว่าเสร็จ

- การทดสอบ integration ทุกข้อผ่านโดยไม่มีการแก้ assertion (ตรวจได้จาก diff ของไฟล์ทดสอบ)
- `bun run typecheck` ผ่านทั้งสามแพ็กเกจ และหน้าเว็บ build ได้
- เอกสาร OpenAPI ที่ `/openapi/json` มีเส้นทางและ schema เท่ากับก่อนย้าย เทียบจากไฟล์ที่บันทึกไว้ก่อนเริ่ม
- ไม่มีไฟล์ใน `domains/` หรือ `applications/` ที่ import ของต้องห้ามตามตารางกฎของชั้น ตรวจด้วยการค้นหา import
- ไม่เหลือไฟล์ `service.ts` ใน `apps/api/src`
- ทดลองตัดการล็อกแถวออกจาก `findManyForUpdate` แล้วการทดสอบขายพร้อมกันต้องล้มเหลว จากนั้นคืนโค้ดเดิม
- หน้าเว็บใช้งานได้จริงในเบราว์เซอร์: ล็อกอิน ขาย ยกเลิกบิล และอัปโหลดรูป

## ความเสี่ยง

| ความเสี่ยง | ผลถ้าเกิด | การรับมือ |
|---|---|---|
| `AsyncLocalStorage` กับ transaction ของไดรเวอร์ Bun SQL ทำงานไม่ตรงที่คาด | การขายไม่อยู่ใน transaction เดียว ขายเกินสต็อกได้ | พิสูจน์ในขั้น 3 ด้วยการทดสอบขายพร้อมกัน ก่อนย้าย `sales` ถ้าใช้ไม่ได้ ให้ส่ง transaction ผ่านพารามิเตอร์ของ port แทน |
| type ของ Eden หายเมื่อเส้นทางมาจากคลาส controller | หน้าเว็บตรวจ type ไม่ผ่าน | พิสูจน์ในขั้น 0 กับโมดูลเดียวก่อน |
| คำตอบของ API เปลี่ยนโดยไม่ตั้งใจ เช่น ลำดับช่องหรือช่องที่เพิ่มมา | หน้าเว็บหรือผู้ใช้ API พัง | การทดสอบ integration และการเทียบเอกสาร OpenAPI |
| ขนาดงาน | ฟีเจอร์ใน roadmap เลื่อน | ย้ายทีละโมดูล แต่ละขั้นใช้งานได้ จึงหยุดพักระหว่างขั้นได้ |
