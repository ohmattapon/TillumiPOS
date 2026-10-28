# Confirm Dialogs (AlertDialog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทุกจุดทำลายข้อมูลที่ย้อนกลับไม่ได้ต้องถามยืนยันก่อนผ่านตัวกลางบน shadcn AlertDialog

**Estimated tasks:** 7 | **Estimated time:** ~120 min | **Touches:** Frontend only (`apps/web`)

## Current Problem / Current Solution

`AlertDialog` มีเป็น primitive ใน `apps/web/src/components/ui/alert-dialog.tsx` แต่ไม่มีที่ไหนใช้เลย (grep เจอแค่ไฟล์นิยาม) ผลคือปุ่มเสี่ยงทำงานทันทีเมื่อกด: ลบบทบาทใช้ `Dialog` ธรรมดา, ยกเลิกบิล/คืนเงินสด/ปิดรายการ QR เป็นฟอร์ม inline สองชั้นกระจัดกระจาย, ยกเลิกออเดอร์/ลบไลน์/ปิดกะ/เลิกจับคู่จอ/ลบรูปสินค้า/ยกเลิก QR ไม่มีเกราะยืนยันแบบเดียวกัน

## Proposed Approach

สร้าง `ConfirmDialog` ตัวกลางไฟล์เดียวใน `apps/web/src/components/` บน AlertDialog primitives (มี Title ทุกครั้งเพื่อ accessibility, ปุ่ม destructive สำหรับงานทำลาย, รองรับ `children` ไว้ใส่ช่องเหตุผลของจุดที่ต้องกรอกเหตุผล) แล้วไล่เปลี่ยน 9 จุดที่ล็อกไว้มาใช้ตัวกลาง สตริงtitle/desc รายจุดอยู่ใน locales ของ feature นั้นๆ ส่วนคำกลาง (ยกเลิก/ยืนยัน) ใช้ของกลาง

## Side by Side

| Scenario | Before | After |
| -------- | ------ | ----- |
| ลบบทบาท | `Dialog` ธรรมดาใน RolesPage | `ConfirmDialog` ปุ่มแดง + ข้อความเตือน |
| ยกเลิกบิล / คืนเงินสด | ฟอร์ม inline ใน SaleDetailDialog | `ConfirmDialog` ใส่ช่องเหตุผลเป็น children |
| ปิดรายการ QR | ฟอร์ม inline ใน QrRecoveryPanel | `ConfirmDialog` ใส่ช่องเหตุผลเป็น children |
| ยกเลิกออเดอร์ / ลบไลน์ | ทำทันทีไม่มีถาม | `ConfirmDialog` ก่อน mutate |
| ปิดกะ / ยกเลิกการนับเงิน | ทำทันทีไม่มีถาม | `ConfirmDialog` ก่อน mutate |
| เลิกจับคู่จอ / ลบรูปสินค้า / ยกเลิก QR ที่กดเอง | ทำทันทีไม่มีถาม | `ConfirmDialog` ก่อน mutate |
| เปิด/ปิดใช้งานชั่วคราว (user, category, member, promotion, product, register) | ไม่มีถาม | คงเดิม ไม่ถาม (เปิดกลับได้ ไม่กระทบเงิน) |

## Assumptions & Risks

- **Assumed:** ลิสต์ 9 จุดจาก grep ครบ (void sale, cash refund, delete role, cancel order, remove line, dismiss QR, cancel QR ที่กดเอง, close shift, cancel closing, unpair display, remove product image) — ถ้ามีจุดอื่นที่ผู้ใช้เจอจริงให้เพิ่มเป็น task ใหม่ ไม่ยัดใน task เดิม
- **Assumed:** การปิดใช้งานชั่วคราวทุกตัวเปิดกลับได้จริงและไม่กระทบเงิน จึงไม่ต้องถาม
- **Assumed:** `use-qr-payment.ts` บรรทัด cancel อัตโนมัติ (programmatic, ไม่ใช่คลิกผู้ใช้) ไม่ต้องใส่ confirm — ใส่เฉพาะปุ่มยกเลิกที่ผู้ใช้กดเอง (OrderQrHold, PaymentDialog)
- **Risk:** จุดลบไลน์ผ่าน stepper จำนวนเหลือ 0 (`use-cart-actions.ts` ลบอัตโนมัติเมื่อ quantity < 1) ใส่ modal ตรงนั้นอาจรำคาญ — task นั้นต้องออกแบบให้ถามเฉพาะปุ่มลบชัดแจ้ง ไม่ใช่ทุกครั้งที่กดลบจำนวน
- **Risk:** เปลี่ยน Dialog เป็น AlertDialog ใน RolesPage ต้องคง behavior เดิม (disabled เมื่อมี user ถือบทบาท, error message, toast) ห้ามหาย

