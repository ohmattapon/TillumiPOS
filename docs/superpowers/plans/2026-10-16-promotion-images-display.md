# Promotion Images on Customer Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** โปรโมชันมีรูปภาพ 1 รูปต่อโปร และจอลูกค้าแสดงรูปโปรแบบป้ายโฆษณา (จอว่างวนรูป จอขายแบนเนอร์เล็กวนรูปต่อ)

**Estimated tasks:** 9 (1 blocker + 8 build) | **Estimated time:** ~3-4 ชม. + DB/e2e | **Touches:** API / DB / Frontend (web)

## Current Problem / Current Solution

- ตาราง `promotions` ไม่มีคอลัมน์รูป (`apps/api/src/infrastructure/database/schema/promotions.ts`) — มีแต่ชื่อ/ชนิด/ค่า/เงื่อนไขเวลา
- `isMediaKey` รับเฉพาะ `products/<id>/...` (`apps/api/src/modules/shared/adapters/local-disk-media-storage.ts:12`) — คีย์รูปโปรโมชันจะถูกปฏิเสธทั้งขาเขียนและขาเสิร์ฟ (`media.plugin.ts` ใช้ `contentTypeOf` คุมขาอ่าน)
- ต้นแบบที่ต้องลอก: รูปสินค้า — `products.imageKey` + `SetProductImageUseCase` / `RemoveProductImageUseCase` + presenter `toProductResponse` (key อยู่ภายใน เปิดแค่ `imageUrl`) + route `PUT/DELETE /:id/image` (owner เท่านั้น, `t.File maxSize '5m'`)
- จอลูกค้า (`DisplayView`/`DisplayState` ใน `apps/web/src/features/customer-display/lib/display-state.ts`) ไม่มีช่องรูปโปร และโค้ดจอทั้งชุดอยู่บน branch `ohmattpon/customer-display-server` ซึ่ง**ไม่มีใน worktree นี้** (branch นี้มีแต่ promotions) — งานฝั่งจอเริ่มไม่ได้จนกว่า branch จะรวมกัน
- สเปค promotions เดิมตัด "ส่งโปรโมชันไปจอลูกค้า" ออกจากขอบเขต — งานนี้คือส่วนต่อขยายที่เจ้าของอนุมัติแล้วผ่าน grill (Q1–Q6)

## Proposed Approach

1. ขยาย `isMediaKey`/`contentTypeOf` รองรับ `promotions/<id>/<uuid>.<jpg|png|webp>` ทั้ง local-disk และ worker adapters (คีย์สุ่มเหมือนเดิม แคชตลอดไป จอไม่ล็อกอินเปิดได้)
2. เพิ่ม `promotions.image_key` (nullable) + `setImageKey` ใน repository port + use case `Set/RemovePromotionImage` (owner เท่านั้น) + route `PUT/DELETE /promotions/:id/image` + `imageUrl` ใน response (cashier อ่านได้)
3. หน้าเว็บ promotions: อัปโหลด/ลบรูป ซ่อนเมื่อ `imageStorage` ปิด (ลอกพฤติกรรมรูปสินค้า)
4. โปรโตคอลจอ: เพิ่ม `promoImages: { imageUrl, name }[]` ใน `DisplayView` พร้อมขีดจำกัด parser (จำนวน+ความยาว URL) — POS แนบรายการรูปโปรที่เปิดใช้+มีรูป+เวลาตรงมากับ display-state ที่ส่งอยู่แล้ว (heartbeat 10s ครอบการรีเฟรชตารางเวลา)
5. จอลูกค้า: จอว่าง (`idle`) วนรูปเต็มจอ, ตอนขาย (`selling`/`paying`) แบนเนอร์เล็กวนรูปโปรอื่นต่อ ส่วนลดของบิลนี้โชว์เป็นตัวเลขอย่างเดียว (ตาม Q4=B)

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| หน้าจัดการโปรโมชัน | ไม่มีที่ใส่รูป | เจ้าของอัปโหลด/ลบรูปได้ (โปรละ 1 รูป), แคชเชียร์เห็นรูปอย่างเดียว |
| จอลูกค้าตอนว่าง | จอ `idle` ว่างเปล่า | วนรูปโปรที่เปิดใช้+มีรูป+เวลาตรง |
| จอลูกค้าตอนขาย | เห็นแต่รายการ+ยอด | เห็นรายการ+ยอด+แบนเนอร์เล็กวนรูปโปรอื่น, ส่วนลดบิลเป็นตัวเลข |
| storage ปิด (`none`) | ไม่เกี่ยว | ซ่อนอัปโหลด, response `imageUrl: null`, จอโชว์ข้อความแทนรูป |
| โปรถูกปิดหลังมีรูป | ไม่เกี่ยว | รูปค้างใน DB แต่หลุดจากรายการวน (กรอง `isActive` ตอนแนบ) |

