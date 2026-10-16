# โปรโมชัน: สถานะการทำงาน (ณ 2026-10-15)

แผน: `docs/superpowers/plans/2026-10-15-promotions.md` · สเปค: `docs/superpowers/specs/2026-10-15-promotions-design.md`
Branch: `ohmattpon/promotions` (แตกจาก `origin/main` ที่ `3988709`) · ยังไม่ push ยังไม่เปิด PR ยังไม่ merge

## สรุปสั้น

โค้ดและ unit test ครบทั้ง 15 task แล้ว แต่ **ยังไม่ได้รัน integration test และ e2e เลย** เพราะเครื่องนี้ไม่มี PostgreSQL ที่ `localhost:5433/pos_test` ส่วนที่ค้างคือการตรวจกับฐานข้อมูลจริง และ final review รอบสุดท้าย

ผลตรวจล่าสุด (โค้ดชุดสุดท้ายที่ `77eeae0`):
- unit ฝั่ง API: 798 ผ่าน
- unit ฝั่งเว็บ: 184 ผ่าน
- root typecheck: ผ่าน
- lint เว็บ: ผ่าน
- `openapi:check`: ผ่าน (baseline ใหม่ที่คุณอนุมัติแล้ว การเปลี่ยนเป็นการเพิ่มอย่างเดียว)

## สถานะรายงาน

| Task | เนื้อหา | สถานะ |
|---|---|---|
| 1 | `SalePromotion` บนบิล | เสร็จ (unit) |
| 2 | กติกาและสูตรโปรโมชัน | เสร็จ (unit) |
| 3 | quote entity (ตรึงราคา) | เสร็จ (unit) |
| 4 | ตาราง `promotions`, `price_quotes`, migration `0015` | โค้ดเสร็จ · **รอ DB** (ขั้น integration) |
| 5 | โมดูล promotions + API | โค้ดเสร็จ · **รอ DB** (`promotions.integration`) |
| 6 | โมดูล quotes + API | โค้ดเสร็จ · **รอ DB** (`quotes.integration`) |
| 7 | QR บอกรหัสอ้างอิง | เสร็จ (unit) |
| 8 | ขาย/ชำระออเดอร์ด้วย quote | เสร็จ (unit) · ดู DB ด้านล่าง |
| 9 | QR จาก quote และปล่อย quote | เสร็จ (unit) |
| 10 | กันแก้ออเดอร์ขณะ QR รอ | unit เสร็จ · **รอ DB** (`orders`, `tables` integration) |
| 11 | ทดสอบเงินผ่าน HTTP กับ PostgreSQL | โค้ดเสร็จ · **รอ DB** (2 ไฟล์ integration) |
| 12 | สัญญา API (OpenAPI) | เสร็จ (baseline อนุมัติแล้ว) · **รอ DB** (`bun run test` ที่ root) |
| 13 | หน้าจัดการโปรโมชัน (เว็บ) | เสร็จ (unit + typecheck + lint) |
| 14 | หน้าขาย: โปรโมชัน, quote ก่อนชำระ, QR | เสร็จ (unit) |
| 15 | e2e, ภาพหน้าจอ, AGENTS.md, roadmap | เอกสารและสคริปต์เสร็จ (`4a21a3f`) · **รอ DB** (`bun run e2e`, `bun run screenshots`, ตรวจภาพด้วยตา) |

## สิ่งที่ต้องทำเมื่อกลับมา

1. **เปิด PostgreSQL ที่ `localhost:5433` ฐาน `pos_test`** (`bun run db:up` ถ้าใช้ Docker หรือ Postgres ตัวอื่นที่พอร์ตเดียวกัน) ข้อควรระวัง: ชุดทดสอบจะ truncate ทุกตาราง ห้ามชี้ไปฐาน demo บนคลาวด์ (`test/database.ts` บังคับไว้แล้ว)
2. **รัน integration** ตามรายการด้านล่าง แล้วแก้ของที่ล้มเหลว (แก้ตาม spec อย่าแก้ test ให้ตรงกับพฤติกรรมผิด)
3. **รัน `bun run test` ที่ root** แล้ว `bun run e2e`, `bun run screenshots`, เปิดภาพ `23-promotions` และหน้าขายดูที่ 390 / 768 / 1366 px
4. **รอผล final review** (agent รีวิวทั้ง branch ยังทำงานอยู่ตอนเขียนเอกสารนี้) แก้ข้อ Critical และ Important แล้วบันทึกใน ledger
5. **ตัดสินใจเรื่อง push**: ตอนนี้ยังไม่ได้ push ข้อบังคับใน AGENTS.md ยังห้าม push ทั้งหมด (การอนุญาต push อยู่บน branch `ohmattpon/agents-push-rule` ยังไม่ได้ merge)

