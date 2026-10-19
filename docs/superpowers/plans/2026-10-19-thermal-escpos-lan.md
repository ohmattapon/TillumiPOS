# Thermal ESC/POS ผ่าน LAN (Raster ไทย) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ร้านเดียวสาขาเดียวพิมพ์ใบเสร็จ thermal 58/80 มม. ผ่านเครื่องพิมพ์ LAN/WiFi ด้วย ESC/POS (ข้อความไทยแบบ raster + ตัดกระดาษ + เปิดลิ้นชัก) โดยเก็บ browser print/PDF เดิมเป็นทางสำรอง และมี docs ให้ user ตั้งค่า IP/กระดาษ/ลิ้นชักเอง

**Design decisions (grill 2026-10-19, user ตอบ):**
- ESC/POS ตรง (ไม่ใช่แค่ browser print) — ใช้ lib เดิมเป็น fallback
- เริ่มจาก LAN/WiFi ก่อน (USB ไว้รอบหลัง)
- รอบแรก: พิมพ์ + ตัด + ลิ้นชัก, ยังไม่เอาโลโก้
- ไทยแบบ raster อย่างเดียว (ไม่ลุ้น codepage แต่ละยี่ห้อ)
- เก็บปุ่ม browser print/PDF เดิม + ทำ docs ให้ user ตั้งค่าเอง

**Architecture:** client เรนเดอร์ `Receipt` เดิมเป็นภาพ (canvas) → แปลงเป็นขาวดำ 1-bit → ส่ง bytes ให้ server ผ่าน `POST /api/v1/receipt-printer/print` → server ส่งต่อ raw TCP ไปที่ printer IP:9100 แบบ reserve-นอก-transaction (เหมือนคุย SCB: ห้ามถือ transaction ข้าม network). ตัดกระดาษ (`GS V`) + เปิดลิ้นชัก (`ESC p`) เป็น bytes ต่อท้ายที่ client ขอหรือ server เติมให้ตาม settings. ตั้งค่าเครื่องพิมพ์อยู่ใน `shop_settings` (แถวเดียว) ส่วนคำสั่ง ESC/POS บริสุทธิ์อยู่ใน `domains/` แชร์ให้เว็บผ่าน `@pos/api/...` ได้ถ้าต้องใช้ซ้ำ

**Tech Stack:** Bun (TCP via `Bun.connect`/`node:net`), Elysia, Drizzle, tsyringe, zod · React 19, html2canvas (reuse), TanStack Query · e2e + fake TCP printer

**Non-goals (รอบนี้):** USB direct, Bluetooth, โลโก้ร้านบนใบเสร็จ, codepage text mode, หลายเครื่องพิมพ์/หลายสาขา, SCB QR (deferred ตามเจ้าของ), test รวม #67-#74 (ทำแยกทีหลัง)

## Global Constraints

- ทำงานบน branch ใหม่ `ohmattpon/thermal-escpos-lan` จาก `main` ห้าม merge เข้า `main` ห้ามลบ branch
- commit ด้วย `gitcz --non-interactive --type=<feat|fix|refactor|test|docs|style|perf|ci|chore> --scope=<scope> --subject="…" --body="…"` เท่านั้น ห้าม `git commit`/`--amend` ห้ามใช้ type `build`, stage เฉพาะไฟล์ของ concern นั้น
- ห้าม push เด็ดขาด รอเจ้าของ push เอง
- API: Hexagonal + CQRS หนึ่ง use case หนึ่งไฟล์ `execute()` รับ `unknown` แล้ว parse ด้วย zod เป็นขั้นแรก, ข้ามโมดูลผ่าน port ที่ consumer เป็นเจ้าของเท่านั้น, repository ใช้ `currentExecutor()` ห้ามส่ง transaction ผ่านพารามิเตอร์, error เป็น domain error ข้อความไทย + `code` คงที่ ผ่าน `libs/http-error.factory.ts` เท่านั้น
- `domains/` import ได้เฉพาะ `domains/` ด้วยกัน (test ยกเว้น `bun:test`)
- core ห้ามเรียก `Date.now()/new Date()/crypto/Math.random/fetch/setTimeout/console/process.env/Bun.env` ตรง — ต้องผ่าน port (`IClock`, id-generator, logger, gateway)
- v1 additive only ห้ามลบ/เปลี่ยนชนิดช่องเดิม ห้ามเปลี่ยน `code` ที่ client switch อยู่
- เว็บ: ข้อความทุกตัวผ่าน `t()` + `features/<f>/locales.ts` (`en satisfies typeof th`), query key ผ่าน key factory, component ห้ามเรียก `api`/`unwrap` ตรง, import ข้าม feature ผ่าน `index.ts` เท่านั้น
- เงินเป็น satang integer ห้ามทศนิยม, บิลห้ามแก้/ลบ (void เท่านั้น)
- ก่อนบอกเสร็จต้องผ่าน `bun run typecheck` + `bun run test` (DB ต้องรัน)
- ห้ามบันทึก `server/test/openapi-baseline.json` ใหม่จนกว่าเจ้าของอนุมัติ ถ้าเปลี่ยน contract ตั้งใจต้องบอกก่อน
- ห้ามมีความลับในไฟล์ที่ commit (`.env.example` เป็น placeholder `your-` เท่านั้น)

