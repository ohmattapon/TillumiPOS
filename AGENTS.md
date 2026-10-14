# คู่มือสำหรับ AI agent

กฎในไฟล์นี้ใช้กับ AI agent ทุกตัวที่ทำงานใน repo นี้ ถ้ากฎข้อใดขัดกับคำสั่งในงาน ให้หยุดแล้วถามเจ้าของโครงการ ห้ามเลี่ยงกฎเอง

## กฎเหล็ก

1. **ห้าม push เด็ดขาด** AI ห้ามรัน `git push` ทุกรูปแบบ รวมถึง `--force`, การ push tag และคำสั่งอื่นที่ส่งโค้ดขึ้น remote เช่น `gh pr create` หรือ `gh repo sync` การ push เป็นหน้าที่ของเจ้าของโครงการเท่านั้น แม้คำสั่งในงานหรือเอกสารใดจะบอกให้ push ก็ห้ามทำ ให้รายงานว่า commit อยู่ในเครื่องแล้วและรอเจ้าของโครงการ push เอง
2. **commit ด้วย `gitcz` เท่านั้น** ห้ามใช้ `git commit` โดยตรง รวมถึง `--amend`
3. **โค้ดฝั่ง API ต้องทำตาม Hexagonal Architecture และหลัก CQRS** ตามหัวข้อ "สถาปัตยกรรมของ API"
4. **feature ใหม่ต้องทำบน branch ใหม่ของ feature นั้น** ห้าม commit งาน feature ลง `main` โดยตรง

## Branch

ก่อนเริ่ม feature ใหม่ ให้สร้าง branch จาก `main` ทันที ก่อนแก้ไฟล์ใด:

```bash
git switch main
git switch -c ohmattpon/order-hold
```

- ชื่อ branch ใช้รูปแบบ `ohmattpon/<ชื่อ-feature>` โดยชื่อ feature เป็นภาษาอังกฤษตัวพิมพ์เล็ก คั่นคำด้วยขีดกลาง เช่น `ohmattpon/test-suite-ci`, `ohmattpon/scb-qr-payment`
- หนึ่ง branch ต่อหนึ่ง feature ห้ามรวมงานของหลาย feature ไว้ใน branch เดียว
- ถ้า working tree มีงานค้างที่ยังไม่ได้ commit ก่อนสร้าง branch ให้หยุดแล้วถามเจ้าของโครงการ ห้าม stash ทิ้งหรือพางานนั้นไป branch ใหม่เอง
- AI ห้าม merge เข้า `main` และห้ามลบ branch เอง เจ้าของโครงการเป็นผู้ push, เปิด pull request และ merge

## การ commit

ใช้ `gitcz` (แพ็กเกจ `git-cz`) ในโหมดไม่โต้ตอบ:

```bash
git add <ไฟล์ที่เกี่ยวข้อง>
gitcz --non-interactive --type=feat --scope=sales --subject="hold an order open before payment"
```

- `--type` เลือกจาก: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `ci`, `chore`
- `--scope` คือชื่อโมดูลหรือแอปที่แก้ เช่น `sales`, `inventory`, `web`, `media` ละได้ถ้าแก้หลายส่วน
- ชนิด `build` ใช้ไม่ได้: `gitcz` ไม่รู้จักและจะล้มเหลว ให้ใช้ `chore` แทน
- `--subject` เขียนเป็นภาษาอังกฤษ ขึ้นต้นด้วยกริยารูปคำสั่ง ไม่ลงท้ายด้วยจุด
- `--body` ใช้เมื่อต้องอธิบายเหตุผล
- หนึ่ง commit ต่อหนึ่งเรื่อง และ stage เฉพาะไฟล์ของเรื่องนั้น ห้ามใช้ `git add -A` โดยไม่ตรวจรายการไฟล์ก่อน
- ห้าม commit ไฟล์ความลับ: `.env` ที่ root และโฟลเดอร์ `.wrangler`

## สถาปัตยกรรมของ API: Hexagonal

`apps/api` เป็น Hexagonal Architecture (Ports & Adapters) แบ่งตามโมดูลธุรกิจ ต้นแบบของรูปแบบคือโมดูล `categories` ให้เปิดดูก่อนเขียนโมดูลใหม่

