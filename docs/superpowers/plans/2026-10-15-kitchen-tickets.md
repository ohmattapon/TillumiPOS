# ใบสั่งครัวและจอครัว Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แคชเชียร์ส่งรายการในออเดอร์เป็นรอบไปสถานีครัว/บาร์ ครัวกดทำเสร็จบนจอ และการลดหรือยกเลิกหลังส่งขึ้นบนจอทันที รวมถึงหน้าแรกเป็นผังโต๊ะและฟอร์มยาวที่ปุ่มยืนยันติดล่างเสมอ (งานรอบ design 2)

**Architecture:** โมดูลใหม่ `kitchen` (hexagonal) เก็บสถานี การผูกหมวด และใบสั่งในตารางของตัวเอง การนับ "ส่งแล้วสุทธิ" ของแต่ละรายการใช้คีย์ `productId:optionsKey` ที่ไม่ซ้ำในออเดอร์อยู่แล้ว ออเดอร์เรียกโมดูลครัวผ่านพอร์ต `IKitchenTickets` ที่ประกาศในโมดูล orders (ผู้เรียกเป็นเจ้าของพอร์ต) โมดูล kitchen เป็นผู้ implement ตามรูปแบบเดียวกับ `ITableOccupancy` ของโต๊ะ เว็บเป็น feature `kitchen` ใหม่ จอครัวดึงข้อมูลทุก 3 วินาที

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod (API); React, Vite, TanStack Query, zustand, react-i18next, shadcn/ui (web); `bun:test`, Playwright (e2e)

**Spec:** `docs/superpowers/specs/2026-10-15-kitchen-tickets-design.md` (commit `95abd9a`) ค่าเริ่มต้นของคำถามเปิดทั้งสี่ข้อในสเปกถูกใช้ตามที่เขียนไว้

## ส่วนที่เพิ่มหรือต่างจากสเปก

แผนนี้ตามสเปกทุกข้อ ยกเว้นจุดเล็ก ๆ ที่จำเป็นต่อการทำงานจริง เจ้าของควรเห็นก่อนเริ่ม:

1. รหัสข้อผิดพลาดเพิ่ม: `KITCHEN_STATION_INACTIVE` (409) เมื่อผูกหมวดกับสถานีที่ปิดอยู่ และ `INVALID_KITCHEN_TICKET` (400) เมื่อข้อมูลใบสั่งไม่ถูกต้องเกินกว่าที่ use case ตรวจแล้ว
2. ตัวเลือกของบรรทัดครัวเก็บเป็นรายชื่อชื่อตัวเลือก (`option_names`) ไม่เก็บ snapshot ทั้งก้อน เพื่อไม่ให้ต้นทุนของตัวเลือกหลุดไปจอครัว
3. หมายเหตุของบรรทัดออเดอร์: เมื่อรวมบรรทัดที่คีย์เดียวกัน ใช้หมายเหตุของปลายทางก่อน ถ้าว่างจึงใช้ของต้นทาง เพราะตารางของออเดอร์มีหนึ่งบรรทัดต่อคีย์
4. เลขรอบของใบที่ย้ายตอนรวมบิลจะถูกนับใหม่ต่อท้ายในออเดอร์ปลายทาง เพื่อไม่ให้ชนกับเลขรอบเดิม (`round_no` ไม่ซ้ำในออเดอร์และสถานี)
5. ชื่อสถานีไม่ซ้ำทั้งร้าน (ตาม "ใช้ร่วมทุกสาขา")
6. มีเส้นทาง `GET /catalog/kitchen-routing` เพิ่มจากสเปก เพื่อให้หน้าหมวดหมู่แสดงสถานีของแต่ละหมวดได้ (เพิ่มอย่างเดียว อยู่ในเกต baseline ของ Task 14)

## Global Constraints

- ห้าม `git push` ทุกรูปแบบ รวม `gh pr create` และ `gh repo sync` เมื่อจบงานให้รายงานว่า commit อยู่ในเครื่อง รอเจ้าของ push เอง
- commit ด้วย `gitcz --non-interactive` เท่านั้น ห้ามใช้ `git commit` ตรง รวม `--amend` ห้ามใช้ `--type=build` (`gitcz` ไม่รู้จัก ใช้ `chore` แทน)
- stage เฉพาะไฟล์ของ task นั้น ห้าม `git add -A`
- ห้าม commit ความลับ ห้ามสร้าง `.env` ในโฟลเดอร์แอป ค่าทั้งหมดอยู่ `.env` เดียวที่ root
- จำนวนเงินเป็นจำนวนเต็มหน่วยสตางค์เสมอ ห้ามทศนิยม
- ออเดอร์เป็น aggregate แยกจากบิล ทุกคำสั่งที่แก้ออเดอร์ล็อกแถวด้วย `findByIdForUpdate` ก่อนแก้ ออเดอร์ของสาขาอื่นตอบ `ORDER_NOT_FOUND`
- การส่งครัวไม่ตัดสต็อก: use case ส่งครัวต้องไม่พึ่ง `IStockLedger` หรือพอร์ตสต็อกใด ๆ
- API (`apps/api`) ตามข้อ "สถาปัตยกรรมของ API" ใน `AGENTS.md`
  - ทุก use case เป็น `@injectable()` มีเมธอด `execute()` และคอมเมนต์เหนือคลาสระบุ `Command` หรือ `Query`
  - `execute()` รับ `unknown` แล้ว parse ด้วย zod เป็นขั้นแรก
  - use case และ entity โยน domain error จาก `domains/errors/` เท่านั้น พร้อมข้อความภาษาไทยและค่า `code` คงที่
  - repository แปลง unique violation เป็น domain error ก่อนออกจาก adapter ใช้ `isUniqueViolation` จาก `libs/pg-error.ts`
  - โมดูลเรียกข้ามกันผ่าน port ที่ inject ด้วย token ห้ามแตะตารางหรือ adapter ของโมดูลอื่น
  - controller อ่านสาขาจาก `await branch()` ห้ามอ่าน header เอง
  - ทุกเส้นทางอยู่ใต้ `/api/v1` เพิ่มได้อย่างเดียว ห้ามเปลี่ยนสัญญาเดิม
  - เส้นทางที่คืนรายการคืน `{ items, total }` ผ่าน `page()` จาก `libs/http-schemas.ts`
- baseline OpenAPI (`apps/api/test/openapi-baseline.json`) บันทึกใหม่ได้ก็ต่อเมื่อเจ้าของอนุมัติ (ดู Task 14)
- เว็บ (`apps/web`): ข้อความทุกตัวผ่าน `t()` ห้ามเขียนไทยหรืออังกฤษตรงใน `.tsx` นอก `locales.ts`; เงินและวันที่ผ่าน `useFormat()`; คอมโพเนนต์ห้ามเรียก `api` หรือ `unwrap` ตรง ให้ผ่าน hook ใน `api.ts`; query key สร้างจาก key factory; ห้ามคัดลอกข้อมูลเซิร์ฟเวอร์เข้า zustand
- เว็บ: ปุ่มและช่องกรอกที่กดได้สูง 44px (`h-11` หรือ `size-11`) ขึ้นไป; ตารางใช้ `DataTable` และทุกคอลัมน์ระบุ `priority`; หน้าใหม่ต้องใช้ได้ที่ 390, 768 และ 1366px
- ก่อนบอกว่างานเสร็จ ต้องรัน `bun run typecheck` และ `bun run test` ให้ผ่าน (ข้อจำกัดด้านฐานข้อมูลอยู่ใน Task 13)
- **ฐานข้อมูล:** ชุดทดสอบที่ต้องใช้ PostgreSQL (integration ของ `bun run test`, `bun run e2e`, `bun run screenshots`) ต้องเปิด Docker ก่อน ต้องถามเจ้าของก่อนเปิด Docker หรือ WSL ทุกครั้ง ห้ามรันสคริปต์ที่ลบฐานข้อมูลกับฐาน dev การทดสอบชี้ไปที่ `pos_test` บน `localhost:5433` เท่านั้น (`apps/api/test/database.ts`)
- `bun run test:unit` ไม่ต้องมีฐานข้อมูล ทำได้ก่อนเสมอ

## Review Focus

ห้าอันดับแรกของกรณีที่สเปกบอกนัยไว้ แต่ไม่มี task ใดทดสอบเอง เรียงจากเสี่ยงที่สุด แต่ละข้อผูกกับ task ที่เป็นเจ้าของโค้ด

1. **กดส่งครัวสองครั้งพร้อมกัน (กดซ้ำหรือสองเครื่อง)** ต้องไม่เกิดใบซ้ำ ล็อกออเดอร์ก่อน แล้วนับส่วนที่ยังไม่ส่งภายใต้ล็อก ส่งครั้งที่สองจะได้ `KITCHEN_NOTHING_TO_SEND` (Task 11 unit, Task 13 integration ด้วย `Promise.all`)
2. **ลดจำนวนหลังส่ง แล้วเพิ่มกลับ** ต้องส่งได้เฉพาะส่วนที่ยังไม่เคยส่ง ยกเลิกตัดจากใบที่ใหม่สุดก่อน และส่วนที่ถูกยกเลิกไม่นับเป็นส่งแล้ว (Task 3 domain, Task 8 unit, Task 13 integration)
3. **รวมบิลเมื่อต้นทางมีใบที่เสร็จแล้ว** ใบต้องย้ายไปปลายทางโดยไม่ชนเลขรอบ (`round_no` ไม่ซ้ำในออเดอร์และสถานี) และไม่ทำให้ส่งซ้ำ (Task 9 unit, Task 11 unit, Task 13 integration)
4. **หมายเหตุ:** ค่าว่าง ช่องว่างล้วน ข้อความ 200 ตัวอักษรขึ้นไป และการแก้หลังส่งแล้ว (ต้องถูกปฏิเสธ `KITCHEN_LINE_SENT`) รวมบรรทัดแล้วหมายเหตุไม่หาย (Task 2 domain, Task 10 unit)
5. **ข้ามสาขา:** ออเดอร์หรือใบสั่งของสาขาอื่นต้องตอบว่าไม่พบ ไม่รั่วข้อมูล (Task 11 และ 12 unit, Task 13 integration)

## File Structure

**API domains (`apps/api/src/domains/`)**
- Modify: `order.domain.ts` (หมายเหตุ, `identityOf`, `lineIdentity`, `quantitiesByLine`, `setLineNote`)
- Create or extend: `order.domain.test.ts`
- Create: `kitchen.domain.ts` (ฟังก์ชันล้วนการนับ, `KitchenTicketEntity`) และ `kitchen.domain.test.ts`
- Create: `kitchen-station.domain.ts` (`KitchenStationEntity`) และ `kitchen-station.domain.test.ts`
- Modify: `shop-settings.domain.ts` (`homeView`)

**Infrastructure (`apps/api/src/infrastructure/database/`)**
- Create: `schema/kitchen.ts`
- Modify: `schema/orders.ts` (`order_items.note`), `schema/shop-settings.ts` (`home_view`)
- Generate: `apps/api/drizzle/0014_kitchen.sql` และ snapshot ใน `apps/api/drizzle/meta/`

**Kitchen module (`apps/api/src/modules/kitchen/`)**
- Create: `kitchen.module.ts`
- Create ports: `applications/ports/kitchen-station.repository.ts`, `kitchen-routing.repository.ts`, `kitchen-ticket.repository.ts`, `kitchen-order-refs.port.ts`
- Create: `applications/schemas/kitchen-schemas.ts`
- Create use cases (แต่ละไฟล์มี test คู่กัน): `list-kitchen-stations`, `create-kitchen-station`, `update-kitchen-station`, `set-category-station`, `send-order-to-kitchen`, `list-kitchen-tickets`, `mark-kitchen-ticket-done`
- Create adapters: `adapters/repository/kitchen-station.drizzle.repository.ts`, `kitchen-routing.drizzle.repository.ts`, `kitchen-ticket.drizzle.repository.ts`, `kitchen-tickets.drizzle.adapter.ts`
- Create controllers: `adapters/controllers/schemas/kitchen.schema.ts`, `kitchen-ticket.presenter.ts`, `kitchen-catalog.controller.ts`, `kitchen-ticket.controller.ts`

**Orders module (`apps/api/src/modules/orders/`)**
- Create: `applications/ports/kitchen-tickets.port.ts`, `applications/usecases/set-order-line-note.usecase.ts`, `adapters/repository/kitchen-order-refs.drizzle.adapter.ts`
- Modify: `set-order-item-quantity`, `remove-order-item`, `set-order-line-quantity`, `remove-order-line`, `cancel-order`, `merge-orders`, `split-order`, `order.drizzle.repository.ts`, `order.controller.ts`, `schemas/order.schema.ts`, `applications/schemas/order-schemas.ts`, `orders.module.ts`, `orders.usecases.test.ts`

**Shared**
- Modify: `apps/api/src/__tests__/mocks.ts` (mock ของพอร์ตใหม่)
- Modify: `apps/api/src/modules/app.module.ts`, `apps/api/src/modules/di-registrations.ts`
- Create: `apps/api/src/__tests__/integration/kitchen.integration.test.ts`
- Modify: `apps/api/src/types.ts` (export ชนิดให้เว็บ)

**Settings (`apps/api/src/modules/settings/`)**
- Modify: `applications/schemas/settings-schemas.ts`, `adapters/controllers/schemas/settings.schema.ts`, `adapters/repository/shop-settings.drizzle.repository.ts`, `applications/usecases/settings.usecases.test.ts`

**Web (`apps/web/src/`)**
- Create: `features/kitchen/index.ts`, `api.ts`, `locales.ts`, `lib/tickets.ts`, `lib/tickets.test.ts`, `components/KitchenBoardPage.tsx`, `components/TicketCard.tsx`, `components/KitchenStationsPage.tsx`
- Modify: `app/App.tsx`, `app/AppSidebar.tsx`, `app/locales.ts`
- Modify: `features/orders/api.ts` (`useSetOrderLineNote`)
- Create: `features/pos/components/KitchenSendButton.tsx`, `FloorView.tsx`, `FloorPage.tsx`
- Modify: `features/pos/components/CartPanel.tsx`, `FloorDialog.tsx`, `features/pos/hooks/use-cart.ts`, `features/pos/locales.ts`
- Modify: `features/categories/components/CategoriesPage.tsx`, `features/categories/locales.ts`
- Modify: `features/settings/components/SettingsPage.tsx`, `features/settings/locales.ts`
- Modify: `locales/errors.ts` (คำแปลรหัสใหม่)
- Modify: ไฟล์ dialog ที่มี `<form>` ซึ่งยาวเกินจอ (Task 19 บอกวิธีหา)
- Modify: `apps/web/e2e/run.ts`, `apps/web/e2e/shots.ts`

---

### Task 1: เตรียม worktree และ baseline

**Files:** ไม่มีการแก้ไขโค้ด ไม่มี commit

ทำงานใน worktree `D:/worktrees/POS-kitchen` บนสาขา `ohmattpon/kitchen-tickets` ที่มี commit สเปก `95abd9a` อยู่แล้ว

- [ ] **Step 1: ติดตั้ง dependency**

Run (จาก `D:/worktrees/POS-kitchen`): `bun install`
Expected: ติดตั้งสำเร็จ

- [ ] **Step 2: สร้าง `.env` ที่ root จากตัวอย่าง**

Run: `cp .env.example .env`
Expected: มี `.env` ที่ root ค่าเป็น placeholder ตามตัวอย่าง ห้ามใส่คีย์จริง (เช่นของ SCB)

สคริปต์ `db:*` และ `drizzle-kit` อ่าน `../../.env` ต้องมีไฟล์นี้ก่อน

- [ ] **Step 3: ตรวจ baseline ก่อนแก้โค้ด**

Run: `bun run typecheck`
Expected: ผ่านทุกแพ็กเกจ

Run (จาก `apps/api`): `bun run test:unit`
Expected: ผ่านทั้งหมด จดจำนวนกรณีที่ผ่านไว้เทียบภายหลัง

- [ ] **Step 4: ตรวจ drizzle config**

Run: `cat apps/api/drizzle.config.ts`
Expected: `schema` ชี้ไปที่โฟลเดอร์ `./src/infrastructure/database/schema` หรือไฟล์ index ที่ export ทุกตาราง ถ้าเป็นไฟล์ index ให้เพิ่ม `export * from './kitchen'` ใน Task 4

---

### Task 2: โดเมนของออเดอร์ หมายเหตุต่อบรรทัด และคีย์ของบรรทัด

**Files:**
- Modify: `apps/api/src/domains/order.domain.ts`
- Create or extend: `apps/api/src/domains/order.domain.test.ts`

**Interfaces:**
- Consumes: `lineKey`, `LineOption` จาก `apps/api/src/domains/modifier.domain.ts`
- Produces:
  - `OrderItem.note: string | null`
  - `MAX_NOTE_LENGTH = 200`
  - `identityOf(productId: number, optionsKey: string): string`
  - `lineIdentity(productId: number, options: readonly LineOption[]): string`
  - `OrderEntity.setLineNote(lineId: number, note: string | null): OrderEntity`
  - `OrderEntity.quantitiesByLine(): Map<string, number>`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

`apps/api/src/domains/order.domain.test.ts` (ถ้ายังไม่มีไฟล์ ให้สร้างใหม่):

```ts
import { describe, expect, test } from 'bun:test'
import { makeOrder } from '../__tests__/factories'
import { DomainError } from './errors/domain-error'
import { identityOf, lineIdentity, type LineOption, type OrderItem } from './order.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
    return undefined
  } catch (error) {
    return (error as DomainError).code
  }
}

const option = (optionId: number) =>
  ({ groupId: 1, groupName: 'กลุ่ม', optionId, name: 'ตัวเลือก', priceSatang: 0, costSatang: 0 }) as LineOption

const line = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  lineId: 1,
  productId: 10,
  productName: 'ชาเย็น',
  sku: 'TEA',
  unitPriceSatang: 3500,
  quantity: 1,
  options: [],
  note: null,
  ...overrides,
})

describe('หมายเหตุต่อบรรทัด', () => {
  test('ตัดช่องว่างหัวท้าย และค่าว่างหมายถึงไม่มีหมายเหตุ', () => {
    const order = makeOrder({ items: [line()] })

    expect(order.setLineNote(1, '  ไม่ใส่น้ำแข็ง  ').items[0]!.note).toBe('ไม่ใส่น้ำแข็ง')
    expect(order.setLineNote(1, '   ').items[0]!.note).toBeNull()
    expect(order.setLineNote(1, null).items[0]!.note).toBeNull()
  })

  test('หมายเหตุเกิน 200 ตัวอักษรถูกปฏิเสธ และ 200 ตัวอักษรพอดีผ่าน', () => {
    const order = makeOrder({ items: [line()] })

    expect(codeOf(() => order.setLineNote(1, 'x'.repeat(201)))).toBe('INVALID_ORDER')
    expect(order.setLineNote(1, 'x'.repeat(200)).items[0]!.note).toHaveLength(200)
  })

  test('แก้หมายเหตุได้เฉพาะออเดอร์ที่ยังเปิด', () => {
    const paid = makeOrder({ status: 'paid', saleId: 9, items: [line()] })

    expect(codeOf(() => paid.setLineNote(1, 'เผ็ด'))).toBe('ORDER_NOT_OPEN')
  })

  test('บรรทัดที่ไม่มีในออเดอร์ไม่พบ', () => {
    const order = makeOrder({ items: [line()] })

    expect(codeOf(() => order.setLineNote(99, 'เผ็ด'))).toBe('ORDER_ITEM_NOT_FOUND')
  })

  test('รวมบรรทัดสินค้าเดียวกันเก็บหมายเหตุแรกที่มีค่า', () => {
    const order = makeOrder({ items: [line({ lineId: 1, note: null })] })

    const merged = order.addItem({ productId: 10, productName: 'ชาเย็น', sku: 'TEA', unitPriceSatang: 3500 }, 2)

    expect(merged.items).toHaveLength(1)
    expect(merged.items[0]!.quantity).toBe(3)
    expect(merged.items[0]!.note).toBeNull()
  })

  test('รวมออเดอร์ใช้หมายเหตุของปลายทางก่อน ถ้าว่างจึงใช้ของต้นทาง', () => {
    const destination = makeOrder({ id: 1, items: [line({ lineId: 1, note: 'หวานน้อย' })] })
    const source = makeOrder({
      id: 2,
      items: [line({ lineId: 5, note: 'เผ็ด' }), line({ lineId: 6, productId: 11, note: 'ไม่ใส่ไข่' })],
    })

    const absorbed = destination.absorb(source)

    expect(absorbed.items.find((item) => item.productId === 10)!.note).toBe('หวานน้อย')
    expect(absorbed.items.find((item) => item.productId === 11)!.note).toBe('ไม่ใส่ไข่')
  })
})

describe('คีย์ของบรรทัด', () => {
  test('สินค้าเดียวกันกับตัวเลือกชุดเดียวกันมีคีย์เดียว ไม่สนลำดับตัวเลือก', () => {
    expect(lineIdentity(10, [])).toBe(identityOf(10, ''))
    expect(lineIdentity(10, [option(3), option(1)])).toBe(lineIdentity(10, [option(1), option(3)]))
  })

  test('quantitiesByLine บอกจำนวนของแต่ละบรรทัด', () => {
    const order = makeOrder({ items: [line({ quantity: 2 }), line({ lineId: 2, productId: 11, quantity: 4 })] })

    expect(order.quantitiesByLine()).toEqual(
      new Map([
        [identityOf(10, ''), 2],
        [identityOf(11, ''), 4],
      ]),
    )
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/domains/order.domain.test.ts`
Expected: FAIL เพราะยังไม่มี `note`, `setLineNote`, `identityOf`, `lineIdentity`, `quantitiesByLine`

- [ ] **Step 3: แก้ `order.domain.ts`**

ใน `interface OrderItem` เพิ่มฟิลด์หลัง `options`:

```ts
  /** A note for the kitchen, such as "no ice". Blank means none. */
  note: string | null
```

เพิ่มค่าและฟังก์ชันใกล้ส่วนบนของไฟล์:

```ts
export const MAX_NOTE_LENGTH = 200

/** The identity of a line from its product and the stored key of its options. */
export const identityOf = (productId: number, optionsKey: string) => `${productId}:${optionsKey}`

/** The same product with the same options is the same line. The kitchen uses this same identity. */
export const lineIdentity = (productId: number, options: readonly LineOption[]) =>
  identityOf(productId, lineKey(options))

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() || null
  if (trimmed !== null && trimmed.length > MAX_NOTE_LENGTH)
    throw invalid(`หมายเหตุต้องไม่เกิน ${MAX_NOTE_LENGTH} ตัวอักษร`)
  return trimmed
}
```

แทนที่ฟังก์ชัน `identity` เดิม:

```ts
const identity = (item: OrderItem) => lineIdentity(item.productId, item.options)
```

ใน `mergeLines` เปลี่ยนการรวมให้เก็บหมายเหตุ:

```ts
    merged.set(
      key,
      existing
        ? { ...existing, quantity: existing.quantity + item.quantity, note: existing.note ?? item.note }
        : { ...item },
    )
```

ใน `addItem` ใส่ `note: null` ในบรรทัดใหม่:

```ts
    return this.change({
      items: mergeLines([...this.items, { ...product, lineId: 0, options, quantity, note: null }]),
    })
```

เพิ่มเมธอดในคลาส `OrderEntity` วางหลัง `setLineQuantity`:

```ts
  /** Sets, or with null clears, the note of one line. The caller checks that the line has not been sent. */
  setLineNote(lineId: number, note: string | null): OrderEntity {
    this.assertOpen()
    const value = cleanNote(note)
    this.requireItem(lineWithId(lineId))
    return this.change({ items: this.items.map((item) => (item.lineId === lineId ? { ...item, note: value } : item)) })
  }

  /** How many units of each line the order holds, by line identity (see lineIdentity). */
  quantitiesByLine(): Map<string, number> {
    return new Map(this.items.map((item) => [identity(item), item.quantity]))
  }
```