## Assumptions & Risks

- **Assumed:** ขยาย `KEY_PATTERN` เป็น `promotions/` ไม่พังสัญญา `/media/<key>` เดิมและการสำรอง `.media.tar.gz` (คีย์ยังสุ่มเดาไม่ได้)
- **Assumed:** POS ส่ง idle push + heartbeat (10s) บ่อยพอให้ตารางเวลาโปรบนจออัปเดตทัน — ถ้าร้านเปิดจอทิ้งไว้นานโดยไม่มี POS ส่งเลย รูปอาจค้างเกินเวลาสิ้นสุดได้
- **Assumed:** รูปละ 1 รูป/โปรพอ (Q6=A) — แคมเปญใหญ่แยกเป็นหลายโปรเอา
- **Assumed:** ขีดจำกัดไฟล์ตามดีไซน์ grill คือ `jpg/png/webp` ≤ **2MB** (เข้มกว่าของสินค้าที่ 5MB) — ถ้าอยากเท่ากันให้เจ้าของเคาะก่อน Task 3
- **Risk:** Task 0 (รวม branch) ไม่เสร็จ → Lane B (งานจอ) เริ่มไม่ได้ แต่ Lane A (API+เว็บ) ทำแยกได้
- **Risk:** `test/openapi-baseline.json` (+`openapi-v2-baseline.json` ถ้ามี) เป็น generated artifact — ต้องแจ้งเจ้าของก่อนบันทึกใหม่ตามกฎสัญญา API
- **Risk:** หมายเลข migration ใหม่ชนกับ migration บน main ที่ขยับไปแล้ว — ตรวจ `apps/api/drizzle/` ล่าสุดก่อนตั้งชื่อไฟล์
- **Risk:** worktree นี้ยังไม่มี `node_modules` และไม่มี PostgreSQL ที่ `localhost:5433` — ทุก verification ระดับ integration/e2e รอ `bun install` + DB

## Impact

- DB: migration ใหม่ 1 ไฟล์ (`promotions.image_key` nullable) — ข้อมูลเดิมไม่ถูกแตะ
- API: สัญญาเพิ่มแบบ additive (`imageUrl` + 2 routes) — ไคลเอนต์เดิมไม่พัง
- Web: หน้า promotions + หน้า customer display + POS publisher (3 จุด สัมผัสไฟล์ไม่ทับกัน)
- เงิน/สต็อก/VAT/quote: ไม่แตะเลย — รูปไม่มีผลต่อยอด
- สิทธิ์: อัปโหลด/ลบ = owner เท่านั้น (ลอก `auth: ['owner']` ของสินค้า), อ่าน = owner+cashier

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Spawn separate sub-agents for independent lanes. Do not parallelize tasks that can race on the same files, migrations, generated artifacts, or shared state.

