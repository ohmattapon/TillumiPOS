# Demo โหมด memory (ไม่ต่อ DB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รัน TillumiPOS ทั้งแอปโดยไม่ต้องมี PostgreSQL เลย ข้อมูลอยู่ในหน่วยความจำ รีเซ็ตทุกครั้งที่รีสตาร์ท ใช้โชว์ให้คนอื่นดู บน branch `ohmattpon/dev`

**Design decisions (grill 2026-10-19, user ตอบ):**
- ทั้งแอป ไม่ใช่แค่ flow หลัก
- mock ที่ชั้น server (memory adapters) ใช้ use case/entities เดิม พฤติกรรมเหมือนของจริง
- รีเซ็ตเมื่อรีสตาร์ท ไม่ persist ลงไฟล์

**Architecture:** `DEMO_MODE=memory` เลือก composition root ฝั่ง memory: repository/port ทุกตัวที่แตะ DB มีแฝด memory (Map + auto-increment) ส่วน service ที่คุยผ่าน port อยู่แล้ว (QrPaymentClaims, SaleCheckout, AuthorizeSession ฯลฯ) ไม่ต้องแตะ บูตแล้ว seeder ใส่ข้อมูลชุดเดียวกับ `db:seed:demo` (ผู้ใช้+รหัสคงที่, สินค้า, บิล 3 สัปดาห์, กะ, สต็อก) ลง memory repos ตรง ๆ ผ่าน entity constructors

**Tech Stack:** เดิมทั้งก้อน (Bun, Elysia, Drizzle types เป็น type อย่างเดียว, tsyringe) + `bun run demo:memory`

**Non-goals:** persist ข้ามรีสตาร์ท, bank QR จริง (ใช้ static QR/manual แทน), รูป R2 (`MEDIA_STORAGE=none`), รันหลาย instance, USB/Bluetooth (ของ thermal), เปลี่ยน seed เดิม

## Global Constraints