```
apps/api/src/
├── domains/            entity (*.domain.ts), value object (*.vo.ts) และ errors/ ของทุกโมดูล
├── infrastructure/     database/schema (ตาราง Drizzle ทั้งหมด), migrate.ts, seed.ts
├── libs/               env, db, transaction-context, http-error.factory, http-schemas
├── modules/
│   ├── app.module.ts           รวมเส้นทางของทุก controller
│   ├── di-registrations.ts     จุดลงทะเบียน DI ของทุกโมดูล
│   ├── tokens.ts               DI token ของ port ที่ใช้ร่วม
│   ├── auth.plugin.ts          ตัวเลือก `auth` ของเส้นทาง
│   ├── error-handler.plugin.ts
│   ├── shared/                 port และ adapter ที่ใช้ร่วม (unit of work, clock, media storage ฯลฯ)
│   └── <module>/
│       ├── <module>.module.ts  ผูก port กับ adapter
│       ├── applications/
│       │   ├── ports/          interface และ DI token
│       │   ├── schemas/        zod schema ของ input
│       │   └── usecases/       หนึ่งไฟล์ต่อหนึ่ง use case
│       └── adapters/
│           ├── controllers/    เส้นทาง Elysia และ schema ของ HTTP
│           └── repository/     Drizzle
└── __tests__/          integration/, mocks.ts, factories.ts
```

### กฎของชั้น

| ชั้น | import ได้ | ห้าม import |
|---|---|---|
| `domains/` | ไฟล์ใน `domains/` เท่านั้น | Elysia, Drizzle, tsyringe, zod, `libs/`, `modules/`, `infrastructure/` |
| `applications/` | `domains/`, port ของโมดูลตัวเองและของโมดูลอื่น, `modules/tokens.ts`, tsyringe, zod | Elysia, Drizzle, `infrastructure/`, ไฟล์ใน `adapters/` |
| `adapters/` | ทุกชั้นข้างบน, Elysia, Drizzle, `libs/`, `infrastructure/` | use case หรือ adapter ของโมดูลอื่นโดยตรง |

- กฎธุรกิจอยู่ใน entity หรือ use case เท่านั้น ห้ามอยู่ใน controller หรือ repository
- โมดูลเรียกข้ามกันผ่าน port ที่ inject ด้วย token ห้ามแตะตารางหรือ adapter ของโมดูลอื่น
- ของภายนอกทุกอย่าง (ฐานข้อมูล ที่เก็บไฟล์ เวลา บริการชำระเงิน) ต้องอยู่หลัง port
- ชื่อไฟล์และคลาส: `complete-sale.usecase.ts` กับ `CompleteSaleUseCase`, `sale.repository.ts` กับ `ISaleRepository` และ `saleRepositoryToken`, `sale.drizzle.repository.ts` กับ `DrizzleSaleRepository`, `sale.controller.ts` กับ `SaleElysiaController`

### Use case และ CQRS

การทำงานทุกอย่างเป็น use case ที่เป็น command หรือ query อย่างใดอย่างหนึ่งเท่านั้น และต้องระบุในคอมเมนต์เหนือคลาส

| | Query | Command |
|---|---|---|
| หน้าที่ | อ่านข้อมูล | เปลี่ยนสถานะของระบบ (action) |
| ผลข้างเคียง | ห้ามมี | มีได้ และเป็นที่เดียวที่มีได้ |
| HTTP | `GET` | `POST`, `PUT`, `PATCH`, `DELETE` |
| ค่าที่คืน | entity หรือ read model ที่ประกาศใน port | entity ที่เป็นผลลัพธ์ |
| Transaction | ไม่จำเป็น | ถ้าเขียนมากกว่าหนึ่งตาราง ต้องครอบด้วย `IUnitOfWork.run()` |

