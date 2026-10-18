# Static PromptPay QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ร้านเลือกจ่ายพร้อมเพย์แบบ QR คงที่ (กรอกเบอร์/บัตรครั้งเดียวในตั้งค่าร้าน ฝังยอดตามบิล พนักงานกดยืนยันเอง) โดยยังเก็บขั้นตอนตรวจเงินกับธนาคาร (SCB) ไว้เป็นอีกทางเลือก

**Estimated tasks:** 8 | **Estimated time:** ~90 min | **Touches:** API (domains, settings, sales, qr-payments, DB) / Frontend (settings, pos) / Deps

## Current Problem / Current Solution

ทุกวันนี้ QR พร้อมเพย์ต้องสร้างผ่านธนาคาร SCB (`POST /api/v1/payments/qr`, `/api/v2/payments/qr` ในโหมดกะ) แล้ว POS ถามธนาคารซ้ำทุก 3 วินาที (`QR_POLL_MS` ใน `src/features/pos/api.ts`) จนกว่าจะได้สถานะ paid ร้านที่ไม่มีข้อมูลร้านค้ากับ SCB ใช้พร้อมเพย์ได้แค่แบบพนักงานตรวจยอดเองโดยไม่มี QR ให้ลูกค้าสแกน และเมื่อตั้งค่า SCB แล้ว `SaleCheckout` บังคับ (`QR_PAYMENT_REQUIRED`) ทุกการจ่ายพร้อมเพย์ต้องมี `qrPaymentId` ที่ธนาคารยืนยันแล้ว (`server/src/modules/sales/applications/services/sale-checkout.ts:232-241`, `QrPaymentClaims.isRequired()` คืน `gateway.isEnabled()`)

## Proposed Approach

เพิ่มโหมด `static` เป็นทางเลือกในตั้งค่าร้าน เจ้าของร้านกรอกตัวระบุพร้อมเพย์ครั้งเดียว (เบอร์มือถือ 10 หลักหรือเลขบัตร 13 หลัก) แล้วหน้า `PaymentDialog` สร้าง QR payload ตามมาตรฐาน EMVCo/PromptPay ฝังยอดของบิลนั้นด้วยฟังก์ชัน pure ที่ใช้ร่วมกันระหว่าง server กับ web (แบบเดียวกับ `@pos/api/pricing`, `@pos/api/modifiers`) การจ่ายแบบ static ไม่ต้องมี `qrPaymentId` พนักงานดูยอดเข้าที่แอปธนาคารแล้วกดยืนยันใน POS (พฤติกรรมเดียวกับ trust fallback ปัจจุบัน) โหมดเริ่มต้นของร้านเดิมคือ `bank` จึงไม่มีพฤติกรรมเปลี่ยนจนกว่าเจ้าของร้านจะเปิดเอง

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| ร้านไม่ตั้งค่า SCB เลือกจ่ายพร้อมเพย์ | ไม่มี QR ให้สแกน พนักงานตรวจยอดเองแล้วปิดบิล | แสดง QR คงที่ฝังยอดบิลให้ลูกค้าสแกน พนักงานกดยืนยันแล้วปิดบิล |
| ร้านตั้งค่า SCB ไว้ (โหมด bank) | สร้าง QR ผ่านธนาคาร ถามสถานะทุก 3 วิ บังคับ claim ยอดตรง | เหมือนเดิมทุกประการ |
| ร้านตั้ง SCB ไว้แต่สลับเป็นโหมด static | เป็นไปไม่ได้ (บังคับใช้ธนาคาร) | ข้ามขั้นตอนธนาคาร จ่ายแบบพนักงานยืนยัน ไม่สร้าง `shift_qr_attempts` |
| โหมดกะ (`shifts`) + static | N/A | ใช้กฎเดียวกันผ่าน `ISaleCheckout` (ทุกบิลผ่านจุดเดียว) ไม่แตะขั้นตอนนับกะหรือรายงานกะ |

## Assumptions & Risks