## Review Focus

1. **เงินกับกระดาษไม่ค้าง:** สั่งพิมพ์ล้มเหลว (printer offline/timeout) ต้องไม่ทำให้บิลหาย/ซ้ำ — print เป็น side-effect หลังขายสำเร็จเท่านั้น ห้ามอยู่ใน transaction เดียวกับ `SaleCheckout`
2. **ไม่ถือ transaction ข้าม network:** reserve → commit → ยิง TCP → บันทึกผล แยกขั้น (แบบเดียวกับ QR v2) — timeout ต้องตอบ unknown แล้วให้ retry ด้วย idempotency key เดิม ไม่ยิงซ้ำมั่ว
3. **ไทยไม่เพี้ยนทุกยี่ห้อ:** raster threshold + ความกว้าง dot (384 dots @58mm, 576 dots @80mm) ต้องมี unit test ครอบ ไม่ตกสระบนล่างเพราะเรนเดอร์จาก DOM เดิม
4. **fallback ใช้ได้จริง:** ถ้า printer ต่อไม่ติด ปุ่ม browser print/PDF เดิมต้องยังขายต่อได้ ไม่ถูกถอดออก
5. **docs คนหน้าร้านทำตามได้:** fixed IP, เปิด LAN บนเครื่องพิมพ์ยอดฮิต, 58/80, RJ11 ลิ้นชัก, firewall/port — อ่านแล้วทำเองได้โดยไม่ต้องเรียกช่าง

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `server/src/domains/receipt-raster.domain.ts` (+ `.test.ts`) | pure: raster bits → ESC/POS (`GS v 0`, `GS V` cut, `ESC p` drawer), คำนวณ width dots ตาม 58/80 |
| `server/src/modules/receipt-printer/**` | โมดูลใหม่: ports (`IPrinterGateway`, `IPrinterSettings`), use cases (`PrintReceipt`, `OpenDrawer`, `TestPrinterConnection`), TCP adapter, controller |
| `drizzle/00XX_printer_settings.sql` | migration additive: เพิ่มคอลัมน์ printer ลง `shop_settings` (nullable/default, ไม่แตะคอลัมน์เดิม) |
| `src/features/sales/lib/rasterize-receipt.ts` (+ `.test.ts`) | web pure+adapter: DOM→canvas→mono bits→payload (reuse `html2canvas` แบบ `download-receipt-pdf.ts`) |
| `src/features/sales/components/ReceiptPrintPanel.tsx` | UI: ปุ่มพิมพ์ LAN + สถานะ + fallback ปุ่มเดิม (`ReceiptPdfButton` คงไว้) |
| `src/features/settings/**` | ฟอร์มตั้งค่า printer (IP/port/enabled/drawer) + locales th/en |
| `server/test/fake-printer-server.ts` | fake TCP printer สำหรับ integration test (รับ bytes แล้ว assert `GS v 0`/`GS V`/`ESC p`) |
| `docs/thermal-printer-setup.md` | docs ภาษาไทยให้ user ตั้งค่าเอง + ตารางรุ่นยอดฮิต |
| `e2e/run.ts` | เคสพิมพ์ LAN ผ่าน fake printer + fallback ยังอยู่ |

