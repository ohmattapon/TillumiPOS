# Demo โชว์หน้าตาโดยไม่รัน server (static + MSW) Implementation Plan

> **For agentic workers:** use superpowers:subagent-driven-development; follow TDD where logic exists (fixture builders, state helpers). No pushes, PRs, main merges or history rewrites. Commit only with gitcz.

**Goal:** เปิดเว็บ TillumiPOS ดูได้ทุกจอโดยไม่รัน server และไม่มีฐานข้อมูลเลย เอาไปโชว์ว่าหน้าตาโปรแกรมเป็นยังไง บน branch `ohmattpon/dev`

**Design decisions (user ตอบ):**
- ทั้งแอป ไม่ใช่แค่บางจอ
- ไม่รัน server อะไรทั้งนั้น (databaseless + apiless) — ต่างจาก demo-memory mode (server หน่วยความจำ) ที่ทำไว้ก่อน ของเดิมเก็บไว้ไม่ลบ แต่ docs จะชี้วิธีนี้เป็นทางโชว์หลัก
- เน้น "ดูหน้าตา": อ่านข้อมูลได้ทุกจอ กดบันทึกแล้วตอบสำเร็จแบบสมมติ (ไม่ต้องคงอยู่ข้ามรีเฟรชก็ได้ แต่ห้ามค้าง/เอ๋อ)

**Architecture:** Mock Service Worker (msw v2) ดัก fetch ในเบราว์เซอร์ ตอบ fixture แทน API จริง — ไม่แตะโค้ดแอปเลยยกเว้นจุดสตาร์ท worker ใน `main.tsx` หลังเช็ค `import.meta.env.MODE === 'demo-static'` (รันด้วย `vite --mode demo-static` หรือเสิร์ฟ `dist/` ที่ build ด้วยโหมดนั้น; ตั้งใจไม่ใช้ไฟล์ `.env.*` เพิ่ม เพราะ pre-commit hook ห้าม commit ไฟล์ชื่อนั้น) + `msw init public/` ครั้งเดียว รูปใช้ไฟล์ local ใน `public/demo/` (ห้าม URL นอก งานโชว์ต้องรอดแบบ offline)

**Tech Stack:** msw v2 (browser),ที่มีอยู่เดิมทั้งหมด (React Query/Eden ไม่รู้ว่าโดนดัก), fixtures TypeScript

**Non-goals:** ความถูกต้องของ logic ฝั่ง server (mock ตอบอะไรก็ได้ที่ type ตรง), คงอยู่ข้ามรีเฟรช, bank QR จริง, อัปโหลดรูปจริง, customer display ข้ามเครื่อง (ใช้ BroadcastChannel เดิม), ลบโค้ด demo-memory ทิ้ง

## Global Constraints

- ทำบน branch `ohmattpon/dev` เท่านั้น ห้าม merge เข้า `main`
- commit ด้วย `gitcz --non-interactive` เท่านั้น ห้าม `git commit`/`--amend` ห้าม type `build`, stage เฉพาะไฟล์ของ concern นั้น
- ห้าม push เด็ดขาด รอเจ้าของ push เอง
- โค้ดแอป (`src/`) ห้ามเปลี่ยนพฤติกรรม: เพิ่มได้แค่จุดสตาร์ท worker + ไฟล์ใหม่ใน `demo/` ห้ามแก้ `features/*/api.ts`, `lib/api.ts`, components เพื่อ demo
- ข้อความทุกตัวผ่าน `t()` ตามเดิม (fixtures เป็นข้อมูล ไม่ใช่ข้อความ UI — ชื่อสินค้าตัวอย่างเป็นภาษาไทยได้)
- fixture ต้อง type-ตรงกับ Eden response (typecheck จับได้) ห้าม `any`
- ก่อนบอกเสร็จต้องผ่าน `bun run typecheck` + `bun run test:web` + `bun run lint`

## Review Focus

1. **ห้ามรั่วไป production:** worker สตาร์ทเฉพาะเมื่อ `MODE === 'demo-static'` เท่านั้น (MODE มาจาก `--mode` flag ไม่มีทางเป็นค่านี้ใน build/dev ปกติ) + ไม่มี URL mock หลุดไปโดน API จริง
2. **ทุกจอต้องไม่อยู่ในสถานะ loading/error ค้าง:** ทุก query ที่ UI เรียกต้องมี handler (ไล่จาก `unwrap(api` ทั้ง 101 จุด), skeleton → data จริง, error มี retry
3. **mutations ต้องตอบสำเร็จเสมอ:** ขาย/void/บันทึกทุกอย่างตอบ 200 ที่ type ถูก + toast ปกติ ห้ามมีปุ่มกดแล้วเงียบ
4. **offline ได้:** ไม่มี fetch/รูป/ฟอนต์จากข้างนอก (ฟอนต์ใช้ของระบบ)

## File map