`absorb` และ `splitOff` คัดลอกบรรทัดทั้งก้อนด้วย spread จึงเก็บหมายเหตุอยู่แล้ว

- [ ] **Step 4: ยืนยันว่าผ่าน และหาจุดที่ขาด `note`**

Run: `bun --env-file=.env.test test src/domains/order.domain.test.ts`
Expected: PASS

Run (จาก `apps/api`): `bun run typecheck`
Expected: tsc ชี้ทุกจุดที่สร้าง `OrderItem` โดยไม่มี `note` (เช่น `open-order.usecase.ts`, `orders.usecases.test.ts`, `factories.ts`) ให้เพิ่ม `note: null` ในจุดเหล่านั้นแล้วรันซ้ำจนผ่าน

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/order.domain.ts apps/api/src/domains/order.domain.test.ts apps/api/src/modules/orders apps/api/src/__tests__/factories.ts
gitcz --non-interactive --type=feat --scope=orders --subject="keep a note on each order line" --body="A note travels with its line to the kitchen ticket. Lines of the same product and options share one note."
```

---

### Task 3: โดเมนของครัว (ฟังก์ชันล้วน ใบสั่ง และสถานี)

**Files:**
- Create: `apps/api/src/domains/kitchen.domain.ts`
- Create: `apps/api/src/domains/kitchen.domain.test.ts`
- Create: `apps/api/src/domains/kitchen-station.domain.ts`
- Create: `apps/api/src/domains/kitchen-station.domain.test.ts`

**Interfaces:**
- Produces:
  - `KITCHEN_TICKET_STATUSES`, `KitchenTicketStatus`
  - `KitchenLine`, `NewKitchenLine`, `KitchenTicketProps`, `NewKitchenTicket`
  - `activeQuantity(line)`, `sentNet(lines)`, `unsentQuantity(lineQuantity, sent)`, `planVoids(newestFirst, keep)`
  - `KitchenTicketEntity`: `validateNew(input)` (static), `markDone(actor, at)`, `isFullyVoided`, `toSnapshot()`
  - `KitchenStationEntity`: `name`, `sortOrder`, `isActive`, `with(changes)`, `toSnapshot()`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว (ฟังก์ชันล้วนและใบสั่ง)**

`apps/api/src/domains/kitchen.domain.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import {
  activeQuantity,
  KitchenTicketEntity,
  planVoids,
  sentNet,
  unsentQuantity,
  type KitchenTicketProps,
  type NewKitchenTicket,
} from './kitchen.domain'

const at = new Date('2026-10-15T10:00:00Z')

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
    return undefined
  } catch (error) {
    return (error as DomainError).code
  }
}

const newTicket = (overrides: Partial<NewKitchenTicket> = {}): NewKitchenTicket => ({
  branchId: 1,
  orderId: 7,
  stationId: 2,
  roundNo: 1,
  sentById: 3,
  lines: [{ productId: 10, productName: 'ชาเย็น', optionsKey: '', optionNames: [], note: null, quantity: 2 }],
  ...overrides,
})

const storedTicket = (overrides: Partial<KitchenTicketProps> = {}): KitchenTicketProps => ({
  id: 1,
  branchId: 1,
  orderId: 7,
  stationId: 2,
  roundNo: 1,
  status: 'pending',
  sentById: 3,
  doneById: null,
  doneAt: null,
  createdAt: at,
  lines: [
    { id: 1, productId: 10, productName: 'ชาเย็น', optionsKey: '', optionNames: [], note: null, quantity: 2, voidedQuantity: 0 },
  ],
  ...overrides,
})

describe('การนับสิ่งที่ครัวมี', () => {
  test('บรรทัดหนึ่งเหลือเท่าจำนวนที่ส่งลบจำนวนที่ถูกยกเลิก', () => {
    expect(activeQuantity({ quantity: 3, voidedQuantity: 1 })).toBe(2)
  })

  test('ส่งแล้วสุทธิคือผลรวมของทุกบรรทัด', () => {
    expect(
      sentNet([
        { quantity: 3, voidedQuantity: 1 },
        { quantity: 2, voidedQuantity: 2 },
      ]),
    ).toBe(2)
  })

  test('ส่งได้อีกไม่ติดลบ', () => {
    expect(unsentQuantity(5, 2)).toBe(3)
    expect(unsentQuantity(2, 2)).toBe(0)
    expect(unsentQuantity(1, 4)).toBe(0)
  })
})

describe('planVoids', () => {
  test('ยกเลิกจากใบที่ใหม่สุดก่อน', () => {
    const newestFirst = [
      { id: 30, quantity: 2, voidedQuantity: 0 },
      { id: 20, quantity: 3, voidedQuantity: 0 },
    ]

    expect(planVoids(newestFirst, 4)).toEqual([{ lineId: 30, take: 1 }])
    expect(planVoids(newestFirst, 1)).toEqual([
      { lineId: 30, take: 2 },
      { lineId: 20, take: 2 },
    ])
  })

  test('ไม่ยกเลิกอะไรเมื่อส่งแล้วไม่เกินที่ต้องเก็บ', () => {
    expect(planVoids([{ id: 1, quantity: 2, voidedQuantity: 0 }], 2)).toEqual([])
    expect(planVoids([{ id: 1, quantity: 2, voidedQuantity: 0 }], 9)).toEqual([])
  })

  test('บรรทัดที่ถูกยกเลิกไปแล้วไม่ถูกยกเลิกซ้ำ', () => {
    expect(planVoids([{ id: 1, quantity: 2, voidedQuantity: 2 }], 0)).toEqual([])
  })

  test('ยกเลิกทั้งหมดตัดตามจำนวนที่ยังเหลืออยู่ของแต่ละบรรทัด', () => {
    expect(
      planVoids(
        [
          { id: 2, quantity: 2, voidedQuantity: 1 },
          { id: 1, quantity: 1, voidedQuantity: 0 },
        ],
        0,
      ),
    ).toEqual([
      { lineId: 2, take: 1 },
      { lineId: 1, take: 1 },
    ])
  })
})

describe('KitchenTicketEntity', () => {
  test('ใบใหม่ต้องมีรายการอย่างน้อยหนึ่งรายการ และจำนวนเป็นจำนวนเต็มบวก', () => {
    expect(codeOf(() => KitchenTicketEntity.validateNew(newTicket({ lines: [] })))).toBe('KITCHEN_NOTHING_TO_SEND')
    expect(
      codeOf(() =>
        KitchenTicketEntity.validateNew(
          newTicket({ lines: [{ productId: 1, productName: 'x', optionsKey: '', optionNames: [], note: null, quantity: 0 }] }),
        ),
      ),
    ).toBe('INVALID_KITCHEN_TICKET')
  })

  test('ทำเสร็จบันทึกว่าใครและเมื่อไร และทำซ้ำไม่ได้', () => {
    const done = new KitchenTicketEntity(storedTicket()).markDone({ id: 5 }, at)

    expect(done.status).toBe('done')
    expect(done.doneById).toBe(5)
    expect(done.doneAt).toEqual(at)
    expect(codeOf(() => done.markDone({ id: 5 }, at))).toBe('KITCHEN_TICKET_NOT_PENDING')
  })

  test('ใบที่ทุกบรรทัดถูกยกเลิกหมดถือว่าถูกยกเลิกทั้งใบ', () => {
    const ticket = new KitchenTicketEntity(
      storedTicket({
        lines: [
          { id: 1, productId: 10, productName: 'ชาเย็น', optionsKey: '', optionNames: [], note: null, quantity: 2, voidedQuantity: 2 },
        ],
      }),
    )

    expect(ticket.isFullyVoided).toBe(true)
  })
})
```

`apps/api/src/domains/kitchen-station.domain.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { KitchenStationEntity } from './kitchen-station.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
    return undefined
  } catch (error) {
    return (error as DomainError).code
  }
}

const station = (name: string, sortOrder = 0) => ({ id: 1, name, sortOrder, isActive: true })