## Impact

- ลดอุบัติเหตุกดพลาดในงานที่ย้อนกลับไม่ได้ (เงินหาย/ข้อมูลหาย)
- UI ยืนยันเหมือนกันทั้งแอป ดูแลที่เดียว
- ไม่แตะ API contract / backend — เปลี่ยนแค่ web
- งานสกรีนช็อตต้องตรวจ (390/768/1366) ก่อน merge ตาม DESIGN.md

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before editing production code. Each task is a RED -> GREEN -> REFACTOR slice.
> **Parallel-first:** Spawn separate sub-agents for independent lanes. Do not parallelize tasks that can race on the same files, migrations, generated artifacts, or shared state.

1. **[Shared ConfirmDialog - DONE]** - Lane A (foundation) | Can run together: none | Must wait for: none | TDD slice: failing render test -> `ConfirmDialog.tsx` -> `bun test` ไฟล์นั้น
2. **[RolesPage delete - DONE]** - Lane B | Can run together: 3, 4, 5, 6, 7 | Must wait for: 1 | TDD slice: failing interaction test -> แทน Dialog ด้วย ConfirmDialog -> targeted test
3. **[Void sale + cash refund - DONE]** - Lane B | Can run together: 2, 4, 5, 6, 7 | Must wait for: 1 | TDD slice: failing test (reason rquired + confirm) -> ConfirmDialog + children -> targeted test
4. **QR dismiss + QR cancel (user-initiated)** - Lane B | Can run together: 2, 3, 5, 6, 7 | Must wait for: 1 | TDD slice: failing test -> QrRecoveryPanel + OrderQrHold/PaymentDialog -> targeted test
5. **Orders cancel + remove line** - Lane B | Can run together: 2, 3, 4, 6, 7 | Must wait for: 1 | TDD slice: failing test -> OpenOrdersDialog + จุดลบไลน์ -> targeted test
6. **Shift close + cancel counting** - Lane B | Can run together: 2, 3, 4, 5, 7 | Must wait for: 1 | TDD slice: failing test -> ShiftsPage -> targeted test
7. **Unpair display + remove product image** - Lane B | Can run together: 2, 3, 4, 5, 6 | Must wait for: 1 | TDD slice: failing test -> PairDisplayDialog + ProductFormDialog -> targeted test + `bun run typecheck`

---

### Task 1: Shared ConfirmDialog

**Files:**

- Create: `apps/web/src/components/ConfirmDialog.tsx`
- Test: `apps/web/src/components/ConfirmDialog.test.tsx`
- Modify: `apps/web/src/locales/common.ts` (ถ้าต้องเพิ่มคำกลาง ยืนยัน/ยกเลิก — ถ้ามีอยู่แล้วไม่ต้องแตะ)

**Parallelization:**

- Can run with: `none`
- Must wait for: `none`
- Race risk: none (ไฟล์ใหม่; เป็น dependency ของทุก task อื่น)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

```tsx
// ConfirmDialog.test.tsx (bun test)
- renders title + description + confirm/cancel labels
- confirm button uses destructive variant when destructive
- pending disables both buttons and shows pending label
- children (reason input) renders inside the dialog
- clicking cancel calls onOpenChange(false); clicking confirm calls onConfirm once
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted test command for the test file above. Expected result: FAIL because the component is missing, not because of syntax, setup, or import errors.

- [ ] **Step 3: Implement the minimal code**

Props ขั้นต่ำ: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel?` (default จากคำกลาง), `destructive?`, `pending?`, `pendingLabel?`, `onConfirm`, `children?`. Compose จาก `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` เท่านั้น ห้ามเขียน overlay/content เอง ห้าม `space-x-*` (ใช้ `flex gap-*`) ปุ่ม h-11 ตามมาตรฐานแตะ 44px

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS with no new warnings or unrelated failures.

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

**Verification:** `bun test <path ConfirmDialog.test.tsx>` จาก `apps/web`, แล้ว `bun run typecheck` ที่ root ก่อนจบ task

---

### Task 2: RolesPage delete → ConfirmDialog

**Files:**