- `demo/handlers.ts` — http handlers ทั้งหมด (msw `http.get/post/...`) แยกตาม feature
- `demo/db.ts` — in-memory JS store เล็ก ๆ (login session flag, สินค้า, บิลวันนี้, ตั้งค่า) + reset
- `demo/fixtures/*.ts` — ข้อมูลตัวอย่าง (ร้านกาแฟไทย สินค้า ~40, บิลวันนี้ ~20, สมาชิก, โปรโมชัน, โต๊ะ+ออเดอร์, กะ, รายงาน, users/roles, audit, สไลด์, เมนูคาเฟ่)
- `demo/worker.ts` — setupWorker + start เงื่อนไข + ป้าย DEMO (banner มุมจอว่าโหมดโชว์ ข้อมูลไม่จริง)
- `src/main.tsx` — เพิ่มสตาร์ท worker 3 บรรทัดหลัง flag (ไฟล์เดียวใน src/ ที่แตะ)
- `public/mockServiceWorker.js` — สร้างด้วย `msw init` (commit ได้ เป็นไฟล์ของ lib)
- script `"demo:static": "vite --mode demo-static"` (+ preview path; ไม่ใช้ไฟล์ `.env.*` เพิ่ม)

## Task 1 — โครง + auth/settings/catalog อ่านได้อย่างเดียวก่อน

**Files:** `demo/` skeleton (`worker.ts`, `db.ts`, `handlers.ts` ว่าง), `main.tsx` hook, `public/mockServiceWorker.js`, script, fixtures: settings (รวม printer ปิด), owner me, categories/products/modifiers (~40 สินค้าไทย), members
**Dependencies:** ไม่มี (`bun add -D msw` ก่อน)
**Race risks:** ชื่อไฟล์/พอร์ตชนของเดิม — ใช้ `demo/` ใหม่ทั้งหมด ไม่แตะ `src/` ยกเว้น main.tsx
**Verification:** `bun run demo:static` → เปิดหน้า login (admin/อะไรก็ได้ผ่าน) → เห็นสินค้า/ตั้งค่า, typecheck, test:web, lint; ตรวจว่า build ปกติ (`bun run build`) ไม่มี worker ติดไป (grep `mockServiceWorker` ใน dist ต้องว่าง)

## Task 2 — โฟลว์ขาย + บิล + ตาราง + ออเดอร์ + สมาชิก + โปรโมชัน

**Files:** fixtures + handlers: sales today/summary/detail, sell (ตอบบิล canned ที่คำนวณยอดตรง), void (ปัก flag), orders CRUD, tables/floor, members, promotions/quotes (static QR ใช้ pure fn เดิมได้เลยไม่ต้อง mock), shifts/registers (open/close ตอบสำเร็จ)
**Dependencies:** Task 1
**Race risks:** รูปทรง response ต้องตรง Eden type ทุกจุด (พึ่ง typecheck); ยอดในบิล canned ต้องสมเหตุสมผล (ใช้логікаง่าย ๆ ไม่ต้องตรงสูตร server)
**Verification:** คลิกขาย 1 บิลจนจบ (เงินสด+ทอน), เปิดบิล, void, เปิดออเดอร์ที่โต๊ะ, สมาชิก/โปรแสดง — ไม่ติด loading/error หน้าไหน

## Task 3 — หน้าหลังบ้านที่เหลือ + mutations ทั้งหมด + เก็บงาน

**Files:** reports (ตัวเลขนิ่งแต่สมเหตุสมผล + Excel export ได้ไฟล์จริงผ่าน lib เดิม), users/roles (ห้ามลบ owner คนสุดท้าย — mock ก็ตอบตาม), audit (list จาก action ใน db), branches (MAIN เดียว), customer-display (ไม่ต้องทำอะไร — BroadcastChannel เดิม), slides, cafe-menu, inventory/stock-receipts, setup page (ข้ามได้เพราะ login ผ่านเลย แต่ต้องไม่พังถ้าเปิด URL ตรง), media upload (ตอบสำเร็จพร้อม URL รูป local), v2 endpoints ที่ UI เรียก (void/refund/QR-draft)
**Dependencies:** Task 2
**Race risks:** `unwrap(api` ต้องครบ 101 จุด — ทำ checklist ไล่ทีละ feature แล้วรันสคริปต์ grep ยืนยันว่าไม่มี path ไหนไม่มี handler (test ง่าย ๆ: เรียกทุก handler ตรง ๆ ก็ได้)
**Verification:** เปิดทุกหน้าทั้งภาษาไทย+อังกฤษ ที่ 390/768/1366 (screenshot เป็นหลักฐาน), `screenshots` script ถ้ารันได้โดยไม่ต้องมี DB, typecheck/test:web/lint เขียว, docs 1 ไฟล์ (`docs/demo-showcase.md`: วิธีรัน สิ่งที่ทำได้/ไม่ได้ + ย้ำว่าข้อมูลไม่จริง + ชี้ demo-memory ถ้าอยากได้ logic จริง)

## ลำดับทำ

- Task 1 → Task 2 → Task 3 ตามลำดับ (handlers กองเดียวกัน แยกกันทำแล้วชน)
- ปิดงาน: typecheck + test:web + lint + คลิกทุกหน้า 2 ภาษา + screenshots

## นอกสโคปที่เจ้าของรับทราบแล้ว

- logic ตรง server (ยอด/VAT/sิทธิ์ของจริง), คงอยู่ข้ามรีเฟรช, bank QR, อัปโหลดจริง, customer display ข้ามเครื่อง, ลบโค้ด demo-memory