describe('KitchenStationEntity', () => {
  test('ชื่อถูกตัดช่องว่าง', () => {
    expect(new KitchenStationEntity(station('  ครัว  ')).name).toBe('ครัว')
  })

  test('ชื่อว่าง หรือยาวเกิน 50 ตัวอักษร ถูกปฏิเสธ', () => {
    expect(codeOf(() => new KitchenStationEntity(station('   ')))).toBe('INVALID_KITCHEN_STATION')
    expect(codeOf(() => new KitchenStationEntity(station('x'.repeat(51))))).toBe('INVALID_KITCHEN_STATION')
  })

  test('ลำดับต้องเป็นจำนวนเต็ม', () => {
    expect(codeOf(() => new KitchenStationEntity(station('ครัว', 1.5)))).toBe('INVALID_KITCHEN_STATION')
  })

  test('with เปลี่ยนเฉพาะฟิลด์ที่ส่งมา และคงรหัสเดิม', () => {
    const changed = new KitchenStationEntity(station('ครัว')).with({ isActive: false })

    expect(changed.id).toBe(1)
    expect(changed.name).toBe('ครัว')
    expect(changed.isActive).toBe(false)
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/domains/kitchen.domain.test.ts src/domains/kitchen-station.domain.test.ts`
Expected: FAIL เพราะยังไม่มีไฟล์โดเมน

- [ ] **Step 3: เขียน `apps/api/src/domains/kitchen.domain.ts`**

```ts
import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { MAX_LINE_QUANTITY } from './order.domain'

export const KITCHEN_TICKET_STATUSES = ['pending', 'done'] as const
export type KitchenTicketStatus = (typeof KITCHEN_TICKET_STATUSES)[number]

/** One product on a ticket, as it was sent. `quantity` is what went to the kitchen; `voidedQuantity` is what was taken back. */
export interface KitchenLine {
  /** 0 until the line has been stored. */
  id: number
  productId: number
  productName: string
  optionsKey: string
  optionNames: readonly string[]
  note: string | null
  quantity: number
  voidedQuantity: number
}

export type NewKitchenLine = Omit<KitchenLine, 'id' | 'voidedQuantity'>

export interface KitchenTicketProps {
  id: number
  branchId: number
  orderId: number
  stationId: number
  roundNo: number
  status: KitchenTicketStatus
  sentById: number
  doneById: number | null
  doneAt: Date | null
  createdAt: Date
  lines: readonly KitchenLine[]
}

export interface NewKitchenTicket {
  branchId: number
  orderId: number
  stationId: number
  roundNo: number
  sentById: number
  lines: readonly NewKitchenLine[]
}

const invalidTicket = (message: string, code: string) => new DomainError(message, code)

/** Units that are with the kitchen: sent and not taken back. */
export const activeQuantity = (line: { quantity: number; voidedQuantity: number }) => line.quantity - line.voidedQuantity

export const sentNet = (lines: readonly { quantity: number; voidedQuantity: number }[]) =>
  lines.reduce((total, line) => total + activeQuantity(line), 0)

/** How many units of an order line can still go to the kitchen: the line's quantity less what the kitchen has. */
export const unsentQuantity = (lineQuantity: number, sent: number) => Math.max(0, lineQuantity - sent)

/**
 * Which kitchen lines to take back so that only `keep` units stay with the kitchen. `newestFirst` lists
 * the lines from the latest ticket to the earliest; the latest are taken back first.
 */
export function planVoids(
  newestFirst: readonly { id: number; quantity: number; voidedQuantity: number }[],
  keep: number,
): { lineId: number; take: number }[] {
  let excess = sentNet(newestFirst) - keep
  const plan: { lineId: number; take: number }[] = []
  for (const line of newestFirst) {
    if (excess <= 0) break
    const take = Math.min(activeQuantity(line), excess)
    if (take > 0) {
      plan.push({ lineId: line.id, take })
      excess -= take
    }
  }
  return plan
}

/** A ticket of one station for one round of one order. Lines are only changed by voiding, never by editing. */
export class KitchenTicketEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly orderId: number
  public readonly stationId: number
  public readonly roundNo: number
  public readonly status: KitchenTicketStatus
  public readonly sentById: number
  public readonly doneById: number | null
  public readonly doneAt: Date | null
  public readonly createdAt: Date
  public readonly lines: readonly KitchenLine[]

  constructor(props: KitchenTicketProps) {
    if (!KITCHEN_TICKET_STATUSES.includes(props.status)) throw invalidTicket('สถานะใบสั่งครัวไม่ถูกต้อง', 'INVALID_KITCHEN_TICKET')
    this.id = props.id
    this.branchId = props.branchId
    this.orderId = props.orderId
    this.stationId = props.stationId
    this.roundNo = props.roundNo
    this.status = props.status
    this.sentById = props.sentById
    this.doneById = props.doneById
    this.doneAt = props.doneAt
    this.createdAt = props.createdAt
    this.lines = props.lines
  }

  /** Checks a ticket before it is stored: it needs at least one line, and every quantity is a positive whole number. */
  static validateNew(input: NewKitchenTicket): NewKitchenTicket {
    if (input.lines.length === 0)
      throw new DomainError('ไม่มีรายการที่ยังไม่ได้ส่งครัว', 'KITCHEN_NOTHING_TO_SEND')
    for (const line of input.lines)
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY)
        throw invalidTicket(`จำนวนรายการในใบสั่งต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ${MAX_LINE_QUANTITY}`, 'INVALID_KITCHEN_TICKET')
    return input
  }

  markDone(actor: { id: number }, at: Date): KitchenTicketEntity {
    if (this.status !== 'pending') throw new DomainConflictError('ใบสั่งนี้เสร็จแล้ว', 'KITCHEN_TICKET_NOT_PENDING')
    return new KitchenTicketEntity({ ...this.toSnapshot(), status: 'done', doneById: actor.id, doneAt: at })
  }

  /** Every line taken back: the cashier cancelled the whole ticket. It stays on the screen until the kitchen marks it done. */
  get isFullyVoided(): boolean {
    return this.lines.every((line) => activeQuantity(line) === 0)
  }

  toSnapshot(): KitchenTicketProps {
    return {
      id: this.id,
      branchId: this.branchId,
      orderId: this.orderId,
      stationId: this.stationId,
      roundNo: this.roundNo,
      status: this.status,
      sentById: this.sentById,
      doneById: this.doneById,
      doneAt: this.doneAt,
      createdAt: this.createdAt,
      lines: this.lines.map((line) => ({ ...line, optionNames: [...line.optionNames] })),
    }
  }
}
```

- [ ] **Step 4: เขียน `apps/api/src/domains/kitchen-station.domain.ts`**

```ts
import { DomainError } from './errors/domain-error'

export interface KitchenStationProps {
  id: number
  name: string
  sortOrder: number
  isActive: boolean
}

export type KitchenStationChanges = Partial<Omit<KitchenStationProps, 'id'>>

export const MAX_STATION_NAME_LENGTH = 50

/** A place that prepares orders, such as the kitchen or the bar. Shared by every branch of the shop. */
export class KitchenStationEntity {
  public readonly id: number
  public readonly name: string
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: KitchenStationProps) {
    const name = props.name.trim()
    if (name.length < 1 || name.length > MAX_STATION_NAME_LENGTH)
      throw new DomainError(`ชื่อสถานีต้องยาว 1 ถึง ${MAX_STATION_NAME_LENGTH} ตัวอักษร`, 'INVALID_KITCHEN_STATION')
    if (!Number.isInteger(props.sortOrder)) throw new DomainError('ลำดับต้องเป็นจำนวนเต็ม', 'INVALID_KITCHEN_STATION')
    this.id = props.id
    this.name = name
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; `undefined` keeps the current value. */
  with(changes: KitchenStationChanges): KitchenStationEntity {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    return new KitchenStationEntity({ ...this.toSnapshot(), ...defined })
  }

  toSnapshot(): KitchenStationProps {
    return { id: this.id, name: this.name, sortOrder: this.sortOrder, isActive: this.isActive }
  }
}
```

- [ ] **Step 5: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/domains/kitchen.domain.test.ts src/domains/kitchen-station.domain.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/kitchen.domain.ts apps/api/src/domains/kitchen.domain.test.ts apps/api/src/domains/kitchen-station.domain.ts apps/api/src/domains/kitchen-station.domain.test.ts
gitcz --non-interactive --type=feat --scope=kitchen --subject="add kitchen ticket and station rules" --body="Pure counting for what the kitchen holds: sent, unsent, and which lines to take back. Stations and tickets validate on their own."
```

---

### Task 4: ตารางและ migration

**Files:**
- Create: `apps/api/src/infrastructure/database/schema/kitchen.ts`
- Modify: `apps/api/src/infrastructure/database/schema/orders.ts`
- Modify: `apps/api/src/infrastructure/database/schema/shop-settings.ts`
- Generate: `apps/api/drizzle/0014_kitchen.sql`, `apps/api/drizzle/meta/0014_snapshot.json`, `apps/api/drizzle/meta/_journal.json`

- [ ] **Step 1: สร้าง `schema/kitchen.ts`**

```ts
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { branches } from './branches'
import { categories } from './categories'
import { orders } from './orders'
import { products } from './products'
import { users } from './users'

export const kitchenTicketStatus = pgEnum('kitchen_ticket_status', ['pending', 'done'])

// A place that prepares orders. Shared by every branch, like categories.
export const kitchenStations = pgTable('kitchen_stations', {
  id: id(),
  name: text().notNull().unique(),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  ...timestamps,
})

// Which station a category goes to. A category without a row is not sent to the kitchen.
export const kitchenCategoryStations = pgTable('kitchen_category_stations', {
  categoryId: integer()
    .primaryKey()
    .references(() => categories.id),
  stationId: integer()
    .notNull()
    .references(() => kitchenStations.id),
})

// One round of one order at one station. Its lines are the quantities that went to the kitchen.
export const kitchenTickets = pgTable(
  'kitchen_tickets',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    orderId: integer()
      .notNull()
      .references(() => orders.id),
    stationId: integer()
      .notNull()
      .references(() => kitchenStations.id),
    roundNo: integer().notNull(),
    status: kitchenTicketStatus().notNull().default('pending'),
    sentById: integer()
      .notNull()
      .references(() => users.id),
    doneById: integer().references(() => users.id),
    doneAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.orderId, table.stationId, table.roundNo),
    index().on(table.branchId, table.stationId, table.status),
    index().on(table.orderId),
  ],
)

export const kitchenTicketLines = pgTable(
  'kitchen_ticket_lines',
  {
    id: id(),
    ticketId: integer()
      .notNull()
      .references(() => kitchenTickets.id, { onDelete: 'cascade' }),
    productId: integer()
      .notNull()
      .references(() => products.id),
    productName: text().notNull(),
    // The same key the order uses for its line: the same product with the same options.
    optionsKey: text().notNull().default(''),
    optionNames: jsonb().$type<string[]>().notNull().default([]),
    note: text(),
    quantity: integer().notNull(),
    voidedQuantity: integer().notNull().default(0),
  },
  (table) => [
    check('kitchen_ticket_lines_voided_range', sql`${table.voidedQuantity} >= 0 and ${table.voidedQuantity} <= ${table.quantity}`),
    check('kitchen_ticket_lines_quantity_positive', sql`${table.quantity} >= 1`),
    index().on(table.ticketId),
    index().on(table.productId, table.optionsKey),
  ],
)
```

- [ ] **Step 2: เพิ่มหมายเหตุใน `schema/orders.ts`**

ใน `orderItems` เพิ่มหลัง `optionsKey`:

```ts
    // A note for the kitchen on this line. Frozen once the line has been sent.
    note: text(),
```

- [ ] **Step 3: เพิ่ม `home_view` ใน `schema/shop-settings.ts`**

ตรวจว่ามี `pgEnum` ที่ import แล้ว (ไฟล์นี้มี enum `vatMode` อยู่) แล้วเพิ่ม:

```ts
export const shopHomeView = pgEnum('shop_home_view', ['till', 'tables'])
```

และใน `shopSettings` เพิ่มหลัง `receiptFooter`:

```ts
    // What the sell screen opens on: the till itself, or the floor plan of tables.
    homeView: shopHomeView().notNull().default('till'),
```

- [ ] **Step 4: สร้าง migration**

Run (จาก `apps/api`): `bun run db:generate -- --name kitchen`
Expected: มีไฟล์ `drizzle/0014_kitchen.sql` และ snapshot `0014` ใน `drizzle/meta/` ถ้า `--name` ไม่ได้ผล ให้ใช้ชื่อที่ drizzle สร้างแล้วเปลี่ยนชื่อไฟล์ พร้อมแก้ `tag` ใน `_journal.json` ให้ตรงกัน

- [ ] **Step 5: ตรวจ SQL ที่สร้าง**

เปิด `apps/api/drizzle/0014_kitchen.sql` และยืนยันว่ามีเฉพาะ:
- `CREATE TYPE "kitchen_ticket_status"` และ `CREATE TYPE "shop_home_view"`
- `CREATE TABLE` สามตาราง (`kitchen_stations`, `kitchen_category_stations`, `kitchen_tickets`, `kitchen_ticket_lines`)
- `ALTER TABLE "order_items" ADD COLUMN "note" text`
- `ALTER TABLE "shop_settings" ADD COLUMN "home_view" ...`
- foreign key และ index ของตารางใหม่

ถ้ามี `DROP` หรือการเปลี่ยนตารางเดิมที่ไม่เกี่ยว แปลว่า snapshot เดิมไม่ตรง ให้หยุดแล้วรายงาน อย่า commit

- [ ] **Step 6: ตรวจว่าการ typecheck ผ่าน**

Run (จาก `apps/api`): `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/infrastructure/database/schema apps/api/drizzle
gitcz --non-interactive --type=feat --scope=kitchen --subject="add kitchen tables and order line notes" --body="Stations, category routing, tickets and their lines live in kitchen tables. Order lines gain a note; shop settings gain the home view."
```

---

### Task 5: การตั้งค่าร้าน: หน้าแรก (`homeView`)

**Files:**
- Modify: `apps/api/src/domains/shop-settings.domain.ts`
- Modify: `apps/api/src/modules/settings/applications/schemas/settings-schemas.ts`
- Modify: `apps/api/src/modules/settings/adapters/controllers/schemas/settings.schema.ts`
- Modify: `apps/api/src/modules/settings/adapters/repository/shop-settings.drizzle.repository.ts`
- Modify: `apps/api/src/modules/settings/applications/usecases/settings.usecases.test.ts`

**Interfaces:**
- Produces: `HOME_VIEWS = ['till', 'tables'] as const`, `HomeView`, `ShopSettingsProps.homeView`, ค่าเริ่มต้น `'till'`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

สร้างไฟล์ `apps/api/src/domains/shop-settings.domain.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from './shop-settings.domain'

describe('หน้าแรกของร้าน', () => {
  test('ค่าเริ่มต้นคือหน้าขาย', () => {
    expect(DEFAULT_SHOP_SETTINGS.homeView).toBe('till')
  })

  test('ผังโต๊ะเป็นหน้าแรกได้', () => {
    expect(new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, homeView: 'tables' }).homeView).toBe('tables')
  })

  test('ค่าอื่นที่ไม่รู้จักถูกปฏิเสธ', () => {
    expect(() => new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, homeView: 'floor' as never })).toThrow()
  })
})
```

การตรวจผ่าน zod ที่ชั้น use case ครอบคลุมโดย `settings.usecases.test.ts` เดิม เพิ่มกรณี `homeView: 'floor'` ที่ถูกปฏิเสธในไฟล์นั้นด้วยรูปแบบเดิม

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/settings`
Expected: FAIL เพราะยังไม่มี `homeView`

- [ ] **Step 3: แก้โดเมน `shop-settings.domain.ts`**

เพิ่มค่าคงที่และชนิดใกล้ `RECEIPT_PAPER_WIDTHS`:

```ts
/** What the sell screen opens on: the till itself, or the floor plan of tables. */
export const HOME_VIEWS = ['till', 'tables'] as const
export type HomeView = (typeof HOME_VIEWS)[number]
```

ใน `ShopSettingsProps` เพิ่มหลัง `receiptFooter`:

```ts
  homeView: HomeView
```

ใน `DEFAULT_SHOP_SETTINGS` เพิ่ม `homeView: 'till',`

ใน constructor ของ `ShopSettingsEntity` เพิ่มการตรวจก่อนการกำหนดค่า:

```ts
    if (!HOME_VIEWS.includes(props.homeView)) throw invalid('หน้าแรกต้องเป็นหน้าขายหรือผังโต๊ะ')
```

เพิ่มฟิลด์ `public readonly homeView: HomeView` ในคลาส กำหนดค่าใน constructor และเพิ่มใน `toSnapshot()`

- [ ] **Step 4: แก้ schema ของ API และ application**

ใน `adapters/controllers/schemas/settings.schema.ts` เพิ่มใน `fields`:

```ts
  homeView: t.Union([t.Literal('till'), t.Literal('tables')]),
```

ใน `applications/schemas/settings-schemas.ts` เพิ่มเข้าโครงเดียวกับ `receiptPaperMm` โดยใช้ `z.enum(HOME_VIEWS)` และนำเข้า `HOME_VIEWS` จาก `../../../../domains/shop-settings.domain`

- [ ] **Step 5: แก้ repository**

ใน `shop-settings.drizzle.repository.ts` เพิ่มคอลัมน์ในการ select เหมือน `receiptFooter`:

```ts
  homeView: shopSettings.homeView,
```

ตรวจว่าเมธอด save ส่งค่าทั้งก้อนจาก `toSnapshot()` ถ้าไม่ได้ส่ง ให้เพิ่ม `homeView` ในชุดคอลัมน์ที่เขียน

- [ ] **Step 6: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/settings src/domains`
Expected: PASS

Run: `bun run typecheck` (จาก `apps/api`)
Expected: ผ่าน

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domains/shop-settings.domain.ts apps/api/src/modules/settings
gitcz --non-interactive --type=feat --scope=settings --subject="let the shop choose the sell screen's home view" --body="Till or floor plan. Defaults to the till, so shops that do not change it see no difference."
```

---

### Task 6: สถานีครัว (พอร์ต, use case, repository, route ของแค็ตตาล็อก)

**Files:**
- Create: `apps/api/src/modules/kitchen/applications/ports/kitchen-station.repository.ts`
- Create: `apps/api/src/modules/kitchen/applications/schemas/kitchen-schemas.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/list-kitchen-stations.usecase.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/create-kitchen-station.usecase.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/update-kitchen-station.usecase.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/kitchen-stations.usecases.test.ts`
- Create: `apps/api/src/modules/kitchen/adapters/repository/kitchen-station.drizzle.repository.ts`
- Create: `apps/api/src/modules/kitchen/adapters/controllers/kitchen-catalog.controller.ts`
- Create: `apps/api/src/modules/kitchen/adapters/controllers/schemas/kitchen.schema.ts`
- Create: `apps/api/src/modules/kitchen/kitchen.module.ts`
- Modify: `apps/api/src/__tests__/mocks.ts`

**Interfaces:**
- Produces:
  - `IKitchenStationRepository { findAll(): Promise<KitchenStationEntity[]>; findById(id: number): Promise<KitchenStationEntity | null>; create(station: KitchenStationEntity): Promise<KitchenStationEntity>; update(station: KitchenStationEntity): Promise<KitchenStationEntity> }` และ `kitchenStationRepositoryToken`
  - `ListKitchenStationsUseCase.execute(): Promise<KitchenStationEntity[]>` (Query)
  - `CreateKitchenStationUseCase.execute(input: unknown): Promise<KitchenStationEntity>` (Command)
  - `UpdateKitchenStationUseCase.execute(id: number, input: unknown): Promise<KitchenStationEntity>` (Command)

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

`apps/api/src/modules/kitchen/applications/usecases/kitchen-stations.usecases.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { mockKitchenStationRepository } from '../../../../__tests__/mocks'
import { CreateKitchenStationUseCase } from './create-kitchen-station.usecase'
import { ListKitchenStationsUseCase } from './list-kitchen-stations.usecase'
import { UpdateKitchenStationUseCase } from './update-kitchen-station.usecase'

let repo: ReturnType<typeof mockKitchenStationRepository>

const station = (overrides: Partial<{ id: number; name: string; sortOrder: number; isActive: boolean }> = {}) =>
  new KitchenStationEntity({ id: 1, name: 'ครัว', sortOrder: 0, isActive: true, ...overrides })

beforeEach(() => {
  repo = mockKitchenStationRepository()
  repo.create.mockImplementation(async (entity) => entity)
  repo.update.mockImplementation(async (entity) => entity)
})

describe('ListKitchenStationsUseCase', () => {
  test('ลิสต์สถานีทั้งหมดรวมที่ปิดอยู่ เพื่อให้เจ้าของจัดการได้', async () => {
    repo.findAll.mockResolvedValue([station(), station({ id: 2, name: 'บาร์', isActive: false })])

    const listed = await new ListKitchenStationsUseCase(repo).execute()

    expect(listed.map((row) => row.name)).toEqual(['ครัว', 'บาร์'])
  })
})

describe('CreateKitchenStationUseCase', () => {
  test('สร้างสถานีที่เปิดใช้งานและลำดับเริ่มต้นเป็นศูนย์', async () => {
    const created = await new CreateKitchenStationUseCase(repo).execute({ name: '  ครัว  ' })

    expect(created.toSnapshot()).toEqual({ id: 0, name: 'ครัว', sortOrder: 0, isActive: true })
  })

  test('ชื่อว่างถูกปฏิเสธก่อนเขียนฐานข้อมูล', async () => {
    await expect(new CreateKitchenStationUseCase(repo).execute({ name: '' })).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('UpdateKitchenStationUseCase', () => {
  test('เปิดหรือปิดสถานีโดยไม่เปลี่ยนชื่อ', async () => {
    repo.findById.mockResolvedValue(station())

    const updated = await new UpdateKitchenStationUseCase(repo).execute(1, { isActive: false })

    expect(updated.isActive).toBe(false)
    expect(updated.name).toBe('ครัว')
  })

  test('สถานีที่ไม่มีถูกตอบว่าไม่พบ', async () => {
    repo.findById.mockResolvedValue(null)

    await expect(new UpdateKitchenStationUseCase(repo).execute(9, { isActive: false })).rejects.toBeInstanceOf(
      DomainNotFoundError,
    )
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen`
Expected: FAIL เพราะยังไม่มีไฟล์

- [ ] **Step 3: เพิ่ม mock ใน `__tests__/mocks.ts`**

เพิ่ม import และฟังก์ชันท้ายไฟล์ (ตามรูปแบบของ `mockTableRepository`):

```ts
import type { IKitchenStationRepository } from '../modules/kitchen/applications/ports/kitchen-station.repository'

export const mockKitchenStationRepository = (): Mocked<IKitchenStationRepository> => ({
  findAll: mock<IKitchenStationRepository['findAll']>(),
  findById: mock<IKitchenStationRepository['findById']>(),
  create: mock<IKitchenStationRepository['create']>(),
  update: mock<IKitchenStationRepository['update']>(),
})
```

- [ ] **Step 4: เขียนพอร์ต `applications/ports/kitchen-station.repository.ts`**

```ts
import type { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'

export interface IKitchenStationRepository {
  /** Every station, active or not, ordered by sort order then name. */
  findAll(): Promise<KitchenStationEntity[]>
  findById(id: number): Promise<KitchenStationEntity | null>
  /** Throws DomainConflictError KITCHEN_STATION_NAME_TAKEN for a name that is already used. */
  create(station: KitchenStationEntity): Promise<KitchenStationEntity>
  update(station: KitchenStationEntity): Promise<KitchenStationEntity>
}

const kitchenStationRepositoryTokenSymbol: unique symbol = Symbol('IKitchenStationRepository')
export const kitchenStationRepositoryToken = kitchenStationRepositoryTokenSymbol.toString()
```

- [ ] **Step 5: เขียน zod schema `applications/schemas/kitchen-schemas.ts`**

```ts
import { z } from 'zod'

const stationName = z.string().trim().min(1).max(50)

export const createKitchenStationSchema = z.object({
  name: stationName,
  sortOrder: z.number().int().optional(),
})

export const updateKitchenStationSchema = z
  .object({
    name: stationName,
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  })
  .partial()

export const setCategoryStationSchema = z.object({
  stationId: z.number().int().positive().nullable(),
})

export const kitchenBoardQuerySchema = z.object({
  stationId: z.number().int().positive(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})
```

- [ ] **Step 6: เขียน use case สามตัว**

`applications/usecases/list-kitchen-stations.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import type { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'

/** Query: every station of the shop, active or not, for the stations page and the till's choices. */
@injectable()
export class ListKitchenStationsUseCase {
  constructor(@inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository) {}

  async execute(): Promise<KitchenStationEntity[]> {
    return this.stations.findAll()
  }
}
```

`applications/usecases/create-kitchen-station.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { createKitchenStationSchema } from '../schemas/kitchen-schemas'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'

/** Command: adds a station, active from the start. */
@injectable()
export class CreateKitchenStationUseCase {
  constructor(@inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository) {}

  async execute(input: unknown) {
    const { name, sortOrder } = createKitchenStationSchema.parse(input)
    return this.stations.create(new KitchenStationEntity({ id: 0, name, sortOrder: sortOrder ?? 0, isActive: true }))
  }
}
```

`applications/usecases/update-kitchen-station.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'
import { updateKitchenStationSchema } from '../schemas/kitchen-schemas'

/** Command: renames a station, moves it in the list, or turns it on and off. Stations are never deleted. */
@injectable()
export class UpdateKitchenStationUseCase {
  constructor(@inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository) {}

  async execute(id: number, input: unknown) {
    const changes = updateKitchenStationSchema.parse(input)
    const existing = await this.stations.findById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบสถานีครัว', 'KITCHEN_STATION_NOT_FOUND')
    return this.stations.update(existing.with(changes))
  }
}
```

- [ ] **Step 7: เขียน adapter repository `adapters/repository/kitchen-station.drizzle.repository.ts`**

```ts
import { asc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { kitchenStations } from '../../../../infrastructure/database/schema/kitchen'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenStationRepository } from '../../applications/ports/kitchen-station.repository'

const nameTaken = () => new DomainConflictError('ชื่อสถานีนี้ถูกใช้แล้ว', 'KITCHEN_STATION_NAME_TAKEN')

const toEntity = (row: typeof kitchenStations.$inferSelect) =>
  new KitchenStationEntity({ id: row.id, name: row.name, sortOrder: row.sortOrder, isActive: row.isActive })

@injectable()
export class DrizzleKitchenStationRepository implements IKitchenStationRepository {
  async findAll() {
    const rows = await currentExecutor()
      .select()
      .from(kitchenStations)
      .orderBy(asc(kitchenStations.sortOrder), asc(kitchenStations.name))
    return rows.map(toEntity)
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select().from(kitchenStations).where(eq(kitchenStations.id, id))
    return row ? toEntity(row) : null
  }

  async create(station: KitchenStationEntity) {
    try {
      const [row] = await currentExecutor()
        .insert(kitchenStations)
        .values({ name: station.name, sortOrder: station.sortOrder, isActive: station.isActive })
        .returning()
      return toEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }

  async update(station: KitchenStationEntity) {
    try {
      const [row] = await currentExecutor()
        .update(kitchenStations)
        .set({ name: station.name, sortOrder: station.sortOrder, isActive: station.isActive, updatedAt: new Date() })
        .where(eq(kitchenStations.id, station.id))
        .returning()
      return toEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }
}
```

- [ ] **Step 8: เขียน schema ของ HTTP และ controller ของแค็ตตาล็อก**

`adapters/controllers/schemas/kitchen.schema.ts` (ส่วนสถานี; ส่วนอื่นเพิ่มใน task 7 และ 12):

```ts
import { t } from 'elysia'

const station = t.Object({
  id: t.Integer(),
  name: t.String(),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
})

export const kitchenSchemas = {
  station,
  createStation: t.Object({
    name: t.String({ minLength: 1, maxLength: 50 }),
    sortOrder: t.Optional(t.Integer()),
  }),
  updateStation: t.Partial(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 50 }),
      sortOrder: t.Integer(),
      isActive: t.Boolean(),
    }),
  ),
}

export type KitchenStationResponse = typeof kitchenSchemas.station.static
```

`adapters/controllers/kitchen-catalog.controller.ts` (ส่วนสถานี; Task 7 เพิ่ม route ของหมวด):

```ts
import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateKitchenStationUseCase } from '../../applications/usecases/create-kitchen-station.usecase'
import { ListKitchenStationsUseCase } from '../../applications/usecases/list-kitchen-stations.usecase'
import { UpdateKitchenStationUseCase } from '../../applications/usecases/update-kitchen-station.usecase'
import { kitchenSchemas, type KitchenStationResponse } from './schemas/kitchen.schema'

const toStationResponse = (station: KitchenStationEntity): KitchenStationResponse => station.toSnapshot()

/**
 * Routes under the catalog prefix (`/api/v1/catalog`). They are full paths, not a group prefix, because the
 * catalog also holds category routes, which need their own paths.
 */
@injectable()
export class KitchenCatalogElysiaController {
  constructor(
    @inject(ListKitchenStationsUseCase) private readonly listStations: ListKitchenStationsUseCase,
    @inject(CreateKitchenStationUseCase) private readonly createStation: CreateKitchenStationUseCase,
    @inject(UpdateKitchenStationUseCase) private readonly updateStation: UpdateKitchenStationUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'catalog.kitchen', detail: { tags: ['Catalog'] } })
      .use(auth)
      .get(
        '/kitchen-stations',
        async () => {
          const items = (await this.listStations.execute()).map(toStationResponse)
          return { items, total: items.length }
        },
        { auth: true, response: page(kitchenSchemas.station), detail: { summary: 'สถานีครัว (รวมที่ปิดอยู่)' } },
      )
      .post('/kitchen-stations', async ({ body }) => toStationResponse(await this.createStation.execute(body)), {
        auth: ['owner'],
        body: kitchenSchemas.createStation,
        response: kitchenSchemas.station,
        detail: { summary: 'เพิ่มสถานีครัว' },
      })
      .patch(
        '/kitchen-stations/:id',
        async ({ params, body }) => toStationResponse(await this.updateStation.execute(params.id, body)),
        {
          auth: ['owner'],
          params: idParams,
          body: kitchenSchemas.updateStation,
          response: kitchenSchemas.station,
          detail: { summary: 'แก้ไขสถานีครัว (ชื่อ ลำดับ เปิดปิด)' },
        },
      )
  }
}
```

- [ ] **Step 9: เขียน `kitchen.module.ts` (ส่วนสถานี)**

```ts
import { container } from 'tsyringe'
import { DrizzleKitchenStationRepository } from './adapters/repository/kitchen-station.drizzle.repository'
import { KitchenCatalogElysiaController } from './adapters/controllers/kitchen-catalog.controller'
import { kitchenStationRepositoryToken } from './applications/ports/kitchen-station.repository'
import { CreateKitchenStationUseCase } from './applications/usecases/create-kitchen-station.usecase'
import { ListKitchenStationsUseCase } from './applications/usecases/list-kitchen-stations.usecase'
import { UpdateKitchenStationUseCase } from './applications/usecases/update-kitchen-station.usecase'

container.register(kitchenStationRepositoryToken, { useClass: DrizzleKitchenStationRepository })
container.registerSingleton(ListKitchenStationsUseCase)
container.registerSingleton(CreateKitchenStationUseCase)
container.registerSingleton(UpdateKitchenStationUseCase)
container.registerSingleton(KitchenCatalogElysiaController)
```

- [ ] **Step 10: ต่อ route เข้าแอป**

`apps/api/src/modules/di-registrations.ts`: เพิ่ม `import './kitchen/kitchen.module'` หลังบรรทัด `import './orders/orders.module'`

`apps/api/src/modules/app.module.ts`:
- import `KitchenCatalogElysiaController` จาก `./kitchen/adapters/controllers/kitchen-catalog.controller`
- เพิ่ม `const kitchenCatalogController = container.resolve(KitchenCatalogElysiaController)` พร้อมตัวแปรอื่น
- ใน `const catalog = new Elysia(...)` เพิ่ม `.use(kitchenCatalogController.getRoutes())` หลัง `tableController`

- [ ] **Step 11: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen`
Expected: PASS

Run: `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/kitchen apps/api/src/modules/app.module.ts apps/api/src/modules/di-registrations.ts apps/api/src/__tests__/mocks.ts
gitcz --non-interactive --type=feat --scope=kitchen --subject="add kitchen stations for the owner" --body="Stations are shared by every branch and can be paused, never deleted. Names are unique across the shop."
```

---

### Task 7: ผูกหมวดกับสถานี

**Files:**
- Create: `apps/api/src/modules/kitchen/applications/ports/kitchen-routing.repository.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/set-category-station.usecase.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/set-category-station.usecase.test.ts`
- Create: `apps/api/src/modules/kitchen/adapters/repository/kitchen-routing.drizzle.repository.ts`
- Modify: `apps/api/src/modules/kitchen/adapters/controllers/schemas/kitchen.schema.ts`
- Modify: `apps/api/src/modules/kitchen/adapters/controllers/kitchen-catalog.controller.ts`
- Modify: `apps/api/src/modules/kitchen/kitchen.module.ts`
- Modify: `apps/api/src/__tests__/mocks.ts`

**Interfaces:**
- Consumes: `ICategoryRepository.findById(id)` จาก `modules/categories/applications/ports/category.repository.ts`; `IKitchenStationRepository.findById(id)`
- Produces:
  - `IKitchenRoutingRepository { stationsByCategory(): Promise<Map<number, number>>; setStation(categoryId: number, stationId: number | null): Promise<void> }` และ `kitchenRoutingRepositoryToken`
  - `SetCategoryStationUseCase.execute(categoryId: number, input: unknown): Promise<{ categoryId: number; stationId: number | null }>` (Command)

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

`set-category-station.usecase.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository, mockKitchenRoutingRepository, mockKitchenStationRepository } from '../../../../__tests__/mocks'
import { SetCategoryStationUseCase } from './set-category-station.usecase'

let categories: ReturnType<typeof mockCategoryRepository>
let stations: ReturnType<typeof mockKitchenStationRepository>
let routing: ReturnType<typeof mockKitchenRoutingRepository>

const kitchen = new KitchenStationEntity({ id: 2, name: 'ครัว', sortOrder: 0, isActive: true })

beforeEach(() => {
  categories = mockCategoryRepository()
  stations = mockKitchenStationRepository()
  routing = mockKitchenRoutingRepository()
  categories.findById.mockResolvedValue(makeCategory({ id: 1 }))
  stations.findById.mockResolvedValue(kitchen)
})

const useCase = () => new SetCategoryStationUseCase(categories, stations, routing)

describe('SetCategoryStationUseCase', () => {
  test('ผูกหมวดกับสถานีที่เปิดอยู่', async () => {
    const result = await useCase().execute(1, { stationId: 2 })

    expect(routing.setStation).toHaveBeenCalledWith(1, 2)
    expect(result).toEqual({ categoryId: 1, stationId: 2 })
  })

  test('ค่า null ทำให้หมวดไม่ส่งครัว', async () => {
    const result = await useCase().execute(1, { stationId: null })

    expect(routing.setStation).toHaveBeenCalledWith(1, null)
    expect(result.stationId).toBeNull()
    expect(stations.findById).not.toHaveBeenCalled()
  })

  test('หมวดที่ไม่มีถูกตอบว่าไม่พบ', async () => {
    categories.findById.mockResolvedValue(null)

    await expect(useCase().execute(9, { stationId: 2 })).rejects.toBeInstanceOf(DomainNotFoundError)
    expect(routing.setStation).not.toHaveBeenCalled()
  })

  test('สถานีที่ไม่มีถูกตอบว่าไม่พบ', async () => {
    stations.findById.mockResolvedValue(null)

    await expect(useCase().execute(1, { stationId: 9 })).rejects.toMatchObject({ code: 'KITCHEN_STATION_NOT_FOUND' })
    expect(routing.setStation).not.toHaveBeenCalled()
  })

  test('สถานีที่ปิดอยู่รับหมวดใหม่ไม่ได้', async () => {
    stations.findById.mockResolvedValue(kitchen.with({ isActive: false }))

    await expect(useCase().execute(1, { stationId: 2 })).rejects.toBeInstanceOf(DomainConflictError)
    expect(routing.setStation).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen/applications/usecases/set-category-station.usecase.test.ts`
Expected: FAIL เพราะยังไม่มี use case

- [ ] **Step 3: เพิ่ม mock และพอร์ต**

ใน `__tests__/mocks.ts` เพิ่ม:

```ts
import type { IKitchenRoutingRepository } from '../modules/kitchen/applications/ports/kitchen-routing.repository'

export const mockKitchenRoutingRepository = (): Mocked<IKitchenRoutingRepository> => ({
  stationsByCategory: mock<IKitchenRoutingRepository['stationsByCategory']>(async () => new Map()),
  setStation: mock<IKitchenRoutingRepository['setStation']>(async () => undefined),
})
```

`applications/ports/kitchen-routing.repository.ts`:

```ts
export interface IKitchenRoutingRepository {
  /** The station of each category that has one. A category missing from the map is not sent to the kitchen. */
  stationsByCategory(): Promise<Map<number, number>>
  /** Sets the station of one category, or with null takes it off the kitchen. */
  setStation(categoryId: number, stationId: number | null): Promise<void>
}

const kitchenRoutingRepositoryTokenSymbol: unique symbol = Symbol('IKitchenRoutingRepository')
export const kitchenRoutingRepositoryToken = kitchenRoutingRepositoryTokenSymbol.toString()
```

- [ ] **Step 4: เขียน use case**

`applications/usecases/set-category-station.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { categoryRepositoryToken } from '../../../categories/applications/ports/category.repository'
import type { ICategoryRepository } from '../../../categories/applications/ports/category.repository'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'
import { kitchenRoutingRepositoryToken } from '../ports/kitchen-routing.repository'
import type { IKitchenRoutingRepository } from '../ports/kitchen-routing.repository'
import { setCategoryStationSchema } from '../schemas/kitchen-schemas'

/** Command: decides which station the products of a category are prepared at. */
@injectable()
export class SetCategoryStationUseCase {
  constructor(
    @inject(categoryRepositoryToken) private readonly categories: ICategoryRepository,
    @inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository,
    @inject(kitchenRoutingRepositoryToken) private readonly routing: IKitchenRoutingRepository,
  ) {}

  async execute(categoryId: number, input: unknown) {
    const { stationId } = setCategoryStationSchema.parse(input)

    if (!(await this.categories.findById(categoryId))) throw new DomainNotFoundError('ไม่พบหมวดหมู่')
    if (stationId !== null) {
      const station = await this.stations.findById(stationId)
      if (!station) throw new DomainNotFoundError('ไม่พบสถานีครัว', 'KITCHEN_STATION_NOT_FOUND')
      if (!station.isActive) throw new DomainConflictError('สถานีนี้ปิดใช้งานอยู่', 'KITCHEN_STATION_INACTIVE')
    }

    await this.routing.setStation(categoryId, stationId)
    return { categoryId, stationId }
  }
}
```

- [ ] **Step 5: เขียน adapter**

`adapters/repository/kitchen-routing.drizzle.repository.ts`:

```ts
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { kitchenCategoryStations } from '../../../../infrastructure/database/schema/kitchen'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenRoutingRepository } from '../../applications/ports/kitchen-routing.repository'

@injectable()
export class DrizzleKitchenRoutingRepository implements IKitchenRoutingRepository {
  async stationsByCategory() {
    const rows = await currentExecutor()
      .select({ categoryId: kitchenCategoryStations.categoryId, stationId: kitchenCategoryStations.stationId })
      .from(kitchenCategoryStations)
    return new Map(rows.map((row) => [row.categoryId, row.stationId]))
  }

  async setStation(categoryId: number, stationId: number | null) {
    const executor = currentExecutor()
    if (stationId === null) {
      await executor.delete(kitchenCategoryStations).where(eq(kitchenCategoryStations.categoryId, categoryId))
      return
    }
    await executor
      .insert(kitchenCategoryStations)
      .values({ categoryId, stationId })
      .onConflictDoUpdate({ target: kitchenCategoryStations.categoryId, set: { stationId } })
  }
}
```

- [ ] **Step 6: เพิ่ม route และ schema**

ใน `kitchen.schema.ts` เพิ่ม:

```ts
// in kitchenSchemas:
  categoryStation: t.Object({ stationId: t.Nullable(t.Integer({ minimum: 1 })) }),
  categoryStationResponse: t.Object({ categoryId: t.Integer(), stationId: t.Nullable(t.Integer()) }),
```

ใน `kitchen-catalog.controller.ts`:
- inject `SetCategoryStationUseCase` เพิ่มใน constructor
- เพิ่ม route ต่อจาก `.patch('/kitchen-stations/:id')`:

```ts
      .put(
        '/categories/:id/kitchen-station',
        async ({ params, body }) => this.setCategoryStation.execute(params.id, body),
        {
          auth: ['owner'],
          params: idParams,
          body: kitchenSchemas.categoryStation,
          response: kitchenSchemas.categoryStationResponse,
          detail: { summary: 'ผูกหมวดกับสถานีครัว (ไม่ส่งครัวเมื่อเป็น null)' },
        },
      )
```

ใน `kitchen.module.ts` เพิ่ม:

```ts
import { DrizzleKitchenRoutingRepository } from './adapters/repository/kitchen-routing.drizzle.repository'
import { kitchenRoutingRepositoryToken } from './applications/ports/kitchen-routing.repository'
import { SetCategoryStationUseCase } from './applications/usecases/set-category-station.usecase'

container.register(kitchenRoutingRepositoryToken, { useClass: DrizzleKitchenRoutingRepository })
container.registerSingleton(SetCategoryStationUseCase)
```

- [ ] **Step 6b: ลิสต์การผูกหมวดทั้งร้าน (ให้หน้าหมวดหมู่รู้สถานีของแต่ละหมวด)**

`applications/usecases/list-category-routing.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { kitchenRoutingRepositoryToken } from '../ports/kitchen-routing.repository'
import type { IKitchenRoutingRepository } from '../ports/kitchen-routing.repository'

/** Query: which station each category goes to. A category missing here is not sent to the kitchen. */
@injectable()
export class ListCategoryRoutingUseCase {
  constructor(@inject(kitchenRoutingRepositoryToken) private readonly routing: IKitchenRoutingRepository) {}

  async execute(): Promise<{ categoryId: number; stationId: number }[]> {
    return [...(await this.routing.stationsByCategory())].map(([categoryId, stationId]) => ({ categoryId, stationId }))
  }
}
```

ใน `kitchen-catalog.controller.ts` เพิ่ม `@inject(ListCategoryRoutingUseCase) private readonly listRouting: ListCategoryRoutingUseCase` ใน constructor และเพิ่ม route:

```ts
      .get(
        '/kitchen-routing',
        async () => {
          const items = await this.listRouting.execute()
          return { items, total: items.length }
        },
        {
          auth: true,
          response: page(kitchenSchemas.categoryStationResponse),
          detail: { summary: 'หมวดแต่ละหมวดส่งไปสถานีไหน' },
        },
      )
```

ใน `kitchen.module.ts` เพิ่ม `container.registerSingleton(ListCategoryRoutingUseCase)`

- [ ] **Step 7: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen`
Expected: PASS

Run: `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/kitchen apps/api/src/__tests__/mocks.ts
gitcz --non-interactive --type=feat --scope=kitchen --subject="route each category to a kitchen station" --body="A category without a station is not sent to the kitchen. A paused station cannot take new categories."
```

---

### Task 8: ออเดอร์เรียกโมดูลครัวผ่านพอร์ต และยกเลิกส่วนที่ลดหลังส่ง

**Files:**
- Create: `apps/api/src/modules/orders/applications/ports/kitchen-tickets.port.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/set-order-item-quantity.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/remove-order-item.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/set-order-line-quantity.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/remove-order-line.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/cancel-order.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/orders.usecases.test.ts`
- Modify: `apps/api/src/modules/orders/adapters/controllers/order.controller.ts`
- Modify: `apps/api/src/modules/orders/adapters/controllers/schemas/order.schema.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`
- Modify: `apps/api/src/__tests__/mocks.ts`

**Interfaces:**
- Produces:
  - `IKitchenTickets` (ประกาศในโมดูลออเดอร์):
    - `sentByLine(orderIds: readonly number[]): Promise<Map<number, Map<string, number>>>`
    - `hasPending(orderId: number): Promise<boolean>`
    - `reconcile(orderId: number, quantities: ReadonlyMap<string, number>): Promise<void>`
    - `moveTickets(fromOrderId: number, toOrderId: number): Promise<void>`
  - `kitchenTicketsToken`
  - ผลของ `OrderItem` ในการตอบ: `note: string | null`, `sentQuantity: number`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

ใน `orders.usecases.test.ts` เพิ่มในส่วนบนของไฟล์:

```ts
import { mockKitchenTickets } from '../../../../__tests__/mocks'
import { identityOf } from '../../../../domains/order.domain'

let kitchen: ReturnType<typeof mockKitchenTickets>
// in beforeEach: kitchen = mockKitchenTickets()
// Every constructor below gets `kitchen` as its last argument.
```

เพิ่มกรณีทดสอบ (วางในไฟล์ทดสอบเดิม ใช้ตัวแปรและ factory ที่มีอยู่):

```ts
describe('การลดหรือยกเลิกหลังส่งครัว', () => {
  test('ตั้งจำนวนบรรทัดให้ต่ำลงแจ้งครัวด้วยจำนวนที่ออเดอร์ถืออยู่ตอนนี้', async () => {
    const order = makeOrder({ id: 1, items: [{ lineId: 5, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 3, options: [], note: null }] })
    orders.findByIdForUpdate.mockResolvedValue(order)

    await new SetOrderLineQuantityUseCase(orders, unitOfWork, kitchen).execute(1, 5, { quantity: 1 }, 1)

    expect(kitchen.reconcile).toHaveBeenCalledWith(1, new Map([[identityOf(1, ''), 1]]))
  })

  test('ลบบรรทัดแจ้งครัวว่าไม่เหลือจำนวนของสินค้านั้น', async () => {
    const order = makeOrder({ id: 1, items: [{ lineId: 5, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 3, options: [], note: null }, { lineId: 6, productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700, quantity: 1, options: [], note: null }] })
    orders.findByIdForUpdate.mockResolvedValue(order)

    await new RemoveOrderLineUseCase(orders, unitOfWork, kitchen).execute(1, 5, 1)

    expect(kitchen.reconcile).toHaveBeenCalledWith(1, new Map([[identityOf(2, ''), 1]]))
  })

  test('ยกเลิกออเดอร์แจ้งครัวให้ยกเลิกทุกรายการ', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, items: [] }))

    await new CancelOrderUseCase(orders, unitOfWork, kitchen).execute(1, { reason: 'ลูกค้าไปแล้ว' }, actor)

    expect(kitchen.reconcile).toHaveBeenCalledWith(1, new Map())
  })
})
```

อัปเดตการสร้าง use case เดิมทุกจุดในไฟล์นี้ให้รับ `kitchen` เป็นอาร์กิวเมนต์สุดท้าย (เฉพาะคลาสที่แก้ใน task นี้: `SetOrderItemQuantityUseCase`, `RemoveOrderItemUseCase`, `SetOrderLineQuantityUseCase`, `RemoveOrderLineUseCase`, `CancelOrderUseCase`)

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/orders/applications/usecases/orders.usecases.test.ts`
Expected: FAIL เพราะยังไม่มี `kitchen` และ `mockKitchenTickets`

- [ ] **Step 3: เพิ่ม mock**

ใน `__tests__/mocks.ts` เพิ่ม:

```ts
import type { IKitchenTickets } from '../modules/orders/applications/ports/kitchen-tickets.port'

/** Answers "nothing sent, nothing pending" unless a test says otherwise. */
export const mockKitchenTickets = (): Mocked<IKitchenTickets> => ({
  sentByLine: mock<IKitchenTickets['sentByLine']>(async () => new Map()),
  hasPending: mock<IKitchenTickets['hasPending']>(async () => false),
  reconcile: mock<IKitchenTickets['reconcile']>(async () => undefined),
  moveTickets: mock<IKitchenTickets['moveTickets']>(async () => undefined),
})
```

- [ ] **Step 4: เขียนพอร์ตของออเดอร์**

`apps/api/src/modules/orders/applications/ports/kitchen-tickets.port.ts`:

```ts
/**
 * What orders need from the kitchen. Owned here, because orders is the caller; the kitchen module answers it.
 * Lines are keyed by lineIdentity (product and options), so a line can be compared with its tickets.
 */
export interface IKitchenTickets {
  /** Units sent to the kitchen and not taken back, per order and line identity. Missing means none. */
  sentByLine(orderIds: readonly number[]): Promise<Map<number, Map<string, number>>>
  /** Whether any ticket of the order is still pending at a station. */
  hasPending(orderId: number): Promise<boolean>
  /**
   * Takes back what the kitchen has beyond `quantities` (line identity to the units the order holds now).
   * An empty map takes back everything, which is what a cancelled order does.
   */
  reconcile(orderId: number, quantities: ReadonlyMap<string, number>): Promise<void>
  /** Re-points every ticket of one order to another, when orders are merged. */
  moveTickets(fromOrderId: number, toOrderId: number): Promise<void>
}

const kitchenTicketsTokenSymbol: unique symbol = Symbol('IKitchenTickets')
export const kitchenTicketsToken = kitchenTicketsTokenSymbol.toString()
```

- [ ] **Step 5: เรียก `reconcile` หลังบันทึกใน use case ทั้งห้า**

ทุกคลาสต่อไปนี้ เพิ่ม import และ inject พารามิเตอร์ใหม่ที่ท้าย constructor:

```ts
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
// constructor(..., @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets)
```

ใน `SetOrderLineQuantityUseCase.execute`, `RemoveOrderLineUseCase.execute`, `SetOrderItemQuantityUseCase.execute`, `RemoveOrderItemUseCase.execute` เปลี่ยนการบันทึกเป็น:

```ts
      const saved = await this.orders.save(order.setLineQuantity(lineId, quantity))
      await this.kitchen.reconcile(saved.id, saved.quantitiesByLine())
      return saved
```

(ใช้ `order.removeLine(lineId)`, `order.setQuantity(productId, quantity)` หรือ `order.removeItem(productId)` ตามแต่ละคลาส)

ใน `CancelOrderUseCase.execute`:

```ts
      const saved = await this.orders.save(order.cancel(reason, actor.user.id))
      await this.kitchen.reconcile(saved.id, new Map())
      return saved
```

- [ ] **Step 6: ตอบ `note` และ `sentQuantity` ใน API**

ใน `adapters/controllers/schemas/order.schema.ts` ในโครง `item` เพิ่ม:

```ts
  // A note for the kitchen on this line, when there is one.
  note: t.Nullable(t.String()),
  // Units of this line already sent to the kitchen and not taken back.
  sentQuantity: t.Integer(),
```

ใน `order.controller.ts` เพิ่มการอ่านจำนวนที่ส่งแล้ว:

```ts
import { lineIdentity } from '../../../../domains/order.domain'
import { kitchenTicketsToken } from '../../applications/ports/kitchen-tickets.port'
import type { IKitchenTickets } from '../../applications/ports/kitchen-tickets.port'
```

เปลี่ยนฟังก์ชัน `toResponse` ให้รับจำนวนที่ส่งแล้วของออเดอร์นั้น:

```ts
function toResponse(order: OrderEntity, sent: ReadonlyMap<string, number>): OrderResponse {
  const { items, ...header } = order.toSnapshot()
  return {
    ...header,
    items: items.map((item) => ({
      ...item,
      // The cost of an option is internal, like the cost of a sale line.
      options: item.options.map(({ costSatang: _cost, ...option }) => option),
      lineTotalSatang: item.unitPriceSatang * item.quantity,
      sentQuantity: sent.get(lineIdentity(item.productId, item.options)) ?? 0,
    })),
    itemCount: order.itemCount,
    subtotalSatang: order.subtotalSatang,
  }
}
```

ใน constructor ของ `OrderElysiaController` เพิ่ม `@inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets` และเพิ่มสองเมธอดช่วยในคลาส:

```ts
  /** Answers with one order, including what the kitchen has of each line. */
  private async one(order: OrderEntity): Promise<OrderResponse> {
    return (await this.many([order]))[0]!
  }

  /** Answers with several orders, asking the kitchen once for all of them. */
  private async many(orders: OrderEntity[]): Promise<OrderResponse[]> {
    const sent = await this.kitchen.sentByLine(orders.map((order) => order.id))
    return orders.map((order) => toResponse(order, sent.get(order.id) ?? new Map()))
  }
```

แทนทุกจุดในคลาส controller ที่เรียก `toResponse(await ...)` ด้วย `await this.one(await ...)` และในการ list ใช้ `items: await this.many(items)` แล้วคืน `{ items, total }` ตามเดิม ตัวอย่าง:

```ts
        async ({ params, branch }) => this.one(await this.getOrder.execute(params.id, (await branch()).id)),
```

สำหรับ `pay` (ตอบเป็นขายไม่ใช่ออเดอร์) ไม่ต้องเปลี่ยน

- [ ] **Step 7: ต่อ DI**

ใน `orders.module.ts` ไม่ต้องลงทะเบียน token ใหม่ที่นี่ (โมดูล kitchen ลงทะเบียน `kitchenTicketsToken` ใน Task 11) แต่ให้ตรวจว่า `OrderElysiaController` ยัง resolve ได้หลัง Task 11

- [ ] **Step 8: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/orders/applications/usecases/orders.usecases.test.ts`
Expected: PASS

Run: `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/orders apps/api/src/__tests__/mocks.ts
gitcz --non-interactive --type=feat --scope=orders --subject="take back what the kitchen has when an order line drops" --body="Lowering or removing a line after it went to the kitchen cancels the difference on the ticket. Cancelling the order cancels everything. Responses show what is already with the kitchen."
```

---

### Task 9: รวมและแยกบิลกับใบสั่งครัว

**Files:**
- Modify: `apps/api/src/modules/orders/applications/usecases/merge-orders.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/split-order.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/orders.usecases.test.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts` (ไม่มีการเปลี่ยน token แต่ต้องรับ `kitchen`)

**Interfaces:**
- Consumes: `IKitchenTickets` (Task 8)
- Produces: รหัสข้อผิดพลาด `ORDER_KITCHEN_PENDING` (409), `ORDER_SPLIT_SENT` (409)

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

เพิ่มในไฟล์ `orders.usecases.test.ts`:

```ts
describe('รวมและแยกบิลกับใบสั่งครัว', () => {
  test('รวมบิลไม่ได้ถ้าปลายทางหรือต้นทางมีใบที่ยังไม่เสร็จ', async () => {
    orders.findByIdForUpdate.mockImplementation(async (id) => makeOrder({ id, items: [] }))
    kitchen.hasPending.mockImplementation(async (id) => id === 2)

    await expect(new MergeOrdersUseCase(orders, unitOfWork, kitchen).execute(1, { sourceOrderId: 2 }, 1)).rejects.toMatchObject({
      code: 'ORDER_KITCHEN_PENDING',
    })
    expect(kitchen.moveTickets).not.toHaveBeenCalled()
  })

  test('รวมบิลย้ายใบของต้นทางไปปลายทาง', async () => {
    orders.findByIdForUpdate.mockImplementation(async (id) => makeOrder({ id, items: [] }))

    await new MergeOrdersUseCase(orders, unitOfWork, kitchen).execute(1, { sourceOrderId: 2 }, 1)

    expect(kitchen.moveTickets).toHaveBeenCalledWith(2, 1)
  })

  test('แยกบิลไม่ได้ถ้าออเดอร์มีใบที่ยังไม่เสร็จ', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, items: [{ lineId: 5, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [], note: null }, { lineId: 6, productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700, quantity: 1, options: [], note: null }] }))
    kitchen.hasPending.mockResolvedValue(true)

    await expect(new SplitOrderUseCase(orders, unitOfWork, kitchen).execute(1, { lines: [{ lineId: 6, quantity: 1 }] }, actor)).rejects.toMatchObject({
      code: 'ORDER_KITCHEN_PENDING',
    })
  })

  test('แยกบิลไม่ได้ถ้ารายการที่เลือกเคยส่งครัวแล้ว', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, items: [{ lineId: 5, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [], note: null }, { lineId: 6, productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700, quantity: 1, options: [], note: null }] }))
    kitchen.sentByLine.mockResolvedValue(new Map([[1, new Map([[identityOf(1, ''), 1]])]]))

    await expect(new SplitOrderUseCase(orders, unitOfWork, kitchen).execute(1, { lines: [{ lineId: 5, quantity: 1 }] }, actor)).rejects.toMatchObject({
      code: 'ORDER_SPLIT_SENT',
    })
    expect(orders.create).not.toHaveBeenCalled()
  })

  test('แยกบิลได้เมื่อรายการที่เลือกยังไม่เคยส่งครัว', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, items: [{ lineId: 5, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [], note: null }, { lineId: 6, productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700, quantity: 1, options: [], note: null }] }))

    await new SplitOrderUseCase(orders, unitOfWork, kitchen).execute(1, { lines: [{ lineId: 6, quantity: 1 }] }, actor)

    expect(orders.create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/orders/applications/usecases/orders.usecases.test.ts`
Expected: FAIL

- [ ] **Step 3: แก้ `merge-orders.usecase.ts`**

เพิ่ม `@inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets` ท้ายคอนสตรักเตอร์ และ import `DomainConflictError` จาก `../../../../domains/errors/domain-conflict.error`

ใน `unitOfWork.run` หลังล็อกทั้งสองออเดอร์:

```ts
      if ((await this.kitchen.hasPending(first)) || (await this.kitchen.hasPending(second)))
        throw new DomainConflictError('ยังมีใบสั่งครัวที่ยังไม่เสร็จ รวมบิลไม่ได้', 'ORDER_KITCHEN_PENDING')

      const merged = destination.absorb(source)
      await this.orders.save(source.markMerged(destination.id))
      await this.kitchen.moveTickets(source.id, destination.id)
      return this.orders.save(merged)
```

- [ ] **Step 4: แก้ `split-order.usecase.ts`**

เพิ่ม `kitchen` และ import `lineIdentity` จาก `../../../../domains/order.domain`, `DomainConflictError`

แทนเนื้อของ `unitOfWork.run` ตอนต้น:

```ts
      const order = inBranch(await this.orders.findByIdForUpdate(id), actor.branch.id)
      if (await this.kitchen.hasPending(order.id))
        throw new DomainConflictError('ยังมีใบสั่งครัวที่ยังไม่เสร็จ แยกบิลไม่ได้', 'ORDER_KITCHEN_PENDING')

      const sent = (await this.kitchen.sentByLine([order.id])).get(order.id) ?? new Map<string, number>()
      for (const pick of dto.lines) {
        const picked = order.items.find((item) => item.lineId === pick.lineId)
        if (picked && (sent.get(lineIdentity(picked.productId, picked.options)) ?? 0) > 0)
          throw new DomainConflictError('รายการที่ส่งครัวแล้วแยกไม่ได้', 'ORDER_SPLIT_SENT')
      }

      const { remaining, created } = order.splitOff(dto.lines, actor.user, dto.label ?? null)
      await this.orders.save(remaining)
      return this.orders.create(created)
```

- [ ] **Step 5: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/orders`
Expected: PASS

Run: `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/orders
gitcz --non-interactive --type=feat --scope=orders --subject="guard merge and split against open kitchen tickets" --body="Merging moves the source tickets to the destination. Splitting is refused while tickets are pending or when the chosen lines were already sent, so the kitchen never sees a line twice."
```

---

### Task 10: หมายเหตุต่อบรรทัด (แก้ได้ก่อนส่งครัว)

**Files:**
- Create: `apps/api/src/modules/orders/applications/usecases/set-order-line-note.usecase.ts`
- Create: `apps/api/src/modules/orders/applications/usecases/set-order-line-note.usecase.test.ts`
- Modify: `apps/api/src/modules/orders/applications/schemas/order-schemas.ts`
- Modify: `apps/api/src/modules/orders/adapters/controllers/schemas/order.schema.ts`
- Modify: `apps/api/src/modules/orders/adapters/controllers/order.controller.ts`
- Modify: `apps/api/src/modules/orders/adapters/repository/order.drizzle.repository.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`

**Interfaces:**
- Produces: `SetOrderLineNoteUseCase.execute(id: number, lineId: number, input: unknown, branchId: number): Promise<OrderEntity>` (Command)
- Produces: `PATCH /orders/:id/lines/:lineId/note` รับ `{ note: string | null }`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

`set-order-line-note.usecase.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeOrder } from '../../../../__tests__/factories'
import { mockKitchenTickets, mockOrderRepository, mockUnitOfWork } from '../../../../__tests__/mocks'
import { identityOf } from '../../../../domains/order.domain'
import { SetOrderLineNoteUseCase } from './set-order-line-note.usecase'

let orders: ReturnType<typeof mockOrderRepository>
let kitchen: ReturnType<typeof mockKitchenTickets>

const item = { lineId: 5, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [], note: null }

beforeEach(() => {
  orders = mockOrderRepository()
  kitchen = mockKitchenTickets()
  orders.save.mockImplementation(async (order) => order)
  orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, branchId: 1, items: [item] }))
})

const useCase = () => new SetOrderLineNoteUseCase(orders, mockUnitOfWork(), kitchen)

describe('SetOrderLineNoteUseCase', () => {
  test('เขียนหมายเหตุของบรรทัดที่ยังไม่เคยส่งครัว', async () => {
    const saved = await useCase().execute(1, 5, { note: '  ไม่ใส่น้ำแข็ง ' }, 1)

    expect(saved.items[0]!.note).toBe('ไม่ใส่น้ำแข็ง')
  })

  test('บรรทัดที่ส่งครัวแล้วแก้หมายเหตุไม่ได้', async () => {
    kitchen.sentByLine.mockResolvedValue(new Map([[1, new Map([[identityOf(1, ''), 1]])]]))

    await expect(useCase().execute(1, 5, { note: 'หวาน' }, 1)).rejects.toMatchObject({ code: 'KITCHEN_LINE_SENT' })
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('บรรทัดที่ส่งแล้วแต่ถูกยกเลิกหมดแก้หมายเหตุได้', async () => {
    kitchen.sentByLine.mockResolvedValue(new Map([[1, new Map([[identityOf(1, ''), 0]])]]))

    const saved = await useCase().execute(1, 5, { note: 'หวาน' }, 1)

    expect(saved.items[0]!.note).toBe('หวาน')
  })

  test('ออเดอร์ของสาขาอื่นตอบว่าไม่พบ', async () => {
    await expect(useCase().execute(1, 5, { note: 'หวาน' }, 2)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/orders/applications/usecases/set-order-line-note.usecase.test.ts`
Expected: FAIL

- [ ] **Step 3: เพิ่ม schema และ use case**

ใน `applications/schemas/order-schemas.ts` เพิ่ม:

```ts
// The domain trims the note and refuses more than 200 characters after trimming.
export const setOrderLineNoteSchema = z.object({ note: z.string().max(500).nullable() })
```

`applications/usecases/set-order-line-note.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { lineIdentity } from '../../../../domains/order.domain'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketsToken } from '../ports/kitchen-tickets.port'
import type { IKitchenTickets } from '../ports/kitchen-tickets.port'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { setOrderLineNoteSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/** Command: writes or clears the note of one line. A line the kitchen has is frozen, so the screen matches what was sent. */
@injectable()
export class SetOrderLineNoteUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
  ) {}

  async execute(id: number, lineId: number, input: unknown, branchId: number) {
    const { note } = setOrderLineNoteSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const line = order.items.find((item) => item.lineId === lineId)
      if (line) {
        const sent = (await this.kitchen.sentByLine([id])).get(id)?.get(lineIdentity(line.productId, line.options)) ?? 0
        if (sent > 0) throw new DomainConflictError('รายการนี้ส่งครัวแล้ว แก้หมายเหตุไม่ได้', 'KITCHEN_LINE_SENT')
      }
      return this.orders.save(order.setLineNote(lineId, note))
    })
  }
}
```

- [ ] **Step 4: เก็บหมายเหตุใน repository**

ใน `order.drizzle.repository.ts`:
- ใน `itemColumns` เพิ่ม `note: orderItems.note,`
- ใน `save()` แก้ `.set({ quantity: item.quantity })` เป็น `.set({ quantity: item.quantity, note: item.note })`
- `writeItems` ใช้ spread ของ `item` จึงเขียน `note` อยู่แล้ว ตรวจให้แน่ใจว่าไม่ได้คัดกรองออก

- [ ] **Step 5: route และ schema ของ HTTP**

ใน `order.schema.ts` เพิ่มใน `orderSchemas`:

```ts
  lineNote: t.Object({ note: t.Nullable(t.String({ maxLength: 500 })) }),
```

ใน `order.controller.ts`:
- inject `SetOrderLineNoteUseCase` ใน constructor
- เพิ่ม route วางหลัง `.delete('/:id/lines/:lineId')`:

```ts
      .patch(
        '/:id/lines/:lineId/note',
        async ({ params, body, branch }) =>
          this.one(await this.setLineNote.execute(params.id, params.lineId, body, (await branch()).id)),
        {
          params: orderSchemas.lineParams,
          body: orderSchemas.lineNote,
          response: orderSchemas.order,
          detail: { summary: 'หมายเหตุของบรรทัด (แก้ได้ก่อนส่งครัว)' },
        },
      )
```

ใน `orders.module.ts` เพิ่ม `container.registerSingleton(SetOrderLineNoteUseCase)` และ import ที่เกี่ยวข้อง

- [ ] **Step 6: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/orders`
Expected: PASS

Run: `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/orders
gitcz --non-interactive --type=feat --scope=orders --subject="let the till write a note on a line before it is sent" --body="A line the kitchen already has keeps its note, so the kitchen screen always matches what was sent."
```

---

### Task 11: ส่งครัว: use case, repository และ adapter ของพอร์ตออเดอร์

**Files:**
- Create: `apps/api/src/modules/kitchen/applications/ports/kitchen-ticket.repository.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/send-order-to-kitchen.usecase.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/send-order-to-kitchen.usecase.test.ts`
- Create: `apps/api/src/modules/kitchen/adapters/repository/kitchen-ticket.drizzle.repository.ts`
- Create: `apps/api/src/modules/kitchen/adapters/repository/kitchen-tickets.drizzle.adapter.ts`
- Modify: `apps/api/src/modules/kitchen/kitchen.module.ts`
- Modify: `apps/api/src/__tests__/mocks.ts`

**Interfaces:**
- Consumes: `IOrderRepository`, `IProductRepository.findById(id, branchId)`, `IKitchenRoutingRepository`, `IKitchenTickets` จากโมดูลออเดอร์
- Produces:
  - `IKitchenTicketRepository`:
    - `nextRoundNo(orderId: number, stationId: number): Promise<number>`
    - `create(ticket: NewKitchenTicket): Promise<KitchenTicketEntity>`
    - `findByIdForUpdate(id: number, branchId: number): Promise<KitchenTicketEntity | null>`
    - `save(ticket: KitchenTicketEntity): Promise<KitchenTicketEntity>`
    - `findPending(query: { branchId: number; stationId: number; limit?: number; offset?: number }): Promise<Page<KitchenTicketEntity>>`
  - `kitchenTicketRepositoryToken`
  - `SendOrderToKitchenUseCase.execute(orderId: number, actor: { userId: number; branchId: number }): Promise<KitchenTicketEntity[]>` (Command)
  - `DrizzleKitchenTickets implements IKitchenTickets` (adapter ของพอร์ตในโมดูลออเดอร์)

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

`send-order-to-kitchen.usecase.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeOrder, makeProduct } from '../../../../__tests__/factories'
import {
  mockKitchenRoutingRepository,
  mockKitchenTicketRepository,
  mockKitchenTickets,
  mockOrderRepository,
  mockProductRepository,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { identityOf } from '../../../../domains/order.domain'
import { SendOrderToKitchenUseCase } from './send-order-to-kitchen.usecase'

let orders: ReturnType<typeof mockOrderRepository>
let products: ReturnType<typeof mockProductRepository>
let routing: ReturnType<typeof mockKitchenRoutingRepository>
let tickets: ReturnType<typeof mockKitchenTicketRepository>
let kitchen: ReturnType<typeof mockKitchenTickets>

const food = makeProduct({ id: 1, categoryId: 10 })
const drink = makeProduct({ id: 2, categoryId: 20 })
const loose = makeProduct({ id: 3, categoryId: null })
const item = (productId: number, quantity: number, lineId = productId) => ({
  lineId,
  productId,
  productName: `สินค้า ${productId}`,
  sku: `SKU-${productId}`,
  unitPriceSatang: 1000,
  quantity,
  options: [],
  note: null,
})

const actor = { userId: 3, branchId: 1 }

beforeEach(() => {
  orders = mockOrderRepository()
  products = mockProductRepository()
  routing = mockKitchenRoutingRepository()
  tickets = mockKitchenTicketRepository()
  kitchen = mockKitchenTickets()
  products.findById.mockImplementation(async (id) => [food, drink, loose].find((product) => product.id === id) ?? null)
  routing.stationsByCategory.mockResolvedValue(new Map([[10, 100], [20, 200]]))
  tickets.nextRoundNo.mockResolvedValue(1)
  tickets.create.mockImplementation(async (input) => ({ ...input, id: 1 }) as never)
  orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 7, branchId: 1, items: [item(1, 2), item(2, 1), item(3, 1)] }))
})