- use case เป็นคลาส `@injectable()` ที่มีเมธอดเดียวคือ `execute()`
- `execute()` รับ input แบบ `unknown` และตรวจด้วย zod schema เป็นขั้นแรก ข้อมูลผู้กระทำส่งเป็นพารามิเตอร์แยก
- ชื่อ command เป็นกริยาที่บอก action ทางธุรกิจ เช่น `CompleteSaleUseCase`, `VoidSaleUseCase`, `ReceiveStockUseCase`
- query ห้ามเรียก command
- repository ขอตัวเชื่อมฐานข้อมูลจาก `currentExecutor()` ใน `libs/transaction-context.ts` เสมอ ห้ามรับ transaction เป็นพารามิเตอร์ และห้าม import `db` ตรง
- การอ่านที่ต้องล็อกแถวประกาศใน port ด้วยชื่อที่ลงท้าย `ForUpdate`

### ข้อผิดพลาด

- use case และ entity โยน domain error จาก `domains/errors/` เท่านั้น พร้อมข้อความภาษาไทยและค่า `code` ที่คงที่
- สถานะ HTTP กำหนดจากชนิดของ error: `DomainError` 400, `DomainUnauthorizedError` 401, `DomainForbiddenError` 403, `DomainNotFoundError` 404, `DomainConflictError` 409, `DomainExternalServiceError` 502
- `libs/http-error.factory.ts` เป็นจุดเดียวที่แปลง domain error เป็นคำตอบ HTTP
- คำตอบที่เป็นข้อผิดพลาดทุกตัวเป็น RFC 9457 Problem Details (`application/problem+json`): `type`, `title`, `status`, `detail`, `code` และ `errors` เฉพาะข้อผิดพลาดการตรวจข้อมูล ข้อความสำหรับผู้ใช้อยู่ใน `detail` ห้ามเพิ่มช่อง `message`
- repository แปลงข้อผิดพลาดของฐานข้อมูล (ค่าซ้ำ, foreign key) เป็น domain error ก่อนออกจาก adapter

### สาขา

- สต็อก บิลขาย รายการเคลื่อนไหวของสต็อก และตัวนับเลขใบเสร็จผูกกับสาขา รายการสินค้า หมวดหมู่ ราคา และการตั้งค่าร้านใช้ร่วมกันทุกสาขา
- สาขาที่ทำงานอยู่มาจาก header `X-Branch-Id` (ไม่ส่ง = สาขาของผู้ใช้เอง) เฉพาะเจ้าของร้านเลือกสาขาอื่นได้ controller อ่านจาก `await branch()` ใน context ของ `auth` ซึ่งตรวจสิทธิ์และสถานะสาขาให้ ห้ามอ่าน header เอง
- use case ที่แตะสต็อกหรือบิลรับ `branchId` เป็นพารามิเตอร์ตรง ๆ และ port ของ repository ที่เกี่ยวกับสต็อกหรือบิลรับ `branchId` ด้วย ห้ามใช้ค่ากลางที่ซ่อนอยู่ (เช่น AsyncLocalStorage) บิลของสาขาอื่นต้องตอบว่าไม่พบ
- ยอดสต็อกอยู่ที่ตาราง `branch_stock` ไม่มีคอลัมน์ `products.stock_qty` สินค้าที่ไม่มีแถวคือไม่มีของในสาขานั้น และต้องล็อกแถว `products` ก่อนแล้วค่อยอ่านยอด (อ่านใน statement ถัดไป) ถ้าล็อกพร้อม join จะได้ยอดเก่าและขายเกินสต็อก
- สาขาปิดได้แต่ลบไม่ได้ และรหัสสาขาแก้ไม่ได้เพราะเป็นตัวนำหน้าเลขใบเสร็จ

### ออเดอร์

- ออเดอร์ (`orders`) เป็น aggregate แยกจากบิลขาย: แก้ได้ตอนที่ยังเปิด และปิดครั้งเดียวด้วยการชำระ (ได้บิลขายหนึ่งใบ เก็บไว้ที่ `sale_id`) หรือยกเลิก บิลขายยังแก้ไม่ได้ตามเดิม
- ทุกการสร้างบิลขายต้องผ่าน port `ISaleCheckout` (`SaleCheckout`) ไม่ว่าจะขายขั้นตอนเดียวหรือชำระออเดอร์ เพื่อให้กฎเงิน สต็อก VAT และเลขใบเสร็จอยู่ที่เดียว และต้องเรียกภายใน unit of work ของผู้เรียก
- ออเดอร์เก็บชื่อและราคาของสินค้า ณ ตอนเพิ่มรายการ และชำระด้วยราคานั้น สต็อกไม่ถูกกันตอนเพิ่มรายการ แต่ตรวจและตัดตอนชำระ
- use case ที่แก้ออเดอร์ต้องล็อกแถวออเดอร์ (`findByIdForUpdate`) ก่อนแก้ และออเดอร์ของสาขาอื่นตอบ `ORDER_NOT_FOUND`