- Modify: `apps/web/src/features/roles/components/RolesPage.tsx:35-38`
- Test: test คู่ไฟล์นั้น (ถ้ายังไม่มีให้สร้างข้างไฟล์ตามธรรมเนียม `lib/`/ข้าง component)

**Parallelization:**

- Can run with: `Task 3`, `Task 4`, `Task 5`, `Task 6`, `Task 7`
- Must wait for: `Task 1`
- Race risk: none (ไฟล์นี้ task เดียวแตะ)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

```tsx
// กดลบ -> ConfirmDialog เปิดพร้อม deleteTitle/deleteHint + ชื่อบทบาท
// กดยืนยัน -> remove.mutate ถูกเรียกด้วย id เดิม + toast + ปิด dialog
// ปุ่มลบยัง disabled เมื่อ role.systemKey หรือ userCount > 0 (คงเดิม)
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted test command for the test file above. Expected result: FAIL because the behavior is missing, not because of syntax, setup, or import errors.

- [ ] **Step 3: Implement the minimal code**

แทน `Dialog/DialogContent/...` ชุดลบด้วย `ConfirmDialog` (`destructive`, `pending={remove.isPending}`) คง error block (`remove.error`) ไว้ข้างในผ่าน children คง `tc('cancel')` และ `t('remove')` labels เดิม

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS with no new warnings or unrelated failures.

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

---

### Task 3: Void sale + cash refund → ConfirmDialog

**Files:**

- Modify: `apps/web/src/features/sales/components/SaleDetailDialog.tsx:50-121`
- Test: test คู่ไฟล์นั้น

**Parallelization:**

- Can run with: `Task 2`, `Task 4`, `Task 5`, `Task 6`, `Task 7`
- Must wait for: `Task 1`
- Race risk: none (ไฟล์นี้ task เดียวแตะ)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

```tsx
// กดยกเลิกบิล -> ConfirmDialog เปิดพร้อม voidWarning + ช่องเหตุผล (required, maxLength 500)
// ยืนยันทั้งที่เหตุผลว่าง -> mutate ไม่ถูกเรียก
// กรอกเหตุผล + ยืนยัน -> voidSale.mutate ด้วย reason.trim() + toast + ปิด confirm
// ฝั่ง cash refund เหมือนกัน (ต้องมี shift.data ถึงยืนยันได้)
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted test command for the test file above. Expected result: FAIL because the behavior is missing, not because of syntax, setup, or import errors.

- [ ] **Step 3: Implement the minimal code**

ย้ายฟอร์ม void/refund เข้า `children` ของ `ConfirmDialog` สองตัว (แยก state `isVoiding`/`isRefunding` เดิม) ปุ่มยืนยัน `destructive` เฉพาะฝั่ง void คง labels เดิม (`detail.confirmVoid`, `detail.keep`, `detail.confirmRefund`) และ `autoFocus` ช่องเหตุผล

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS with no new warnings or unrelated failures.

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

---

### Task 4: QR dismiss + QR cancel (user-initiated) → ConfirmDialog — DONE

**Files:**

- Modify: `apps/web/src/features/shifts/components/QrRecoveryPanel.tsx:104-134`
- Modify: `apps/web/src/features/pos/components/OrderQrHold.tsx` (ปุ่มยกเลิกที่ผู้ใช้กด)
- Modify: `apps/web/src/features/pos/components/PaymentDialog.tsx` (เฉพาะปุ่มยกเลิก QR ที่ผู้ใช้กด — ห้ามแตะ path ยกเลิกอัตโนมัติใน `use-qr-payment.ts:54`)
- Test: test คู่ไฟล์ที่แก้

**Parallelization:**

- Can run with: `Task 2`, `Task 3`, `Task 5`, `Task 6`, `Task 7`
- Must wait for: `Task 1`
- Race risk: `OrderQrHold.tsx` / `PaymentDialog.tsx` มีแค่ task นี้แตะ — ยืนยันด้วย grep ก่อนแก้ว่าไม่มี task อื่นแตะไฟล์เดียวกัน

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