const useCase = () => new SendOrderToKitchenUseCase(orders, products, routing, tickets, kitchen, mockUnitOfWork())

describe('SendOrderToKitchenUseCase', () => {
  test('แยกใบหนึ่งใบต่อสถานีต่อรอบ และข้ามสินค้าที่หมวดไม่ได้ผูกสถานี', async () => {
    await useCase().execute(7, actor)

    expect(tickets.create).toHaveBeenCalledTimes(2)
    const sentToStations = tickets.create.mock.calls.map(([ticket]) => [ticket.stationId, ticket.lines.map((line) => line.productId)])
    expect(sentToStations).toEqual([
      [100, [1]],
      [200, [2]],
    ])
  })

  test('ส่งเฉพาะจำนวนที่ยังไม่เคยส่ง', async () => {
    kitchen.sentByLine.mockResolvedValue(new Map([[7, new Map([[identityOf(1, ''), 1]])]]))

    await useCase().execute(7, actor)

    const food100 = tickets.create.mock.calls.find(([ticket]) => ticket.stationId === 100)![0]
    expect(food100.lines[0]!.quantity).toBe(1)
  })

  test('หมายเลขรอบต่อสถานีมาจาก repository ภายใต้ล็อกของออเดอร์', async () => {
    tickets.nextRoundNo.mockResolvedValue(3)

    await useCase().execute(7, actor)

    expect(tickets.nextRoundNo).toHaveBeenCalledWith(7, 100)
    expect(tickets.create.mock.calls[0]![0].roundNo).toBe(3)
  })

  test('ไม่มีอะไรให้ส่งเป็นข้อผิดพลาด และไม่เขียนใบ', async () => {
    kitchen.sentByLine.mockResolvedValue(
      new Map([[7, new Map([[identityOf(1, ''), 2], [identityOf(2, ''), 1]])]]),
    )

    await expect(useCase().execute(7, actor)).rejects.toMatchObject({ code: 'KITCHEN_NOTHING_TO_SEND' })
    expect(tickets.create).not.toHaveBeenCalled()
  })

  test('ออเดอร์ที่ชำระแล้วส่งครัวไม่ได้', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 7, branchId: 1, status: 'paid', saleId: 9, items: [item(1, 1)] }))

    await expect(useCase().execute(7, actor)).rejects.toMatchObject({ code: 'ORDER_NOT_OPEN' })
  })

  test('ออเดอร์ของสาขาอื่นตอบว่าไม่พบ และไม่ส่งครัว', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 7, branchId: 2, items: [item(1, 1)] }))

    await expect(useCase().execute(7, actor)).rejects.toBeInstanceOf(DomainNotFoundError)
    expect(tickets.create).not.toHaveBeenCalled()
  })

  test('ไม่ใช้พอร์ตสต็อกเลย: การส่งครัวไม่ตัดสต็อก', () => {
    // The constructor takes no stock port. A missing dependency would fail at compile time.
    expect(SendOrderToKitchenUseCase.length).toBe(6)
  })

  test('ข้อผิดพลาดของการส่งเป็น DomainError ที่มีรหัส', async () => {
    kitchen.sentByLine.mockResolvedValue(new Map([[7, new Map([[identityOf(1, ''), 2], [identityOf(2, ''), 1]])]]))

    const error = await useCase().execute(7, actor).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DomainError)
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen/applications/usecases/send-order-to-kitchen.usecase.test.ts`
Expected: FAIL

- [ ] **Step 3: เพิ่ม mock และพอร์ต**

ใน `__tests__/mocks.ts`:

```ts
import type { IKitchenTicketRepository } from '../modules/kitchen/applications/ports/kitchen-ticket.repository'

export const mockKitchenTicketRepository = (): Mocked<IKitchenTicketRepository> => ({
  nextRoundNo: mock<IKitchenTicketRepository['nextRoundNo']>(async () => 1),
  create: mock<IKitchenTicketRepository['create']>(),
  findByIdForUpdate: mock<IKitchenTicketRepository['findByIdForUpdate']>(),
  save: mock<IKitchenTicketRepository['save']>(),
  findPending: mock<IKitchenTicketRepository['findPending']>(),
})
```

`applications/ports/kitchen-ticket.repository.ts`:

```ts
import type { Page } from '../../../../domains/page'
import type { KitchenTicketEntity, NewKitchenTicket } from '../../../../domains/kitchen.domain'

export interface IFindPendingTicketsQuery {
  branchId: number
  stationId: number
  limit?: number
  offset?: number
}

export interface IKitchenTicketRepository {
  /** The round a new ticket of this order at this station gets: one more than the last. */
  nextRoundNo(orderId: number, stationId: number): Promise<number>
  /** Stores a ticket with its lines, as they were sent. */
  create(ticket: NewKitchenTicket): Promise<KitchenTicketEntity>
  /** Row-locks the ticket until the surrounding unit of work ends. Another branch's ticket is not found. */
  findByIdForUpdate(id: number, branchId: number): Promise<KitchenTicketEntity | null>
  /** Writes the status and who finished it. Lines are changed only through voiding. */
  save(ticket: KitchenTicketEntity): Promise<KitchenTicketEntity>
  /** One page of the pending tickets of one station, oldest first, with their lines. */
  findPending(query: IFindPendingTicketsQuery): Promise<Page<KitchenTicketEntity>>
}

const kitchenTicketRepositoryTokenSymbol: unique symbol = Symbol('IKitchenTicketRepository')
export const kitchenTicketRepositoryToken = kitchenTicketRepositoryTokenSymbol.toString()
```

- [ ] **Step 4: เขียน use case**

`applications/usecases/send-order-to-kitchen.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { KitchenTicketEntity, unsentQuantity, type NewKitchenLine } from '../../../../domains/kitchen.domain'
import { lineIdentity, lineKey } from '../../../../domains/order.domain'
import { orderRepositoryToken } from '../../../orders/applications/ports/order.repository'
import type { IOrderRepository } from '../../../orders/applications/ports/order.repository'
import { kitchenTicketsToken } from '../../../orders/applications/ports/kitchen-tickets.port'
import type { IKitchenTickets } from '../../../orders/applications/ports/kitchen-tickets.port'
import { inBranch } from '../../../orders/applications/services/order-access'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenRoutingRepositoryToken } from '../ports/kitchen-routing.repository'
import type { IKitchenRoutingRepository } from '../ports/kitchen-routing.repository'
import { kitchenTicketRepositoryToken } from '../ports/kitchen-ticket.repository'
import type { IKitchenTicketRepository } from '../ports/kitchen-ticket.repository'