- **Assumed:** โหมดเริ่มต้น `bank` สำหรับร้านเดิมทั้งหมด (migration ตั้ง default นี้) พฤติกรรมปัจจุบันจึงไม่เปลี่ยนจนกว่าเจ้าของร้านจะสลับเอง
- **Assumed:** จำแนกเบอร์มือถือ/บัตรประชาชนด้วยความยาว (10 หลักขึ้นต้น 0 = มือถือ → tag `01` เติม `0066`; 13 หลัก = บัตร → tag `02`) ไม่ต้องมีฟิลด์ชนิดแยก
- **Assumed:** เส้นทางจ่ายบิลโหมดกะ (v2) เรียก `ISaleCheckout` จุดเดียวกับ v1 (ตามกฎใน AGENTS.md) กฎ static จึงมีผลทั้งสองโหมดโดยไม่ต้องแก้โค้ดกะ Task 3 มีขั้นยืนยันด้วยการอ่านโค้ด
- **Risk:** ถ้าแกน EMV/PromptPay เข้ารหัส tag ผิด QR จะสแกนไม่ผ่านทุกบิล กันด้วย test vectors ที่สอบทานกับค่าอ้างอิงของไลบรารี `promptpay-qr` (ใช้แค่สอบทาน ไม่เพิ่มเป็น dependency)
- **Risk:** หมายเลข migration ชนกันถ้ามี branch อื่นสร้าง migration พร้อมกัน Task 2 ต้องดูเลขล่าสุดใน `drizzle/` ก่อน generate (`0027_auto_product_sku.sql` คือล่าสุดตอนเขียนแผน)
- **Risk:** `openapi:check` จะแดงเพราะ response ตั้งค่าร้านเปลี่ยน Task 7 รับ baseline ใหม่โดยเฉพาะ และต้องแจ้งเจ้าของโปรเจกต์ก่อน record ตามกฎ

## Impact

- เจ้าของร้านเปิดใช้ QR พร้อมเพย์ได้โดยไม่ต้องมีสัญญากับธนาคาร
- ลูกค้าสแกนจ่ายยอดตรงบิล ไม่ต้องกรอกยอดเอง
- ความปลอดภัยเงินลดลงในโหมด static (ไม่มีการยืนยันจากธนาคาร) แต่เป็นการเลือกของร้านเอง และเหมือนพฤติกรรม trust fallback ที่มีอยู่แล้ว
- โค้ด SCB, ขั้นตอน shift QR, รายงานกะ ไม่ถูกแตะ

## Fixed Contract (ทุก task ใช้อันนี้ ห้ามตั้งชื่อใหม่เอง)

- ตั้งค่าร้านเพิ่ม 2 ฟิลด์: `promptpayMode: 'bank' | 'static'` (default `'bank'`), `promptpayTarget: string | null` (เก็บเฉพาะตัวเลข)
- Entity validation: `promptpayTarget` เป็น null ได้ ถ้าไม่ null ต้องเป็นตัวเลขล้วนยาว 10 หลัก (ขึ้นต้น `0`) หรือ 13 หลัก อย่างอื่น → `INVALID_SHOP_SETTINGS`
- ฟังก์ชัน payload: `server/src/domains/promptpay-qr.domain.ts` → `buildPromptPayPayload(target: string, amountSatang: number): string`, import ฝั่ง web ผ่าน alias `@pos/api/promptpay-qr`
- กฎ claim: โหมด static ข้าม `assertClaimable` (จ่ายพร้อมเพย์ไม่ต้องมี `qrPaymentId`); โหมด bank คงเดิมทุกประการ

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Spawn separate sub-agents for independent lanes. Do not parallelize tasks that can race on the same files, migrations, generated artifacts, or shared state.