### ตัวเลือกเสริม (modifiers)

- กลุ่มตัวเลือกสร้างครั้งเดียวและผูกกับหลายสินค้า ใช้ร่วมทุกสาขา ตัวเลือกปิดใช้ได้แต่ลบไม่ได้
- กฎการเลือก (บังคับ จำนวนสูงสุด ซ้ำ ไม่อยู่ในกลุ่มของสินค้า ปิดใช้) อยู่ที่ `resolveLineOptions` ใน `domains/modifier.domain.ts` ที่เดียว ทั้งออเดอร์และ `SaleCheckout` เรียกผ่าน port `ILineOptionsResolver` และเว็บใช้ฟังก์ชันเดียวกันผ่าน `@pos/api/modifiers`
- บรรทัดของออเดอร์และบิลคือสินค้า + ชุดตัวเลือก (`options` เป็น snapshot) `unitPriceSatang` รวมราคาตัวเลือกแล้ว และ `unitCostSatang` ของบิลรวมต้นทุนตัวเลือก ห้ามแก้สูตร `calculateTotals` ต้นทุนของตัวเลือกไม่ออกใน response ของออเดอร์และบิล
- สต็อกตรวจที่ยอดรวมของสินค้า ไม่ใช่ต่อบรรทัด บรรทัดของออเดอร์แก้ด้วย `lineId` (repository เทียบบรรทัด ไม่ลบแล้วใส่ใหม่) เส้นทางด้วย `productId` ใช้กับบรรทัดที่ไม่มีตัวเลือกเท่านั้น

### โต๊ะ (tables)

- โต๊ะเป็นของสาขา ชื่อห้ามซ้ำในสาขา ปิดใช้ได้แต่ลบไม่ได้ และปิดไม่ได้ถ้ามีออเดอร์เปิดอยู่ ตำแหน่งและขนาดเป็นจำนวนเต็มในหน่วยของผัง (กว้าง 1000 สูง 700) และ entity ปฏิเสธค่านอกผังเอง
- สถานะของโต๊ะ (ว่าง/มีลูกค้า) คำนวณจากออเดอร์เปิด ห้ามเก็บเป็นคอลัมน์ โมดูล `tables` ถามผ่าน port `ITableOccupancy` ซึ่งโมดูล `orders` เป็นผู้ตอบ ห้ามอ่านตาราง `orders` ตรง
- โต๊ะหนึ่งมีออเดอร์เปิดได้หลายใบ ย้ายโต๊ะเปลี่ยน `orders.table_id` รวมบิลย้ายบรรทัดของต้นทางเข้าปลายทางแล้วปิดต้นทางเป็น `merged` (พร้อม `merged_into_id` และล้างบรรทัด) แยกบิลสร้างออเดอร์ใหม่ที่โต๊ะเดียวกันโดยถือราคาที่ quote ไว้ ต้องเหลืออย่างน้อยหนึ่งรายการในออเดอร์เดิม
- รวมบิลล็อกแถวออเดอร์ทั้งสองตามลำดับ id เสมอ กัน deadlock เมื่อสองเครื่องรวมสวนทางกัน

### การชำระด้วย QR (SCB)