/**
 * Command: sends the lines of an open order that have not gone to the kitchen yet, as one ticket per
 * station for this round. The order row is locked first, so two sends of the same order cannot both
 * count the same units. Stock is not touched: sending to the kitchen is not a sale.
 */
@injectable()
export class SendOrderToKitchenUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(kitchenRoutingRepositoryToken) private readonly routing: IKitchenRoutingRepository,
    @inject(kitchenTicketRepositoryToken) private readonly tickets: IKitchenTicketRepository,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(orderId: number, actor: { userId: number; branchId: number }): Promise<KitchenTicketEntity[]> {
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(orderId), actor.branchId)
      order.assertOpen()

      const sent = (await this.kitchen.sentByLine([order.id])).get(order.id) ?? new Map<string, number>()
      const stations = await this.routing.stationsByCategory()
      const byStation = new Map<number, NewKitchenLine[]>()

      for (const item of order.items) {
        const quantity = unsentQuantity(item.quantity, sent.get(lineIdentity(item.productId, item.options)) ?? 0)
        if (quantity === 0) continue
        const product = await this.products.findById(item.productId, actor.branchId)
        const stationId = product?.categoryId == null ? undefined : stations.get(product.categoryId)
        if (stationId === undefined) continue
        const lines = byStation.get(stationId) ?? []
        lines.push({
          productId: item.productId,
          productName: item.productName,
          optionsKey: lineKey(item.options),
          optionNames: item.options.map((option) => option.name),
          note: item.note,
          quantity,
        })
        byStation.set(stationId, lines)
      }

      if (byStation.size === 0)
        throw new DomainError('ไม่มีรายการที่ส่งครัวได้ (ยังไม่ได้ผูกหมวดกับสถานี หรือส่งไปหมดแล้ว)', 'KITCHEN_NOTHING_TO_SEND')

      const created: KitchenTicketEntity[] = []
      for (const [stationId, lines] of byStation) {
        const roundNo = await this.tickets.nextRoundNo(order.id, stationId)
        created.push(
          await this.tickets.create(
            KitchenTicketEntity.validateNew({
              branchId: actor.branchId,
              orderId: order.id,
              stationId,
              roundNo,
              sentById: actor.userId,
              lines,
            }),
          ),
        )
      }
      return created
    })
  }
}
```

หมายเหตุ: `order.assertOpen()` เป็นเมธอดสาธารณะของ `OrderEntity` อยู่แล้ว ตรวจให้แน่ใจว่ายังเป็น public

- [ ] **Step 5: เขียน repository ของใบสั่ง**

`adapters/repository/kitchen-ticket.drizzle.repository.ts`:

```ts
import { and, count, eq, inArray, max, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { KitchenTicketEntity, type KitchenLine, type NewKitchenTicket } from '../../../../domains/kitchen.domain'
import type { Page } from '../../../../domains/page'
import { kitchenTickets, kitchenTicketLines } from '../../../../infrastructure/database/schema/kitchen'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IFindPendingTicketsQuery, IKitchenTicketRepository } from '../../applications/ports/kitchen-ticket.repository'

type TicketRow = typeof kitchenTickets.$inferSelect
type LineRow = typeof kitchenTicketLines.$inferSelect

const toLine = (row: LineRow): KitchenLine => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  optionsKey: row.optionsKey,
  optionNames: row.optionNames,
  note: row.note,
  quantity: row.quantity,
  voidedQuantity: row.voidedQuantity,
})

const toEntity = (ticket: TicketRow, lines: LineRow[]) =>
  new KitchenTicketEntity({
    id: ticket.id,
    branchId: ticket.branchId,
    orderId: ticket.orderId,
    stationId: ticket.stationId,
    roundNo: ticket.roundNo,
    status: ticket.status,
    sentById: ticket.sentById,
    doneById: ticket.doneById,
    doneAt: ticket.doneAt,
    createdAt: ticket.createdAt,
    lines: lines.map(toLine),
  })

@injectable()
export class DrizzleKitchenTicketRepository implements IKitchenTicketRepository {
  async nextRoundNo(orderId: number, stationId: number) {
    const [row] = await currentExecutor()
      .select({ latest: max(kitchenTickets.roundNo) })
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.orderId, orderId), eq(kitchenTickets.stationId, stationId)))
    return (row?.latest ?? 0) + 1
  }

  async create(ticket: NewKitchenTicket) {
    const executor = currentExecutor()
    const [stored] = await executor
      .insert(kitchenTickets)
      .values({
        branchId: ticket.branchId,
        orderId: ticket.orderId,
        stationId: ticket.stationId,
        roundNo: ticket.roundNo,
        sentById: ticket.sentById,
      })
      .returning({ id: kitchenTickets.id })
    await executor.insert(kitchenTicketLines).values(
      ticket.lines.map((line) => ({
        ticketId: stored!.id,
        productId: line.productId,
        productName: line.productName,
        optionsKey: line.optionsKey,
        optionNames: [...line.optionNames],
        note: line.note,
        quantity: line.quantity,
      })),
    )
    return (await this.load(stored!.id, false, undefined))!
  }

  findByIdForUpdate(id: number, branchId: number) {
    return this.load(id, true, branchId)
  }

  async save(ticket: KitchenTicketEntity) {
    await currentExecutor()
      .update(kitchenTickets)
      .set({ status: ticket.status, doneById: ticket.doneById, doneAt: ticket.doneAt, updatedAt: new Date() })
      .where(eq(kitchenTickets.id, ticket.id))
    return (await this.load(ticket.id, false, undefined))!
  }

  async findPending(query: IFindPendingTicketsQuery): Promise<Page<KitchenTicketEntity>> {
    const matching = and(
      eq(kitchenTickets.branchId, query.branchId),
      eq(kitchenTickets.stationId, query.stationId),
      eq(kitchenTickets.status, 'pending'),
    )
    const headers = await currentExecutor()
      .select()
      .from(kitchenTickets)
      .where(matching)
      .orderBy(kitchenTickets.createdAt, kitchenTickets.id)
      .limit(query.limit ?? 100)
      .offset(query.offset ?? 0)
    const [counted] = await currentExecutor().select({ total: count() }).from(kitchenTickets).where(matching)

    const lines = headers.length
      ? await currentExecutor()
          .select()
          .from(kitchenTicketLines)
          .where(
            inArray(
              kitchenTicketLines.ticketId,
              headers.map((header) => header.id),
            ),
          )
          .orderBy(kitchenTicketLines.id)
      : []

    return {
      items: headers.map((header) => toEntity(header, lines.filter((line) => line.ticketId === header.id))),
      total: counted!.total,
    }
  }

  private async load(id: number, lock: boolean, branchId: number | undefined): Promise<KitchenTicketEntity | null> {
    const headerQuery = currentExecutor()
      .select()
      .from(kitchenTickets)
      .where(
        and(eq(kitchenTickets.id, id), branchId === undefined ? undefined : eq(kitchenTickets.branchId, branchId)),
      )
    const [header] = await (lock ? headerQuery.for('update') : headerQuery)
    if (!header) return null
    const lines = await currentExecutor()
      .select()
      .from(kitchenTicketLines)
      .where(eq(kitchenTicketLines.ticketId, id))
      .orderBy(kitchenTicketLines.id)
    return toEntity(header, lines)
  }
}
```

หมายเหตุ: `sql` ที่ import ไว้ใช้ในไฟล์ adapter ของพอร์ตออเดอร์ ถ้าไม่ได้ใช้ในไฟล์นี้ให้ลบออกเพื่อให้ lint ผ่าน

- [ ] **Step 6: เขียน adapter ของพอร์ตออเดอร์**

`adapters/repository/kitchen-tickets.drizzle.adapter.ts`:

```ts
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { identityOf } from '../../../../domains/order.domain'
import { planVoids } from '../../../../domains/kitchen.domain'
import { kitchenTickets, kitchenTicketLines } from '../../../../infrastructure/database/schema/kitchen'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenTickets } from '../../../orders/applications/ports/kitchen-tickets.port'

/** The orders module's view of the kitchen. It reads and writes only kitchen tables. */
@injectable()
export class DrizzleKitchenTickets implements IKitchenTickets {
  async sentByLine(orderIds: readonly number[]) {
    const result = new Map<number, Map<string, number>>()
    if (orderIds.length === 0) return result

    const rows = await currentExecutor()
      .select({
        orderId: kitchenTickets.orderId,
        productId: kitchenTicketLines.productId,
        optionsKey: kitchenTicketLines.optionsKey,
        net: sql<number>`coalesce(sum(${kitchenTicketLines.quantity} - ${kitchenTicketLines.voidedQuantity}), 0)`.mapWith(Number),
      })
      .from(kitchenTicketLines)
      .innerJoin(kitchenTickets, eq(kitchenTickets.id, kitchenTicketLines.ticketId))
      .where(inArray(kitchenTickets.orderId, [...orderIds]))
      .groupBy(kitchenTickets.orderId, kitchenTicketLines.productId, kitchenTicketLines.optionsKey)

    for (const row of rows) {
      const lines = result.get(row.orderId) ?? new Map<string, number>()
      lines.set(identityOf(row.productId, row.optionsKey), row.net)
      result.set(row.orderId, lines)
    }
    return result
  }

  async hasPending(orderId: number) {
    const [row] = await currentExecutor()
      .select({ pending: sql<number>`count(*)`.mapWith(Number) })
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.orderId, orderId), eq(kitchenTickets.status, 'pending')))
    return (row?.pending ?? 0) > 0
  }

  async reconcile(orderId: number, quantities: ReadonlyMap<string, number>) {
    const lines = await currentExecutor()
      .select({
        id: kitchenTicketLines.id,
        ticketId: kitchenTicketLines.ticketId,
        productId: kitchenTicketLines.productId,
        optionsKey: kitchenTicketLines.optionsKey,
        quantity: kitchenTicketLines.quantity,
        voidedQuantity: kitchenTicketLines.voidedQuantity,
      })
      .from(kitchenTicketLines)
      .innerJoin(kitchenTickets, eq(kitchenTickets.id, kitchenTicketLines.ticketId))
      .where(and(eq(kitchenTickets.orderId, orderId), sql`${kitchenTicketLines.quantity} > ${kitchenTicketLines.voidedQuantity}`))
      .orderBy(desc(kitchenTicketLines.ticketId), desc(kitchenTicketLines.id))

    const byIdentity = new Map<string, typeof lines>()
    for (const line of lines) {
      const key = identityOf(line.productId, line.optionsKey)
      byIdentity.set(key, [...(byIdentity.get(key) ?? []), line])
    }

    for (const [key, group] of byIdentity) {
      for (const step of planVoids(group, quantities.get(key) ?? 0))
        await currentExecutor()
          .update(kitchenTicketLines)
          .set({ voidedQuantity: sql`${kitchenTicketLines.voidedQuantity} + ${step.take}` })
          .where(eq(kitchenTicketLines.id, step.lineId))
    }
  }

  async moveTickets(fromOrderId: number, toOrderId: number) {
    const moving = await currentExecutor()
      .select()
      .from(kitchenTickets)
      .where(eq(kitchenTickets.orderId, fromOrderId))
      .orderBy(kitchenTickets.id)

    // Each moved ticket takes the next free round of its station in the destination, so no round number repeats.
    for (const ticket of moving) {
      const [latest] = await currentExecutor()
        .select({ latest: max(kitchenTickets.roundNo) })
        .from(kitchenTickets)
        .where(and(eq(kitchenTickets.orderId, toOrderId), eq(kitchenTickets.stationId, ticket.stationId)))
      await currentExecutor()
        .update(kitchenTickets)
        .set({ orderId: toOrderId, roundNo: (latest?.latest ?? 0) + 1 })
        .where(eq(kitchenTickets.id, ticket.id))
    }
  }
}
```

- [ ] **Step 7: ลงทะเบียนใน kitchen.module.ts**

```ts
import { DrizzleKitchenTicketRepository } from './adapters/repository/kitchen-ticket.drizzle.repository'
import { DrizzleKitchenTickets } from './adapters/repository/kitchen-tickets.drizzle.adapter'
import { kitchenTicketRepositoryToken } from './applications/ports/kitchen-ticket.repository'
import { SendOrderToKitchenUseCase } from './applications/usecases/send-order-to-kitchen.usecase'
import { kitchenTicketsToken } from '../orders/applications/ports/kitchen-tickets.port'