## รายการ integration ที่ต้องรัน (ยังไม่ได้รัน)

`apps/api`:
- `src/__tests__/integration/promotions.integration.test.ts` (Task 5)
- `src/__tests__/integration/quotes.integration.test.ts` (Task 6)
- `src/__tests__/integration/promotion-payments.integration.test.ts` (Task 11)
- `src/__tests__/integration/promotion-shifts.integration.test.ts` (Task 11)
- `src/__tests__/integration/unit-of-work.integration.test.ts` (Task 4 ตรวจว่า migration `0015` รันได้)
- `src/__tests__/integration/orders.integration.test.ts`, `tables.integration.test.ts` (Task 10)
- `src/__tests__/integration/sales.integration.test.ts`, `qr-payments.integration.test.ts`, `qr-shifts.integration.test.ts` (ควรตรวจ เพราะ Task 8 เปลี่ยนลำดับการ claim QR ในขายแบบไม่มี quote)
- เพิ่มเติม: `bun run test` ที่ root และ `bun run openapi:check`

`apps/web`:
- `bun run e2e` (หัวข้อ Promotions ใหม่) และ `bun run screenshots` (ภาพ `23-promotions`)

## การตัดสินใจที่ต้องรู้ (ruling)

ทุกเรื่องบันทึกไว้ใน ledger (ดูด้านล่าง) สรุปสำคัญ:
- **หน้าขาย (Task 14):** แผนเขียน `usesQuote: !declined` ซึ่งทำให้ส่วนลดที่พิมพ์เองหายไปเมื่อไม่มีโปรโมชัน จึงแก้เป็น `!declined && (มีโปรโมชัน || ไม่ได้พิมพ์ส่วนลด)` ผลคือ QR บนบิลที่ปฏิเสธโปรโมชันจะไม่มี quote (เป็น QR แบบเดิม) ซึ่งอาจถูกปฏิเสธด้วย `QR_AMOUNT_MISMATCH` ถ้าราคาเปลี่ยนก่อนชำระ
- **ขายแบบไม่มี quote (Task 8):** ตรวจ QR ก่อนคิดราคา ไม่ใช่หลัง เพื่อให้ได้ `QUOTE_REQUIRED` ไม่ใช่ `UNDERPAID`
- **Task 10:** ลบ import `DrizzleOrderRepository` ที่ไม่ได้ใช้ออกจาก `orders.module.ts` (tsc -b ของเว็บตรวจ `noUnusedLocals`)
- **Task 5:** เพิ่มไฟล์ `promotion.snapshot.ts` เพื่อแก้ชนิด `weekdays` ที่เป็น readonly (ค่าไม่เปลี่ยน)

## ไฟล์ที่เกี่ยวข้อง

- ledger (git-ignored, ตัวบันทึกละเอียด): `.superpowers/sdd/2026-10-15-promotions/progress.md`
  ถ้าเผลอรัน `git clean -fdx` ไฟล์นี้จะหาย ให้ใช้ `git log` และไฟล์นี้แทน
- ไฟล์ diff รีวิว: `.superpowers/sdd/2026-10-15-promotions/review-3988709..4a21a3f.diff`

## ประวัติ commit (ตั้งแต่ `origin/main`)

```
77eeae0 chore(api): record the promotions and quotes contract
4a21a3f docs(promotions): document promotions and add their browser checks
0375413 feat(pos): sell at a promotion with the price pinned before payment
1e14c47 feat(promotions): add the promotions page and quote client
f94e5a1 fix(orders): drop the import the guarded order repository no longer needs here
07f91bf test(promotions): cover pinned prices with QR, orders and shifts
d674ee2 feat(orders): stop editing an order while a QR waits on its price
5e559d1 feat(qr-payments): hold a quote for the QR made from it
0b23ae7 feat(sales): sell and pay orders at a pinned price
9c0bc29 feat(qr-payments): expose the reference of a claimed QR payment
78be12c feat(quotes): price and pin a cart with a quote
78c7c95 feat(promotions): manage promotions through the API
7aaf38f feat(promotions): add promotion and price quote tables
85ceddd feat(quotes): add the pinned price quote entity
809a0aa feat(promotions): add promotion rules and best-discount selection
b9f8d8d feat(sales): keep the promotion a sale was given
4d48244 docs(promotions): align the promotions spec with the plan
2794ef1 docs(promotions): plan the promotions and quotes work
bd73fb6 docs(promotions): define promotions and quote-based price pinning
```