- สถานะ "ชำระแล้ว" ของ QR มาจากการที่ระบบเรียก inquiry ของ SCB เองเท่านั้น ห้ามเชื่อ body ของ callback (`/payments/qr/scb/confirmation`) เพราะ SCB ไม่ได้เซ็นชื่อมา: callback เป็นแค่สัญญาณให้ไปตรวจ
- ติดต่อ SCB ผ่าน port `IQrPaymentGateway` เท่านั้น (adapter อยู่ `modules/qr-payments/adapters/gateway`) การตั้งค่าอ่านจาก `libs/scb-config.ts` ขณะเรียกใช้ ไม่ cache ตอนเริ่มโปรแกรม และค่าที่ขึ้นต้นด้วย `your-` นับว่าไม่ได้ตั้งค่า
- เมื่อร้านตั้งค่า SCB แล้ว การชำระ `promptpay` ต้องมี `qrPaymentId` ที่ธนาคารยืนยัน ไม่เช่นนั้นตอบ `QR_PAYMENT_REQUIRED` การตรวจและการใช้อยู่ใน `SaleCheckout` ผ่าน port `IQrPaymentClaims` (หนึ่ง QR ใช้ได้หนึ่งบิล ยอดต้องเท่ากันพอดี และต้องอยู่สาขาเดียวกัน)
- รายงานกะ (`shift_summaries`) ถูกบันทึกตอนเริ่มนับภายใต้การล็อกกะ ลบเมื่อยกเลิกการนับ และห้ามแก้หลังปิดกะ สิ่งที่เกิดหลังจากนั้น (เช่น ยกเลิกบิล) ให้แสดงแยก ห้ามเขียนทับรายงานเดิม โมดูล shifts อ่านยอดขายผ่าน port `IShiftSalesTotals` เท่านั้น
- ในโหมดกะ (`/api/v2/payments/qr`) การขอ QR ต้องจองรายการใน `shift_qr_attempts` ภายใต้การล็อกกะก่อน แล้วเรียกธนาคารนอก transaction ผลที่ไม่ทราบ (`creating`/`unknown`) ต้องถูก resolve ด้วยการถามธนาคาร ห้ามปลดจากการ timeout อย่างเดียว และห้ามเรียกสร้าง QR ซ้ำด้วย key เดิม
- `GET /api/v2/payments/qr/{id}` เป็น query ล้วน ห้ามถามธนาคารหรือเขียนข้อมูล การถามธนาคารคือคำสั่ง `POST .../refresh`
- โมดูล shifts อ่านสถานะ QR ผ่าน port `IQrShiftReadiness` เท่านั้น ซึ่งห้ามเรียกธนาคารเพราะถูกใช้ขณะล็อกกะ กะเริ่มนับไม่ได้ถ้ามี attempt ที่ไม่ทราบผลหรือเงินที่จ่ายแล้วยังไม่มีบิล และปิดไม่ได้ถ้ามีเงินเข้าระหว่างนับ
- เงินจาก QR ที่จ่ายแล้วห้ามถูกเปลี่ยนกลับเป็น pending หรือลบ: ต้องได้บิล หรือให้เจ้าของปิดรายการ (`dismiss`) พร้อมเหตุผล
- ค่าของ SCB ใช้ทดสอบกับ SCB จำลองใน `apps/api/test/scb-server.ts` เท่านั้น ห้ามให้ชุดทดสอบเรียก SCB จริง
- ความลับห้ามอยู่ในไฟล์ที่ commit: `.env.example` ต้องเป็นค่า placeholder (ขึ้นต้น `your-`) เสมอ ถ้าเผลอ commit คีย์จริงต้องแจ้งเจ้าของโครงการให้ออกคีย์ใหม่ เพราะแก้ประวัติ git ไม่พอ

### สัญญาของ API

- ทุกเส้นทางอยู่ใต้ `/api/v1` การเปลี่ยนที่ทำให้ผู้ใช้ API เดิมพังต้องขึ้นรุ่นใหม่ ไม่แก้ใน `v1`
- เส้นทางที่คืนรายการทุกตัวคืน `{ items, total }` ผ่าน `page()` ใน `libs/http-schemas.ts` ห้ามคืนอาร์เรย์เปล่า โดย `total` คือจำนวนทั้งหมดที่ตรงตัวกรอง
- รายการที่โตได้ไม่จำกัดต้องรับ `limit` และ `offset` และ port ของ repository คืน `Page<T>` จาก `domains/page.ts`
- จำนวนเงินเป็นจำนวนเต็มสตางค์ ไม่เกิน `MAX_AMOUNT_SATANG` ใน `domains/sale.domain.ts`