container.register(kitchenTicketRepositoryToken, { useClass: DrizzleKitchenTicketRepository })
container.register(kitchenTicketsToken, { useClass: DrizzleKitchenTickets })
container.registerSingleton(SendOrderToKitchenUseCase)
```

- [ ] **Step 8: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen src/modules/orders`
Expected: PASS

Run: `bun run typecheck`
Expected: ผ่าน

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/kitchen apps/api/src/__tests__/mocks.ts
gitcz --non-interactive --type=feat --scope=kitchen --subject="send unsent order lines to the kitchen by station" --body="Each send takes the order lock, counts only what the kitchen does not have yet, and writes one ticket per station for the round. Stock is not touched."
```

---

### Task 12: จอครัว: รายการใบค้าง, ทำเสร็จ, ตัวนำทางข้ามพอร์ต

**Files:**
- Create: `apps/api/src/modules/kitchen/applications/ports/kitchen-order-refs.port.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/list-kitchen-tickets.usecase.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/mark-kitchen-ticket-done.usecase.ts`
- Create: `apps/api/src/modules/kitchen/applications/usecases/kitchen-tickets.usecases.test.ts`
- Create: `apps/api/src/modules/kitchen/adapters/controllers/kitchen-ticket.presenter.ts`
- Create: `apps/api/src/modules/kitchen/adapters/controllers/kitchen-ticket.controller.ts`
- Modify: `apps/api/src/modules/kitchen/adapters/controllers/schemas/kitchen.schema.ts`
- Create: `apps/api/src/modules/orders/adapters/repository/kitchen-order-refs.drizzle.adapter.ts`
- Modify: `apps/api/src/modules/kitchen/kitchen.module.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`
- Modify: `apps/api/src/modules/app.module.ts`
- Modify: `apps/api/src/__tests__/mocks.ts`

**Interfaces:**
- Produces:
  - `IKitchenOrderRefs { refsOf(orderIds: readonly number[]): Promise<Map<number, { label: string | null; tableId: number | null }>> }` และ `kitchenOrderRefsToken`
  - `ListKitchenTicketsUseCase.execute(input: unknown, branchId: number): Promise<Page<KitchenBoardTicket>>` (Query) โดย `KitchenBoardTicket = { ticket: KitchenTicketEntity; orderLabel: string | null; tableName: string | null }`
  - `MarkKitchenTicketDoneUseCase.execute(id: number, actor: { userId: number; branchId: number }): Promise<KitchenTicketEntity>` (Command)
  - Routes: `GET /kitchen/tickets?stationId&limit&offset`, `POST /kitchen/tickets/:id/done`, `POST /orders/:id/kitchen-send`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

`kitchen-tickets.usecases.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeTable } from '../../../../__tests__/factories'
import {
  mockClock,
  mockKitchenOrderRefs,
  mockKitchenTicketRepository,
  mockTableRepository,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { KitchenTicketEntity } from '../../../../domains/kitchen.domain'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ListKitchenTicketsUseCase } from './list-kitchen-tickets.usecase'
import { MarkKitchenTicketDoneUseCase } from './mark-kitchen-ticket-done.usecase'

const at = new Date('2026-10-15T10:00:00Z')
const pendingTicket = () =>
  new KitchenTicketEntity({
    id: 4,
    branchId: 1,
    orderId: 7,
    stationId: 2,
    roundNo: 1,
    status: 'pending',
    sentById: 3,
    doneById: null,
    doneAt: null,
    createdAt: at,
    lines: [{ id: 1, productId: 10, productName: 'ชาเย็น', optionsKey: '', optionNames: [], note: null, quantity: 2, voidedQuantity: 0 }],
  })

let tickets: ReturnType<typeof mockKitchenTicketRepository>
let refs: ReturnType<typeof mockKitchenOrderRefs>
let tables: ReturnType<typeof mockTableRepository>

beforeEach(() => {
  tickets = mockKitchenTicketRepository()
  refs = mockKitchenOrderRefs()
  tables = mockTableRepository()
  tickets.findPending.mockResolvedValue({ items: [pendingTicket()], total: 1 })
  refs.refsOf.mockResolvedValue(new Map([[7, { label: null, tableId: 3 }]]))
  tables.findAll.mockResolvedValue([makeTable({ id: 3, name: 'T3', branchId: 1 })])
})

describe('ListKitchenTicketsUseCase', () => {
  test('ใบค้างของสถานีพร้อมชื่อโต๊ะปัจจุบันของออเดอร์', async () => {
    const page = await new ListKitchenTicketsUseCase(tickets, refs, tables).execute({ stationId: 2 }, 1)

    expect(tickets.findPending).toHaveBeenCalledWith({ branchId: 1, stationId: 2 })
    expect(page.total).toBe(1)
    expect(page.items[0]!.tableName).toBe('T3')
    expect(page.items[0]!.orderLabel).toBeNull()
  })

  test('ออเดอร์ที่ไม่มีโต๊ะแสดงชื่อโต๊ะเป็นว่าง', async () => {
    refs.refsOf.mockResolvedValue(new Map([[7, { label: 'ซื้อกลับบ้าน', tableId: null }]]))

    const page = await new ListKitchenTicketsUseCase(tickets, refs, tables).execute({ stationId: 2 }, 1)

    expect(page.items[0]!.tableName).toBeNull()
    expect(page.items[0]!.orderLabel).toBe('ซื้อกลับบ้าน')
  })

  test('ขอสถานีที่ไม่ใช่ตัวเลขบวกถูกปฏิเสธก่อนอ่านฐานข้อมูล', async () => {
    await expect(new ListKitchenTicketsUseCase(tickets, refs, tables).execute({ stationId: 0 }, 1)).rejects.toThrow()
    expect(tickets.findPending).not.toHaveBeenCalled()
  })
})

describe('MarkKitchenTicketDoneUseCase', () => {
  test('ทำเสร็จบันทึกผู้ทำและเวลา', async () => {
    tickets.findByIdForUpdate.mockResolvedValue(pendingTicket())
    tickets.save.mockImplementation(async (ticket) => ticket)

    const done = await new MarkKitchenTicketDoneUseCase(tickets, mockUnitOfWork(), mockClock(at)).execute(4, { userId: 5, branchId: 1 })

    expect(done.status).toBe('done')
    expect(done.doneById).toBe(5)
    expect(done.doneAt).toEqual(at)
  })

  test('ใบของสาขาอื่นตอบว่าไม่พบ', async () => {
    tickets.findByIdForUpdate.mockResolvedValue(null)

    await expect(new MarkKitchenTicketDoneUseCase(tickets, mockUnitOfWork(), mockClock(at)).execute(4, { userId: 5, branchId: 2 })).rejects.toBeInstanceOf(DomainNotFoundError)
    expect(tickets.save).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: ยืนยันว่าล้มเหลว**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen/applications/usecases/kitchen-tickets.usecases.test.ts`
Expected: FAIL

- [ ] **Step 3: เพิ่ม mock และพอร์ต**

ใน `__tests__/mocks.ts`:

```ts
import type { IKitchenOrderRefs } from '../modules/kitchen/applications/ports/kitchen-order-refs.port'

export const mockKitchenOrderRefs = (): Mocked<IKitchenOrderRefs> => ({
  refsOf: mock<IKitchenOrderRefs['refsOf']>(async () => new Map()),
})
```

`applications/ports/kitchen-order-refs.port.ts`:

```ts
/**
 * What the board shows about an order: its label and the table it is on now. Owned by the kitchen,
 * answered by the orders module from its own data, so the kitchen never reads the orders table itself.
 */
export interface IKitchenOrderRefs {
  refsOf(orderIds: readonly number[]): Promise<Map<number, { label: string | null; tableId: number | null }>>
}

const kitchenOrderRefsTokenSymbol: unique symbol = Symbol('IKitchenOrderRefs')
export const kitchenOrderRefsToken = kitchenOrderRefsTokenSymbol.toString()
```

- [ ] **Step 4: เขียน use case**

`applications/usecases/list-kitchen-tickets.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import type { KitchenTicketEntity } from '../../../../domains/kitchen.domain'
import type { Page } from '../../../../domains/page'
import { tableRepositoryToken } from '../../../tables/applications/ports/table.repository'
import type { ITableRepository } from '../../../tables/applications/ports/table.repository'
import { kitchenOrderRefsToken } from '../ports/kitchen-order-refs.port'
import type { IKitchenOrderRefs } from '../ports/kitchen-order-refs.port'
import { kitchenTicketRepositoryToken } from '../ports/kitchen-ticket.repository'
import type { IKitchenTicketRepository } from '../ports/kitchen-ticket.repository'
import { kitchenBoardQuerySchema } from '../schemas/kitchen-schemas'

export interface KitchenBoardTicket {
  ticket: KitchenTicketEntity
  orderLabel: string | null
  /** The table the order is on now, which may differ from the table when the ticket was sent. */
  tableName: string | null
}

/** Query: the open tickets of one station, with where they belong. */
@injectable()
export class ListKitchenTicketsUseCase {
  constructor(
    @inject(kitchenTicketRepositoryToken) private readonly tickets: IKitchenTicketRepository,
    @inject(kitchenOrderRefsToken) private readonly refs: IKitchenOrderRefs,
    @inject(tableRepositoryToken) private readonly tables: ITableRepository,
  ) {}

  async execute(input: unknown, branchId: number): Promise<Page<KitchenBoardTicket>> {
    const query = kitchenBoardQuerySchema.parse(input)
    const page = await this.tickets.findPending({ branchId, ...query })

    const refs = await this.refs.refsOf([...new Set(page.items.map((ticket) => ticket.orderId))])
    const tableNames = new Map((await this.tables.findAll(branchId)).map((table) => [table.id, table.name]))

    return {
      items: page.items.map((ticket) => {
        const ref = refs.get(ticket.orderId)
        return {
          ticket,
          orderLabel: ref?.label ?? null,
          tableName: ref?.tableId != null ? (tableNames.get(ref.tableId) ?? null) : null,
        }
      }),
      total: page.total,
    }
  }
}
```

`applications/usecases/mark-kitchen-ticket-done.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenTicketRepositoryToken } from '../ports/kitchen-ticket.repository'
import type { IKitchenTicketRepository } from '../ports/kitchen-ticket.repository'

/** Command: the kitchen marks a whole ticket as made. */
@injectable()
export class MarkKitchenTicketDoneUseCase {
  constructor(
    @inject(kitchenTicketRepositoryToken) private readonly tickets: IKitchenTicketRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(id: number, actor: { userId: number; branchId: number }) {
    return this.unitOfWork.run(async () => {
      const ticket = await this.tickets.findByIdForUpdate(id, actor.branchId)
      if (!ticket) throw new DomainNotFoundError('ไม่พบใบสั่งครัว', 'KITCHEN_TICKET_NOT_FOUND')
      return this.tickets.save(ticket.markDone({ id: actor.userId }, this.clock.now()))
    })
  }
}
```

- [ ] **Step 5: adapter ของ refs ในโมดูลออเดอร์**

`apps/api/src/modules/orders/adapters/repository/kitchen-order-refs.drizzle.adapter.ts`:

```ts
import { inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { orders } from '../../../../infrastructure/database/schema/orders'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenOrderRefs } from '../../../kitchen/applications/ports/kitchen-order-refs.port'

/** Answers the kitchen's question from the orders' own table. */
@injectable()
export class DrizzleKitchenOrderRefs implements IKitchenOrderRefs {
  async refsOf(orderIds: readonly number[]) {
    if (orderIds.length === 0) return new Map<number, { label: string | null; tableId: number | null }>()
    const rows = await currentExecutor()
      .select({ id: orders.id, label: orders.label, tableId: orders.tableId })
      .from(orders)
      .where(inArray(orders.id, [...orderIds]))
    return new Map(rows.map((row) => [row.id, { label: row.label, tableId: row.tableId }]))
  }
}
```

ใน `orders.module.ts` เพิ่ม:

```ts
import { DrizzleKitchenOrderRefs } from './adapters/repository/kitchen-order-refs.drizzle.adapter'
import { kitchenOrderRefsToken } from '../kitchen/applications/ports/kitchen-order-refs.port'

container.register(kitchenOrderRefsToken, { useClass: DrizzleKitchenOrderRefs })
```

- [ ] **Step 6: presenter, schema และ controller**

`adapters/controllers/schemas/kitchen.schema.ts` เพิ่มใน `kitchenSchemas`:

```ts
  ticket: t.Object({
    id: t.Integer(),
    branchId: t.Integer(),
    orderId: t.Integer(),
    stationId: t.Integer(),
    roundNo: t.Integer(),
    status: t.Union([t.Literal('pending'), t.Literal('done')]),
    sentById: t.Integer(),
    doneById: t.Nullable(t.Integer()),
    doneAt: t.Nullable(t.Date()),
    createdAt: t.Date(),
    lines: t.Array(
      t.Object({
        id: t.Integer(),
        productId: t.Integer(),
        productName: t.String(),
        optionNames: t.Array(t.String()),
        note: t.Nullable(t.String()),
        quantity: t.Integer(),
        voidedQuantity: t.Integer(),
      }),
    ),
  }),
  boardTicket: t.Composite([
    t.Object({
      id: t.Integer(),
      branchId: t.Integer(),
      orderId: t.Integer(),
      stationId: t.Integer(),
      roundNo: t.Integer(),
      status: t.Union([t.Literal('pending'), t.Literal('done')]),
      sentById: t.Integer(),
      doneById: t.Nullable(t.Integer()),
      doneAt: t.Nullable(t.Date()),
      createdAt: t.Date(),
      lines: t.Array(
        t.Object({
          id: t.Integer(),
          productId: t.Integer(),
          productName: t.String(),
          optionNames: t.Array(t.String()),
          note: t.Nullable(t.String()),
          quantity: t.Integer(),
          voidedQuantity: t.Integer(),
        }),
      ),
    }),
    t.Object({ orderLabel: t.Nullable(t.String()), tableName: t.Nullable(t.String()) }),
  ]),
  boardQuery: t.Object({
    stationId: t.Numeric({ minimum: 1 }),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  ticketParams: t.Object({ id: t.Numeric({ minimum: 1 }) }),
```

`adapters/controllers/kitchen-ticket.presenter.ts`:

```ts
import type { KitchenTicketEntity } from '../../../../domains/kitchen.domain'
import type { KitchenBoardTicket } from '../../applications/usecases/list-kitchen-tickets.usecase'

export interface KitchenTicketResponse {
  id: number
  branchId: number
  orderId: number
  stationId: number
  roundNo: number
  status: 'pending' | 'done'
  sentById: number
  doneById: number | null
  doneAt: Date | null
  createdAt: Date
  lines: {
    id: number
    productId: number
    productName: string
    optionNames: string[]
    note: string | null
    quantity: number
    voidedQuantity: number
  }[]
}

/** A ticket as the API sends it: the option costs and the internal snapshot stay on the server. */
export const toTicketResponse = (ticket: KitchenTicketEntity): KitchenTicketResponse => {
  const { lines, ...header } = ticket.toSnapshot()
  return {
    ...header,
    lines: lines.map(({ optionsKey: _key, ...line }) => ({ ...line, optionNames: [...line.optionNames] })),
  }
}

export const toBoardTicketResponse = (board: KitchenBoardTicket) => ({
  ...toTicketResponse(board.ticket),
  orderLabel: board.orderLabel,
  tableName: board.tableName,
})
```

`adapters/controllers/kitchen-ticket.controller.ts`:

```ts
import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { SendOrderToKitchenUseCase } from '../../applications/usecases/send-order-to-kitchen.usecase'
import { ListKitchenTicketsUseCase } from '../../applications/usecases/list-kitchen-tickets.usecase'
import { MarkKitchenTicketDoneUseCase } from '../../applications/usecases/mark-kitchen-ticket-done.usecase'
import { kitchenSchemas } from './schemas/kitchen.schema'
import { toBoardTicketResponse, toTicketResponse } from './kitchen-ticket.presenter'

/** The kitchen board and the till's "send to kitchen". Every signed-in user works in the branch of the request. */
@injectable()
export class KitchenTicketElysiaController {
  constructor(
    @inject(ListKitchenTicketsUseCase) private readonly listTickets: ListKitchenTicketsUseCase,
    @inject(MarkKitchenTicketDoneUseCase) private readonly markDone: MarkKitchenTicketDoneUseCase,
    @inject(SendOrderToKitchenUseCase) private readonly sendToKitchen: SendOrderToKitchenUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'kitchen.tickets', detail: { tags: ['Kitchen'] } })
      .use(auth)
      .guard({ auth: true })
      .get(
        '/kitchen/tickets',
        async ({ query, branch }) => {
          const { items, total } = await this.listTickets.execute(query, (await branch()).id)
          return { items: items.map(toBoardTicketResponse), total }
        },
        {
          query: kitchenSchemas.boardQuery,
          response: page(kitchenSchemas.boardTicket),
          detail: { summary: 'ใบสั่งครัวที่ยังค้างของสถานี' },
        },
      )
      .post(
        '/kitchen/tickets/:id/done',
        async ({ params, user, branch }) =>
          toTicketResponse(await this.markDone.execute(params.id, { userId: user.id, branchId: (await branch()).id })),
        {
          params: idParams,
          response: kitchenSchemas.ticket,
          detail: { summary: 'ทำใบสั่งครัวเสร็จ' },
        },
      )
      .post(
        '/orders/:id/kitchen-send',
        async ({ params, user, branch }) => {
          const items = await this.sendToKitchen.execute(params.id, { userId: user.id, branchId: (await branch()).id })
          const responses = items.map(toTicketResponse)
          return { items: responses, total: responses.length }
        },
        {
          params: idParams,
          response: page(kitchenSchemas.ticket),
          detail: { summary: 'ส่งรายการที่ยังไม่เคยส่งของออเดอร์ไปครัว (หนึ่งใบต่อสถานี)' },
        },
      )
  }
}
```

- [ ] **Step 7: ลงทะเบียนและต่อ route**

ใน `kitchen.module.ts` เพิ่ม:

```ts
import { KitchenTicketElysiaController } from './adapters/controllers/kitchen-ticket.controller'
import { ListKitchenTicketsUseCase } from './applications/usecases/list-kitchen-tickets.usecase'
import { MarkKitchenTicketDoneUseCase } from './applications/usecases/mark-kitchen-ticket-done.usecase'
import { kitchenOrderRefsToken } from './applications/ports/kitchen-order-refs.port'

container.registerSingleton(ListKitchenTicketsUseCase)
container.registerSingleton(MarkKitchenTicketDoneUseCase)
container.registerSingleton(KitchenTicketElysiaController)
```

`kitchenOrderRefsToken` ลงทะเบียนในโมดูลออเดอร์แล้ว (Step 5) ไม่ต้องซ้ำ

`apps/api/src/modules/app.module.ts`:
- import `KitchenTicketElysiaController` และ `const kitchenTicketController = container.resolve(KitchenTicketElysiaController)`
- เพิ่ม `.use(kitchenTicketController.getRoutes())` หลัง `.use(orderController.getRoutes())`

- [ ] **Step 8: ยืนยันว่าผ่าน**

Run (จาก `apps/api`): `bun --env-file=.env.test test src/modules/kitchen src/modules/orders`
Expected: PASS

Run: `bun run typecheck`
Expected: ผ่าน

Run: `bun run test:unit`
Expected: ผ่านทั้งหมด จำนวนกรณีมากกว่า baseline จาก Task 1

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/kitchen apps/api/src/modules/orders apps/api/src/modules/app.module.ts apps/api/src/__tests__/mocks.ts
gitcz --non-interactive --type=feat --scope=kitchen --subject="show pending tickets and let the kitchen mark them done" --body="The board lists a station's open tickets with the order's current table. Marking done records who and when, and only within the branch."
```

---

### Task 13: การทดสอบแบบ integration กับ PostgreSQL

**Files:**
- Create: `apps/api/src/__tests__/integration/kitchen.integration.test.ts`

**Gate:** ต้องมี PostgreSQL ที่ `localhost:5433` (ฐาน `pos_test`) จึงจะรันได้ การเปิดฐานต้องใช้ `bun run db:up` (Docker) ก่อนเปิดต้องถามเจ้าของ ถ้าเจ้าของไม่อนุญาต ให้ข้ามการรันจริง เขียนไฟล์ทดสอบให้ครบ แล้วรายงานว่ายังไม่ได้รัน

- [ ] **Step 1: เขียนการทดสอบ**

`apps/api/src/__tests__/integration/kitchen.integration.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedBranch, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

/** A station and a category routed to it, with one product in that category. */
async function kitchenProduct(stationName = 'ครัว') {
  const station = ok(await owner.api.catalog['kitchen-stations'].post({ name: stationName }))
  const category = ok(await owner.api.catalog.categories.post({ name: `หมวด ${stationName}` }))
  ok(await owner.api.catalog.categories({ id: category.id })['kitchen-station'].put({ stationId: station.id }))
  const product = await seedProduct(owner, { categoryId: category.id, stock: 10 })
  return { station, product }
}

const send = (session: Session, orderId: number) => session.api.orders({ id: orderId })['kitchen-send'].post()

describe('ส่งครัวและจอครัว', () => {
  test('สถานีถูกสร้างเป็นของร้าน และแคชเชียร์เพิ่มไม่ได้', async () => {
    const denied = await cashier.api.catalog['kitchen-stations'].post({ name: 'บาร์' })

    expect(denied.error?.status).toBe(403)
    ok(await owner.api.catalog['kitchen-stations'].post({ name: 'บาร์' }))
    expect(ok(await cashier.api.catalog['kitchen-stations'].get()).items.map((row) => row.name)).toEqual(['บาร์'])
  })

  test('ส่งครัวแยกใบต่อสถานี และส่งซ้ำได้เฉพาะส่วนที่ยังไม่เคยส่ง', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 2 }] }))

    const first = ok(await send(cashier, order.id))
    expect(first.items).toHaveLength(1)
    expect(first.items[0]!.stationId).toBe(station.id)
    expect(first.items[0]!.roundNo).toBe(1)

    const again = await send(cashier, order.id)
    expect(again.error?.status).toBe(400)
    expect(again.error?.value).toMatchObject({ code: 'KITCHEN_NOTHING_TO_SEND' })
  })

  test('กดส่งพร้อมกันสองครั้งไม่เกิดใบซ้ำ', async () => {
    const { product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 3 }] }))

    const [a, b] = await Promise.all([send(cashier, order.id), send(cashier, order.id)])
    const statuses = [a.error?.status ?? 200, b.error?.status ?? 200].sort()

    expect(statuses).toEqual([200, 400])
  })

  test('ลดจำนวนหลังส่ง ยกเลิกส่วนนั้นบนจอ และเพิ่มกลับส่งได้เฉพาะส่วนที่ยังไม่ส่ง', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 3 }] }))
    ok(await send(cashier, order.id))

    const lineId = ok(await cashier.api.orders({ id: order.id }).get()).items[0]!.lineId
    ok(await cashier.api.orders({ id: order.id }).lines({ lineId }).patch({ quantity: 1 }))
    const board = ok(await cashier.api.kitchen.tickets.get({ query: { stationId: station.id } }))
    expect(board.items[0]!.lines[0]).toMatchObject({ quantity: 3, voidedQuantity: 2 })

    ok(await cashier.api.orders({ id: order.id }).lines({ lineId }).patch({ quantity: 2 }))
    const resent = ok(await send(cashier, order.id))
    expect(resent.items[0]!.lines[0]!.quantity).toBe(1)
  })

  test('ยกเลิกออเดอร์ทำให้ใบยังอยู่บนจอจนครัวกดเสร็จ และกดซ้ำไม่ได้', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const sent = ok(await send(cashier, order.id)).items[0]!

    ok(await cashier.api.orders({ id: order.id }).cancel.post({ reason: 'ลูกค้าไปแล้ว' }))
    const board = ok(await cashier.api.kitchen.tickets.get({ query: { stationId: station.id } }))
    expect(board.items.map((ticket) => ticket.id)).toContain(sent.id)
    expect(board.items[0]!.lines[0]!.voidedQuantity).toBe(1)

    ok(await cashier.api.kitchen.tickets({ id: sent.id }).done.post())
    const again = await cashier.api.kitchen.tickets({ id: sent.id }).done.post()
    expect(again.error?.status).toBe(409)
  })

  test('การส่งครัวไม่ตัดสต็อก', async () => {
    const { product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 4 }] }))

    ok(await send(cashier, order.id))

    const listed = ok(await cashier.api.products.get({ query: { q: product.sku } })).items[0]!
    expect(listed.stockQty).toBe(10)
  })

  test('รวมบิลไม่ได้ขณะมีใบค้าง และเมื่อเสร็จแล้วใบย้ายไปปลายทาง', async () => {
    const { station, product } = await kitchenProduct()
    const destination = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const source = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const pending = ok(await send(cashier, source.id)).items[0]!

    const blocked = await cashier.api.orders({ id: destination.id }).merge.post({ sourceOrderId: source.id })
    expect(blocked.error?.status).toBe(409)

    ok(await cashier.api.kitchen.tickets({ id: pending.id }).done.post())
    ok(await cashier.api.orders({ id: destination.id }).merge.post({ sourceOrderId: source.id }))

    const board = ok(await cashier.api.kitchen.tickets.get({ query: { stationId: station.id } }))
    expect(board.items).toHaveLength(0)
  })

  test('ออเดอร์และใบของสาขาอื่นตอบว่าไม่พบ', async () => {
    const { station, product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const sent = ok(await send(cashier, order.id)).items[0]!
    const other = await seedBranch('CNX', 'สาขาเชียงใหม่')
    const elsewhere = await signIn('cashier', 'cashier-cnx', { branchId: other.id })

    expect((await send(elsewhere, order.id)).error?.status).toBe(404)
    expect((await elsewhere.api.kitchen.tickets({ id: sent.id }).done.post()).error?.status).toBe(404)
    expect(ok(await elsewhere.api.kitchen.tickets.get({ query: { stationId: station.id } })).items).toHaveLength(0)
  })

  test('หมายเหตุแก้ได้ก่อนส่ง และถูกปฏิเสธหลังส่ง', async () => {
    const { product } = await kitchenProduct()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: product.id, quantity: 1 }] }))
    const lineId = ok(await cashier.api.orders({ id: order.id }).get()).items[0]!.lineId

    ok(await cashier.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: '  ไม่ใส่น้ำแข็ง ' }))
    expect(ok(await cashier.api.orders({ id: order.id }).get()).items[0]!.note).toBe('ไม่ใส่น้ำแข็ง')

    ok(await send(cashier, order.id))
    const late = await cashier.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: 'หวาน' })
    expect(late.error?.status).toBe(409)
  })
})
```

หมายเหตุสำหรับผู้ลงมือ: ชื่อ role `'cashier'` และฟิลด์ `stockQty` ของสินค้า ให้ตรวจกับ `harness.ts` และ schema ของ product ก่อนรัน ถ้าต่างไปให้แก้ให้ตรง การทดสอบต้องไม่เรียก SCB จริง

- [ ] **Step 2: รันการทดสอบ (ต้องมีฐานข้อมูล)**

ก่อนรัน ให้ถามเจ้าของว่าอนุญาตให้เปิด Docker (`bun run db:up`) หรือไม่ ถ้าได้รับอนุญาต:

Run: `bun run db:up` (จาก root)
Run (จาก `apps/api`): `bun run test -- src/__tests__/integration/kitchen.integration.test.ts`
Expected: PASS ทุกกรณี

- [ ] **Step 3: รันชุดทดสอบเดิมทั้งหมด**

Run (จาก `apps/api`): `bun run test`
Expected: PASS ถ้ามีกรณีของออเดอร์เดิมที่ตรวจทั้งออบเจ็กต์ ให้เพิ่ม `note: null, sentQuantity: 0` ในความคาดหวังนั้น แล้วรันซ้ำ

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/integration/kitchen.integration.test.ts
gitcz --non-interactive --type=test --scope=kitchen --subject="cover the kitchen flow against PostgreSQL" --body="Sends, double sends, cancels after send, cross-branch refusals, merge gating and stock stay untouched, each checked over HTTP."
```

ถ้ายังไม่ได้รันจริง (ไม่ได้รับอนุญาตให้เปิดฐาน) ให้ commit ไฟล์เดียวกันได้ แต่ระบุในข้อความ commit และรายงานให้เจ้าของทราบว่ายังไม่ได้รัน

---

### Task 14: เกต baseline OpenAPI (ต้องได้รับอนุมัติจากเจ้าของ)

**Files:**
- Modify (หลังอนุมัติเท่านั้น): `apps/api/test/openapi-baseline.json`
- Generated, do not commit: `apps/api/test/openapi-v1-current.json`

- [ ] **Step 1: ตรวจการเปลี่ยนแปลง**

Run (จาก `apps/api`): `bun --env-file=.env.test test/openapi-snapshot.ts check`
Expected: FAIL พร้อมข้อความ "OpenAPI differs" และมีไฟล์ `test/openapi-v1-current.json` ที่เป็นสัญญาใหม่

- [ ] **Step 2: สรุปความต่างให้เจ้าของดู**

เทียบ `test/openapi-baseline.json` กับ `test/openapi-v1-current.json` แล้วสรุปให้เจ้าของเห็นเพียงสามกลุ่ม:
- เส้นทางใหม่ทั้งหมด (`/catalog/kitchen-stations`, `/catalog/kitchen-stations/{id}`, `/catalog/categories/{id}/kitchen-station`, `/catalog/kitchen-routing`, `/kitchen/tickets`, `/kitchen/tickets/{id}/done`, `/orders/{id}/kitchen-send`, `/orders/{id}/lines/{lineId}/note`)
- ช่องใหม่ในการตอบ (`note`, `sentQuantity` ของรายการออเดอร์; `homeView` ของการตั้งค่าร้าน)
- ไม่มีช่องเดิมที่ถูกลบหรือเปลี่ยนชนิด ถ้ามี ให้หยุดแล้วรายงาน

- [ ] **Step 3: ขออนุมัติ**

ถามเจ้าของว่าอนุมัติการบันทึก baseline ใหม่หรือไม่ ห้ามบันทึกก่อนได้รับคำตอบ

- [ ] **Step 4: บันทึก baseline หลังอนุมัติ**

Run: `cp apps/api/test/openapi-v1-current.json apps/api/test/openapi-baseline.json`
Run (จาก `apps/api`): `bun --env-file=.env.test test/openapi-snapshot.ts check`
Expected: "OpenAPI v1 and v2 documents match their baselines"
Run: `rm apps/api/test/openapi-v1-current.json` (ถ้ามี)

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/openapi-baseline.json
gitcz --non-interactive --type=chore --scope=api --subject="record the v1 contract with the kitchen additions" --body="Additive only: new kitchen routes, note and sentQuantity on order lines, homeView on shop settings. Approved by the owner before recording."
```

---

### Task 15: ชนิดข้อมูลสำหรับเว็บ และ feature `kitchen` (API, lib, locales)

**Files:**
- Modify: `apps/api/src/types.ts`
- Create: `apps/web/src/features/kitchen/index.ts`
- Create: `apps/web/src/features/kitchen/api.ts`
- Create: `apps/web/src/features/kitchen/locales.ts`
- Create: `apps/web/src/features/kitchen/lib/tickets.ts`
- Create: `apps/web/src/features/kitchen/lib/tickets.test.ts`

- [ ] **Step 1: export ชนิดให้เว็บ**

ใน `apps/api/src/types.ts` เพิ่ม:

```ts
export type { KitchenStationResponse as KitchenStation } from './modules/kitchen/adapters/controllers/schemas/kitchen.schema'
export type { OrderResponse as Order } from './modules/orders/adapters/controllers/schemas/order.schema'
```

บรรทัด `Order` มีอยู่แล้ว อย่าซ้ำ ให้เพิ่มเฉพาะบรรทัด `KitchenStation`

ใน `kitchen.schema.ts` เพิ่ม `export type KitchenBoardTicketResponse = typeof kitchenSchemas.boardTicket.static` และ export ผ่าน `types.ts` เป็น `KitchenBoardTicket`

- [ ] **Step 2: เขียนการทดสอบของฟังก์ชันล้วน**

`apps/web/src/features/kitchen/lib/tickets.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { isLineCancelled, isTicketCancelled, liveUnits, ticketHeading, unsentUnits } from './tickets'

describe('หน่วยที่ยังอยู่กับครัว', () => {
  test('บรรทัดที่ยกเลิกบางส่วนเหลือเท่าที่ยังไม่ถูกยกเลิก', () => {
    expect(liveUnits({ quantity: 3, voidedQuantity: 1 })).toBe(2)
    expect(isLineCancelled({ quantity: 3, voidedQuantity: 1 })).toBe(false)
  })

  test('บรรทัดที่ยกเลิกหมดถูกขีดฆ่า และใบที่ทุกบรรทัดถูกยกเลิกเป็นใบยกเลิก', () => {
    expect(isLineCancelled({ quantity: 2, voidedQuantity: 2 })).toBe(true)
    expect(isTicketCancelled([{ quantity: 2, voidedQuantity: 2 }, { quantity: 1, voidedQuantity: 1 }])).toBe(true)
    expect(isTicketCancelled([{ quantity: 2, voidedQuantity: 2 }, { quantity: 1, voidedQuantity: 0 }])).toBe(false)
  })

  test('ใบที่ไม่มีบรรทัดไม่ถือว่าถูกยกเลิก', () => {
    expect(isTicketCancelled([])).toBe(false)
  })
})

describe('ส่งครัวได้อีกเท่าไร', () => {
  test('เท่ากับจำนวนของออเดอร์ลบส่วนที่ส่งแล้ว ไม่ติดลบ', () => {
    expect(unsentUnits(5, 2)).toBe(3)
    expect(unsentUnits(2, 2)).toBe(0)
    expect(unsentUnits(1, 4)).toBe(0)
  })
})

describe('หัวของใบ', () => {
  test('ใช้ชื่อโต๊ะก่อน แล้วชื่อออเดอร์ แล้วเลขออเดอร์', () => {
    const fallback = (orderId: number) => `#${orderId}`

    expect(ticketHeading({ orderId: 7, tableName: 'T3', orderLabel: 'ป้าย' }, fallback)).toBe('T3')
    expect(ticketHeading({ orderId: 7, tableName: null, orderLabel: 'ป้าย' }, fallback)).toBe('ป้าย')
    expect(ticketHeading({ orderId: 7, tableName: null, orderLabel: null }, fallback)).toBe('#7')
  })
})
```

- [ ] **Step 3: ยืนยันว่าล้มเหลว**

Run (จาก `apps/web`): `bun test src/features/kitchen`
Expected: FAIL

- [ ] **Step 4: เขียนฟังก์ชันล้วน**

`apps/web/src/features/kitchen/lib/tickets.ts`:

```ts
export interface LineCounts {
  quantity: number
  voidedQuantity: number
}