---

### Task 1: ตั้งค่าเครื่องพิมพ์ใน shop_settings (migration + API + เว็บ)

**Files:**
- Modify: `server/src/infrastructure/database/schema/shop-settings.ts` (เพิ่ม `receiptPrinterIp text`, `receiptPrinterPort integer default 9100`, `receiptPrinterEnabled boolean default false`, `cashDrawerEnabled boolean default false` — nullable/default only, ห้ามแตะคอลัมน์เดิม)
- Create: `drizzle/00XX_printer_settings.sql` (additive, nullable/default)
- Modify: `server/src/modules/settings/applications/schemas/*`, `usecases/update-shop-settings.usecase.ts` (+ test), `adapters/controllers/*`, `applications/ports/shop-settings.repository.ts`
- Modify: `src/features/settings/api.ts`, `components/*`, `locales.ts` (th+en), `index.ts` (export key factory ถ้าต้อง invalidate ข้าม feature)
- Test: settings usecase test + integration test GET/PUT settings มีช่องใหม่

**Dependencies:** ไม่มี (ทำก่อนได้เลย)
**Race risks:** migration ห้าม NOT NULL แบบไม่มี default บน DB ร้านจริงที่มีแถวอยู่แล้ว → ใช้ default/nullable แล้ว backfill ใน migration เดียวกัน; ห้ามเปลี่ยน `receiptPaperMm` เดิม
**Verification:**
- `bun run typecheck`
- `bun run test:unit` (settings usecase)
- `curl GET /api/v1/settings` เห็นช่องใหม่, PUT แล้ว persist

---

### Task 2: โดเมน ESC/POS builder (pure, raster → bytes)