1. **[Task 0: รวม branch]** - Blocker (owner) | Can run together: none | Must wait for: none | TDD slice: docs-only (ไม่มีโค้ด)
2. **[Task 1: ขยาย media key]** - Lane A (API) | Can run together: 2, 5 | Must wait for: none | TDD slice: `isMediaKey('promotions/1/x.png')===false` -> รองรับ `promotions/` -> `bun test` ไฟล์ media
3. **[Task 2: คอลัมน์ image + repository]** - Lane A (API/DB) | Can run together: 1, 5 | Must wait for: none | TDD slice: entity snapshot มี `imageKey` -> migration+port+adapter -> integration `promotions`
4. **[Task 3: use case + routes รูปโปร]** - Lane A (API) | Can run together: 5 | Must wait for: 1, 2 | TDD slice: usecase test กับ mock media -> routes owner-only -> `openapi:check`
5. **[Task 4: บันทึก OpenAPI baseline]** - Lane A (docs/config) | Can run together: none | Must wait for: 3 + เจ้าของอนุมัติ | TDD slice: docs-only (`openapi:check` เขียว)
6. **[Task 5: หน้าจัดการรูปโปร]** - Lane C (Web) | Can run together: 1, 2, 3 | Must wait for: 4 (เพื่อ verify กับ contract จริง) | TDD slice: lib/form test -> upload/remove UI + locales -> `bun run lint`
7. **[Task 6: โปรโตคอลจอ + parser]** - Lane B (Web lib) | Can run together: none (branch เดียวกับ 7,8) | Must wait for: Task 0 | TDD slice: parse `promoImages` ถูกตัดเมื่อเกินลิมิต -> type+parser -> unit test lib
8. **[Task 7: POS แนบรูปโปร]** - Lane B (Web pos) | Can run together: 8 | Must wait for: 5 (query key/factory), 6 | TDD slice: selector เลือกรูปที่เวลาตรง -> แนบใน view -> unit test hook/lib
9. **[Task 8: จอลูกค้าวนรูป + e2e]** - Lane B (Web display) | Can run together: 7 | Must wait for: 6 | TDD slice: receiver test (idle carousel / sale banner / ไม่มีรูป) -> UI -> `e2e`+`screenshots` + ดูภาพ 390/768/1366 ด้วยตา

---

### Task 0: รวม branch customer-display กับ promotions (blocker — เจ้าของทำ)

**Files:**

- Modify: none (การตัดสินใจ + คำสั่ง git ของเจ้าของ)

**Parallelization:**

- Can run with: `none`
- Must wait for: `none`
- Race risk: `none` (ไม่มีโค้ด)

- [ ] **Step 0: Load the TDD discipline**

  งานนี้เป็น docs/config-only: ไม่ต้อง RED -> GREEN เพราะไม่มีพฤติกรรมโค้ด มีแต่การตัดสินใจเรื่อง branch

- [ ] **Step 1: เจ้าของเลือกวิธีรวม (AI ห้าม merge เอง)**

  ทางเลือก: (ก) rebase `ohmattpon/promotions` บน main ใหม่ที่รวม customer-display แล้ว, (ข) merge `ohmattpon/customer-display-server` เข้า promotions worktree นี้ชั่วคราวเพื่องาน Lane B. ข้อเท็จจริงที่ต้องใช้: promotions แยกจาก `3988709` (เก่า), โค้ดจอทั้งชุด (`apps/api/src/modules/customer-display/`, `apps/web/src/features/customer-display/`, `DisplayView`/`useCustomerDisplayPublisher`) อยู่บน `ohmattpon/customer-display-server` เท่านั้น

- [ ] **Step 2: ยืนยันว่า worktree นี้เห็นไฟล์จอแล้ว**

  ```powershell
  git ls-tree -r --name-only HEAD | Select-String "customer-display" | Select-Object -First 5
  ```

  Expected result: เห็นรายชื่อไฟล์ `customer-display` ทั้ง API และ web ก่อนเริ่ม Task 6–8

### Task 1: ขยาย media key รองรับรูปโปรโมชัน

**Files:**

- Modify: `apps/api/src/modules/shared/adapters/local-disk-media-storage.ts:12` (`KEY_PATTERN`, `contentTypeOf`, คอมเมนต์ "product image" → ครอบคลุม promotions)
- Modify: `apps/api/src/modules/shared/adapters/worker-media-storage.ts` (pattern เดียวกันฝั่ง R2 — เปิดไฟล์ดูก่อนว่ามี pattern แยกไหม)
- Test: `apps/api/src/modules/shared/adapters/local-disk-media-storage.test.ts`, `worker-media-storage.test.ts`, `apps/api/src/modules/media.plugin.test.ts` (ถ้ามีเคส key shape)

**Parallelization:**

- Can run with: `Task 2`, `Task 5`
- Must wait for: `none`
- Race risk: `none` (ไฟล์ชุดนี้ไม่มี task อื่นแตะ)

- [ ] **Step 0: Load the TDD discipline**

  Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

  ```ts
  expect(isMediaKey('promotions/12/0193abcd-0000-4000-8000-000000000000.png')).toBe(true)
  expect(contentTypeOf('promotions/12/0193abcd-0000-4000-8000-000000000000.webp')).toBe('image/webp')
  expect(isMediaKey('promotions/../escape.png')).toBe(false)
  ```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

  Run `bun test apps/api/src/modules/shared/adapters/local-disk-media-storage.test.ts`. Expected result: FAIL เพราะ pattern รับแค่ `products/...` ไม่ใช่ syntax/setup error.