1. **PromptPay payload pure function** - Lane A (server domains) | Can run together: 2, 4, 5, 6 | Must wait for: none | TDD slice: payload vectors FAIL -> `promptpay-qr.domain.ts` -> `bun test` ไฟล์เดียว
2. **Settings fields + migration (server)** - Lane B (settings + DB) | Can run together: 1, 4 | Must wait for: none (เช็คเลข migration ล่าสุดก่อน) | TDD slice: entity/usecase tests FAIL -> entity + schema + migration + repository/response schema -> integration test ตั้งค่า
3. **Static claim rule (sales/qr-payments)** - Lane A/B join | Can run together: 1, 2 (unit ด้วย mock) | Must wait for: 2 (เฉพาะขั้น integration) | TDD slice: usecase tests FAIL -> เงื่อนไขข้าม claim ในโหมด static -> integration จ่าย static ไม่มี qrPaymentId ผ่าน
4. **Render dep + shared alias wiring** - Lane C (config) | Can run together: 1, 2 | Must wait for: none | docs/config-only: `bun add qrcode.react` + alias 3 ไฟล์ -> `bun run typecheck`
5. **Settings page fields (web)** - Lane C | Can run together: 1, 2, 3, 6 | Must wait for: none (ใช้ contract ข้างบน) | TDD slice: test ฟังก์ชัน/validation FAIL -> ฟอร์ม + locales th/en -> `bun run test:web` + เปิดหน้าจริง
6. **POS static QR panel (web)** - Lane C | Can run together: 1, 2, 3, 5 | Must wait for: 4 (เฉพาะขั้น verify typecheck) | TDD slice: component/payload test FAIL -> แสดง QR + ปุ่มยืนยัน + คำเตือนเมื่อยังไม่ตั้งค่า -> `bun run test:web` + คลิกจ่ายจริงใน dev
7. **OpenAPI baseline + review diff** - Sequential | Can run together: none | Must wait for: 2, 3 | docs/config-only: regen baseline แล้วรีวิว diff ทุกบรรทัด (additive เท่านั้น) แจ้งเจ้าของโปรเจกต์ก่อน record
8. **Docs + full verification** - Sequential | Can run together: none | Must wait for: 1-7 | docs-only: เติม README เรื่อง static QR แล้วรัน typecheck/lint/test/openapi:check ครบชุด

---

### Task 1: PromptPay payload pure function

**Files:**

- Create: `server/src/domains/promptpay-qr.domain.ts`
- Create: `server/src/domains/promptpay-qr.domain.test.ts`
- Modify: `vite.config.ts` (alias `@pos/api/promptpay-qr`), `tsconfig.json` + `tsconfig.app.json` (paths คู่กัน ห้ามแก้เฉพาะไฟล์เดียว)

**Parallelization:**

- Can run with: Task 2, Task 4, Task 5, Task 6
- Must wait for: none
- Race risk: `vite.config.ts`/`tsconfig*` ชนกับ Task 4 ถ้าทำพร้อมกัน ให้ Task 1 แตะแค่บรรทัด alias ของตัวเอง หรือโยนงาน alias ทั้งหมดให้ Task 4 แล้ว Task 1 รอ verify

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

`server/src/domains/promptpay-qr.domain.test.ts` ครอบคลุม: เบอร์ `0812345678` ยอด 100.00 บาทได้ payload ตรง vector อ้างอิง, บัตร 13 หลักใช้ tag `02`, ยอด `0`/ติดลบ/เกิน `MAX_AMOUNT_SATANG` โยน domain error, target ผิดรูปโยน error, ยอดสตางค์ไม่ลงตัว (เช่น ทศนิยมเกิน 2 ตำแหน่ง) ถูกปัดหรือโยน error ตามที่เลือก (เลือกอย่างใดอย่างหนึ่งแล้วคงเส้นคงวา) สอบทาน vector กับไลบรารี `promptpay-qr` (รันแบบ one-off ไม่ต้องเพิ่ม dependency)

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

`cd server && bun --env-file=.env.test test src/domains/promptpay-qr.domain.test.ts` ต้อง FAIL เพราะไฟล์ production ยังไม่มี

- [ ] **Step 3: Implement the minimal code**