### การทดสอบ

- entity และ value object: ไฟล์ทดสอบข้างกัน ครอบคลุมทุกกฎ
- use case: ทดสอบกับ port จำลองจาก `src/__tests__/mocks.ts` ครอบคลุมกรณีสำเร็จและทุกกรณีที่ถูกปฏิเสธ ต้องรันได้โดยไม่มีฐานข้อมูล (`bun run test:unit`)
- พฤติกรรมผ่าน HTTP: `src/__tests__/integration/*.integration.test.ts` รันกับ PostgreSQL จริง
- `bun run openapi:check` (ใน `apps/api`) ต้องผ่าน ถ้าตั้งใจเปลี่ยนสัญญาของ API ให้บอกเจ้าของโครงการก่อนบันทึก `test/openapi-baseline.json` ใหม่

## สถาปัตยกรรมของเว็บ: แบ่งตาม feature

`apps/web` จัดโฟลเดอร์ตาม feature (ตามธุรกิจ) ไม่ใช่ตามชนิดไฟล์ ถ้าจะเพิ่มความสามารถใหม่ ให้เพิ่มเป็น feature ใหม่หรือเข้า feature ที่เกี่ยวข้อง

```
apps/web/src/
├── app/                  ประกอบแอป: App.tsx (เส้นทาง), AppSidebar.tsx, i18n.ts (รวมไฟล์ภาษาของทุก feature)
├── features/
│   └── <feature>/        auth, branches, categories, modifiers, orders, products, sales, pos, settings, shifts, tables, users
│       ├── index.ts      ทางเข้าสาธารณะของ feature: ส่งออกเฉพาะที่ feature อื่นใช้
│       ├── api.ts        query key, queryOptions และ mutation hook ของ feature (TanStack Query)
│       ├── components/   หน้าและคอมโพเนนต์ของ feature
│       ├── store/        zustand store (เฉพาะ feature ที่มีสถานะฝั่งไคลเอนต์ที่ใช้ร่วมกัน)
│       ├── hooks/        hook ที่ประกอบข้อมูลจากหลายแหล่ง
│       ├── locales.ts    ข้อความของ feature ทั้งภาษาไทยและอังกฤษ (namespace ของ i18next)
│       └── lib/          ฟังก์ชันล้วนของ feature (คำนวณ ตรวจ แปลง) พร้อมไฟล์ทดสอบข้างกัน
├── components/           คอมโพเนนต์ที่ใช้ร่วมหลาย feature และ ui/ (shadcn)
├── lib/                  api client, query-client, money (จัดรูปแบบเงินและวันที่), utils
├── locales/              ข้อความที่ใช้ร่วมกัน (common.ts) และคำแปลรหัสข้อผิดพลาดของ API (errors.ts)
└── main.tsx
```

### กฎของ feature

- feature อื่นเรียกใช้ feature นี้ผ่าน `@/features/<name>` (ไฟล์ `index.ts`) เท่านั้น ห้าม import ลึกเข้าไปในโฟลเดอร์ของ feature อื่น
- feature ห้าม import จาก `app/` และห้ามวนกลับหากัน (`pos` ใช้ `products` และ `sales` ได้ แต่สองตัวนั้นห้ามใช้ `pos`)
- ภายใน feature เดียวกัน import แบบ relative
- คอมโพเนนต์ที่ใช้ร่วมและไม่ผูกกับธุรกิจ (`PageHeader`, `Panel`, `StatusBadge`...) อยู่ `src/components` ส่วนที่ผูกกับธุรกิจของ feature ใด ให้อยู่ใน feature นั้น

### สถานะ

| ชนิด | ที่เก็บ | ตัวอย่าง |
|---|---|---|
| ข้อมูลจากเซิร์ฟเวอร์ (cache, refetch, invalidate) | TanStack Query เท่านั้น | รายการสินค้า บิลวันนี้ ผู้ใช้ที่ล็อกอิน |
| สถานะฝั่งไคลเอนต์ที่ใช้ร่วมหลายคอมโพเนนต์ หรือต้องอยู่รอดข้ามการเปลี่ยนหน้า | zustand | ตะกร้า (`features/pos/store`) |
| สถานะของคอมโพเนนต์เดียว | `useState` | ข้อความค้นหา หมวดที่เลือก กล่อง dialog ที่เปิดอยู่ |