- [ ] **Step 3: Implement the minimal code**

  ขยาย `KEY_PATTERN` เป็น `^(products\/\d+|promotions\/\d+)\/[A-Za-z0-9-]+\.(jpg|png|webp)$` (ห้ามผ่อนส่วนอื่น: ยังต้องมีตัวเลข id, uuid, นามสกุลเดิมเท่านั้น) ทำทั้ง local-disk และ worker adapter ให้ตรงกัน อัปเดตคอมเมนต์ที่อ้าง "product" ให้ตรงความจริง

- [ ] **Step 4: Run the test and confirm it passes**

  Run คำสั่งเดิม + `bun test apps/api/src/modules/shared/adapters/worker-media-storage.test.ts` + `bun test apps/api/src/modules/media.plugin.test.ts`. Expected result: PASS ไม่มี regression

- [ ] **Step 5: Refactor only after green**

  Refactor only after the targeted test is green. ถ้า worker กับ local มี pattern ซ้ำกัน อย่าเพิ่งรวม abstraction ใหม่ — เปลี่ยนน้อยที่สุด

### Task 2: คอลัมน์ `imageKey` + repository

**Files:**

- Modify: `apps/api/src/infrastructure/database/schema/promotions.ts` (เพิ่ม `imageKey: text()` nullable)
- Create: `apps/api/drizzle/NNNN_promotion_image.sql` (NNNN = หมายเลขถัดจากไฟล์ล่าสุดใน `apps/api/drizzle/` — ตรวจก่อนตั้งชื่อ, branch นี้มี `0016_promotions.sql`)
- Modify: `apps/api/src/domains/promotion.domain.ts` (entity snapshot มี `imageKey: string | null`, ค่าเริ่มต้น null — กฎธุรกิจรูปอยู่ use case ไม่ใช่ entity)
- Modify: `apps/api/src/modules/promotions/applications/ports/promotion.repository.ts` (เพิ่ม `setImageKey(id, imageKey): Promise<...>` — ไม่มี `branchId` เพราะโปรใช้ร่วมทุกสาขา ต่างจากสินค้า)
- Modify: `apps/api/src/modules/promotions/adapters/repository/promotion.drizzle.repository.ts` (implement ด้วย `currentExecutor()` ห้าม import `db` ตรง)
- Test: `apps/api/src/domains/promotion.domain.test.ts` (ข้างไฟล์), `apps/api/src/__tests__/integration/promotions.integration.test.ts` (round-trip imageKey)

**Parallelization:**

- Can run with: `Task 1`, `Task 5`
- Must wait for: `none` (port ใหม่ออกแบบจากต้นแบบ `IProductRepository.setImageKey` ได้เลย)
- Race risk: **migration numbering** — ถ้ามี task/branch อื่นออก migration พร้อมกัน หมายเลขชนกัน ต้องตรวจ `apps/api/drizzle/` ใหม่ก่อนสร้างไฟล์

- [ ] **Step 0: Load the TDD discipline**

  Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

  ```ts
  // domain: snapshot ของโปรใหม่ต้องมี imageKey: null
  // repository (mock/port): setImageKey(7, 'promotions/7/uuid.png') แล้ว entity ที่ได้มี imageKey นั้น
  ```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

  Run `bun test apps/api/src/domains/promotion.domain.test.ts`. Expected result: FAIL เพราะ entity ยังไม่มี field นี้

- [ ] **Step 3: Implement the minimal code**

  เพิ่ม field + migration + port + drizzle adapter (ใช้ `currentExecutor()` ตามกฎ) อย่าแตะ `calculateTotals`, อย่าแตะกฎ `evaluatePromotion`/`pickBestPromotion`

- [ ] **Step 4: Run the test and confirm it passes**

  Run `bun test apps/api/src/domains/promotion.domain.test.ts` แล้ว (เมื่อมี DB) `bun test apps/api/src/__tests__/integration/promotions.integration.test.ts`. Expected result: PASS

- [ ] **Step 5: Refactor only after green**

  Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

### Task 3: use case + routes อัปโหลด/ลบรูปโปร

**Files:**