`buildPromptPayPayload(target, amountSatang): string` pure function ไม่มี framework import (ตามกฎ hexagonal: domains ห้าม import Elysia/Drizzle/tsyringe/zod) โครง EMV: `00`=`01`, `01`=`11`/`12` (มี/ไม่มี amount), field `29` AID `A000000677010111` + sub-tag `01` (เบอร์: `0066` + ตัด `0` ตัวหน้า) / `02` (บัตร), `53`=`764`, `54`=ยอดทศนิยม 2 ตำแหน่ง, `58`=`TH`, `63`=CRC16-CCITT ต่อท้าย ใส่ยอดเสมอ (ตามดีไซน์: ฝังยอดตามบิล)

- [ ] **Step 4: Run the test and confirm it passes**

คำสั่งเดียวกับ Step 2 ต้อง PASS ไม่มี warning ใหม่

- [ ] **Step 5: Refactor only after green**

คง behavior แล้วรัน test ซ้ำ

### Task 2: Settings fields + migration (server)

**Files:**

- Modify: `server/src/domains/shop-settings.domain.ts` (props + entity + validation + defaults)
- Modify: `server/src/modules/settings/applications/schemas/settings-schemas.ts` (zod input)
- Modify: `server/src/modules/settings/adapters/controllers/schemas/settings.schema.ts` (response)
- Modify: `server/src/infrastructure/database/schema/shop-settings.ts` (คอลัมน์ใหม่)
- Create: `drizzle/0028_*.sql` (ผ่าน `bun run db:generate` ห้ามเขียน SQL มือถ้า generate ได้)
- Modify: `server/src/modules/settings/adapters/repository/shop-settings.drizzle.repository.ts` (ถ้าต้อง map ฟิลด์ใหม่)
- Test: `server/src/domains/shop-settings.domain.test.ts` (หรือไฟล์ test ตั้งค่าที่มี), `server/src/modules/settings/applications/usecases/settings.usecases.test.ts`, integration test ตั้งค่า (ถ้ามี)

**Parallelization:**

- Can run with: Task 1, Task 4
- Must wait for: none
- Race risk: หมายเลข migration ใน `drizzle/` (ดูก่อน generate), response schema ชน Task 7 (Task 7 รอ Task นี้เสมอ)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`. RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

Entity test: `promptpayMode` default `'bank'`; mode นอก enum โยน `INVALID_SHOP_SETTINGS`; target ตัวอักษร/สั้นยาวผิดโยน error; `with()` เปลี่ยนโหมดได้ ส่วน usecase test: update สำเร็จและ invalid ถูกปฏิเสธ

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

รัน test ไฟล์เป้าหมาย ต้อง FAIL เพราะฟิลด์ยังไม่มี

- [ ] **Step 3: Implement the minimal code**

Entity + zod + response schema + drizzle columns (`promptpayMode text not null default 'bank'` แบบเดียวกับคอลัมน์อื่นในไฟล์นี้, `promptpayTarget text` nullable) + migration additive (nullable/default only ห้าม NOT NULL แบบไม่มี default ห้ามแตะคอลัมน์เดิม) ตรวจ `seed.ts`/`seed-demo.ts` ว่าสร้าง settings แบบ explicit fields หรือไม่ ถ้าใช่ต้องไม่พัง (default ที่ DB ช่วยได้ แต่ entity constructor ต้องรับฟิลด์ใหม่)

- [ ] **Step 4: Run the test and confirm it passes**

unit tests ผ่าน แล้วรัน `bun run db:migrate` กับฐาน dev ตรวจว่า migration ขึ้นและ rollback-safe (รันซ้ำได้)

- [ ] **Step 5: Refactor only after green**

คง behavior รัน test ซ้ำ

### Task 3: Static claim rule (sales/qr-payments)

**Files:**

- Modify: `server/src/modules/qr-payments/applications/services/qr-payment-claims.ts` (`isRequired` รู้จักโหมด static) และ/หรือ `server/src/modules/sales/applications/services/sale-checkout.ts:232-241` (จุดที่โยน `QR_PAYMENT_REQUIRED`)
- Modify: `server/src/modules/qr-payments/qr-payments.module.ts` (หรือไฟล์ DI ที่ผูก `QrPaymentClaims`) ถ้าต้อง inject settings repository
- Test: `server/src/modules/sales/applications/usecases/sales.usecases.test.ts` (เคสโหมด static), `server/src/modules/qr-payments/applications/usecases/qr-payments.usecases.test.ts` (ถ้าแตะ claims), `server/src/__tests__/integration/qr-payments.integration.test.ts` (จ่าย static ไม่มี `qrPaymentId` ผ่าน; โหมด bank ไม่มี `qrPaymentId` ยังได้ `QR_PAYMENT_REQUIRED`)
- Test doubles: `server/src/__tests__/mocks.ts` (`mockShopSettingsRepository` มีอยู่แล้ว ถ้าต้อง mock ฟิลด์ใหม่เพิ่มตรงนี้ ระวังชนกับ task อื่นที่แตะ mocks พร้อมกัน)

**Parallelization:**

- Can run with: Task 1, Task 2 (ขั้น unit ด้วย mock settings ตาม contract)
- Must wait for: Task 2 (เฉพาะขั้น integration ที่ต้องการ migration จริง)
- Race risk: `mocks.ts` ถ้ามี task อื่นแตะพร้อมกัน, `sale-checkout.ts` มี owner เดียวคือ task นี้

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`. RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