```tsx
// dismiss: กดปิดรายการ -> ConfirmDialog + ช่องเหตุผล required -> ยืนยันเรียก dismiss.mutate{id, reason: trim}
// QR cancel ที่กดเอง: กดยกเลิก -> ConfirmDialog -> ยืนยันถึงเรียก cancel.mutate
// auto-cancel ใน use-qr-payment.ts ต้องไม่มี confirm (ไม่แตะไฟล์นั้น)
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted test command for the test file above. Expected result: FAIL because the behavior is missing, not because of syntax, setup, or import errors.

- [ ] **Step 3: Implement the minimal code**

dismiss ย้ายฟอร์มเหตุผลเข้า `children` ของ `ConfirmDialog` (`destructive`) คง `t('qr.*')` labels; ปุ่มยกเลิก QR ที่กดเองห่อด้วย `ConfirmDialog` แบบบาง (ไม่มี children)

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS with no new warnings or unrelated failures.

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

---

### Task 5: Cancel order + remove line → ConfirmDialog ✅ DONE (2026-10-17)

> **Finding:** CartPanel ไม่มีปุ่มลบไลน์ชัดแจ้ง — มีแค่ stepper +/− และช่องกรอกจำนวน (ลดเหลือ 0 = ลบ ผ่าน `use-cart-actions.setQuantity`) ตาม guard ในแผนจึงไม่แตะ path นี้ (ต้อง grill ใหม่ถ้าจะเปลี่ยน) Task นี้จึงทำเฉพาะ cancel order ส่วน remove-line คงเดิม
> Verified: `bun test` 302 pass 0 fail, `bun run typecheck` ทุก package ผ่าน
> Lesson: `mock.module` ใน bun รั่วข้ามไฟล์ตามลำดับโหลด (sequential, process เดียว) — ห้าม mock shared module ที่ไฟล์อื่นใช้จริง (cart.store, use-list-pagination, PaginationBar) ให้ใช้ของจริงแทน

**Files:**

- Modify: `apps/web/src/features/pos/components/OpenOrdersDialog.tsx:23-127` (cancel order + ฟอร์มเหตุผล)
- Modify: `apps/web/src/features/pos/hooks/use-cart-actions.ts:16-29` + component ปุ่มลบไลน์ที่เรียก hook นี้ (grep หา caller ก่อนแก้)
- Test: test คู่ไฟล์ที่แก้

**Parallelization:**

- Can run with: `Task 2`, `Task 3`, `Task 4`, `Task 6`, `Task 7`
- Must wait for: `Task 1`
- Race risk: caller ของ `use-cart-actions` อาจซ้ำกับไฟล์ใน task อื่น — grep ก่อนแก้ ถ้าชนให้ทำ sequential

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

```tsx
// cancel order: กดยกเลิก -> ConfirmDialog + เหตุผล required -> ยืนยันเรียก cancelOrder.mutate
// remove line: กดปุ่มลบไลน์ชัดแจ้ง -> ConfirmDialog -> ยืนยันถึง removeLine.mutate
// ลดจำนวนลงเหลือ 0 ผ่าน stepper ต้องไม่เด้ง modal (คงพฤติกรรมเดิม) — ถ้าตัดสินใจเปลี่ยน ให้เรียก grill ใหม่ ไม่ยัดใน task นี้
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted test command for the test file above. Expected result: FAIL because the behavior is missing, not because of syntax, setup, or import errors.

- [ ] **Step 3: Implement the minimal code**

cancel order ย้ายฟอร์มเหตุผลเข้า `children` ของ `ConfirmDialog`; ปุ่มลบไลน์ชัดแจ้งห่อ `ConfirmDialog` แบบบาง ห้ามใส่ confirm ใน path ลดจำนวนอัตโนมัติ

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS with no new warnings or unrelated failures.

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

---

### Task 6: Close shift + cancel counting → ConfirmDialog ✅ DONE (2026-10-17)

> Verified: `bun test` 305 pass 0 fail, `bun run typecheck` ทุก package ผ่าน
> Lesson 2: mock `../store/register-selection` รั่วไปโดน `register-selection.test.ts` (permission เดียวกับ Task 5) — เอาออกแล้วใช้ real store แทน (initial selections ว่าง → fallback register แรกที่ active พอดี)

**Files:**

- Modify: `apps/web/src/features/shifts/components/ShiftsPage.tsx:145-153` (cancelClosing + close buttons) และปุ่ม `startCounting` บรรทัด 154-177 (มี ack flow ของ QR อยู่แล้ว — ห้ามรื้อ ack flow, เพิ่ม confirm เฉพาะการเริ่มนับแบบไม่มี QR ค้าง)
- Test: test คู่ไฟล์ที่แก้

**Parallelization:**

- Can run with: `Task 2`, `Task 3`, `Task 4`, `Task 5`, `Task 7`
- Must wait for: `Task 1`
- Race risk: none (ไฟล์นี้ task เดียวแตะ)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