- Create: `apps/api/src/modules/promotions/applications/usecases/set-promotion-image.usecase.ts` (`SetPromotionImageUseCase` — command, ลอก `set-product-image.usecase.ts`: ตรวจโปรมีจริงก่อน upload, คีย์ใหม่ทุกครั้ง `promotions/<id>/<uuid>.<ext>`, แทนที่แล้วลบรูปเก่าแบบ best-effort)
- Create: `apps/api/src/modules/promotions/applications/usecases/remove-promotion-image.usecase.ts` (ลอก `remove-product-image.usecase.ts`)
- Test: `apps/api/src/modules/promotions/applications/usecases/promotion-image.usecases.test.ts` (ใช้ `mockMediaStorage` + mock repository จาก `src/__tests__/mocks.ts` — ครอบคลุม: สำเร็จ, โปรไม่มี (ไม่ upload), upload พัง (คงรูปเดิม), ลบรูปเก่าพัง (request ยังสำเร็จ), ไฟล์ผิดชนิด)
- Modify: `apps/api/src/modules/promotions/promotions.module.ts` (register 2 use cases)
- Modify: `apps/api/src/modules/promotions/adapters/controllers/promotion.controller.ts` (เพิ่ม `PUT /:id/image` + `DELETE /:id/image`, `auth: ['owner']` ทั้งคู่, body `t.File({ type: ['image/jpeg','image/png','image/webp'], maxSize: '2m' })` ตามดีไซน์ Q6)
- Modify: presenter/snapshot (`promotion.snapshot.ts` + `promotion.schema.ts` + controller `toResponse`) — เปิด `imageUrl: imageKey ? media.urlFor(imageKey) : null`, key อยู่ภายใน (ลอก `toProductResponse`)
- Test: `apps/api/src/__tests__/integration/promotions.integration.test.ts` (เพิ่มเคส: upload→`imageUrl` ขึ้น, แทนที่→รูปเก่าหาย, cashier upload→403, จอ/isted response มี `imageUrl`)

**Parallelization:**

- Can run with: `Task 5` (web ใช้ contract จากสเปค task นี้ mock ไปก่อนได้)
- Must wait for: `Task 1` (key pattern), `Task 2` (setImageKey port)
- Race risk: `test/openapi-baseline.json` — ห้ามบันทึก baseline ใหม่ใน task นี้ (แยกไว้ Task 4 ที่ต้องขออนุมัติก่อน)

- [ ] **Step 0: Load the TDD discipline**

  Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

  ```ts
  // repo มีโปร id 4 imageKey 'promotions/4/old.png'; execute(4, pngFile)
  // expect media.put ถูกเรียกด้วย key ขึ้นต้น 'promotions/4/' + repo.setImageKey ถูกเรียก + media.delete ถูกเรียกด้วยรูปเก่า
  ```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

  Run `bun test apps/api/src/modules/promotions/applications/usecases/promotion-image.usecases.test.ts`. Expected result: FAIL เพราะยังไม่มี use case

- [ ] **Step 3: Implement the minimal code**

  สร้าง 2 use cases + register DI + routes + presenter `imageUrl` เปลี่ยนเฉพาะทางรูป ห้ามแตะ create/update use case เดิม

- [ ] **Step 4: Run the test and confirm it passes**

  Run `bun test apps/api/src/modules/promotions/applications/usecases/promotion-image.usecases.test.ts` แล้ว `bun run test:unit` (ไม่ต้องมี DB). Expected result: PASS

- [ ] **Step 5: Refactor only after green**

  Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

### Task 4: บันทึก OpenAPI baseline ใหม่ (ต้องขออนุมัติก่อน)

**Files:**

- Modify: `apps/api/test/openapi-baseline.json` (regenerate อย่างเดียว ห้ามแก้ด้วยมือ)

**Parallelization:**

- Can run with: `none` (generated artifact — ทำเดี่ยวเท่านั้น)
- Must wait for: `Task 3` + **เจ้าของอนุมัติ** (กฎ: ตั้งใจเปลี่ยนสัญญา API ต้องบอกเจ้าของก่อนบันทึก)
- Race risk: **generated artifact** — อย่ารันพร้อม task อื่นที่แตะ API routes

- [ ] **Step 0: Load the TDD discipline**

  งานนี้เป็น docs/config-only: ไม่มีพฤติกรรมให้เขียน failing test — verification คือ `bun run openapi:check` เขียว และการเปลี่ยนเป็น additive-only (`imageUrl` + 2 routes ใหม่ ไม่มี field เดิมหาย)

