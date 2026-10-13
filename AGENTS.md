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
- repository แปลงข้อผิดพลาดของฐานข้อมูล (ค่าซ้ำ, foreign key) เป็น domain error ก่อนออกจาก adapter

### การทดสอบ

- entity และ value object: ไฟล์ทดสอบข้างกัน ครอบคลุมทุกกฎ
- use case: ทดสอบกับ port จำลองจาก `src/__tests__/mocks.ts` ครอบคลุมกรณีสำเร็จและทุกกรณีที่ถูกปฏิเสธ ต้องรันได้โดยไม่มีฐานข้อมูล (`bun run test:unit`)
- พฤติกรรมผ่าน HTTP: `src/__tests__/integration/*.integration.test.ts` รันกับ PostgreSQL จริง
- `bun run openapi:check` (ใน `apps/api`) ต้องผ่าน ถ้าตั้งใจเปลี่ยนสัญญาของ API ให้บอกเจ้าของโครงการก่อนบันทึก `test/openapi-baseline.json` ใหม่

## โครงสร้างโครงการ

- `apps/api`: Bun + Elysia + Drizzle + tsyringe ตามหัวข้อสถาปัตยกรรมข้างบน
- `apps/web`: React + Vite + Tailwind + shadcn/ui เรียก API ผ่าน Eden client ที่ได้ type จาก `apps/api`
- `apps/media`: Cloudflare Worker ที่เก็บรูปสินค้าใน R2
- `DESIGN.md`: ระบบออกแบบของหน้าเว็บ (สี ตัวอักษร คอมโพเนนต์ และกฎการโต้ตอบ) ต้องอ่านก่อนแก้หรือเพิ่มหน้าจอ
- `docs/superpowers`: `roadmap.md`, เอกสารออกแบบใน `specs/` และแผนลงมือทำใน `plans/`

## คำสั่งที่ใช้บ่อย

รันจาก root ของ repo:

| คำสั่ง | ผล |
|---|---|
| `bun run db:up` | เปิด PostgreSQL ใน Docker (พอร์ต 5433) |
| `bun run db:migrate` | รัน migration |
| `bun run dev` | เปิด API (3000), เว็บ (5173) และ Worker ในเครื่อง (8787) |
| `bun run typecheck` | ตรวจ type ทุกแพ็กเกจ |
| `bun run test` | รันการทดสอบทั้งหมดของ API (ต้องเปิดฐานข้อมูล) |
| `bun run test:unit` | รันเฉพาะการทดสอบ unit ไม่ต้องมีฐานข้อมูล |
| `bun run lint` | ตรวจ lint ของหน้าเว็บ |

## กฎอื่น

- ค่าตั้งค่าและความลับทั้งหมดอยู่ใน `.env` ไฟล์เดียวที่ root ของ repo (ตัวอย่างอยู่ใน `.env.example`) ห้ามสร้าง `.env` หรือ `.dev.vars` ในโฟลเดอร์ของแอป เมื่อเพิ่มตัวแปรใหม่ต้องเพิ่มใน `.env.example` ด้วย และ Worker ใน `apps/media` อ่านได้เฉพาะชื่อที่ระบุใน `secrets.required` ของ `wrangler.jsonc`

- จำนวนเงินเป็นจำนวนเต็มหน่วยสตางค์เสมอ ห้ามใช้ทศนิยม
- บิลขายห้ามแก้หรือลบ ข้อผิดพลาดแก้ด้วยการยกเลิกบิล
- สต็อกเปลี่ยนผ่าน port `IStockLedger` ของโมดูล `inventory` เท่านั้น และทุกการเปลี่ยนต้องมีรายการเคลื่อนไหว
- ก่อนบอกว่างานเสร็จ ต้องรัน `bun run typecheck` และ `bun run test` ให้ผ่าน