```tsx
// กดปิดกะ -> ConfirmDialog แสดงยอดนับ vs ยอดคาดหวัง -> ยืนยันถึง close.mutate พร้อม countedCashSatang + reason
// กดยกเลิกการนับ -> ConfirmDialog -> ยืนยันถึง cancelClosing.mutate
// guard เดิมคงอยู่: นับไม่ตรงแต่ไม่มีเหตุผลต่าง -> ปุ่มยืนยัน disabled
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted test command for the test file above. Expected result: FAIL because the behavior is missing, not because of syntax, setup, or import errors.

- [ ] **Step 3: Implement the minimal code**

ห่อปุ่มปิดกะ/ยกเลิกการนับด้วย `ConfirmDialog` แบบบาง (สรุปยอดเป็น description/children อ่านอย่างเดียว ไม่ใช่ฟอร์ม) คง `closingRevision`, idempotency guard และ QR acknowledgement flow เดิมทั้งหมด

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS with no new warnings or unrelated failures.

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

---

### Task 7: Unpair display + remove product image → ConfirmDialog ✅ DONE (2026-10-17)

> Unpair: `PairDisplayDialog` ใช้ ConfirmDialog (destructive, title/confirm=`pair.disconnect`, description=`pair.unpairDescription` ใหม่ th+en) — 2 เทสต์ใหม่
> Remove image: ไม่แตะโค้ด — ปุ่มลบรูปใน `ProductFormDialog:138` แค่ล้าง state โลคัล (`chooseImage(null)`) ลบจริงเกิดตอนกดบันทึกผ่าน `useSaveProduct` (api.ts:77) ซึ่งเป็นการยืนยันชัดแจ้งอยู่แล้ว ใส่ confirm ซ้ำ = noise ถ้าอยากเปลี่ยนค่อย grill ใหม่
> Verified: `bun test` 307 pass 0 fail, `tsc -b` ผ่าน

**Files:**

- Modify: `apps/web/src/features/customer-display/components/PairDisplayDialog.tsx:57-62`
- Modify: `apps/web/src/features/products/components/ProductFormDialog.tsx:140` (ปุ่มลบรูป — grep หา handler ลบจริงใน `products/api.ts:77` ก่อนแก้)
- Test: test คู่ไฟล์ที่แก้

**Parallelization:**

- Can run with: `Task 2`, `Task 3`, `Task 4`, `Task 5`, `Task 6`
- Must wait for: `Task 1`
- Race risk: none (คนละไฟล์กับทุก task)

- [ ] **Step 0: Load the TDD discipline**

Use `superpowers:test-driven-development` before editing production code. This task must follow RED -> GREEN -> REFACTOR.

- [ ] **Step 1: Write the failing test**

```tsx
// unpair: กดตัดการเชื่อมต่อ -> ConfirmDialog -> ยืนยันถึง unpair.mutate; ปุ่มยัง disabled เมื่อ displays === 0
// remove image: กดลบรูป -> ConfirmDialog -> ยืนยันถึงลบ image (image.delete / set null path เดิม)
```

- [ ] **Step 2: Run the test and confirm it fails for the expected reason**

Run the most targeted test command for the test file above. Expected result: FAIL because the behavior is missing, not because of syntax, setup, or import errors.

- [ ] **Step 3: Implement the minimal code**

ทั้งสองจุดใช้ `ConfirmDialog` แบบบาง (`destructive`) ไม่ต้องมี children คง labels/i18n เดิมของแต่ละ feature

- [ ] **Step 4: Run the test and confirm it passes**

Run the same targeted test command. Expected result: PASS with no new warnings or unrelated failures.

- [ ] **Step 5: Refactor only after green**

Refactor only after the targeted test is green. Keep behavior unchanged and rerun the targeted test after the refactor.

---

## Final verification (ทำหลังทุก task เขียว)

- [ ] `bun run typecheck` ที่ root ผ่าน
- [ ] `bun run test` ที่ root ผ่าน (api + web)
- [ ] `bun run screenshots` แล้วดูภาพด้วยตาที่ 390/768/1366 — ทุก dialog ที่เปลี่ยนต้องไม่ล้นจอ ไม่มี scrollbar แนวตั้งโผล่ (สาขาก่อนหน้าซ่อนไว้)
- [ ] ห้าม commit / ห้าม push จาก worker — ส่งงานให้ owner ตรวจแล้วกดเอง