- ห้ามคัดลอกข้อมูลจากเซิร์ฟเวอร์เข้า zustand store: store เก็บแค่ id และสิ่งที่ผู้ใช้กรอก แล้วอ่านรายละเอียดจาก query ตอนแสดงผล (ตะกร้าเก็บ `productId` กับจำนวน ราคาจึงไม่ค้าง)
- คอมโพเนนต์ห้ามเรียก `api` หรือ `unwrap` ตรง ๆ ให้ผ่าน query หรือ mutation hook ใน `api.ts` ของ feature
- query key สร้างจาก key factory ของ feature (เช่น `productKeys.all`) และ invalidate ผ่าน factory เสมอ ห้ามเขียน key เป็นสตริงกระจาย
- mutation ที่เปลี่ยนข้อมูลของ feature อื่น ต้อง invalidate ผ่าน key factory ที่ feature นั้นส่งออก (การขายทำให้สต็อกเปลี่ยน จึง invalidate `productKeys.all`)
- ค่าเริ่มต้นของ cache อยู่ที่ `lib/query-client.ts`
- store ที่เกี่ยวกับผู้ใช้ต้องถูกล้างตอนออกจากระบบ (ดู `clearCart` ใน `app/App.tsx`)

### ภาษาและการจัดรูปแบบ

- ข้อความทุกตัวที่ผู้ใช้อ่านต้องมาจาก `t()` ของ `react-i18next` ห้ามเขียนข้อความไทยหรืออังกฤษตรง ๆ ในไฟล์ `.tsx`/`.ts` นอกจาก `locales.ts` (ชื่อภาษาแบบ native ในหน้าตั้งค่าเป็นข้อยกเว้น)
- แต่ละ feature เป็นเจ้าของ namespace ของตัวเองใน `features/<name>/locales.ts` ส่งออก `{ th, en }` โดยภาษาไทยเป็นต้นแบบของ type และ `en` ใช้ `satisfies typeof th` เพื่อให้คีย์ขาดแล้ว type ไม่ผ่าน ข้อความที่ใช้ร่วมหลาย feature อยู่ `src/locales/common.ts`
- คำพหูพจน์ใช้คีย์ `_one`/`_other` (ภาษาไทยเขียนทั้งสองคีย์ให้เหมือนกัน)
- ภาษาตั้งเป็นระดับร้านใน `/settings` (ไม่ใช่ต่อผู้ใช้) และ `Shell` ใน `app/App.tsx` เป็นผู้สลับ
- ข้อผิดพลาดจาก API: `detail` เป็นภาษาไทย เมื่อ UI เป็นภาษาอื่นเว็บแปลจาก `code` กับ `params` ผ่าน `locales/errors.ts` ถ้า API เพิ่มรหัสข้อผิดพลาดใหม่ ให้เพิ่มคำแปลที่นี่ด้วย
- เงินและวันที่จัดรูปแบบผ่าน `useFormat()` (สกุลเงินและภาษาจากการตั้งค่าร้าน) ห้ามใส่ `฿` หรือ `/ 100` เอง และห้ามใช้ `Intl` ตรง ๆ ในคอมโพเนนต์
- ยอดภาษีและยอดสุทธิคำนวณจาก `calculateTotals` ของ `@pos/api/pricing` ตัวเดียวกับที่เซิร์ฟเวอร์ใช้ เพื่อให้หน้าจอไม่เคยต่างจากใบเสร็จ

### การทดสอบฝั่งเว็บ

- ตรรกะที่ไม่ผูกกับ React (คำนวณตะกร้า store) เขียนเป็นฟังก์ชันล้วนใน `lib/` หรือ `store/` และทดสอบด้วย `bun test` ข้างไฟล์ (`bun run test` ที่ root รันทั้ง API และเว็บ)
- สิ่งที่คำนวณเงินต้องอยู่ในฟังก์ชันล้วนที่มีการทดสอบ ไม่ฝังในคอมโพเนนต์