/** Units the kitchen still has to make from one line. */
export const liveUnits = (line: LineCounts) => line.quantity - line.voidedQuantity

/** A line the cashier took back in full: it is crossed out until the ticket is done. */
export const isLineCancelled = (line: LineCounts) => liveUnits(line) === 0

/** A ticket is cancelled as a whole when every one of its lines is. An empty ticket is not. */
export const isTicketCancelled = (lines: readonly LineCounts[]) => lines.length > 0 && lines.every(isLineCancelled)

/** Units of an order line that have not gone to the kitchen yet. */
export const unsentUnits = (orderQuantity: number, sentQuantity: number) => Math.max(0, orderQuantity - sentQuantity)

/** The heading of a ticket: the table it is on, else the order's label, else the order's number. */
export const ticketHeading = (
  ticket: { orderId: number; tableName: string | null; orderLabel: string | null },
  fallback: (orderId: number) => string,
) => ticket.tableName ?? ticket.orderLabel ?? fallback(ticket.orderId)
```

- [ ] **Step 5: ยืนยันว่าผ่าน**

Run (จาก `apps/web`): `bun test src/features/kitchen`
Expected: PASS

- [ ] **Step 6: เขียน api ของ feature**

`apps/web/src/features/kitchen/api.ts`:

```ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { categoryKeys } from '@/features/categories'
import { orderKeys } from '@/features/orders'
import { api, unwrap } from '@/lib/api'

export const kitchenKeys = {
  /** Prefix of every kitchen query. */
  all: ['kitchen'] as const,
  stations: () => [...kitchenKeys.all, 'stations'] as const,
  tickets: (stationId: number) => [...kitchenKeys.all, 'tickets', stationId] as const,
  routing: () => [...kitchenKeys.all, 'routing'] as const,
}

export const kitchenStationsQuery = queryOptions({
  queryKey: kitchenKeys.stations(),
  queryFn: async () => (await unwrap(api.catalog['kitchen-stations'].get())).items,
})

/** Which station each category goes to. A category missing here is not sent to the kitchen. */
export const kitchenRoutingQuery = queryOptions({
  queryKey: kitchenKeys.routing(),
  queryFn: async () => (await unwrap(api.catalog['kitchen-routing'].get())).items,
})

/** The open tickets of one station. Refetched every 3 seconds: the kitchen has no push channel. */
export const kitchenTicketsQuery = (stationId: number) =>
  queryOptions({
    queryKey: kitchenKeys.tickets(stationId),
    queryFn: async () => (await unwrap(api.kitchen.tickets.get({ query: { stationId, limit: 200 } }))).items,
    refetchInterval: 3_000,
  })

export function useMarkTicketDone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => unwrap(api.kitchen.tickets({ id }).done.post()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.all }),
  })
}

/** Sends what has not gone yet. The order's sent counts change, so the order is refreshed too. */
export function useSendOrderToKitchen() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orderId: number) => unwrap(api.orders({ id: orderId })['kitchen-send'].post()),
    onSuccess: (_result, orderId) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: kitchenKeys.all }),
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) }),
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
      ]),
  })
}

export function useCreateKitchenStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string; sortOrder?: number }) => unwrap(api.catalog['kitchen-stations'].post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.stations() }),
  })
}

export function useUpdateKitchenStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: { name?: string; sortOrder?: number; isActive?: boolean } }) =>
      unwrap(api.catalog['kitchen-stations']({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.stations() }),
  })
}

/** Routes a category to a station, or with null takes it off the kitchen. */
export function useSetCategoryStation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ categoryId, stationId }: { categoryId: number; stationId: number | null }) =>
      unwrap(api.catalog.categories({ id: categoryId })['kitchen-station'].put({ stationId })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: kitchenKeys.routing() }),
      ]),
  })
}
```

หมายเหตุ: `categoryKeys` และ `orderKeys` ต้อง export จาก `index.ts` ของ feature ตรวจว่ามี ถ้าไม่มีให้เพิ่ม export ใน `features/categories/index.ts` และ `features/orders/index.ts` (ดูตัวอย่าง `tableKeys` ใน `features/tables/index.ts`)

- [ ] **Step 7: locales และ index**

`apps/web/src/features/kitchen/locales.ts` ตามรูปแบบเดียวกับ `features/tables/locales.ts` (ไทยเป็นต้นแบบ `en satisfies typeof th`):

```ts
const th = {
  title: 'ครัว',
  stations: 'สถานี',
  noStations: 'ยังไม่มีสถานีครัว เจ้าของต้องเพิ่มสถานีและผูกหมวดก่อน',
  noTickets: 'ไม่มีใบสั่งที่ค้างอยู่',
  done: 'ทำเสร็จ',
  round_one: 'รอบ {{count}}',
  round_other: 'รอบ {{count}}',
  cancelledUnits: 'ยกเลิก {{count}}',
  cancelledTicket: 'ใบนี้ถูกยกเลิกทั้งใบ',
  note: 'หมายเหตุ: {{note}}',
  sentAt: 'ส่งเมื่อ {{time}}',
  addStation: 'เพิ่มสถานี',
  stationName: 'ชื่อสถานี',
  sortOrder: 'ลำดับ',
  active: 'เปิดใช้งาน',
  save: 'บันทึก',
  orderNumber: 'ออเดอร์ #{{id}}',
}

export const locales = {
  th,
  en: {
    title: 'Kitchen',
    stations: 'Stations',
    noStations: 'No kitchen stations yet. The owner must add a station and route categories to it first.',
    noTickets: 'No open tickets.',
    done: 'Done',
    round_one: 'Round {{count}}',
    round_other: 'Round {{count}}',
    cancelledUnits: 'Cancelled {{count}}',
    cancelledTicket: 'This ticket was cancelled.',
    note: 'Note: {{note}}',
    sentAt: 'Sent {{time}}',
    addStation: 'Add station',
    stationName: 'Station name',
    sortOrder: 'Order',
    active: 'Active',
    save: 'Save',
    orderNumber: 'Order #{{id}}',
  } satisfies typeof th,
}
```

ใน `app/i18n.ts` (หรือจุดที่รวม locales ทุก feature) เพิ่ม namespace `kitchen` ตามที่ `tablesLocales` ถูกรวม (ตรวจไฟล์นั้นก่อนแก้)

`apps/web/src/features/kitchen/index.ts`:

```ts
export {
  kitchenKeys,
  kitchenRoutingQuery,
  kitchenStationsQuery,
  kitchenTicketsQuery,
  useSendOrderToKitchen,
  useSetCategoryStation,
} from './api'
export { unsentUnits } from './lib/tickets'
export { KitchenBoardPage } from './components/KitchenBoardPage'
export { KitchenStationsPage } from './components/KitchenStationsPage'
export { locales as kitchenLocales } from './locales'
```

- [ ] **Step 8: ตรวจ typecheck และ commit**

Run (จาก `apps/web`): `bun run typecheck`
Expected: ผ่าน (ถ้าหน้า component ยังไม่มี ให้ชั่วคราว comment สองบรรทัดนั้นออกจาก index ใน task นี้ แล้วเปิดกลับใน Task 16)

```bash
git add apps/api/src/types.ts apps/api/src/modules/kitchen/adapters/controllers/schemas/kitchen.schema.ts apps/web/src/features/kitchen apps/web/src/app/i18n.ts
gitcz --non-interactive --type=feat --scope=web --subject="add the kitchen feature's api, rules and text" --body="Queries for the board and stations, the mutations that send, mark done and route, and the pure rules for cancelled lines and unsent units."
```

---

### Task 16: หน้าจอครัว และหน้าจัดการสถานี (เส้นทาง และเมนู)

**Files:**
- Create: `apps/web/src/features/kitchen/components/KitchenBoardPage.tsx`
- Create: `apps/web/src/features/kitchen/components/TicketCard.tsx`
- Create: `apps/web/src/features/kitchen/components/KitchenStationsPage.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/AppSidebar.tsx`
- Modify: `apps/web/src/app/locales.ts`

- [ ] **Step 1: อ่านตัวอย่างที่ต้องตาม**

อ่านก่อนเขียน: `apps/web/src/components/DataTable.tsx` (รูปแบบ `priority`), `apps/web/src/components/PageHeader.tsx`, `apps/web/src/features/tables/components/TablesPage.tsx` (หน้าที่มี dialog ฟอร์ม), `apps/web/src/features/settings/hooks/use-format.ts` (ชื่อฟังก์ชันจัดรูปแบบเวลา), `apps/web/src/app/AppSidebar.tsx` (รูปแบบเมนู)

- [ ] **Step 2: หน้าจอครัว**

`components/KitchenBoardPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { kitchenStationsQuery, kitchenTicketsQuery, useMarkTicketDone } from '../api'
import { TicketCard } from './TicketCard'