- [ ] **Step 1: ตรวจ diff ของสัญญาก่อนบันทึก**

  รัน `bun run openapi:check` ใน `apps/api` ให้เห็น diff แล้วส่งให้เจ้าของตรวจว่าเพิ่มอย่างเดียวจริง

- [ ] **Step 2: บันทึก baseline ใหม่หลังอนุมัติเท่านั้น**

  บันทึกแล้วรัน `bun run openapi:check` ซ้ำให้ผ่าน

### Task 5: หน้าจัดการรูปโปร (web)

**Files:**

- Modify: `apps/web/src/features/promotions/api.ts` (mutation upload/remove + key factory เดิม, invalidate ผ่าน factory)
- Modify: `apps/web/src/features/promotions/components/PromotionsPage.tsx` + `PromotionFormDialog.tsx` (ช่องอัปโหลด/พรีวิว/ลบใน dialog, ปุ่มสูง 44px, skeleton ตอนโหลด, ปุ่มลองใหม่ตอน error)
- Modify: `apps/web/src/features/promotions/locales.ts` (th เป็นต้นแบบ type, en `satisfies typeof th`)
- Modify: `apps/web/src/locales/errors.ts` (คำแปลรหัสใหม่ถ้ามี: `IMAGE_TOO_LARGE`, `INVALID_FILE_TYPE` — ตรวจว่าหน้าสินค้ามีอยู่แล้วให้ reuse)
- Test: `apps/web/src/features/promotions/lib/promotion-form.test.ts` (เคสที่มีอยู่) + เพิ่ม test ฟังก์ชันล้วนถ้ามี logic ใหม่ (เช่น ซ่อนอัปโหลดเมื่อ `imageStorage` ปิด — อ่านจาก `v2 capabilities` เหมือนหน้าสินค้า)
- ซ่อนอัปโหลดเมื่อ storage ปิด: ใช้ `imageStorage` จาก capabilities (ลอกหน้าสินค้า)

**Parallelization:**

- Can run with: `Task 1`, `Task 2`, `Task 3`
- Must wait for: `Task 4` (เพื่อ verify กับ contract จริง — ระหว่างรอใช้ contract จากสเปค task นี้)
- Race risk: `none` (ไฟล์อยู่แต่ใน feature promotions; ห้าม import ลึกจาก feature อื่น ใช้ `@/features/promotions` ผ่าน `index.ts`)

- [ ] **Step 0: Load the TDD discipline**

  Use `superpowers:test-driven-development` before editing production code. Logic ที่คำนวณ/ตัดสินใจ (เช่น ควรโชว์อัปโหลดไหม) อยู่ในฟังก์ชันล้วน + test ข้างไฟล์ (`bun test`) ห้ามฝังในคอมโพเนนต์

- [ ] **Step 1: Write the failing test**

  ```ts
  // shouldShowImageUpload({ imageStorage: 'none' }) === false
  // shouldShowImageUpload({ imageStorage: 'local' }) === true
  ```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

  Run `bun test apps/web/src/features/promotions/lib/<new-file>.test.ts`. Expected result: FAIL เพราะยังไม่มีฟังก์ชัน

- [ ] **Step 3: Implement the minimal code**

  เพิ่ม UI อัปโหลด/ลบ + ซ่อนตาม `imageStorage` + locales ทั้ง th/en ข้อความผ่าน `t()` เท่านั้น ห้ามเขียนไทย/อังกฤษตรงใน tsx

- [ ] **Step 4: Run the test and confirm it passes**

  Run `bun test` ไฟล์นั้น + `bun run lint` + `bun run typecheck`. Expected result: PASS

- [ ] **Step 5: Refactor only after green**

  Refactor only after the targeted test is green. Rerun หลัง refactor เสมอ

### Task 6: โปรโตคอลจอ — `promoImages` + parser limits

**Files (บน branch ที่รวมจอแล้ว — ดู Task 0):**