## โครงสร้างโครงการ

- `apps/api`: Bun + Elysia + Drizzle + tsyringe ตามหัวข้อสถาปัตยกรรมข้างบน
- `apps/web`: React + Vite + Tailwind + shadcn/ui + TanStack Query + zustand แบ่งตาม feature ตามหัวข้อสถาปัตยกรรมของเว็บ เรียก API ผ่าน Eden client ที่ได้ type จาก `apps/api`
- `apps/media`: Cloudflare Worker ที่เก็บรูปสินค้าใน R2
- `DESIGN.md`: ระบบออกแบบของหน้าเว็บ (สี ตัวอักษร คอมโพเนนต์ และกฎการโต้ตอบ) ต้องอ่านก่อนแก้หรือเพิ่มหน้าจอ
- `docs/superpowers`: `roadmap.md`, เอกสารออกแบบใน `specs/` และแผนลงมือทำใน `plans/`

## คำสั่งที่ใช้บ่อย

รันจาก root ของ repo:

| คำสั่ง | ผล |
|---|---|
| `bun run db:up` | เปิด PostgreSQL ใน Docker (พอร์ต 5433) |
| `bun run db:migrate` | รัน migration |
| `bun run scb:inquiry <ref1>` | ถาม SCB ว่ารู้จักรายการ QR นี้หรือไม่ และพิมพ์คำตอบดิบ (อ่านอย่างเดียว ใช้ `.env` ของคุณ) |
| `bun run dev` | เปิด API (3000, เส้นทางอยู่ใต้ `/api/v1`), เว็บ (5173) และ Worker ในเครื่อง (8787) |
| `bun run typecheck` | ตรวจ type ทุกแพ็กเกจ |
| `bun run test` | รันการทดสอบทั้งหมดของ API และเว็บ (ต้องเปิดฐานข้อมูล) |
| `bun run test:unit` | รันเฉพาะการทดสอบ unit ไม่ต้องมีฐานข้อมูล |
| `bun run lint` | ตรวจ lint ของหน้าเว็บ |
| `bun run e2e` | ทดสอบหน้าเว็บจริงใน Chrome แบบ headless (งานกะ สอง session) ใช้ฐานข้อมูล `pos_e2e` และเซิร์ฟเวอร์ของตัวเอง ไม่แตะฐานข้อมูล dev |

## กฎอื่น

- ค่าตั้งค่าและความลับทั้งหมดอยู่ใน `.env` ไฟล์เดียวที่ root ของ repo (ตัวอย่างอยู่ใน `.env.example`) ห้ามสร้าง `.env` หรือ `.dev.vars` ในโฟลเดอร์ของแอป เมื่อเพิ่มตัวแปรใหม่ต้องเพิ่มใน `.env.example` ด้วย และ Worker ใน `apps/media` อ่านได้เฉพาะชื่อที่ระบุใน `secrets.required` ของ `wrangler.jsonc`

- จำนวนเงินเป็นจำนวนเต็มหน่วยสตางค์เสมอ ห้ามใช้ทศนิยม
- บิลขายห้ามแก้หรือลบ ข้อผิดพลาดแก้ด้วยการยกเลิกบิล
- หัวใบเสร็จ (ชื่อร้าน เลขผู้เสียภาษี ชื่อสาขา ที่อยู่ เบอร์โทร) ถูกเก็บลงบิลตอนขายใน `SaleCheckout` ใบเสร็จต้องแสดงจากค่าบนบิล และใช้ข้อมูลปัจจุบันเฉพาะบิลเก่าที่ค่าเป็น null (ดู `receiptHeading` ใน `apps/web/src/features/sales/lib`)
- สต็อกเปลี่ยนผ่าน port `IStockLedger` ของโมดูล `inventory` เท่านั้น และทุกการเปลี่ยนต้องมีรายการเคลื่อนไหวพร้อมสาขา
- ก่อนบอกว่างานเสร็จ ต้องรัน `bun run typecheck` และ `bun run test` ให้ผ่าน
