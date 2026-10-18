# Display Slides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** จอลูกค้า (customer display) วนสไลด์รูปโปรโมชั่น/บริจาคแบบ POS ห้างใหญ่ — ว่าง = สไลด์เต็มจอ, กำลังขาย = ยอดเด่น + แถบสไลด์ย่อ โดยเจ้าของร้านอัปโหลด/เปิด-ปิด/เรียงรูปเอง

**Estimated tasks:** 5 | **Estimated time:** ~3-4 ชม. | **Touches:** API (`server/src/modules/display-slides`, migration) + Web (`src/features/display-slides`, `src/features/customer-display`)

## Current Problem / Current Solution

จอลูกค้ามีอยู่แล้ว (`server/src/modules/customer-display` + `src/features/customer-display`): till ส่ง `DisplayView` ผ่าน `PUT /customer-display/state` (envelope `t.Any`, `publish-display-state.usecase.ts:15-22) ลง SSE + BroadcastChannel, จอ parse ด้วย `parseEnvelope` (`display-state.ts:142`) และรู้เองว่าว่างหรือขายอยู่ (`isStale` 30s → idle, `STALE_AFTER_MS`, `display-state.ts:9`) แต่จอ idle ตอนนี้เป็นจอนิ่ง ไม่มีสไลด์ เจ้าของร้านไม่มีที่อัปโหลดรูป

## Proposed Approach

- ตารางใหม่ `display_slides` (global ทุกสาขาเหมือน promotions): `id, image_key, sort_order, is_active, created_at` — soft-disable ด้วย `is_active` ไม่ลบจริง (history ไม่มีอะไรชี้มา แต่กันรูปหายระหว่างจอเปิดอยู่)
- โมดูล API ใหม่ `display-slides` ตามแพทเทิร์น `categories` (ports → usecases → controllers → repository, เรียกผ่าน ports ข้ามโมดูลไม่ได้): CRUD แอดมิน (auth + permission เดียวกับ promotions — implementer ต้องเช็ค `domains/permission.vo.ts` ห้ามสร้าง permission ใหม่), public `GET /api/v1/display-slides` คืนเฉพาะรูปที่ active เรียงตาม `sort_order` (public route ต้องมี comment ว่าปลอดภัย: รูปการตลาดเดียวกับที่โชว์บนจอลูกค้าอยู่แล้ว ไม่มี PII)
- อัปโหลดล้อ `set-product-image.usecase.ts`: รับ JPEG/PNG/WebP, key รูปแบบ `slides/<uuid>.<ext>`, ลบไฟล์เก่าแบบ best-effort
- จอดึงสไลด์เองผ่าน public endpoint (poll ทุก 60s + ครั้งแรกตอน mount) ไม่ยัดลง SSE sale state (SSE เป็น per-session sale state เปลี่ยนบ่อย ไม่เหมาะกับรูปที่แทบไม่เปลี่ยน)
- จอ idle (`state.kind === 'idle'` หรือ stale) → carousel เต็มจอ auto-advance 8s crossfade; จอขาย (selling/paying/paid) → หน้าขายเดิม + แถบสไลด์ย่อด้านล่าง (รูปเล็กสูง ~64px วนเงียบ ไม่มี interaction)

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| จอลูกค้าว่าง 30s+ | จอ idle นิ่ง | วนสไลด์เต็มจอ 8s/รูป |
| กำลังคิดเงิน | หน้ายอดอย่างเดียว | หน้ายอดเดิม + แถบรูปเล็กด้านล่าง |
| เจ้าของอยากเปลี่ยนรูป | ทำไม่ได้ (ไม่มีฟีเจอร์) | หน้าจัดการสไลด์: อัปโหลด/เปิด-ปิด/เรียง/ลบ |

## Assumptions & Risks

- **Assumed:** `IMediaStorage` เปิดใช้อยู่ (local/worker) — ถ้า `MEDIA_STORAGE=none` endpoint อัปโหลดตอบ error ชัดเจนเหมือน pattern สินค้า (user ตอบ Q2 ยอมรับเงื่อนไขนี้)
- **Risk (media serving):** `isMediaKey` ใน `modules/media.plugin.ts` ล็อกเฉพาะ `products/<number>/<uuid>.<ext>` และกฎห้าม relax ฟอร์มนี้ — worker/R2 mode ใช้ `urlFor()` ได้เลยไม่มีปัญหา แต่ local-disk mode ต้องมีทางเสิร์ฟรูป slides โดยเฉพาะ (route ใหม่ strict `slides/<uuid>.<ext>` แยกจากของ products ไม่ใช่การ relax ฟอร์มเดิม) Task 2 ต้องจัดการข้อนี้พร้อมเทสต์ ไม่มีข้อยกเว้น
- **Risk:** จอเป็น in-memory + anonymous token — สไลด์ persist ใน DB + media storage ไม่ใช่ใน session store ถูกต้องแล้ว แต่จอเปิดค้างจะไม่เห็นรูปใหม่จนกว่าจะ poll รอบถัดไป (60s รับได้)
- **Assumed:** รูปนิ่งเท่านั้น (no video) — `<img>` ธรรมดา ไม่ต้องทำ video pipeline
- **Risk:** รูปที่อัปโหลดใหญ่มากจะหนักจอลูกค้า — จำกัดขนาดไฟล์ 5MB + แนะนำ 1920px ใน UI (validate ใน usecase, ไม่ทำ resize ฝั่ง server รอบนี้)

## Impact

- จอลูกค้ามีสไลด์แบบห้างใหญ่โดยไม่กวนจอแคชเชียร์
- ไม่กระทบยอดขาย/stock/VAT/sale flow (อ่านสไลด์อย่างเดียว, sale state envelope ไม่เปลี่ยน `ENVELOPE_VERSION` คง 1)
- OpenAPI baseline เปลี่ยน (route ใหม่ทั้งชุด) — ต้อง `openapi:check` แล้วให้ project owner รับทราบก่อนบันทึก baseline ใหม่ตามกฎ
- ไม่แตะ `docs/_rules` (ไม่มีไฟล์) และไม่เปลี่ยน DESIGN.md รอบนี้ (จอลูกค้าอยู่นอก design system หลัก)

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Spawn separate sub-agents for independent lanes. Do not parallelize tasks that can race on the same files, migrations, generated artifacts, fixtures, or shared state.

1. **Slide table + domain + repository** - Lane A (server) | Can run together: none | Must wait for: none | TDD slice: entity test (validate/сортировка) -> migration + Drizzle repo -> repo integration test GREEN
2. **Slide usecases + controller + media serving + DI** - Lane A (server) | Can run together: none | Must wait for: Task 1 (ports/repository) | TDD slice: mock-port unit tests (ทุก reject path) -> routes GREEN + `openapi:check`
3. **Web admin: slide management page** - Lane B (web) | Can run together: Task 4 | Must wait for: Task 2 (API contract) | TDD slice: pure lib test (sort/order logic) -> page renders + mutations invalidate GREEN
4. **Display: idle carousel + sale mini-strip** - Lane B (web) | Can run together: Task 3 | Must wait for: Task 2 (public endpoint) | TDD slice: pure carousel-index lib test -> idle shows slides / sale shows strip GREEN
5. **Full verification (verify-only, no code)** - Lane C | Can run together: none | Must wait for: Task 3, Task 4 | TDD slice: docs/config-only — checklist + eyeball

---

### Task 1: Slide table + domain + repository

**Files:**

- Create: `drizzle/<next-seq>_display_slides.sql` (additive, nullable/loosen-first ไม่แตะตารางเดิม)
- Create: `server/src/domains/slide.domain.ts` (+ `slide.domain.test.ts` ข้างไฟล์), error codes ใน `domains/errors/` ถ้าต้องมีใหม่ (reuse code เดิมถ้าตรง)
- Create: `server/src/modules/display-slides/display-slides.module.ts`, `applications/ports/slide.repository.ts` (+ token), `adapters/repository/slide.drizzle.repository.ts` (ใช้ `currentExecutor()` ห้าม import `db` ตรง)
- Modify: `server/src/modules/di-registrations.ts`, `server/src/modules/app.module.ts` (ผูก ports — implementer เปิดไฟล์ดู pattern ของ `categories`)

**Parallelization:**

- Can run with: `none`
- Must wait for: `none`
- Race risk: `migration seq` — ห้ามรันขนานกับงานที่มี migration อื่นในช่วงเดียวกัน

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing tests**

Entity test: สร้าง slide ด้วย `sortOrder` ติดลบ / `imageKey` ว่าง / path นอก `slides/` ต้อง throw domain error `code` คงที่; repository test ผ่าน test DB จริง: insert → `findActive()` คืนเฉพาะ `is_active` เรียง `sort_order`

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd server && bun --env-file=.env.test test src/domains/slide.domain.test.ts
```

Expected result: FAIL (ไฟล์ยังไม่มี / rule ยังไม่実装) ไม่ใช่ syntax/setup error

- [ ] **Step 3: Implement the minimal code**

Entity immutable (`readonly` + `with()`), validate ใน constructor, `toSnapshot()` ไม่หลุด secret (ไม่มี secret ในสไลด์อยู่แล้ว); repository แปลง DB error (unique/ordering) เป็น domain error ก่อนออกจาก adapter; `Page<T>` ผ่าน `page()` ถ้า list มี `limit/offset`

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd server && bun --env-file=.env.test test src/domains/slide.domain.test.ts src/modules/display-slides/
bun run typecheck
```

Expected result: PASS ทั้งหมด

- [ ] **Step 5: Refactor only after green**

เก็บ behavior เดิม รันเทสต์ซ้ำหลัง refactor

**Verification:**

```bash
bun run typecheck
cd server && bun run test:unit
```

---

### Task 2: Slide usecases + controller + media serving + DI

**Files:**

- Create: `server/src/modules/display-slides/applications/schemas/slide-schemas.ts` (zod, `execute()` รับ `unknown` แล้ว parse), `applications/usecases/*.usecase.ts` (list-active public query, admin list/create/update-order/toggle/delete + upload-image command ผ่าน `IUnitOfWork`), `adapters/controllers/display-slides.controller.ts` (Elysia routes `/api/v1/display-slides`, response `{ items, total }` ผ่าน `page()`)
- Modify: `server/src/modules/display-slides/display-slides.module.ts`, `server/src/modules/di-registrations.ts` (ผูก module)
- Media serving: ทางใดทางหนึ่ง — worker mode ใช้ `urlFor()` ตรง; **local mode ห้าม relax `isMediaKey`** ให้เพิ่ม route strict เฉพาะ slides (เช่น `slides/<uuid>.<jpg|png|webp>` แยกจาก products form) พร้อมเทสต์กัน path-traversal

**Parallelization:**

- Can run with: `none`
- Must wait for: `Task 1` (ports + repository + entity)
- Race risk: `OpenAPI baseline` — อย่า regenerate baseline เอง ให้ owner รับทราบก่อนตามกฎ contract

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing tests**

Unit tests ด้วย mock ports (`src/__tests__/mocks.ts` + `factories.ts`): success + ทุก reject path (invalid input, not found, ไม่มี permission, media disabled, ไฟล์ผิด type/เกิน 5MB) — ห้ามใช้ DB จริงใน unit tests

- [ ] **Step 2: Run the tests and confirm they fail for the expected reason**

Expected result: FAIL (usecase ยังไม่มี) ไม่ใช่ import/setup error

- [ ] **Step 3: Implement the minimal code**

Query = `GET` อ่านอย่างเดียวไม่มี side effect; command เปลี่ยนเกิน 1 ตารางต้องห่อ `IUnitOfWork.run()`; permission ใช้ของ promotions เดิม (เช็ค `domains/permission.vo.ts` ห้ามเพิ่ม permission ใหม่); public `GET` (active only) มี comment ว่าทำไมปลอดภัย; upload ล้อ `set-product-image.usecase.ts` (key `slides/<uuid>.<ext>`, ลบไฟล์เก่า best-effort); audit log ถ้าคำสั่งเปลี่ยนข้อมูล (เรียก `IAuditLog.record` ใน UoW เดียวกัน)

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd server && bun run test:unit
bun run openapi:check
```

Expected result: PASS — ถ้า `openapi:check` แดงเพราะ route ใหม่ (expected) ให้เก็บ diff ไว้รายงาน owner ห้ามบันทึก baseline ใหม่เอง

- [ ] **Step 5: Refactor only after green**

คงไว้ ไม่สกัดเพิ่ม

**Verification:**

```bash
bun run typecheck
cd server && bun run test:unit
bun run openapi:check
```

---

### Task 3: Web admin — slide management page

**Files:**

- Create: `src/features/display-slides/` (`index.ts` public entry, `api.ts` key factory + query/mutation hooks ห้าม component เรียก `api` ตรง, `components/*.tsx` ใช้ `DataTable` + priority columns, `locales.ts` `{ th, en }`, `lib/*.ts` pure functions + เทสต์ข้างไฟล์)
- Modify: `src/app/App.tsx` (route), `src/app/AppSidebar.ts(x)` (เมนู), `src/app/i18n.ts` (namespace), `src/locales/errors.ts` (แปล error `code` ใหม่ถ้ามี)

**Parallelization:**

- Can run with: `Task 4` (คนละ feature folder ไม่ import ข้ามกัน)
- Must wait for: `Task 2` (API contract + error codes)
- Race risk: `i18n namespace / errors.ts` — Task 4 แตะไฟล์ locales ของตัวเองเท่านั้น ห้ามแก้ `src/locales/errors.ts` พร้อมกัน (ถ้า Task 4 ไม่ต้องเพิ่ม code ใหม่ก็ไม่มี race)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing tests**

Pure lib tests (จัดลำดับ/validate ไฟล์ก่อนอัปโหลด) + store test ถ้ามี; component test ไม่บังคับถ้าไม่มี logic

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
bun run test:web
```

Expected result: FAIL (ไฟล์ยังไม่มี) ไม่ใช่ config error

- [ ] **Step 3: Implement the minimal code**

Server state ด้วย TanStack Query เท่านั้น (ห้าม copy รูปลง zustand); upload ผ่าน mutation hook; ปุ่ม/input สูง 44px (`h-11`); ทุกข้อความผ่าน `t()`; ตารางใช้ `DataTable`; skeleton/error-retry/empty state ครบ; ตรวจที่ 390/768/1366 ไม่ overflow

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
bun run test:web
bun run typecheck
bun run screenshots
```

Expected: PASS + เปิดหน้า admin ดูด้วยตาว่าใช้งานได้ (อัปโหลดจริง 1 รูป เปิด/ปิด เรียงลำดับ)

- [ ] **Step 5: Refactor only after green**

Logic อยู่ใน `lib/` ไม่ฝังใน component

**Verification:**

```bash
bun run typecheck
bun run lint
bun run test:web
```

---

### Task 4: Display — idle carousel + sale mini-strip

**Files:**

- Modify: `src/features/customer-display/` (components ฝั่งจอ: idle screen → carousel; sale view → แถบสไลด์ย่อ; ดึงสไลด์ผ่าน public endpoint ของ Task 2 ด้วย fetch + poll 60s + ครั้งแรกตอน mount)
- Create: `src/features/customer-display/lib/slideshow.ts` (+ `.test.ts`) — pure: คำนวณ index ถัดไป/ก่อนหน้า, ข้ามรูปเสีย, ว่าง = ไม่โชว์ carousel
- Modify (ถ้าจำเป็น): `src/features/customer-display/locales.ts` (ข้อความจอ เช่น "แตะเพื่อ..." — ไม่มีก็ไม่ต้อง)

**Parallelization:**

- Can run with: `Task 3` (คนละ feature folder)
- Must wait for: `Task 2` (public endpoint + URL รูป)
- Race risk: `none` กับ Task 3 ถ้าไม่แตะไฟล์ร่วมกัน (เช็ค `git status` ก่อนเริ่ม)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code.

- [ ] **Step 1: Write the failing tests**

`slideshow.test.ts`: วน index ถูก, รูปเดียวไม่วน, รายการว่างคืน null, ข้าม index รูปที่โหลดเสีย; parse response ของ public endpoint (reuse guard แบบ `display-state.ts` — ตัด field แปลกทิ้ง ไม่พังทั้งจอ)

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
bun run test:web
```

Expected result: FAIL (logic ยังไม่มี)

- [ ] **Step 3: Implement the minimal code**

Idle (`state.kind === 'idle'` หรือ stale 30s ตามของเดิม): รูปเต็มจอ `object-cover` auto-advance 8s (inject timer ผ่าน options เพื่อเทสต์ได้ ห้าม `setTimeout` ลอยใน logic); ขายอยู่: หน้าเดิมทุกประการ + แถบรูปสูง ~64px ด้านล่าง วนเงียบ ไม่มีปุ่ม/click (จอลูกค้า display-only); รูปโหลดเสีย → ข้ามไปรูปถัดไป ไม่ใช่จอขาว; โลกใหม่ไม่เปลี่ยน `ENVELOPE_VERSION`, ไม่แตะ publisher/parse ของ sale state

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
bun run test:web
bun run typecheck
bun run screenshots
```

Expected: PASS + เปิดจอลูกค้าดูด้วยตา (idle วนรูป / ขายโชว์ยอด+แถบย่อ) ถ้า e2e ไม่มี route จอให้ดู manual

- [ ] **Step 5: Refactor only after green**

คงไว้ ไม่สกัดเพิ่ม

**Verification:**

```bash
bun run typecheck
bun run test:web
```

---

### Task 5: Full verification (verify-only, no code)

**Files:**

- Read: ภาพ screenshots ที่เกี่ยว (admin + display ทุก size), `DESIGN.md` ถ้า Task 3/4 เติมข้อความจอใหม่, OpenAPI diff จาก Task 2
- Modify: none — ห้ามแก้โค้ดใน task นี้ ตกข้อไหนเปิด task ใหม่เฉพาะจุด

**Parallelization:**

- Can run with: `none`
- Must wait for: `Task 3`, `Task 4`
- Race risk: `none`

- [ ] **Step 0: Load the TDD discipline**

Docs/config-only exception: ใช้ checklist นี้เป็นเกณฑ์ผ่าน/ตกแทน RED test

- [ ] **Step 1: Checklist (FAIL ถ้าตกข้อเดียว)**

1. อัปโหลด เปิด/ปิด เรียงลำดับ ลบรูป ใช้งานได้จริงผ่าน UI (รูปขึ้นจอลูกค้าใน 60s)
2. จอ idle วนเต็มจอ / จอขายโชว์ยอด + แถบย่อ / รูปเสียไม่ทำจอขาว
3. 390/768/1366 ไม่มี horizontal overflow ทั้งหน้า admin และจอ
4. touch target 44px ครบหน้า admin; จอลูกค้าไม่มีปุ่มที่ต้องกด
5. `bun run test` (API+web ทั้งชุด) + `typecheck` + `lint` เขียว; `openapi:check` diff อธิบายได้ว่าเป็น additive + owner รับทราบแล้ว

- [ ] **Step 2: Run verification**

```bash
bun run typecheck
bun run lint
bun run test
bun run openapi:check
bun run screenshots
```

Expected: เขียวทั้งหมด (ยกเว้น openapi baseline ที่รอ owner รับทราบ)

**Verification:** คำสั่งชุดเดียวกับข้างบน

---

## Unresolved / Out of scope

- ตั้งเวลาหมดอายุ/แยกช่วงเวลาในวัน (มติ Q4 = A รอบหลัง)
- ผูกสไลด์ auto จากโมดูล promotions (มติ Q2 = A อัปโหลดมือ)
- วิดีโอในสไลด์ (รูปนิ่งก่อน)
- resize/compress รูปฝั่ง server (validate ขนาดอย่างเดียวรอบนี้)
- สไลด์บนจอแคชเชียร์ (มติ Q1 = A จอลูกค้าก่อน)
- ลบ locale keys ที่เลิกใช้ (`brand.sales/stock/tables/shifts`, `brand.headline`) — งาน cleanup แยกที่ค้างอยู่