/** The kitchen screen: one station at a time, its open tickets oldest first, refreshed by the query. */
export function KitchenBoardPage() {
  const { t } = useTranslation('kitchen')
  const [params, setParams] = useSearchParams()
  const stations = useQuery(kitchenStationsQuery)
  const active = (stations.data ?? []).filter((station) => station.isActive)
  const chosen = Number(params.get('station')) || active[0]?.id || 0
  const tickets = useQuery({ ...kitchenTicketsQuery(chosen), enabled: chosen > 0 })
  const markDone = useMarkTicketDone()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t('title')} />

      {stations.isPending && <Skeleton className="m-4 h-11 w-64" />}
      {!stations.isPending && active.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">{t('noStations')}</p>
      )}

      {active.length > 0 && (
        <nav aria-label={t('stations')} className="flex flex-wrap gap-2 px-4 pb-2">
          {active.map((station) => (
            <Button
              key={station.id}
              variant={station.id === chosen ? 'default' : 'outline'}
              className="h-11"
              aria-pressed={station.id === chosen}
              onClick={() => setParams({ station: String(station.id) })}
            >
              {station.name}
            </Button>
          ))}
        </nav>
      )}

      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
        {tickets.isPending && chosen > 0 && <Skeleton className="h-48 w-full" />}
        {tickets.data?.length === 0 && <p className="col-span-full py-16 text-center text-sm text-muted-foreground">{t('noTickets')}</p>}
        {tickets.data?.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            disabled={markDone.isPending}
            onDone={() => markDone.mutate(ticket.id)}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: การ์ดใบสั่ง**

`components/TicketCard.tsx`:

```tsx
import type { KitchenBoardTicket } from '@pos/api/types'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/features/settings'
import { cn } from '@/lib/utils'
import { isLineCancelled, isTicketCancelled, liveUnits, ticketHeading } from '../lib/tickets'

interface Props {
  ticket: KitchenBoardTicket
  disabled: boolean
  onDone: () => void
}

/** One ticket: where it belongs, what to make, what was taken back, and the done button. */
export function TicketCard({ ticket, disabled, onDone }: Props) {
  const { t } = useTranslation('kitchen')
  const { date } = useFormat()
  const cancelled = isTicketCancelled(ticket.lines)

  return (
    <article className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4', cancelled && 'opacity-70')}>
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold">
          {ticketHeading(ticket, (id) => t('orderNumber', { id }))}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">{t('round', { count: ticket.roundNo })}</span>
      </header>
      <p className="text-xs text-muted-foreground">{t('sentAt', { time: date(ticket.createdAt) })}</p>
      {cancelled && <p className="text-sm font-medium text-destructive">{t('cancelledTicket')}</p>}

      <ul className="divide-y">
        {ticket.lines.map((line) => (
          <li key={line.id} className="space-y-1 py-2">
            <p className={cn('text-base font-medium', isLineCancelled(line) && 'text-muted-foreground line-through')}>
              <span className="tabular-nums">{liveUnits(line)} ×</span> {line.productName}
            </p>
            {line.optionNames.length > 0 && <p className="text-sm text-muted-foreground">{line.optionNames.join(', ')}</p>}
            {line.note && <p className="text-sm font-medium">{t('note', { note: line.note })}</p>}
            {line.voidedQuantity > 0 && !isLineCancelled(line) && (
              <p className="text-sm font-medium text-destructive">{t('cancelledUnits', { count: line.voidedQuantity })}</p>
            )}
            {isLineCancelled(line) && <p className="text-sm font-medium text-destructive">{t('cancelledUnits', { count: line.voidedQuantity })}</p>}
          </li>
        ))}
      </ul>

      <Button className="h-11 w-full text-base" disabled={disabled} onClick={onDone}>
        {t('done')}
      </Button>
    </article>
  )
}
```

หมายเหตุ: `KitchenBoardTicket` ต้อง export จาก `apps/api/src/types.ts` ตาม Task 15 และ `date(...)` ต้องตรงกับชื่อจริงของ `useFormat` (ตรวจใน Step 1)

- [ ] **Step 4: หน้าจัดการสถานี (เจ้าของ)**

`components/KitchenStationsPage.tsx` ใช้ `DataTable` พร้อม `priority` ทุกคอลัมน์ และ dialog ฟอร์มเพิ่มสถานี ฟอร์มใช้โครงที่ Task 19 กำหนด (ปุ่มยืนยันอยู่นอกพื้นที่เลื่อน) ให้เขียนตามนี้:

- คอลัมน์: `name` (`priority: 'primary'`), `sortOrder` (`priority: 'secondary'`), `isActive` (`priority: 'secondary'`), ปุ่มเปิดปิด (`priority: 'primary'`, `h-11`)
- ข้อมูลจาก `kitchenStationsQuery` (รวมที่ปิดอยู่)
- ปุ่ม "เพิ่มสถานี" ที่ `h-11` เปิด dialog ฟอร์มที่มีช่อง `stationName` (ความสูง `h-11`) และ `sortOrder` และปุ่มบันทึกอยู่ท้ายฟอร์ม
- การเปิดปิดเรียก `useUpdateKitchenStation` ด้วย `{ id, changes: { isActive } }`
- ข้อความทั้งหมดผ่าน `t('...')` ใน namespace `kitchen`

- [ ] **Step 5: เส้นทางและเมนู**

ใน `app/App.tsx`:
- import `KitchenBoardPage`, `KitchenStationsPage` จาก `@/features/kitchen`
- เพิ่มเส้นทางหลัง `shifts`:

```tsx
          <Route path="kitchen" element={<KitchenBoardPage />} />
          {isOwner && <Route path="kitchen-stations" element={<KitchenStationsPage />} />}
```

ใน `app/AppSidebar.tsx`:
- เพิ่มเมนู "ครัว" (`to: '/kitchen'`) ให้ทุกบทบาท ตำแหน่งหลังเมนูขาย
- เพิ่มเมนู "สถานีครัว" (`to: '/kitchen-stations'`) ในกลุ่มของเจ้าของ ใช้ไอคอนจาก `lucide-react` ที่มีอยู่แล้วในโปรเจกต์ (เช่น `ChefHat`) หรือ `Utensils`

ใน `app/locales.ts` เพิ่มคีย์ `nav.kitchen` และ `nav.kitchenStations` ทั้งไทยและอังกฤษ

- [ ] **Step 6: ตรวจ**

Run (จาก `apps/web`): `bun run typecheck`
Expected: ผ่าน

Run (จาก `apps/web`): `bun run lint`
Expected: ผ่าน

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/kitchen apps/web/src/app
gitcz --non-interactive --type=feat --scope=web --subject="add the kitchen board and the station page" --body="The board shows one station's open tickets and refreshes every 3 seconds. Cancelled lines are crossed out. The stations page is for the owner."
```

---

### Task 17: ฝั่งแคชเชียร์: ส่งครัว หมายเหตุต่อบรรทัด และป้ายส่งแล้ว

**Files:**
- Modify: `apps/web/src/features/orders/api.ts` (เพิ่ม `useSetOrderLineNote`)
- Modify: `apps/web/src/features/orders/index.ts` (export ตามที่ใช้)
- Create: `apps/web/src/features/pos/components/KitchenSendButton.tsx`
- Modify: `apps/web/src/features/pos/components/CartPanel.tsx`
- Modify: `apps/web/src/features/pos/hooks/use-cart.ts`
- Modify: `apps/web/src/features/pos/locales.ts`

- [ ] **Step 1: ตรวจ cart ก่อนแก้**

เปิด `features/pos/hooks/use-cart.ts` และ `features/pos/lib/cart.ts` เพื่อดูว่าบรรทัดของออเดอร์ที่เปิดอยู่ถูกสร้างจาก `cart.order.items` อย่างไร และมี `lineId` อยู่ในบรรทัดของตะกร้าหรือไม่ ถ้าไม่มี ให้เพิ่มการจับคู่จาก `cart.order.items` ด้วยคีย์ `productId` และ `options` (หรือ `lineId` ถ้ามี) โดยเพิ่มฟิลด์ `sentQuantity: number` และ `note: string | null` ให้บรรทัดที่มาจากออเดอร์ (บรรทัดที่ยังไม่บันทึกเป็นออเดอร์ให้ค่า `sentQuantity: 0` และ `note: null`)

- [ ] **Step 2: เพิ่ม hook หมายเหตุ**

ใน `features/orders/api.ts`:

```ts
/** Writes or clears the note of one line. Refused by the API once the line has gone to the kitchen. */
export function useSetOrderLineNote() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, lineId, note }: { orderId: number; lineId: number; note: string | null }) =>
      unwrap(api.orders({ id: orderId }).lines({ lineId }).note.patch({ note })),
    onSuccess: remember,
  })
}
```

ตรวจว่า `features/orders/index.ts` export `useSetOrderLineNote` และ `orderKeys` ถ้าไม่มีให้เพิ่ม

- [ ] **Step 3: ปุ่มส่งครัว**

`features/pos/components/KitchenSendButton.tsx`:

```tsx
import type { Order } from '@pos/api/types'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { unsentUnits } from '@/features/kitchen/lib/tickets'
import { useSendOrderToKitchen } from '@/features/kitchen'

/** Sends what the kitchen does not have yet. The count is what would go, not what was sent before. */
export function KitchenSendButton({ order }: { order: Order }) {
  const { t } = useTranslation('pos')
  const send = useSendOrderToKitchen()
  const unsent = order.items.reduce((total, item) => total + unsentUnits(item.quantity, item.sentQuantity), 0)

  return (
    <div className="px-4 py-2">
      <Button
        variant="outline"
        className="h-11 w-full"
        disabled={unsent === 0 || send.isPending}
        onClick={() =>
          send.mutate(order.id, {
            onSuccess: () => toast.success(t('kitchen.sent')),
            onError: (error) => toast.error(error.message),
          })
        }
      >
        {t('kitchen.send', { count: unsent })}
      </Button>
    </div>
  )
}
```

หมายเหตุ: `features/kitchen/index.ts` ต้องไม่ export `KitchenBoardPage` ซ้ำในวงจร การ import จาก `@/features/kitchen/lib/tickets` ตรงข้าม index เป็นการละเมิดกฎ feature (ต้องใช้ทางเข้าสาธารณะ) ดังนั้น ให้ export `unsentUnits` จาก `features/kitchen/index.ts` แล้วเปลี่ยนการ import เป็น `import { unsentUnits, useSendOrderToKitchen } from '@/features/kitchen'`

- [ ] **Step 4: ต่อปุ่มและหมายเหตุเข้า CartPanel**

ใน `CartPanel.tsx` ใต้ `{cart.order && cart.order.status === 'open' && <OrderTools order={cart.order} />}` เพิ่ม `<KitchenSendButton order={cart.order} />` เฉพาะกรณีที่ออเดอร์เปิดอยู่

ในรายการบรรทัดของตะกร้า แต่ละบรรทัดที่มาจากออเดอร์:
- แสดงป้าย `t('kitchen.sentBadge', { count: line.sentQuantity })` เมื่อ `sentQuantity > 0`
- แสดงช่อง `Input` หมายเหตุ (`h-11`, `aria-label={t('kitchen.noteFor', { name })}`, placeholder `t('kitchen.notePlaceholder')`) ที่ `onBlur` เรียก `useSetOrderLineNote` เมื่อค่าเปลี่ยนจากค่าที่โหลดมา
- ช่องหมายเหตุ `disabled` เมื่อ `sentQuantity > 0` และแสดง `t('kitchen.lockedNote')` ใต้ช่อง

ใช้ `useFormat` และ `money` เดิม อย่าเขียนรูปแบบเงินเอง

- [ ] **Step 5: locales ของ pos**

เพิ่มใน `features/pos/locales.ts` ทั้งไทยและอังกฤษ:
- `kitchen.send` (ไทย: "ส่งครัว ({{count}})"), `kitchen.sent` ("ส่งครัวแล้ว"), `kitchen.sentBadge` ("ส่งแล้ว {{count}}"), `kitchen.noteFor` ("หมายเหตุของ {{name}}"), `kitchen.notePlaceholder` ("เช่น ไม่ใส่น้ำแข็ง"), `kitchen.lockedNote` ("ส่งครัวแล้ว แก้หมายเหตุไม่ได้")

- [ ] **Step 6: ตรวจ**

Run (จาก `apps/web`): `bun run typecheck`
Expected: ผ่าน

Run (จาก `apps/web`): `bun test src`
Expected: ผ่าน

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/orders apps/web/src/features/pos apps/web/src/features/kitchen/index.ts
gitcz --non-interactive --type=feat --scope=pos --subject="send a ticket and write notes from the till" --body="The order shows how many units can still go and how many already went. A line the kitchen has keeps its note fixed."
```

---

### Task 18: หน้าแรกเป็นผังโต๊ะ, การผูกหมวดกับสถานีในหน้าหมวดหมู่, และตัวเลือกหน้าแรกในการตั้งค่า

**Files:**
- Create: `apps/web/src/features/pos/components/FloorView.tsx`
- Create: `apps/web/src/features/pos/components/FloorPage.tsx`
- Modify: `apps/web/src/features/pos/components/FloorDialog.tsx`
- Modify: `apps/web/src/features/pos/index.ts`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/features/categories/components/CategoriesPage.tsx`
- Modify: `apps/web/src/features/categories/locales.ts`
- Modify: `apps/web/src/features/settings/components/SettingsPage.tsx`
- Modify: `apps/web/src/features/settings/locales.ts`

- [ ] **Step 1: แยก `FloorView` จาก `FloorDialog`**

`FloorDialog.tsx` มีเนื้อหาผังโต๊ะกับการเลือกออเดอร์อยู่ในไฟล์ dialog ให้ย้ายเนื้อหาทั้งหมดไปไว้ใน `FloorView.tsx` ที่รับ `onResume(order: Order): void` และ `onNewOrderOpened?: () => void` แล้วให้ `FloorDialog` เหลือเพียงกรอบ `Dialog` ที่เรียก `FloorView` ด้วย `onResume={(order) => { workOnOrder(order.id); onClose() }}` พฤติกรรมเดิมต้องไม่เปลี่ยน

- [ ] **Step 2: หน้าแรกเป็นผังโต๊ะ**

`FloorPage.tsx`:

```tsx
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { useCartStore } from '../store/cart.store'
import { FloorView } from './FloorView'

/** The home screen when the shop chose the floor plan: pick a table, then take the order to the sell screen. */
export function FloorPage() {
  const { t } = useTranslation('pos')
  const navigate = useNavigate()
  const workOnOrder = useCartStore((state) => state.workOnOrder)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t('floor.title')} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <FloorView
          onResume={(order) => {
            workOnOrder(order.id)
            navigate('/sell')
          }}
        />
      </div>
    </div>
  )
}
```

ใน `App.tsx`:
- ใน `features/pos/index.ts` เพิ่ม `export { FloorPage } from './components/FloorPage'` แล้วใน `App.tsx` ใช้ `import { FloorPage } from '@/features/pos'`
- อ่าน `const { homeView } = useSettings()` ใน `Shell` (`useSettings` มีอยู่แล้วใน `Shell`)
- เปลี่ยน route ดังนี้:

```tsx
          <Route index element={homeView === 'tables' ? <FloorPage /> : <PosPage />} />
          <Route path="sell" element={<PosPage />} />
```

`sell` ต้องมีด้วยเมื่อหน้าแรกเป็นผังโต๊ะ เพื่อให้หน้าขายเปิดได้

- [ ] **Step 3: ผูกหมวดกับสถานีในหน้าหมวดหมู่**

ใน `CategoriesPage.tsx` เพิ่มช่อง `Select` ในฟอร์มแก้หมวด ตัวเลือกประกอบด้วย "ไม่ส่งครัว" (ค่า `none`, แปลงเป็น `null`) และสถานีทั้งหมดจาก `kitchenStationsQuery` ค่าปัจจุบันของหมวดอ่านจาก `kitchenRoutingQuery` (`GET /catalog/kitchen-routing` จาก Task 7) โดยหาแถวที่ `categoryId` ตรงกับหมวด ถ้าไม่มีแถวให้แสดงว่า "ไม่ส่งครัว"

การเปลี่ยนค่าเรียก `useSetCategoryStation` จาก `@/features/kitchen`:

```tsx
<Select value={String(stationId ?? 'none')} onValueChange={(value) => setStation.mutate({ categoryId: category.id, stationId: value === 'none' ? null : Number(value) })}>
  <SelectTrigger className="h-11 w-full">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">{t('kitchen.noStation')}</SelectItem>
    {stations.map((station) => (
      <SelectItem key={station.id} value={String(station.id)} disabled={!station.isActive}>
        {station.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

ข้อความ `kitchen.noStation` อยู่ใน `features/categories/locales.ts` (ไม่ใช่ namespace ของ kitchen) ให้เพิ่มคีย์นั้นไว้ที่ categories

- [ ] **Step 4: ตัวเลือก "หน้าแรก" ในการตั้งค่า**

ใน `SettingsPage.tsx` เพิ่ม `Field` ใหม่ชื่อ `t('shop.homeView')` ที่มี `Select` สองตัวเลือก (`till` และ `tables`) ค่าที่ส่งเข้า `useUpdateSettings` เป็น `homeView` ใช้ฟอร์มและการบันทึกเดิมของหน้า (`set('homeView', value)`) ข้อความอยู่ใน `features/settings/locales.ts` ทั้งไทยและอังกฤษ:
- `shop.homeView` ("หน้าแรก"), `shop.homeViewTill` ("หน้าขาย"), `shop.homeViewTables` ("ผังโต๊ะ"), `shop.homeViewHint` ("เลือกว่าเมื่อเปิดระบบ จะเห็นหน้าขายหรือผังโต๊ะ")

- [ ] **Step 5: ตรวจ**

Run (จาก `apps/web`): `bun run typecheck`
Expected: ผ่าน

Run (จาก `apps/web`): `bun test src`
Expected: ผ่าน

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/pos apps/web/src/features/categories apps/web/src/features/settings apps/web/src/app/App.tsx
gitcz --non-interactive --type=feat --scope=web --subject="open the floor plan as home when the shop chooses it" --body="The sell screen moves to /sell in that mode. Categories choose their kitchen station. The shop settings choose the home view."
```

---

### Task 19: ฟอร์มยาวที่ปุ่มยืนยันติดล่างเสมอ (งานรอบ design 2)

**Files:**
- Modify: ไฟล์ dialog ทั้งหมดที่มี `<form>` และยาวเกินจอมือถือ (หาได้ด้วยคำสั่งด้านล่าง)
- Modify: `apps/web/src/components/ui/dialog.tsx` (เฉพาะถ้าต้องเพิ่มคลาสช่วยเลื่อน)

- [ ] **Step 1: หาไฟล์ที่ต้องแก้**

Run (จาก `apps/web`): `grep -rl "<form" src --include=*.tsx`
Expected: รายการไฟล์ที่มีฟอร์ม (ราว 18 ไฟล์) เลือกเฉพาะที่อยู่ใน `DialogContent` ซึ่งสูงเกินจอ 390px (ปกติคือฟอร์มที่มีช่องมากกว่าสี่หรือมีรายการเลือก)

- [ ] **Step 2: อ่าน dialog ก่อนแก้**

อ่าน `apps/web/src/components/ui/dialog.tsx` เพื่อดูคลาสฐานของ `DialogContent` (ความสูงสูงสุด, `grid` หรือ `flex`, `overflow`) และ `DialogFooter` ที่มี `sticky`

- [ ] **Step 3: รูปแบบที่ใช้กับทุกฟอร์มยาว**

ใช้โครงนี้ โดยให้ `<form>` เป็นลูกชั้นแรกของ `DialogContent` และให้แถวปุ่มอยู่นอกพื้นที่เลื่อน:

```tsx
<DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-lg">
  <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
    <DialogHeader className="px-6 pt-6 pb-4">
      <DialogTitle>{title}</DialogTitle>
    </DialogHeader>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
      {/* fields */}
    </div>
    <DialogFooter className="shrink-0 border-t px-6 py-4">
      <Button variant="outline" className="h-11" onClick={onClose}>{tc('cancel')}</Button>
      <Button type="submit" className="h-11" disabled={save.isPending}>{tc('save')}</Button>
    </DialogFooter>
  </form>
</DialogContent>
```

หลักการ: ปุ่มยืนยันต้องเป็นลูกโดยตรงของ `form` ที่เป็น flex และอยู่นอก `overflow-y-auto` ห้ามใช้ `sticky` ภายในฟอร์ม (ตาม `AGENTS.md`) ส่วน dialog ที่ไม่มี form ใช้ `DialogFooter sticky` ตามเดิม

- [ ] **Step 4: ตรวจด้วยภาพ**

Run (จาก `apps/web`): `bun run typecheck` และ `bun run lint`
Expected: ผ่าน

ตรวจด้วยตาในเบราว์เซอร์หรือภาพหน้าจอที่ 390px: เปิด dialog ฟอร์มยาว ปุ่มยืนยันต้องอยู่ที่ขอบล่างของ dialog เสมอ แม้เลื่อนฟอร์ม ไม่ลอยกลางจอ และไม่ล้นแนวนอน ตรวจแล้วบันทึกชื่อฟอร์มที่แก้ในข้อความ commit

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
gitcz --non-interactive --type=style --scope=web --subject="keep the confirm row of long forms at the bottom of the dialog" --body="The form is the dialog's flex column; its fields scroll and the buttons sit outside the scroll area. Checked at 390px."
```

---

### Task 20: e2e และภาพหน้าจอ

**Files:**
- Modify: `apps/web/e2e/run.ts`
- Modify: `apps/web/e2e/shots.ts`

**Gate:** ต้องมีฐาน PostgreSQL เหมือน Task 13 และต้องถามเจ้าของก่อนเปิด Docker

- [ ] **Step 1: อ่านโครงของ e2e ก่อน**

อ่าน `apps/web/e2e/run.ts` ทั้งไฟล์เพื่อดูรูปแบบ `results`, `children`, การล็อกอินของเจ้าของและแคชเชียร์ (`OWNER_PASSWORD`, `CASHIER_PASSWORD`) และการเปิดหน้า ใช้รูปแบบเดิมทุกอย่าง

- [ ] **Step 2: เพิ่มฉากทดสอบ**

เพิ่มฉาก `kitchen` ที่ทำตามลำดับนี้ โดยแต่ละขั้นเป็นการตรวจที่บันทึกลง `results`:
1. เจ้าของเปิด `/kitchen-stations` เพิ่มสถานี "ครัว" และเปิด `/categories` ผูกหมวดอาหารกับสถานีนั้น
2. แคชเชียร์เปิดออเดอร์ มีสินค้าในหมวดนั้น แล้วกด "ส่งครัว (1)"
3. ปุ่มส่งครัวกลายเป็น "ส่งครัว (0)" และป้าย "ส่งแล้ว 1" ปรากฏ
4. เปิด `/kitchen` เลือกสถานี "ครัว" เห็นการ์ดใบแรกภายใน 5 วินาที
5. แคชเชียร์ลดจำนวนเหลือศูนย์ การ์ดแสดงบรรทัดขีดฆ่าและ "ยกเลิก N" ภายใน 5 วินาที
6. ครัวกด "ทำเสร็จ" การ์ดหายไป

ทุกขั้นต้องใช้ `page.waitForSelector` หรือ `expect` ตามรูปแบบเดิม ไม่ใช้ `sleep` ตายตัว

- [ ] **Step 3: ภาพหน้าจอ**

เพิ่มในรายการ `shots.ts` ที่ 390, 768 และ 1366px:
- `/kitchen` (มีใบ 1 ใบ และไม่มีใบ)
- `/kitchen-stations`
- ฟอร์มยาวที่ Task 19 แก้ (เปิด dialog แล้วเลื่อน)
- ผังโต๊ะเป็นหน้าแรก (ตั้งค่า `homeView = tables` ก่อนถ่าย)

- [ ] **Step 4: รัน (ต้องมีฐาน)**

Run (จาก root): `bun run e2e`
Expected: ทุกขั้นของฉาก kitchen ผ่าน และฉากเดิมผ่าน

Run (จาก root): `bun run screenshots`
Expected: ได้ภาพครบ เปิดดูด้วยตาทั้ง phone / tablet / desktop ตาม `AGENTS.md`

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e
gitcz --non-interactive --type=test --scope=web --subject="check the kitchen flow end to end and shoot the new screens" --body="Owner routes a category, cashier sends and cancels, kitchen marks done. Screens are shot at 390, 768 and 1366px."
```

---

### Task 21: ตรวจรวมก่อนรายงานว่าเสร็จ

**Files:** ไม่มีการแก้ไข

- [ ] **Step 1: ตรวจทั้ง repo**

Run (จาก root): `bun run typecheck`
Expected: ผ่านทุกแพ็กเกจ

Run (จาก root): `bun run test:unit`
Expected: ผ่าน จำนวนกรณีมากกว่า baseline

Run (จาก root): `bun run test`
Expected: ผ่าน (ต้องมีฐาน PostgreSQL; ถ้าไม่ได้รับอนุญาตให้เปิด ให้รายงานว่ายังไม่ได้รัน)

Run (จาก root): `bun run lint`
Expected: ผ่าน

Run (จาก `apps/api`): `bun run openapi:check`
Expected: ผ่าน (หลัง Task 14 ได้รับอนุมัติ)

- [ ] **Step 2: ตรวจกฎของโครงการ**

- ทุก commit ใช้ `gitcz` (`git log --format=%s` ดูว่าผ่านรูปแบบ)
- ไม่มีไฟล์ `.env` อื่นนอกจาก root และไม่มีความลับใน `git status`
- `repo-secrets.test.ts` ผ่าน (อยู่ในชุด `bun run test`)
- ไม่มี `git push`

- [ ] **Step 3: รายงานให้เจ้าของ**

รายงานสามส่วนให้ชัด:
1. สิ่งที่ทำเสร็จและ commit แล้ว (รายการ commit พร้อม hash)
2. สิ่งที่ยังค้างหรือยังไม่ได้รัน (เช่น integration และ e2e ถ้าไม่ได้เปิดฐาน, OpenAPI ถ้าไม่ได้รับอนุมัติ)
3. ค่าที่แผนเลือกเองนอกเหนือจากสเปก (ดูหัวข้อ "ส่วนที่เพิ่มหรือต่างจากสเปก")

- [ ] **Step 4: ไม่ push**

รายงานว่า commit อยู่ในเครื่องบน `ohmattpon/kitchen-tickets` และรอเจ้าของ push และเปิด PR เอง

---

## หลังแผนนี้

หลังบันทึกแผนนี้ จะเลือกวิธีลงมือทำกับเจ้าของ ซึ่งทำได้สองแบบ:
- **Subagent-driven**: ผู้ลงมือทำแต่ละ task แยกกันและให้ผู้รีวิวตรวจก่อน task ถัดไป แล้วรีวิวทั้ง branch ตอนท้าย ใช้เวลาและค่าใช้จ่ายมากที่สุด
- **Native**: ลงมือทำทุก task ในเซสชันนี้เอง แล้วให้ผู้รีวิวหนึ่งคนตรวจทั้ง branch ตอนท้าย เร็วกว่าและถูกกว่า แต่ไม่มีการรีวิวระหว่างทาง

แผนนี้มี 21 task ที่พึ่งพากันผ่านรูปร่างของพอร์ต (Task 8, 9, 11 และ 12) และมีผลกับข้อมูลจริงของร้าน (migration และ merge/split) ดังนั้นควรเลือกแบบ subagent-driven ถ้าต้องการการรีวิวทีละ task