- Modify: `apps/web/src/features/customer-display/lib/display-state.ts` (เพิ่ม `PromoImage { imageUrl, name }` + field `promoImages` ใน `DisplayView`, คง `ENVELOPE_VERSION` หรือ bump ตามแบบของไฟล์ — เปิดไฟล์ดูก่อน)
- Modify: parser ในไฟล์เดียวกัน (limits แบบเดียวกับของเดิม: จำนวนสูงสุดเช่น 20, URL ยาวไม่เกินเช่น 500, name ≤ MAX_TEXT — ตั้งให้พอดีกับโปร 1 รูป/โปร)
- Test: `apps/web/src/features/customer-display/lib/display-state.test.ts` (เคส: เกินจำนวนถูกตัด, URL ยาวเกินถูกทิ้ง, envelope เก่าไม่มี field ยัง parse ได้)

**Parallelization:**

- Can run with: `none` (ไฟล์ protocol ไฟล์เดียวกับ Task 7/8 อ่าน — แต่ write scope คือไฟล์นี้เท่านั้น ถ้าแยก sub-agent ต้องห้ามแตะไฟล์เดียวกันพร้อมกัน)
- Must wait for: `Task 0`
- Race risk: **shared protocol file** — Task 7/8 อ่านได้อย่างเดียว ห้ามแก้ `display-state.ts` นอก Task 6

- [ ] **Step 0: Load the TDD discipline**

  Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

  ```ts
  // parse envelope ที่มี promoImages 25 รูป -> เหลือไม่เกิน limit และ envelope ยัง valid
  // parse envelope เก่า (ไม่มี promoImages) -> ได้ promoImages === [] (default) ไม่พัง
  ```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

  Run `bun test apps/web/src/features/customer-display/lib/display-state.test.ts`. Expected result: FAIL เพราะ parser ยังไม่รู้จัก field

- [ ] **Step 3: Implement the minimal code**

  เพิ่ม type + parser + default `[]` อย่าแตะ `DisplayState` (idle/selling/paying/paid) และอย่าแตะ channel/server-channel

- [ ] **Step 4: Run the test and confirm it passes**

  Run คำสั่งเดิม. Expected result: PASS

- [ ] **Step 5: Refactor only after green**

  Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

### Task 7: POS แนบรายการรูปโปรไปกับ display-state

**Files (บน branch ที่รวมจอแล้ว):**

- Modify: จุดที่ POS สร้าง `DisplayView` (หาต้นตอจาก `useCustomerDisplayPublisher(` ใน `apps/web/src/features/pos/` — คาดว่าใน `PosPage.tsx` หรือ hook ประกอบ view)
- Modify/Create lib selector: ฟังก์ชันล้วน `selectPromoImages(promotions, now, timeZone): { imageUrl, name }[]` — กรอง `isActive && imageUrl && evaluatePromotion เวลาตรง` (ใช้สูตรกลาง `@pos/api/promotions` ตัวเดียวกับตะกร้า/เซิร์ฟเวอร์ ห้ามเขียนสูตรเวลาเอง)
- Test: lib test ข้างไฟล์ (`bun test`) — ครอบคลุม: โปรปิด/ไม่มีรูป/หมดเวลาหลุด, ข้ามเที่ยงคืนนับตามวันที่เริ่ม (ลอกกติกาสเปค), member-only ยังติดมาตอนจอว่าง (ตาม Q3 ที่ตอบแบบค้าปลีก)
- Query: ใช้ query/options ของ `features/promotions/api.ts` ผ่าน key factory (ห้ามเรียก `api`/`unwrap` ตรงในคอมโพเนนต์)

**Parallelization:**

- Can run with: `Task 8`
- Must wait for: `Task 5` (query/factory นิ่ง), `Task 6` (field `promoImages` นิ่ง)
- Race risk: `none` (write scope: POS เท่านั้น ไม่แตะไฟล์จอ) — แต่ห้ามคัดลอกข้อมูลเซิร์ฟเวอร์ลง zustand: เก็บแค่ id/ros ใน store แล้วอ่านรายละเอียดจาก query ตอนแสดงผล

- [ ] **Step 0: Load the TDD discipline**

  Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

  ```ts
  // selectPromoImages([active มีรูป เวลาตรง, ปิดใช้ มีรูป, เปิดใช้ ไม่มีรูป, หมดอายุ], now) -> เหลือเฉพาะข้อแรก
  ```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

  Run `bun test <lib-file>.test.ts`. Expected result: FAIL เพราะยังไม่มี selector