- ทำบน branch `ohmattpon/dev` (ฐาน `origin/main` #74) ห้าม merge เข้า `main` ห้ามลบ branch
- commit ด้วย `gitcz --non-interactive` เท่านั้น ห้าม `git commit`/`--amend` ห้าม type `build`, stage เฉพาะไฟล์ของ concern นั้น
- ห้าม push เด็ดขาด รอเจ้าของ push เอง (เคยกด push ให้เฉพาะตอนเจ้าของสั่งชัด)
- API: Hexagonal + CQRS เหมือนเดิม memory adapter อยู่ `adapters/` ของโมดูลเจ้าของ port นั้น (provider side) หรือโมดูลตัวเอง
- `domains/` import ได้เฉพาะ `domains/`; core ห้าม `Date.now()/new Date()/crypto/Math.random/fetch/setTimeout/console/process.env/Bun.env` ตรง (memory repo ใช้ Map + counter อย่างเดียว เวลาผ่าน `IClock`)
- ห้ามแตะไฟล์ seed เดิม (`seed.ts`, `seed-demo.ts`) และ migration เดิม
- เงินเป็น satang integer; บิลห้ามแก้/ลบ (void เท่านั้น)
- ก่อนบอกเสร็จต้องผ่าน `bun run typecheck` + `bun run test:unit` + smoke test บูต demo (ไม่ต้องมี DB)

## Review Focus

1. **โหมด demo แตะ DB จริงไม่ได้เลย:** memory adapter ห้าม import `libs/db`, `libs/env` (ยกเว้น composition root), `drizzle-orm` ใช้เป็น type ได้ ห้าม query; `DATABASE_URL` ที่ demo script ส่งเป็น dummy ที่ไม่มี server ฟัง (`postgres://demo:demo@127.0.0.1:1/demo`) ตรวจด้วย grep ก่อน commit
2. **รหัส demo ไม่รั่วไป production:** ผู้ใช้ demo (รหัสคงที่) อยู่ใน seeder ของ demo เท่านั้น มี banner ตอนบูตว่า DEMO MODE ห้ามเอา code นี้ไปรันกับข้อมูลจริง
3. **ForUpdate = no-op:** memory เป็น single process จึงไม่ล็อก แต่ต้องคอมเมนต์ไว้ทุก port ที่สัญญาว่าล็อก กันคนเอาไปใช้ผิดที่
4. **Idempotency/command_receipts:** แฝด memory ใช้ Map ตาม scope เดิม (actor+branch+action+key)

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `server/src/modules/demo-memory/demo-memory.module.ts` | composition root ฝั่ง memory: bind memory impl ทุก token |
| `server/src/modules/demo-memory/memory/*.ts` | `MemoryUnitOfWork`, `MemoryCommandReceipts`, `MemoryAuditLog` (+ test) |
| `server/src/modules/<m>/adapters/repository/*.memory.repository.ts` | แฝด memory ของ drizzle repository เดิม (23 ไฟล์) |
| `server/src/modules/<m>/adapters/.../*.memory.adapter.ts` | แฝด memory ของ provider adapter ที่แตะ DB ตรง (9 ไฟล์) |
| `server/src/modules/demo-memory/demo-seed.ts` | seeder ใส่ข้อมูล demo ผ่าน entity + memory repos (รหัสคงที่, PIN คงที่) |
| `server/src/modules/demo-memory/demo-boot.test.ts` | smoke test บูต demo ทั้งระบบโดยไม่ต้องมี DB |
| `docs/demo-mode.md` | วิธีรัน รหัสเข้า สิ่งที่ใช้ไม่ได้ ข้อควรระวัง |
| `package.json` | script `demo:memory` |

---

### Task 1: แกน memory + สวิตช์ composition + สคริปต์รัน

**Files:**
- Create: `server/src/modules/demo-memory/memory/unit-of-work.memory.ts` (`run` เรียก fn ตรง ไม่มี tx), `command-receipts.memory.ts` (Map ตาม scope + `lock()` no-op), `audit-log.memory.ts` (array + `list` แบบง่าย)
- Create: `server/src/modules/demo-memory/demo-memory.module.ts` (ตอนนี้ bind 3 ตัวบน + import ใน `di-registrations.ts` แบบมีเงื่อนไข `Bun.env.DEMO_MODE === 'memory'`)
- Modify: `package.json` เพิ่ม `"demo:memory": "DEMO_MODE=memory MEDIA_STORAGE=none DATABASE_URL=postgres://demo:demo@127.0.0.1:1/demo bun run dev"` (Windows: `cross-env`? ดูว่า scripts อื่นทำอย่างไร ห้าม hardcode secret — URL นี้เป็น dummy ไม่มี server ฟัง)
- Create: `server/src/modules/demo-memory/memory/memory-kernel.test.ts` (receipts lock/find/create, audit record/list)

**Dependencies:** ไม่มี
**Race risks:** `di-registrations.ts` เป็นจุดเดียวที่เลือก composition — task อื่นห้ามแตะไฟล์นี้จนกว่า Task 6 (wiring) รอรวม bind ทั้งหมดทีเดียว
**Verification:**
- `bun run test:unit` (kernel test เขียว ไม่ต้องมี DB)
- grep `libs/db|libs/env|drizzle-orm` ใน `modules/demo-memory` ต้องเจอแค่ type-import (ไม่มี query)

---

### Task 2: memory repositories กลุ่มแคตตาล็อก (อิสระต่อกัน)

**Files (แฝด memory, Map + auto-increment id, `*ForUpdate` = no-op + คอมเมนต์):**
- `branches/adapters/repository/branch.memory.repository.ts`
- `users/adapters/repository/user.memory.repository.ts`
- `roles/adapters/repository/role.memory.repository.ts`
- `categories/adapters/repository/category.memory.repository.ts`
- `products/adapters/repository/product.memory.repository.ts`
- `modifiers/adapters/repository/modifier.memory.repository.ts`
- `members/adapters/repository/member.memory.repository.ts`
- `promotions/adapters/repository/promotion.memory.repository.ts`
- `settings/adapters/repository/shop-settings.memory.repository.ts` (เริ่มจาก `DEFAULT_SHOP_SETTINGS`, seeder เขียนทับ)
- `tables/adapters/repository/table.memory.repository.ts`
- `display-slides/adapters/repository/slide.memory.repository.ts`

**Dependencies:** Task 1 (pattern kernel) — แต่ละไฟล์อิสระกัน
**Race risks:** id เริ่ม 1 ทุกตาราง; สาขา `MAIN` ต้อง id 1, owner `admin` id 1 (smoke test พึ่ง) — กำหนดใน seeder ไม่ใช่ใน repo; ห้าม copy สูตร Map ซ้ำ ๆ เกิน 3 ครั้งโดยไม่แยก helper (`memory-store.ts` ถ้าจำเป็น)
**Verification:**
- `bun run test:unit`
- สุ่มตรวจ 1 ไฟล์ว่า `getForUpdate` ไม่ล็อกจริงแต่มีคอมเมนต์

---

### Task 3: memory repositories กลุ่มธุรกรรม + provider adapters (9 ตัว)

**Files:**
- Repos: `sales/sale.memory`, `orders/order.memory`, `inventory/stock-movement.memory` + stock ledger (ดูว่า ledger เป็น service หรือ repo — ถ้า service ที่ใช้ port อยู่แล้วไม่ต้องทำ), `stock-receipts/stock-receipt.memory`, `shifts/shift.memory` + `shift-summary.memory` + `register.memory`(อยู่ใน shifts?), `qr-payments/qr-attempt.memory` + `qr-payment.memory`, `quotes/price-quote.memory`
- Provider twins (implement port ของ consumer โดยอ่าน memory repo ของโมดูลตัวเอง): `orders/table-occupancy.memory.adapter`, `sales/shift-sales-totals.memory.adapter`, `qr-payments/qr-shift-readiness.memory.adapter`, `quotes/quote-products.memory.adapter`, `members/member-sales-history.memory.adapter`, `shifts/shift-ledger.memory.adapter` + `shift-settings-guard.memory.adapter`, `setup/first-run-guard.memory.adapter` (มี users แล้ว = ตั้งค่าแล้ว), `roles/role-usage.memory.adapter`
- ข้าม (ไม่แตะ DB อยู่แล้ว): `QrPaymentClaims`/`QrPaymentRefresher` (services ผ่าน port), `ISetupCode` adapter (ถ้าไม่แตะ DB — ตรวจก่อน), `IPinGuard`/`IPairingGuard` (in-memory อยู่แล้ว), `ICheckoutPolicy` (อ่าน env — ตรวจก่อน), `ISaleCheckout`, cafe-menu (ตรวจว่าใช้ port ล้วนไหม ถ้าแตะ DB ตรงให้ทำ twin เพิ่ม)

**Dependencies:** Task 2 (pattern repo)
**Race risks:** twin ต้อง inject memory repo ของโมดูลตัวเองผ่าน port เดิม ห้าม import drizzle repo; `IQuoteClaims.reserveForQr` เดิมใช้ DB transaction ผ่าน port อื่น — twin นี้ซับซ้อนสุด ให้ทำท้ายสุดของ task
**Verification:**
- `bun run test:unit`
- `grep currentExecutor` ในไฟล์ memory ทั้งหมดต้องได้ 0

---

### Task 4: demo seeder (ข้อมูลชุดเดียวกับ seed:demo)

**Files:**
- Create: `server/src/modules/demo-memory/demo-seed.ts` — สร้างผ่าน entity constructors + memory repos โดยตรง (ไม่ผ่าน use case เพื่อความเร็ว): owner `admin` + แคชเชียร์ (รหัสคงที่ จดใน docs ห้ามใช้ที่อื่น), PIN คงที่สำหรับ quick-switch, `shop_settings` (รวม printer ปิดไว้), สินค้า/หมวด/ตัวเลือกจาก `demo-product-catalog.json` (import JSON เดิมได้ ห้าม copy), บิล+กะ+สต็อก+ออเดอร์โต๊ะย้อนหลังแบบย่อ (ไม่ต้องเท่า seed-demo 3 สัปดาห์ เอาให้ครบทุกจอ: วันนี้มีบิล, รายงานมีกราฟ, กะมีประวัติ)
- เรียกจาก `demo-memory.module.ts` ตอนบูต (memory เท่านั้น)

**Dependencies:** Task 2+3 (repos ครบ)
**Race risks:** รหัส/PIN คงที่ต้องมีเฉพาะในไฟล์นี้ + docs ห้ามหลุดไป seed จริง; สินค้าอ้างรูป R2 ไม่ได้ (`MEDIA_STORAGE=none` ไม่มีรูป — รับได้สำหรับ demo)
**Verification:**
- smoke ด้วยตา: บูตแล้ว `GET /api/v1/settings`, login, เปิดดูมีข้อมูล
- `bun run test:unit`

---

### Task 5: wiring + ความปลอดภัย + docs

**Files:**
- Modify: `server/src/modules/demo-memory/demo-memory.module.ts` (bind ครบทุก token), `server/src/modules/di-registrations.ts` (สวิตช์ `DEMO_MODE`, banner `console` ที่ composition root อนุญาตเพราะเป็น adapter concern — ตรวจว่าไม่มี `console` ใน core)
- Create: `docs/demo-mode.md` (วิธีรัน, รหัสเข้า, รีเซ็ตเมื่อรีสตาร์ท, สิ่งที่ใช้ไม่ได้: bank QR/R2/หลาย instance/USB printer, คำเตือนห้ามใช้กับข้อมูลจริง)
- Modify: `docs/summary.md` + `docs/superpowers/roadmap.md` (1-2 บรรทัด: มี demo mode)

**Dependencies:** Task 1-4
**Race risks:** ไฟล์เดียวที่ห้ามชนกันคือ `di-registrations.ts` — ทำ task นี้คนเดียวตอนท้าย
**Verification:**
- `bun run demo:memory` บูตขึ้นโดยไม่มี Postgres ฟังอยู่เลย, banner ขึ้น, login ได้, ขาย+void ได้, รีสตาร์ทแล้วข้อมูลกลับมาชุดเดิม
- grep สุดท้าย: `libs/db` ต้องไม่มีใน `modules/demo-memory` และ memory adapters (นอกจาก type)

---

### Task 6: smoke test บูตทั้งระบบ (ไม่ใช้ DB) + ปิดงาน

**Files:**
- Create: `server/src/modules/demo-memory/demo-boot.test.ts` — บูต container ฝั่ง memory: login admin → อ่าน settings → ขาย 1 บิล → เปิดดูรายงาน → void → ตรวจ audit มี `sale.void` (ทุกอย่างผ่าน use case จริง ไม่ใช่ mock)
- ตรวจรวม: `bun run typecheck` + `bun run test:unit` + `bun run lint`

**Dependencies:** Task 5
**Race risks:** smoke test ห้าม import `test/harness` (ตัวนั้นบังคับ DB) — บูต container เองในไฟล์
**Verification:**
- `bun test server/src/modules/demo-memory/demo-boot.test.ts` เขียวโดยไม่มี Postgres
- checklist คลิกด้วยมือ: ล็อกอิน → ขาย → จ่าย → พิมพ์ (PDF) → รายงาน → ตั้งค่า → สลับคน (PIN)

---

## ลำดับทำ + ขนานได้

- Wave 1: Task 1
- Wave 2 (parallel): Task 2 ทั้ง 11 ไฟล์ + สำรวจ Task 3 ว่า service ใดใช้ port ล้วน (ไม่ต้อง twin)
- Wave 3: Task 3
- Wave 4: Task 4 → Task 5 → Task 6 ตามลำดับ (แตะจุดเดียวกัน)
- ปิดงาน: typecheck + test:unit + lint + smoke + checklist คลิกมือ

## นอกสโคปที่เจ้าของรับทราบแล้ว

- persist ข้ามรีสตาร์ท, bank QR จริง, รูป R2, หลาย instance, USB/Bluetooth, e2e บน demo mode
- ห้ามเอาโหมดนี้ไปรันกับข้อมูลจริงเด็ดขาด