โหมด static + `promptpay` ไม่มี `qrPaymentId` → checkout ผ่าน ไม่เรียก `assertClaimable`; โหมด bank + ไม่มี `qrPaymentId` → `QR_PAYMENT_REQUIRED` เหมือนเดิม; โหมด static + มี `qrPaymentId` ของธนาคาร (ร้านสลับโหมดหลังสร้าง QR) → เลือกพฤติกรรมเดียว: ยอมรับ claim ตามปกติ (ไม่พัง) แล้วคงไว้

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

รัน usecase tests ต้อง FAIL เพราะกฎโหมด static ยังไม่มี

- [ ] **Step 3: Implement the minimal code**

ทางเลือกที่เล็กสุด: `QrPaymentClaims` inject `IShopSettingsRepository` แล้ว `isRequired()` คืน `gateway.isEnabled() && settings.promptpayMode !== 'static'` (อ่าน settings แบบ read-only ไม่ล็อก) ห้ามย้าย business rule ไปไว้ใน controller ห้ามเปลี่ยน error code เดิม อ่าน `sale-checkout.ts` ทั้งฟังก์ชันก่อนแตะเพื่อยืนยันว่าเส้นทาง v2/shifts ผ่านจุดเดียวกัน (ถ้าไม่ใช่ ให้หยุดแล้วรายงานแทนที่จะขยายสโคปเอง)

- [ ] **Step 4: Run the test and confirm it passes**

unit + integration ข้างบนผ่าน

- [ ] **Step 5: Refactor only after green**

คง behavior รัน test ซ้ำ

### Task 4: Render dep + shared alias wiring

**Files:**