- [ ] **Step 3: Implement the minimal code**

  สร้าง selector + ต่อเข้า view ที่ส่งให้ `useCustomerDisplayPublisher` (แนบทั้งตอน idle และตอนขาย — ตอนขายคือรายการวนแบนเนอร์ตาม Q4=B) ไม่เปลี่ยนจังหวะส่ง (heartbeat/resend ของเดิม)

- [ ] **Step 4: Run the test and confirm it passes**

  Run `bun test` + `bun run typecheck`. Expected result: PASS

- [ ] **Step 5: Refactor only after green**

  Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

### Task 8: จอลูกค้าวนรูป + e2e/screenshots

**Files (บน branch ที่รวมจอแล้ว):**

- Modify: `apps/web/src/features/customer-display/components/CustomerDisplayPage.tsx` (idle: carousel เต็มจอจาก `promoImages`; selling/paying: แบนเนอร์เล็กวนรูป + ยอด/ส่วนลดตัวเลข; ไม่มีรูป: ข้อความล้วนเหมือนเดิม; ปุ่ม/แตะ ≥44px ถ้ามี)
- Modify: `apps/web/src/features/customer-display/locales.ts` (th/en ถ้ามีข้อความใหม่)
- Test: `apps/web/src/features/customer-display/lib/receiver.test.ts` หรือ test ฝั่ง view (idle วนรูป / sale แบนเนอร์ / payload ไม่มีรูปไม่พัง)
- e2e: เพิ่มเคสใน `apps/web/e2e/` (สร้างโปร+อัปโหลดรูป → เปิดจอ → เห็นรูปตอน idle → เปิดขาย → แบนเนอร์ยังวน) + หน้าใหม่ใน `shots.ts` ถ้ามี
- locales error: ถ้ามี code ใหม่เพิ่มใน `apps/web/src/locales/errors.ts`

**Parallelization:**

- Can run with: `Task 7`
- Must wait for: `Task 6` (protocol นิ่ง)
- Race risk: **e2e/screenshots ใช้ DB `pos_e2e`/`pos_e2e_shots` ของตัวเอง** — ห้ามแตะ DB dev; ภาพ 390/768/1366 ต้องดูด้วยตาก่อนจบ

- [ ] **Step 0: Load the TDD discipline**

  Use `superpowers:test-driven-development` before editing production code. Unit ของ view/receiver ก่อน แล้วค่อย e2e

- [ ] **Step 1: Write the failing test**

  ```ts
  // view idle + promoImages 2 รูป -> carousel แสดงรูปแรกและวนได้
  // view selling + promoImages -> แบนเนอร์วนรูป ส่วนลดบิลเป็นตัวเลข (ไม่โชว์รูปโปรของบิลเป็นพิเศษ)
  // view ไม่มี promoImages (envelope เก่า) -> แสดงแบบเดิม ไม่พัง
  ```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

  Run `bun test` ไฟล์ test นั้น. Expected result: FAIL เพราะ UI ยังไม่รู้จักรูป

- [ ] **Step 3: Implement the minimal code**

  ทำ UI ตาม Q1=A+Q4=B ห้ามถอด BroadcastChannel (ทางสำรอง) ห้ามเปลี่ยน pairing/token flow

- [ ] **Step 4: Run the test and confirm it passes**

  Run `bun test` + `bun run e2e` + `bun run screenshots` แล้วเปิดภาพดูที่ 390/768/1366px ด้วยตา. Expected result: PASS + ภาพไม่ล้นแนวนอน

- [ ] **Step 5: Refactor only after green**

  Refactor only after the targeted test is green. ก่อนบอกว่าเสร็จต้อง `bun run typecheck` + `bun run test` ที่ root ผ่าน

## ก่อนบอกว่าเสร็จ (final gate ของแผนนี้)

- `bun run typecheck`, `bun run test` (root, ต้องมี DB), `bun run lint`, `bun run openapi:check` ผ่าน
- `bun run e2e`, `bun run screenshots` ผ่าน + ดูภาพจอลูกค้า (idle/ขาย) ที่ 390/768/1366 ด้วยตา
- ตารางใหม่ `promotions.image_key` มากับ migration, ข้อมูลเดิม `imageUrl: null`
- ไม่แตะเงิน/สต็อก/VAT/quote/calculateTotals — ถ้า diff มีไฟล์พวกนั้น ต้องอธิบาย
- ไม่ commit/push จากงานของแผนนี้ (เจ้าของ push + เปิด PR เอง)