**Files:**
- Create: `server/src/domains/receipt-raster.domain.ts` — `buildRasterCommand(widthDots, monoBits): Uint8Array` (`GS v 0 m xL xH yL yH`), `buildCutCommand(partial=true)`, `buildDrawerCommand(pin=0)`, `dotsForPaperMm(58|80)` (58→384, 80→576), validate ขนาด bits ตรง width*height
- Create: `server/src/domains/receipt-raster.domain.test.ts` — ทุก rule: width ผิด throw, bits ไม่ครบ throw, bytes ขึ้นต้น `1D 76 30 00`, cut = `1D 56 42`, drawer = `1B 70 00 19 FA`
- Export ผ่าน `@pos/api/...` ถ้าเว็บต้องใช้ซ้ำ (alias 3 ที่ต้องตรง: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`)

**Dependencies:** ไม่ขึ้นกับ Task 1 (parallel ได้)
**Race risks:** อย่า copy สูตรคำนวณ width ไปไว้ที่อื่น — ที่เดียวที่นี่เท่านั้น; ห้าม import Drizzle/Elysia/zod ใน `domains/`
**Verification:**
- `bun run test:unit` (domain test ต้องเขียวโดยไม่ต้องมี DB)

---

### Task 3: เว็บ rasterize ใบเสร็จ (DOM → mono bits)

**Files:**
- Create: `src/features/sales/lib/rasterize-receipt.ts` — `rasterizeReceipt(element, paperMm): Promise<{widthDots,heightDots,bits}>` (reuse pattern `download-receipt-pdf.ts`: `document.fonts.ready`, `html2canvas scale 3`, clone inline สี print-safe, threshold ขาวดำ, pad width ให้หาร 8 ลงตัว)
- Create: `src/features/sales/lib/rasterize-receipt.test.ts` — mock canvas/bits (ไม่ต้องเปิด browser): threshold, padding, 58 vs 80 width
- Modify: ไม่แตะ `Receipt.tsx` / `download-receipt-pdf.ts` (ห้าม improve adjacent code)

**Dependencies:** ใช้ `dotsForPaperMm` จาก Task 2 (ถ้า export ผ่าน `@pos/api` แล้ว) — รอแค่ signature ไม่ต้องรอ code เสร็จก็ mock ได้
**Race risks:** `html2canvas` oklch bug เดิม — ต้องคง inline color fix แบบไฟล์เดิม; ห้ามเปลี่ยน style บนจอจริง (แก้เฉพาะ cloned doc)
**Verification:**
- `bun run test:web`
- manual: เปิด sale จริง กด rasterize แล้ว preview ภาพขาวดำสระไทยไม่แหว่ง (ยังไม่ต้องส่งไป printer)

---

### Task 4: โมดูล receipt-printer ฝั่ง server (gateway TCP + use cases)

**Files:**
- Create: `server/src/modules/receipt-printer/receipt-printer.module.ts` (bind ports ใน composition root, import ใน `di-registrations.ts`)
- Create: `applications/ports/printer-gateway.port.ts` (+ token ข้างกัน) — `sendRaw(host, port, bytes, opts:{timeoutMs}): Promise<{sentBytes}>`, `applications/ports/printer-settings.port.ts` (consumer-owned: อ่าน IP/port/enabled/drawer จาก settings — ห้าม import settings repository ตรง)
- Create: `adapters/gateway/tcp-printer.gateway.ts` — ใช้ `node:net`/`Bun.connect` + timeout, ปิด socket ทุก path, แปลง network error เป็น `DomainExternalServiceError` (`PRINTER_UNREACHABLE`/`PRINTER_TIMEOUT`)
- Create: `applications/usecases/print-receipt.usecase.ts` (command, มี `idempotencyKey`, validate zod: `saleId + raster payload + cut/drawer flags`, อ่าน settings ผ่าน port, ถ้า `printerEnabled=false` → `PRINTER_DISABLED`, ส่ง bytes ผ่าน gateway **นอก transaction**, บันทึก audit `receipt.printed` ใน UoW เดียวกับสถานะพิมพ์ถ้ามีตาราง log — ถ้าไม่มีตาราง log ให้แค่ audit, ห้ามสร้างบิลใหม่ที่นี่), `open-drawer.usecase.ts`, `test-connection.usecase.ts`
- Create: `adapters/controllers/receipt-printer.controller.ts` + schemas (Elysia schema เฉพาะ HTTP contract, business rule อยู่ใน use case)
- Create: `server/test/fake-printer-server.ts` (TCP server ปลอม assert bytes) + `src/__tests__/integration/receipt-printer.integration.test.ts`
- Modify: `server/src/modules/settings/adapters/...` เพิ่ม adapter ตอบ `IPrinterSettings` (provider side), `modules/app.module.ts`

**Dependencies:** ต้องหลัง Task 1 (settings) + Task 2 (builder) — รอ signature
**Race risks:** ห้ามถือ `IUnitOfWork.run()` คร่อม `gateway.sendRaw` (deadlock/timeout ค้าง); idempotency key ซ้ำต้องไม่ยิงซ้ำ; ห้าม log IP/token เกินจำเป็น; เช็ค import ด้วยคำสั่งใน AGENTS.md ก่อน commit (core ห้าม import adapter อีกโมดูล)
**Verification:**
- `bun run test:unit` (use cases ด้วย mock gateway)
- integration กับ fake printer: ส่ง raster จริง → fake ได้รับ `GS v 0` + `GS V` + `ESC p` ครบ
- `bun run openapi:check` (ถ้าเพิ่ม route — ห้าม baseline ใหม่จนกว่าเจ้าของอนุมัติ)

---

### Task 5: UI ปุ่มพิมพ์ LAN + คง fallback (web)

**Files:**
- Create: `src/features/sales/components/ReceiptPrintPanel.tsx` — ปุ่ม "พิมพ์ LAN" (เรียก mutation print), สถานะ sending/success/fail + retry ด้วย idempotency key เดิม, ถ้า fail ให้ชี้ไปปุ่ม browser print/PDF เดิม
- Modify: `SaleDetailDialog.tsx` (วาง panel คู่กับ `ReceiptPdfButton` — ห้ามลบของเดิม), `api.ts` (mutation hook + key factory), `locales.ts` (th/en)
- Test: `lib` test + component test ถ้ามี pattern (logic เงิน/สถานะต้องเป็น pure มี test ข้างไฟล์)

**Dependencies:** หลัง Task 3 + Task 4 (รอ endpoint)
**Race risks:** ห้ามโชว์ "พิมพ์แล้ว" ก่อน server ตอบ success (optimistic เฉพาะ undo ได้ — เงิน/พิมพ์ undo ไม่ได้); 44px touch target ตาม DESIGN.md; ทุกข้อความผ่าน `t()` ห้าม hardcode ไทย/อังกฤษใน tsx
**Verification:**
- `bun run test:web`, `bun run lint`, `bun run typecheck`
- e2e: ขายจริง → กดพิมพ์ LAN ผ่าน fake printer → ได้ใบ + fallback ปุ่มยังอยู่
- `bun run screenshots` ดู 390/768/1366 ก่อน merge

---

### Task 6: Docs ให้ user ตั้งค่าเอง + ตารางรุ่นยอดฮิต

**Files:**
- Create: `docs/thermal-printer-setup.md` (ไทย): เงื่อนไข (LAN/WiFi เท่านั้นรอบนี้), ตั้ง fixed IP/DHCP reservation, เปิด LAN บน XPrinter/Sewoo/Epson TM-T20III/TM-T82III ( println: ปุ่ม feed + เปิดเครื่องพิมพ์ self-test), ตั้ง 58/80 ใน settings ให้ตรงม้วน, เสียบลิ้นชัก RJ11 + test เปิด, firewall Windows + port 9100, ขั้นตอน test (ปุ่ม Test connection → พิมพ์ test → พิมพ์บิลจริง 1 ใบ), troubleshooting (ping ไม่เจอ / ออกครึ่งใบ / สระเพี้ยน → กลับไปดู raster version / กระดาษยัด)
- Modify: `docs/install.md` เพิ่มลิงก์ไป docs ใหม่ (1 บรรทัด, ห้าม rewrite ไฟล์)
- Modify: `src/features/settings/locales.ts` มีลิงก์/ hint สั้น ๆ ไป docs (ถ้าจำเป็น)

**Dependencies:** หลัง Task 1/4/5 (เอาชื่อฟิลด์ + flow จริงมาเขียน) — ร่างโครงก่อนได้แบบ parallel
**Race risks:** ห้ามสัญญาว่ารองรับ USB/Bluetooth ใน docs; ระบุชัดว่า R2/รูปสินค้าไม่เกี่ยวกับใบเสร็จ, backup ไม่รวมการตั้งค่า printer นอก DB (แต่อยู่ใน DB แล้ว restore กลับมา)
**Verification:**
- อ่าน docs แล้วทำตามได้โดยไม่เปิดโค้ด: fixed IP → test connection เขียว → พิมพ์บิลจริง 58 และ 80 อย่างละ 1 ใบ + เปิดลิ้นชักได้

---

## ลำดับทำ + ขนานได้

- Wave 1 (parallel): Task 1 + Task 2 + Task 6 (ร่างโครง)
- Wave 2: Task 3 + Task 4 (รอ signature Task 1/2)
- Wave 3: Task 5 + Task 6 (จบ docs ให้ตรงของจริง)
- ปิดงาน: `bun run typecheck` + `bun run test` + `bun run lint` + `bun run openapi:check` + e2e พิมพ์ + checklist เครื่องจริง (thermal 58/80 + ลิ้นชัก)

## นอกสโคปที่เจ้าของรับทราบแล้ว

- SCB QR เงินจริง: พักไว้ก่อน (ยังไม่ใช้) — ไม่รวมในแผนนี้
- Test รวม #67-#74: ทำแยกทีหลัง
- Backup อัตโนมัติ + กู้รหัส owner: ทำตามแนะนำ (Task Scheduler + off-machine copy + restore drill) แยกจากแผนนี้
- สาขา: ร้านเดียวสาขาเดียว (MAIN) + จอลูกค้าแก้ตามสมควร — ไม่รวมในแผนนี้