- Modify: `package.json` (เพิ่ม `qrcode.react`)
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json` (alias `@pos/api/promptpay-qr` ทั้ง 3 ที่ให้ตรงกัน)

**Parallelization:**

- Can run with: Task 1, Task 2
- Must wait for: none
- Race risk: `vite.config.ts`/`tsconfig*` ชน Task 1 ถ้า Task 1 แตะไฟล์เดียวกัน (ตกลงกัน: งาน alias รวมไว้ที่ Task นี้ที่เดียว)

- [ ] **Step 0: docs/config-only**

Task นี้ไม่มี behavior ของตัวเอง จึงข้าม RED -> GREEN ใช้ verification ด้านล่างแทน

- [ ] **Step 1: Install + wire**

`bun add qrcode.react` (SVG output ไม่เอา canvas) เพิ่ม alias `@pos/api/promptpay-qr` ชี้ `server/src/domains/promptpay-qr.domain.ts` ใน 3 ไฟล์พร้อมกัน

- [ ] **Step 2: Verify**

`bun run typecheck` ผ่าน และ import ทดสอบจากฝั่ง web resolve ได้ (เช่น `bunx tsc --noEmit` หรือ smoke import ใน test ของ Task 6)

### Task 5: Settings page fields (web)

**Files:**

- Modify: `src/features/settings/components/SettingsPage.tsx` (ฟิลด์เลือกโหมด + กรอกตัวระบุ)
- Modify: `src/features/settings/locales.ts` (th + en ครบคู่, type `en satisfies typeof th` ต้องผ่าน)
- Modify: `src/features/settings/api.ts` (ถ้าต้องส่งฟิลด์ใหม่ ดูของเดิมก่อน)
- Test: web test ข้างไฟล์ที่แตะ (`bun test ./src`) ครอบคลุม validation ฝั่งหน้าจอ (เบอร์ 10/บัตร 13 เท่านั้น) และการ invalidate cache ผ่าน key factory ของ feature

**Parallelization:**

- Can run with: Task 1, Task 2, Task 3, Task 6
- Must wait for: none (ใช้ contract ที่ล็อกไว้ข้างบน)
- Race risk: `locales.ts` ของ settings มี owner เดียวคือ task นี้

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`. RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

test ตรรกะ validation/transform ของฟอร์ม (pure function ใน `lib/` หรือข้างไฟล์): ตัวเลข 10 หลักผ่าน 13 หลักผ่าน อย่างอื่นไม่ผ่าน, สลับโหมด static โดยไม่มี target ได้ (ไปเตือนตอนจ่าย ไม่บล็อกตอนบันทึก)

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

`bun run test:web` เฉพาะไฟล์ใหม่ ต้อง FAIL เพราะ logic ยังไม่มี

- [ ] **Step 3: Implement the minimal code**

ทำตาม pattern ฟิลด์เดิมใน `SettingsPage.tsx` (เช่น `taxId`) ห้ามเขียน `฿` หรือจัดรูปแบบเงินเอง ไม่ import deep ข้าม feature (`@/features/<name>` เท่านั้น) ข้อความทุกตัวผ่าน `t()`

- [ ] **Step 4: Run the test and confirm it passes**

`bun run test:web` ผ่าน แล้วเปิดหน้าตั้งค่าจริงที่ 390/768/1366px ดูด้วยตา (ปุ่มสูง ≥44px ตามกฎ)

- [ ] **Step 5: Refactor only after green**

คง behavior รัน test ซ้ำ

### Task 6: POS static QR panel (web)

**Files:**

- Modify: `src/features/pos/components/PaymentDialog.tsx` (สาขา static: ไม่เรียก `useQrPayment` สร้าง QR จาก payload ท้องถิ่น)
- Modify: `src/features/pos/components/QrPaymentPanel.tsx` (หรือ component ใหม่ในโฟลเดอร์เดียวกันถ้า panel เดิมผูกกับ bank flow มาก แยกไฟล์ดีกว่าฝัง `if` เต็มไปหมด)
- Modify: `src/features/pos/locales.ts` (th + en: ป้าย static, คำเตือนยังไม่ตั้งค่า, ปุ่มยืนยันรับเงิน)
- Modify: `src/features/pos/api.ts` (เฉพาะถ้าต้องอ่านโหมดจาก `qrConfigQuery`/settings query — อ่านของเดิมก่อน reuse ของเดิมให้มากที่สุด)
- Test: test ข้างไฟล์ (`bun test ./src`) ครอบคลุม payload ถูกส่งเข้า QR component, กรณียังไม่ตั้งค่า target แสดงคำเตือนและไม่ให้ยืนยัน

**Parallelization:**

- Can run with: Task 1, Task 2, Task 3, Task 5
- Must wait for: Task 4 (เฉพาะขั้น verify typecheck เพราะต้องใช้ alias)
- Race risk: `PaymentDialog.tsx`/`QrPaymentPanel.tsx` มี owner เดียวคือ task นี้

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development`. RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

payload จาก `buildPromptPayPayload(settings.promptpayTarget, totalSatang)` ถูกใช้ render; โหมด static + target ว่าง → แสดงคำเตือนไปตั้งค่าและปุ่มยืนยันถูก disable; โหมด bank → behavior เดิมไม่เปลี่ยน (test กัน regression)

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

ต้อง FAIL เพราะสาขา static ยังไม่มี

- [ ] **Step 3: Implement the minimal code**

เงื่อนไขสาขา static: `settings.promptpayMode === 'static' && settings.promptpayTarget` → render `qrcode.react` (SVG) + ยอด + ปุ่ม "ยืนยันว่าเงินเข้าแล้ว" (staff confirm เดิมของ trust flow ไม่สร้างปุ่มใหม่ซ้ำ) ไม่แตะ `useQrPayment`/polling/bank endpoints ไม่แสดงบนจอลูกค้า ไม่พิมพ์ลงใบเสร็จ (นอกสโคปตามดีไซน์) อ่าน settings ผ่าน query hook เดิมของ feature อย่า copy ลง zustand

- [ ] **Step 4: Run the test and confirm it passes**

`bun run test:web` ผ่าน แล้วจ่ายจริงใน dev (legacy + shifts อย่างละครั้ง) ดู QR สแกนได้ยอดตรง

- [ ] **Step 5: Refactor only after green**

คง behavior รัน test ซ้ำ

### Task 7: OpenAPI baseline + review diff

**Files:**

- Modify: `server/test/openapi-baseline.json` (record ใหม่ — ชื่อไฟล์ยืนยันหน้างานจาก `server/test/openapi-snapshot.ts`)
- Review: `git diff` ของ baseline ทุกบรรทัด

**Parallelization:**

- Can run with: none
- Must wait for: Task 2, Task 3
- Race risk: baseline เป็น generated artifact มี owner เดียวคือ task นี้

- [ ] **Step 0: docs/config-only**

ไม่มี behavior test ใช้ verification นี้แทน

- [ ] **Step 1: Regen + review**

`bun run openapi:check` ดู diff ยืนยันว่าเปลี่ยนแค่ settings schema แบบ additive (เพิ่ม optional fields) ถ้ามีบรรทัดลบ/เปลี่ยน type ให้หยุดแล้วรายงาน ห้าม record ทับ

- [ ] **Step 2: Record + notify**

แจ้งเจ้าของโปรเจกต์ก่อน record ตามกฎ (`If you intentionally change the API contract, tell the project owner before recording`) แล้ว record ใหม่ รัน `bun run openapi:check` ซ้ำให้ผ่าน

### Task 8: Docs + full verification

**Files:**

- Modify: `README.md` (เติมย่อหน้า static QR ในแถว QR ของตาราง + หมายเหตุ trust/verify)
- Modify: `src/locales/errors.ts` (เฉพาะถ้า Task 3 เพิ่ม error code ใหม่ — ตามแผนไม่มี ถ้ามีต้องมี th+en คู่กัน)

**Parallelization:**

- Can run with: none
- Must wait for: Task 1-7
- Race risk: none (ไฟล์ docs มี owner เดียว)

- [ ] **Step 0: docs-only**

ข้าม RED -> GREEN ใช้ verification นี้แทน

- [ ] **Step 1: Docs**

README สั้น ๆ: static QR คืออะไร ตั้งค่าที่ไหน ข้อควรระวัง (พนักงานต้องตรวจยอดเอง) ไม่ต้องอธิบาย EMV ใน README

- [ ] **Step 2: Full verification**

`bun run typecheck` → `bun run lint` → `bun run test` → `bun run openapi:check` ผ่านครบสี่คำสั่ง (test ต้องมี DB ที่ `localhost:5433` ตาม README) ถ้าอันไหนแดงแก้ที่ต้นเหตุห้าม skip hook
