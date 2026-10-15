# โปรโมชัน Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ร้านตั้งโปรโมชันลดท้ายบิลที่เซิร์ฟเวอร์เลือกและคำนวณเอง โดยตรึงราคาด้วย quote เพื่อให้เงิน QR ที่จ่ายแล้วได้บิลที่ยอดตรงเสมอ

**Architecture:** โมดูล `promotions` (กติกาและการจัดการ) กับโมดูล `quotes` (ตะกร้าที่คิดราคาแล้วและตรึงไว้) ฟังก์ชันคำนวณเป็นฟังก์ชันล้วนใน `domains/` ที่เว็บใช้ร่วมผ่าน `@pos/api/promotions` `SaleCheckout` รับ `quoteId` ที่ไม่บังคับและใช้ราคา ส่วนลด และกติกาภาษีจาก quote ส่วน QR จอง quote ด้วยรหัสอ้างอิงของ QR และ repository ออเดอร์ถูกห่อด้วยตัวกันแก้ไขขณะรอ QR

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod, `bun:test`; เว็บ React, TanStack Query, zustand, react-i18next, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-10-15-promotions-design.md` (แผนนี้อ้างอิงเอกสารนั้นและรวมการแก้ที่ทำตอนเขียนแผน: ตาราง `price_quotes` เก็บ `sale_id` แทนการมี `sales.quote_id`, ใช้ช่อง `value` เดียวแทน `valueSatang`/`valueBp`, ล็อกตามลำดับ ออเดอร์ → รายการชำระด้วย QR → quote → สมาชิก → สินค้า)

## Global Constraints

- จำนวนเงินเป็นจำนวนเต็มสตางค์เสมอ ไม่เกิน `MAX_AMOUNT_SATANG` (2_147_483_647) จาก `domains/sale.domain.ts` ห้ามใช้ทศนิยม
- บิลขายห้ามแก้หรือลบ ห้ามแก้สูตร `calculateTotals` ใน `domains/pricing.ts`
- ทุกเส้นทางใต้ `/api/v1` เป็นการเพิ่มช่องแบบ additive เท่านั้น ห้ามเปลี่ยนความหมายของช่องเดิม คำขอที่ไม่ส่ง `quoteId` ต้องทำงานเหมือนเดิมทุกอย่าง
- ทุก list คืน `{ items, total }` ผ่าน `page()` ใน `libs/http-schemas.ts` และรับ `limit`/`offset`
- error คืนเป็น RFC 9457 มี `code` คงที่ ข้อความผู้ใช้อยู่ใน `detail` เป็นภาษาไทย ห้ามเพิ่มช่อง `message`
- ชั้น `domains/` ห้าม import Elysia, Drizzle, tsyringe, zod, `libs/`, `modules/`, `infrastructure/`
- ชั้น `applications/` ห้าม import Elysia, Drizzle, `infrastructure/`, ไฟล์ใน `adapters/`
- โมดูลเรียกข้ามกันผ่าน port ที่ inject ด้วย token เท่านั้น repository ใช้ `currentExecutor()` และห้ามรับ transaction เป็นพารามิเตอร์
- การอ่านที่ล็อกแถวต้องชื่อลงท้าย `ForUpdate`
- ลำดับล็อกตอนขาย: ออเดอร์ → รายการชำระด้วย QR → quote → สมาชิก → สินค้า (ลำดับสินค้าเดิม)
- ข้อความที่ผู้ใช้อ่านทุกตัวเว็บต้องมาจาก `t()` ใน `locales.ts` ของ feature (th เป็นต้นแบบ, `en` ใช้ `satisfies typeof th`) เงินและวันที่ผ่าน `useFormat()` ห้ามใส่ `฿` หรือหาร 100 เอง
- ปุ่มและช่องกรอกสูง 44px (`h-11`/`size-11`) ตารางใช้ `DataTable` และทุกคอลัมน์ระบุ `priority`
- commit ด้วย `gitcz --non-interactive --type=<type> --scope=<scope> --subject="<อังกฤษ ขึ้นต้นด้วยกริยา ไม่ลงท้ายด้วยจุด>"` เท่านั้น `git add` เฉพาะไฟล์ของเรื่องนั้น ห้าม `git add -A` ชนิดที่ใช้ได้: feat fix refactor test docs style perf ci chore
- AI push ได้เฉพาะ branch `ohmattpon/*` ของงานนี้ ห้าม push `main`, ห้าม force, ห้าม merge, ห้ามเปิด PR
- เจ้าของโครงการต้องรู้ก่อนบันทึก `apps/api/test/openapi-baseline.json` ใหม่ (Task 12)
- integration test ต้องมี PostgreSQL ทดสอบ (`apps/api/.env.test`) ตามหน่วยความจำของโครงการ ห้ามเปิด Docker/WSL เองและห้ามรันสคริปต์ที่ลบฐานข้อมูลกับฐานข้อมูล dev ถ้าต่อฐานข้อมูลไม่ได้ ให้หยุดแล้วถามเจ้าของโครงการ ส่วน unit test (`bun run test:unit`) ไม่ต้องมีฐานข้อมูล
- ก่อนบอกว่างานเสร็จต้องรัน `bun run typecheck` และ `bun run test` ที่ root ให้ผ่าน

## Review Focus

อินพุตหรือเงื่อนไขที่ spec บอกเป็นนัยแต่ไม่มี task ใดทดสอบโดยตรง เรียงจากเสี่ยงมากไปน้อย แต่ละข้อมีการทดสอบกำกับใน task ที่เป็นเจ้าของโค้ด

1. **เงิน QR มาถึงหลังโปรโมชันถูกปิดหรือหมดอายุ และหลังแก้ราคา/VAT กลางทาง** บิลต้องออกด้วยราคาของ quote ไม่ใช่ราคาสด (Task 11: integration)
2. **สมาชิกถูกปิดใช้ระหว่างรอ QR** บิลต้องยังออกได้ (Task 8 unit, Task 11 integration)
3. **ส่ง quote ใบเดียวพร้อมกันจากสองเครื่อง** ต้องได้บิลเดียวและอีกเครื่องได้ `QUOTE_NOT_OPEN` (Task 11 integration)
4. **ใช้เงิน QR ที่ quote จองไว้โดยไม่ส่ง `quoteId`** (เช่น ใช้เงินที่มาถึงช้า) ต้องตอบ `QUOTE_REQUIRED` พร้อม `params.quoteId` ไม่ปล่อยให้ quote ค้างเป็น `reserved` (Task 8)
5. **ช่วงเวลาข้ามเที่ยงคืนกับวันในสัปดาห์ วันสิ้นสุดแบบรวม และเปอร์เซ็นต์ที่ปัดเป็น 0 สตางค์** (Task 2 unit)
6. **แก้ออเดอร์ (รวมถึงเปลี่ยนป้ายชื่อ ย้ายโต๊ะ รวม แยก ยกเลิก) ขณะ quote ถูก QR จอง** ต้อง `ORDER_LOCKED_BY_QR_PAYMENT` และชำระออเดอร์ด้วย quote นั้นต้องยังได้ (Task 10 unit, Task 11 integration)

## File Structure

สร้างใหม่ (API, `apps/api/src/`):

| ไฟล์ | หน้าที่ |
|---|---|
| `domains/promotion.domain.ts` (+ `.test.ts`) | กติกาโปรโมชัน สูตรประเมิน `evaluatePromotion` `pickBestPromotion` และ `PromotionEntity` |
| `domains/price-quote.domain.ts` (+ `.test.ts`) | `PriceQuoteEntity` คิดราคา ตรึงราคา และสถานะ |
| `infrastructure/database/schema/promotions.ts`, `price-quotes.ts` | ตาราง Drizzle |
| `modules/promotions/**` | port, use case, repository, controller, `PromotionCatalog` (ตอบ `IPromotionCatalog`) |
| `modules/quotes/**` | port, use case, `QuoteClaims`, `OrderEditLock`, repository, controller |
| `modules/orders/applications/ports/order-edit-lock.port.ts` | port ที่ orders ถาม quotes |
| `modules/orders/applications/services/order-quote-source.ts` | ตอบ `IOrderQuoteSource` ของ quotes |
| `modules/orders/adapters/repository/guarded-order.repository.ts` | decorator กันแก้ออเดอร์ที่ถูก QR จอง |
| `__tests__/integration/{promotions,quotes,promotion-payments,promotion-shifts}.integration.test.ts` | ทดสอบผ่าน HTTP กับ PostgreSQL |

แก้ไข: `domains/sale.domain.ts`, `infrastructure/database/schema/{sales,index}.ts`, `modules/sales/**` (checkout, schemas, controllers, repository), `modules/orders/**` (pay-order, schemas, module), `modules/qr-payments/**` (claims, create/cancel/dismiss/resolve), `modules/app.module.ts`, `modules/di-registrations.ts`, `__tests__/mocks.ts`, `apps/api/package.json`

เว็บ (`apps/web/src/`): `features/promotions/**` ใหม่, `features/pos/**` (cart, payment, QR), `features/orders/api.ts`, `app/{App.tsx,AppSidebar.tsx,BottomNav.tsx,i18n.ts,locales.ts}`, `locales/errors.ts`, `features/sales/components/Receipt.tsx`

---

### Task 1: ส่วนลดโปรโมชันบนบิล (`SalePromotion`)

**Files:**
- Modify: `apps/api/src/domains/sale.domain.ts`
- Create: `apps/api/src/domains/sale-promotion.domain.test.ts`

**Interfaces:**
- Produces: `SalePromotion { id: number; name: string; kind: 'fixed' | 'percent'; value: number; maxDiscountSatang: number | null; discountSatang: number }`, ช่อง `promotion?: SalePromotion | null` ใน `NewSale`/`CompleteSaleInput`, `SaleEntity.promotion: Readonly<SalePromotion> | null`, และ `toSnapshot().promotion`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

สร้าง `apps/api/src/domains/sale-promotion.domain.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { makeProduct } from '../__tests__/factories'
import { SaleEntity, type SalePromotion } from './sale.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const promotion: SalePromotion = {
  id: 4, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, discountSatang: 1000,
}
const base = {
  lines: [{ product: makeProduct({ priceSatang: 10000 }), quantity: 1 }],
  payments: [{ method: 'cash' as const, amountSatang: 10000 }],
  vatMode: 'inclusive' as const,
  vatRateBp: 700,
  branchId: 1,
  cashier: { id: 1, displayName: 'แคชเชียร์' },
}
const stored = (sale: ReturnType<typeof SaleEntity.complete>) =>
  new SaleEntity({
    ...sale, id: 1, receiptNo: 'MAIN-20261015-00001', status: 'completed',
    voidedById: null, voidedAt: null, voidReason: null, createdAt: new Date('2026-10-15T05:00:00Z'),
  })

describe('sale promotion snapshot', () => {
  test('keeps the promotion beside the discount it gave', () => {
    const sale = stored(SaleEntity.complete({ ...base, discountSatang: 1000, promotion }))
    expect(sale.promotion).toEqual(promotion)
    expect(sale.discountSatang).toBe(1000)
    expect(sale.totalSatang).toBe(9000)
  })

  test('a sale without a promotion has null, and so does one restored from an older snapshot', () => {
    const sale = stored(SaleEntity.complete({ ...base, discountSatang: 0 }))
    expect(sale.promotion).toBeNull()
    const { promotion: _dropped, ...legacy } = sale.toSnapshot()
    expect(new SaleEntity(legacy).promotion).toBeNull()
  })

  test('the discount has to be the one the promotion gave', () => {
    expect(codeOf(() => SaleEntity.complete({ ...base, discountSatang: 500, promotion }))).toBe('INVALID_DISCOUNT')
  })

  test('the snapshot used to replay an idempotent request carries the promotion', () => {
    const sale = stored(SaleEntity.complete({ ...base, discountSatang: 1000, promotion }))
    expect(sale.toSnapshot().promotion).toEqual(promotion)
    expect(new SaleEntity(sale.toSnapshot()).promotion).toEqual(promotion)
  })
})
```

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/sale-promotion.domain.test.ts`
Expected: FAIL (`promotion` ไม่มีใน `SaleEntity` หรือ type error ของ `SalePromotion`)

- [ ] **Step 3: เขียนโค้ด**

ใน `apps/api/src/domains/sale.domain.ts`

(ก) ต่อจาก `const copyMember = ...` เพิ่ม:

```ts
/**
 * The promotion a sale was given, as it was when sold, kept so editing or closing the promotion later
 * never changes an old receipt. `value` is satang for `fixed` and basis points for `percent`.
 */
export interface SalePromotion {
  id: number
  name: string
  kind: 'fixed' | 'percent'
  value: number
  maxDiscountSatang: number | null
  discountSatang: number
}

const copyPromotion = (promotion?: SalePromotion | null): SalePromotion | null =>
  promotion
    ? {
        id: promotion.id,
        name: promotion.name,
        kind: promotion.kind,
        value: promotion.value,
        maxDiscountSatang: promotion.maxDiscountSatang,
        discountSatang: promotion.discountSatang,
      }
    : null
```

(ข) ใน `interface NewSale` ต่อจาก `member?: SaleMember | null` เพิ่ม `promotion?: SalePromotion | null`

(ค) ใน `interface CompleteSaleInput` ต่อจาก `member?: SaleMember | null` เพิ่ม `promotion?: SalePromotion | null`

(ง) ใน `class SaleEntity` ต่อจาก `public readonly member: ...` เพิ่ม `public readonly promotion: Readonly<SalePromotion> | null` และใน constructor ต่อจากบรรทัด `this.member = ...` เพิ่ม:

```ts
    // `?? null`: a sale restored from a snapshot stored before promotions were kept has none.
    this.promotion = props.promotion ? Object.freeze(copyPromotion(props.promotion)!) : null
```

(จ) ใน `static complete({ ... })` เพิ่ม `promotion` ในรายการที่แตกจาก input, ใส่การตรวจต่อจากการตรวจ `isWholeAmount(discountSatang)`:

```ts
    if (promotion && promotion.discountSatang !== discountSatang)
      throw new DomainError('ส่วนลดไม่ตรงกับโปรโมชันที่ใช้', 'INVALID_DISCOUNT')
```

และใน object ที่ return เพิ่ม `promotion: copyPromotion(promotion),` ต่อจาก `member: copyMember(member),`

(ฉ) ใน `toSnapshot()` เปลี่ยนชนิดคืนเป็น `SaleEntityProps & { member: SaleMember | null; promotion: SalePromotion | null }` และเพิ่ม `promotion: copyPromotion(this.promotion),` ต่อจาก `member: copyMember(this.member),`

- [ ] **Step 4: รันการทดสอบให้ผ่าน แล้วตรวจชนิดทั้ง package**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/sale-promotion.domain.test.ts src/domains && bun run typecheck`
Expected: PASS (ทดสอบ domain เดิมทั้งหมดยังผ่าน) และ typecheck ผ่าน ถ้ามี type error ที่ที่สร้าง `ISaleHeader` ให้ปล่อยไว้แก้ใน Task 8 (ช่อง `promotion` เป็น optional ใน `NewSale` จึงไม่ควรมี error)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/sale.domain.ts apps/api/src/domains/sale-promotion.domain.test.ts
gitcz --non-interactive --type=feat --scope=sales --subject="keep the promotion a sale was given"
```

---

### Task 2: กติกาและสูตรโปรโมชัน (`promotion.domain.ts`)

**Files:**
- Create: `apps/api/src/domains/promotion.domain.ts`
- Create: `apps/api/src/domains/promotion.domain.test.ts`
- Modify: `apps/api/package.json` (exports)

**Interfaces:**
- Consumes: `SalePromotion`, `MAX_AMOUNT_SATANG` จาก `./sale.domain`
- Produces:
  - `PROMOTION_KINDS`, `PromotionKind`, `PROMOTION_AUDIENCES`, `PromotionAudience`
  - `interface PromotionRules { id; kind; value; maxDiscountSatang: number | null; minSubtotalSatang; startsOn: string | null; endsOn: string | null; weekdays: readonly number[] | null; windowStartMinute: number | null; windowEndMinute: number | null; audience; isActive }`
  - `interface PromotionContext { subtotalSatang: number; hasMember: boolean; at: Date; timeZone: string }`
  - `evaluatePromotion(rules, context): { eligible: false } | { eligible: true; discountSatang: number }`
  - `pickBestPromotion<T extends PromotionRules>(promotions: readonly T[], context): { promotion: T; discountSatang: number } | null`
  - `class PromotionEntity` (constructor รับ `PromotionProps = PromotionRules & { name; createdAt; updatedAt }`, `with(changes, now)`, `toSnapshot()`, `toSalePromotion(discountSatang)`)

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

สร้าง `apps/api/src/domains/promotion.domain.test.ts` (วันที่ 2026-10-15 เป็นวันพฤหัสบดี = 4, เขตเวลา `Asia/Bangkok` = UTC+7):

```ts
import { describe, expect, test } from 'bun:test'
import {
  evaluatePromotion, pickBestPromotion, PromotionEntity,
  type PromotionContext, type PromotionRules,
} from './promotion.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const rules = (overrides: Partial<PromotionRules> = {}): PromotionRules => ({
  id: 1, kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
  startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
  audience: 'everyone', isActive: true, ...overrides,
})
const context = (overrides: Partial<PromotionContext> = {}): PromotionContext => ({
  subtotalSatang: 10000, hasMember: false, at: new Date('2026-10-15T03:00:00Z'), timeZone: 'Asia/Bangkok', ...overrides,
})
const discount = (r: PromotionRules, c: PromotionContext) => {
  const result = evaluatePromotion(r, c)
  return result.eligible ? result.discountSatang : null
}

describe('discount amount', () => {
  test('a fixed promotion gives its value, never more than the subtotal', () => {
    expect(discount(rules({ kind: 'fixed', value: 500 }), context())).toBe(500)
    expect(discount(rules({ kind: 'fixed', value: 5000 }), context({ subtotalSatang: 3000 }))).toBe(3000)
  })

  test('a percent promotion rounds to the satang and stops at its cap', () => {
    expect(discount(rules({ value: 1000 }), context({ subtotalSatang: 15555 }))).toBe(1556)
    expect(discount(rules({ value: 1000, maxDiscountSatang: 1000 }), context({ subtotalSatang: 15555 }))).toBe(1000)
    expect(discount(rules({ value: 10000 }), context({ subtotalSatang: 4200 }))).toBe(4200)
  })

  test('a promotion that would give nothing is not eligible', () => {
    expect(evaluatePromotion(rules({ value: 1 }), context({ subtotalSatang: 100 }))).toEqual({ eligible: false })
    expect(evaluatePromotion(rules(), context({ subtotalSatang: 0 }))).toEqual({ eligible: false })
  })
})

describe('who and what it applies to', () => {
  test('a disabled promotion never applies', () => {
    expect(evaluatePromotion(rules({ isActive: false }), context())).toEqual({ eligible: false })
  })

  test('a members-only promotion needs a member', () => {
    const memberOnly = rules({ audience: 'members' })
    expect(evaluatePromotion(memberOnly, context({ hasMember: false }))).toEqual({ eligible: false })
    expect(discount(memberOnly, context({ hasMember: true }))).toBe(1000)
  })

  test('the minimum is compared with the subtotal before discount', () => {
    const minimum = rules({ minSubtotalSatang: 10000 })
    expect(discount(minimum, context({ subtotalSatang: 9999 }))).toBeNull()
    expect(discount(minimum, context({ subtotalSatang: 10000 }))).toBe(1000)
  })
})

describe('when it applies, in the shop time zone', () => {
  test('the end date is included to the last minute of that day', () => {
    const ends = rules({ endsOn: '2026-10-15' })
    expect(discount(ends, context({ at: new Date('2026-10-15T16:59:00Z') }))).toBe(1000) // 23:59 Bangkok
    expect(discount(ends, context({ at: new Date('2026-10-15T17:00:00Z') }))).toBeNull() // 00:00 next day
  })

  test('the start date opens at midnight of the shop, not of UTC', () => {
    const starts = rules({ startsOn: '2026-10-15' })
    expect(discount(starts, context({ at: new Date('2026-10-14T16:59:00Z') }))).toBeNull() // 23:59 on the 14th
    expect(discount(starts, context({ at: new Date('2026-10-14T17:00:00Z') }))).toBe(1000) // 00:00 on the 15th
  })

  test('weekdays name the days it applies on (0 = Sunday)', () => {
    const thursdays = rules({ weekdays: [4] })
    expect(discount(thursdays, context())).toBe(1000)
    expect(discount(rules({ weekdays: [1, 2] }), context())).toBeNull()
  })

  test('a time window is half open: its start is inside, its end is outside', () => {
    const lunch = rules({ windowStartMinute: 11 * 60, windowEndMinute: 14 * 60 })
    expect(discount(lunch, context({ at: new Date('2026-10-15T04:00:00Z') }))).toBe(1000) // 11:00
    expect(discount(lunch, context({ at: new Date('2026-10-15T06:59:00Z') }))).toBe(1000) // 13:59
    expect(discount(lunch, context({ at: new Date('2026-10-15T07:00:00Z') }))).toBeNull() // 14:00
    expect(discount(lunch, context({ at: new Date('2026-10-15T03:59:00Z') }))).toBeNull() // 10:59
  })

  test('a window across midnight belongs to the weekday it started on', () => {
    // Fridays 22:00-02:00. 2026-10-16 is a Friday, 2026-10-17 a Saturday.
    const lateFriday = rules({ weekdays: [5], windowStartMinute: 22 * 60, windowEndMinute: 2 * 60 })
    expect(discount(lateFriday, context({ at: new Date('2026-10-16T15:30:00Z') }))).toBe(1000) // Fri 22:30
    expect(discount(lateFriday, context({ at: new Date('2026-10-16T18:30:00Z') }))).toBe(1000) // Sat 01:30
    expect(discount(lateFriday, context({ at: new Date('2026-10-16T19:30:00Z') }))).toBeNull() // Sat 02:30
    expect(discount(lateFriday, context({ at: new Date('2026-10-17T15:30:00Z') }))).toBeNull() // Sat 22:30
  })

  test('a window across midnight uses the start day for the dates too', () => {
    const lastNight = rules({ endsOn: '2026-10-15', windowStartMinute: 22 * 60, windowEndMinute: 2 * 60 })
    expect(discount(lastNight, context({ at: new Date('2026-10-15T18:30:00Z') }))).toBe(1000) // 01:30 on the 16th, started on the 15th
    expect(discount(lastNight, context({ at: new Date('2026-10-16T15:30:00Z') }))).toBeNull() // 22:30 on the 16th
  })
})

describe('choosing the best', () => {
  test('the biggest discount wins and a tie goes to the lowest id', () => {
    const small = rules({ id: 3, kind: 'fixed', value: 500 })
    const big = rules({ id: 5, kind: 'fixed', value: 900 })
    const sameAsBig = rules({ id: 4, kind: 'fixed', value: 900 })
    expect(pickBestPromotion([small, big, sameAsBig], context())).toEqual({ promotion: sameAsBig, discountSatang: 900 })
  })

  test('none eligible is null', () => {
    expect(pickBestPromotion([rules({ isActive: false })], context())).toBeNull()
    expect(pickBestPromotion([], context())).toBeNull()
  })
})

describe('PromotionEntity', () => {
  const props = {
    ...rules(), name: '  ลดวันพฤหัส  ', createdAt: new Date('2026-10-15T00:00:00Z'), updatedAt: new Date('2026-10-15T00:00:00Z'),
  }
  const invalid = (changes: Partial<typeof props>) =>
    expect(codeOf(() => new PromotionEntity({ ...props, ...changes }))).toBe('INVALID_PROMOTION')

  test('trims the name and turns an empty weekday list into every day', () => {
    const entity = new PromotionEntity({ ...props, weekdays: [] })
    expect(entity.name).toBe('ลดวันพฤหัส')
    expect(entity.weekdays).toBeNull()
  })

  test('sorts weekdays and drops repeats', () => {
    expect(new PromotionEntity({ ...props, weekdays: [5, 1, 5, 0] }).weekdays).toEqual([0, 1, 5])
  })

  test('rejects values outside what each kind allows', () => {
    invalid({ name: '   ' })
    invalid({ name: 'x'.repeat(81) })
    invalid({ kind: 'percent', value: 0 })
    invalid({ kind: 'percent', value: 10001 })
    invalid({ kind: 'fixed', value: 0 })
    invalid({ kind: 'fixed', value: 2_147_483_648 })
    invalid({ value: 10.5 })
  })

  test('a cap belongs to percent promotions only and must be positive', () => {
    invalid({ kind: 'fixed', value: 500, maxDiscountSatang: 100 })
    invalid({ maxDiscountSatang: 0 })
    expect(new PromotionEntity({ ...props, maxDiscountSatang: 100 }).maxDiscountSatang).toBe(100)
  })

  test('rejects an impossible calendar, weekday or window', () => {
    invalid({ startsOn: '2026-02-30' })
    invalid({ endsOn: '15/10/2026' })
    invalid({ startsOn: '2026-10-16', endsOn: '2026-10-15' })
    invalid({ weekdays: [7] })
    invalid({ weekdays: [-1] })
    invalid({ windowStartMinute: 600, windowEndMinute: null })
    invalid({ windowStartMinute: 600, windowEndMinute: 600 })
    invalid({ windowStartMinute: 1440, windowEndMinute: 10 })
    invalid({ minSubtotalSatang: -1 })
  })

  test('`with` changes only what is given, keeps null as a value, and validates the result', () => {
    const entity = new PromotionEntity({ ...props, maxDiscountSatang: 100, startsOn: '2026-10-01' })
    const later = new Date('2026-10-16T00:00:00Z')
    const changed = entity.with({ endsOn: '2026-10-31', startsOn: null }, later)
    expect(changed).toMatchObject({ endsOn: '2026-10-31', startsOn: null, maxDiscountSatang: 100, updatedAt: later })
    expect(changed.createdAt).toEqual(entity.createdAt)
    expect(codeOf(() => entity.with({ kind: 'fixed' }, later))).toBe('INVALID_PROMOTION')
  })

  test('toSalePromotion snapshots the rule with the discount it gave', () => {
    const entity = new PromotionEntity({ ...props, id: 9, maxDiscountSatang: 700 })
    expect(entity.toSalePromotion(650)).toEqual({
      id: 9, name: 'ลดวันพฤหัส', kind: 'percent', value: 1000, maxDiscountSatang: 700, discountSatang: 650,
    })
  })
})
```

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/promotion.domain.test.ts`
Expected: FAIL (`Cannot find module './promotion.domain'`)

- [ ] **Step 3: เขียนโค้ด**

สร้าง `apps/api/src/domains/promotion.domain.ts`:

```ts
import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG, type SalePromotion } from './sale.domain'

export const PROMOTION_KINDS = ['fixed', 'percent'] as const
export type PromotionKind = (typeof PROMOTION_KINDS)[number]

export const PROMOTION_AUDIENCES = ['everyone', 'members'] as const
export type PromotionAudience = (typeof PROMOTION_AUDIENCES)[number]

/** The part of a promotion the rules read; the entity and the web's plain objects both satisfy it. */
export interface PromotionRules {
  id: number
  kind: PromotionKind
  /** Satang for `fixed`, basis points for `percent` (700 = 7%). */
  value: number
  /** Ceiling of a `percent` promotion; null means none. */
  maxDiscountSatang: number | null
  /** Compared with the subtotal before discount and before VAT that is added on top. */
  minSubtotalSatang: number
  /** Dates in the shop's time zone as `YYYY-MM-DD`, both included; null means unbounded. */
  startsOn: string | null
  endsOn: string | null
  /** 0 = Sunday ... 6 = Saturday; null means every day. */
  weekdays: readonly number[] | null
  /** Minutes of the day. The end is outside the window; an end before the start crosses midnight. */
  windowStartMinute: number | null
  windowEndMinute: number | null
  audience: PromotionAudience
  isActive: boolean
}

export interface PromotionContext {
  subtotalSatang: number
  hasMember: boolean
  at: Date
  timeZone: string
}

export type PromotionEvaluation = { eligible: false } | { eligible: true; discountSatang: number }

const NOT_ELIGIBLE: PromotionEvaluation = { eligible: false }
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BASIS_POINTS = 10_000

interface Day {
  /** `YYYY-MM-DD`. */
  date: string
  weekday: number
}

/** The date, weekday and minute of the day that `at` is in the given time zone. */
function localMoment(at: Date, timeZone: string): Day & { minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)!.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: WEEKDAY_NAMES.indexOf(part('weekday')),
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  }
}

function previousDay(date: string): Day {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return { date: day.toISOString().slice(0, 10), weekday: day.getUTCDay() }
}

/**
 * The one rule for whether a promotion applies and what it gives, shared by the server and the till so
 * the cart shows what the server will choose. All amounts are integer satang.
 */
export function evaluatePromotion(rules: PromotionRules, context: PromotionContext): PromotionEvaluation {
  if (!rules.isActive) return NOT_ELIGIBLE
  if (rules.audience === 'members' && !context.hasMember) return NOT_ELIGIBLE
  if (context.subtotalSatang < 1 || context.subtotalSatang < rules.minSubtotalSatang) return NOT_ELIGIBLE

  const now = localMoment(context.at, context.timeZone)
  // The day a window belongs to is the day it started on, so "Friday 22:00-02:00" includes Saturday 01:00.
  let day: Day = { date: now.date, weekday: now.weekday }
  if (rules.windowStartMinute !== null && rules.windowEndMinute !== null) {
    const start = rules.windowStartMinute
    const end = rules.windowEndMinute
    if (start < end) {
      if (now.minute < start || now.minute >= end) return NOT_ELIGIBLE
    } else if (now.minute < start) {
      if (now.minute >= end) return NOT_ELIGIBLE
      day = previousDay(now.date)
    }
  }
  if (rules.weekdays && rules.weekdays.length > 0 && !rules.weekdays.includes(day.weekday)) return NOT_ELIGIBLE
  if (rules.startsOn !== null && day.date < rules.startsOn) return NOT_ELIGIBLE
  if (rules.endsOn !== null && day.date > rules.endsOn) return NOT_ELIGIBLE

  const given =
    rules.kind === 'fixed' ? rules.value : Math.round((context.subtotalSatang * rules.value) / BASIS_POINTS)
  const capped =
    rules.kind === 'percent' && rules.maxDiscountSatang !== null ? Math.min(given, rules.maxDiscountSatang) : given
  const discountSatang = Math.min(capped, context.subtotalSatang)
  return discountSatang >= 1 ? { eligible: true, discountSatang } : NOT_ELIGIBLE
}

/** The promotion that gives the most; a tie goes to the lowest id so the answer is always the same. */
export function pickBestPromotion<T extends PromotionRules>(
  promotions: readonly T[],
  context: PromotionContext,
): { promotion: T; discountSatang: number } | null {
  let best: { promotion: T; discountSatang: number } | null = null
  for (const promotion of promotions) {
    const result = evaluatePromotion(promotion, context)
    if (!result.eligible) continue
    const beats =
      best === null ||
      result.discountSatang > best.discountSatang ||
      (result.discountSatang === best.discountSatang && promotion.id < best.promotion.id)
    if (beats) best = { promotion, discountSatang: result.discountSatang }
  }
  return best
}

export interface PromotionProps extends PromotionRules {
  name: string
  createdAt: Date
  updatedAt: Date
}

export type PromotionChanges = Partial<Omit<PromotionProps, 'id' | 'createdAt' | 'updatedAt'>>

const invalid = (message: string) => new DomainError(message, 'INVALID_PROMOTION')
const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)
const MAX_NAME_LENGTH = 80
const MINUTES_PER_DAY = 1440

function assertDate(value: string | null, label: string) {
  if (value === null) return
  const parsed = new Date(`${value}T00:00:00Z`)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  if (!valid) throw invalid(`${label}ไม่ถูกต้อง`)
}

/** A promotion the shop has set up. Every change returns a new entity. */
export class PromotionEntity implements PromotionRules {
  public readonly id: number
  public readonly name: string
  public readonly kind: PromotionKind
  public readonly value: number
  public readonly maxDiscountSatang: number | null
  public readonly minSubtotalSatang: number
  public readonly startsOn: string | null
  public readonly endsOn: string | null
  public readonly weekdays: readonly number[] | null
  public readonly windowStartMinute: number | null
  public readonly windowEndMinute: number | null
  public readonly audience: PromotionAudience
  public readonly isActive: boolean
  public readonly createdAt: Date
  public readonly updatedAt: Date

  constructor(props: PromotionProps) {
    const name = props.name.trim()
    if (name.length < 1 || name.length > MAX_NAME_LENGTH)
      throw invalid(`ชื่อโปรโมชันต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`)
    if (!PROMOTION_KINDS.includes(props.kind)) throw invalid('ชนิดของโปรโมชันไม่ถูกต้อง')
    if (props.kind === 'fixed' && !(isWholeNumber(props.value) && props.value >= 1 && props.value <= MAX_AMOUNT_SATANG))
      throw invalid('ส่วนลดเป็นบาทต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป และไม่เกินที่ระบบรองรับ')
    if (props.kind === 'percent' && !(isWholeNumber(props.value) && props.value >= 1 && props.value <= BASIS_POINTS))
      throw invalid('ส่วนลดเป็นเปอร์เซ็นต์ต้องอยู่ระหว่าง 0.01% ถึง 100%')
    if (props.maxDiscountSatang !== null) {
      if (props.kind !== 'percent') throw invalid('เพดานส่วนลดใช้ได้กับแบบเปอร์เซ็นต์เท่านั้น')
      if (!isWholeNumber(props.maxDiscountSatang) || props.maxDiscountSatang < 1 || props.maxDiscountSatang > MAX_AMOUNT_SATANG)
        throw invalid('เพดานส่วนลดต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป')
    }
    if (!isWholeNumber(props.minSubtotalSatang) || props.minSubtotalSatang < 0 || props.minSubtotalSatang > MAX_AMOUNT_SATANG)
      throw invalid('ยอดขั้นต่ำต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ')

    assertDate(props.startsOn, 'วันเริ่ม')
    assertDate(props.endsOn, 'วันสิ้นสุด')
    if (props.startsOn !== null && props.endsOn !== null && props.startsOn > props.endsOn)
      throw invalid('วันเริ่มต้องไม่เกินวันสิ้นสุด')

    let weekdays: number[] | null = null
    if (props.weekdays !== null && props.weekdays.length > 0) {
      if (!props.weekdays.every((day) => isWholeNumber(day) && day >= 0 && day <= 6))
        throw invalid('วันในสัปดาห์ต้องเป็นเลข 0 ถึง 6')
      weekdays = [...new Set(props.weekdays)].sort((a, b) => a - b)
    }

    const { windowStartMinute: start, windowEndMinute: end } = props
    if ((start === null) !== (end === null)) throw invalid('ต้องกำหนดเวลาเริ่มและเวลาสิ้นสุดของช่วงเวลาพร้อมกัน')
    if (start !== null && end !== null) {
      const inDay = (minute: number) => isWholeNumber(minute) && minute >= 0 && minute < MINUTES_PER_DAY
      if (!inDay(start) || !inDay(end)) throw invalid('เวลาของช่วงเวลาไม่ถูกต้อง')
      if (start === end) throw invalid('เวลาเริ่มและเวลาสิ้นสุดต้องไม่เท่ากัน')
    }
    if (!PROMOTION_AUDIENCES.includes(props.audience)) throw invalid('กลุ่มลูกค้าไม่ถูกต้อง')

    this.id = props.id
    this.name = name
    this.kind = props.kind
    this.value = props.value
    this.maxDiscountSatang = props.maxDiscountSatang
    this.minSubtotalSatang = props.minSubtotalSatang
    this.startsOn = props.startsOn
    this.endsOn = props.endsOn
    this.weekdays = weekdays
    this.windowStartMinute = start
    this.windowEndMinute = end
    this.audience = props.audience
    this.isActive = props.isActive
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  /** Only the fields given change; `null` is a value (it clears a bound), `undefined` means leave it. */
  with(changes: PromotionChanges, now: Date): PromotionEntity {
    const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    return new PromotionEntity({ ...this.toSnapshot(), ...given, updatedAt: now })
  }

  /** What a sale keeps of this promotion when it gave `discountSatang`. */
  toSalePromotion(discountSatang: number): SalePromotion {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      value: this.value,
      maxDiscountSatang: this.maxDiscountSatang,
      discountSatang,
    }
  }

  toSnapshot(): PromotionProps {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      value: this.value,
      maxDiscountSatang: this.maxDiscountSatang,
      minSubtotalSatang: this.minSubtotalSatang,
      startsOn: this.startsOn,
      endsOn: this.endsOn,
      weekdays: this.weekdays ? [...this.weekdays] : null,
      windowStartMinute: this.windowStartMinute,
      windowEndMinute: this.windowEndMinute,
      audience: this.audience,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}
```

ใน `apps/api/package.json` ที่ `exports` ต่อจากบรรทัด `"./modifiers": ...` เพิ่ม:

```json
    "./promotions": "./src/domains/promotion.domain.ts",
```

- [ ] **Step 4: รันการทดสอบให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/promotion.domain.test.ts && bun run typecheck`
Expected: PASS ทุกกรณี และ typecheck ผ่าน

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/promotion.domain.ts apps/api/src/domains/promotion.domain.test.ts apps/api/package.json
gitcz --non-interactive --type=feat --scope=promotions --subject="add promotion rules and best-discount selection"
```

---

### Task 3: ตะกร้าที่ตรึงราคา (`price-quote.domain.ts`)

**Files:**
- Create: `apps/api/src/domains/price-quote.domain.ts`
- Create: `apps/api/src/domains/price-quote.domain.test.ts`

**Interfaces:**
- Consumes: `SaleMember`, `SalePromotion`, `MAX_AMOUNT_SATANG` จาก `./sale.domain`, `LineOption`, `lineKey` จาก `./modifier.domain`, `calculateTotals`, `VatMode` จาก `./pricing`
- Produces:
  - `QUOTE_STATUSES`, `QuoteStatus`, `QUOTE_VALID_FOR_MS` (15 นาที)
  - `QuoteLine { productId; productName; sku; unitPriceSatang; quantity; options: LineOption[] }`
  - `QuoteRequestLine { productId: number; optionIds: readonly number[]; quantity: number }`, `QuoteRequest { branchId: number; memberId: number | null; lines: readonly QuoteRequestLine[] }`
  - `NewPriceQuote` (`branchId, memberId, member, orderId, lines, promotion, vatMode, vatRateBp, createdById`), `PricedQuote extends NewPriceQuote` (+ `subtotalSatang, discountSatang, vatSatang, totalSatang, expiresAt`), `PriceQuoteProps extends PricedQuote` (+ `id, status, qrReference, saleId, createdAt`)
  - `PriceQuoteEntity.price(input, now): PricedQuote`
  - เมธอดบน entity: `assertSellable(request, now, claimedReferences)`, `assertQrAmount(amountSatang)`, `reserve(reference, now)`, `release(reference)`, `cancelReserved(reference)`, `cancel()`, `consume(saleId)`, `matches(request)`, `toSnapshot()`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

สร้าง `apps/api/src/domains/price-quote.domain.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  PriceQuoteEntity, QUOTE_VALID_FOR_MS,
  type NewPriceQuote, type PriceQuoteProps, type QuoteRequest,
} from './price-quote.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const now = new Date('2026-10-15T05:00:00Z')
const option = { groupId: 1, groupName: 'ท็อปปิง', optionId: 7, name: 'ไข่มุก', priceSatang: 500, costSatang: 200 }
const input = (overrides: Partial<NewPriceQuote> = {}): NewPriceQuote => ({
  branchId: 1, memberId: null, member: null, orderId: null,
  lines: [
    { productId: 1, productName: 'ชาไทย', sku: 'T1', unitPriceSatang: 4500, quantity: 2, options: [option] },
    { productId: 2, productName: 'เค้ก', sku: 'C1', unitPriceSatang: 6000, quantity: 1, options: [] },
  ],
  promotion: null, vatMode: 'inclusive', vatRateBp: 700, createdById: 3, ...overrides,
})
const stored = (overrides: Partial<PriceQuoteProps> = {}) =>
  new PriceQuoteEntity({
    ...PriceQuoteEntity.price(input(), now), id: 11, status: 'open', qrReference: null, saleId: null, createdAt: now, ...overrides,
  })
const request = (overrides: Partial<QuoteRequest> = {}): QuoteRequest => ({
  branchId: 1, memberId: null,
  lines: [{ productId: 2, optionIds: [], quantity: 1 }, { productId: 1, optionIds: [7], quantity: 2 }],
  ...overrides,
})
const after = (ms: number) => new Date(now.getTime() + ms)

describe('pricing a quote', () => {
  test('totals come from the lines and the shared pricing rule', () => {
    const priced = PriceQuoteEntity.price(input(), now)
    expect(priced).toMatchObject({ subtotalSatang: 15000, discountSatang: 0, vatSatang: 981, totalSatang: 15000 })
    expect(priced.expiresAt).toEqual(after(QUOTE_VALID_FOR_MS))
  })

  test('a promotion lowers the total and is kept with the discount it gave', () => {
    const promotion = { id: 2, name: 'ลด 10%', kind: 'percent' as const, value: 1000, maxDiscountSatang: null, discountSatang: 1500 }
    const priced = PriceQuoteEntity.price(input({ promotion }), now)
    expect(priced).toMatchObject({ discountSatang: 1500, totalSatang: 13500, promotion })
  })

  test('VAT added on top raises the total, and none keeps the rate at zero', () => {
    expect(PriceQuoteEntity.price(input({ vatMode: 'exclusive' }), now)).toMatchObject({ vatSatang: 1050, totalSatang: 16050 })
    expect(PriceQuoteEntity.price(input({ vatMode: 'none' }), now)).toMatchObject({ vatSatang: 0, vatRateBp: 0, totalSatang: 15000 })
  })

  test('refuses an empty cart, a bad quantity, and a discount larger than the lines', () => {
    expect(codeOf(() => PriceQuoteEntity.price(input({ lines: [] }), now))).toBe('EMPTY_SALE')
    const bad = input().lines.map((line) => ({ ...line, quantity: 0 }))
    expect(codeOf(() => PriceQuoteEntity.price(input({ lines: bad }), now))).toBe('INVALID_QUANTITY')
    const promotion = { id: 2, name: 'x', kind: 'fixed' as const, value: 99999, maxDiscountSatang: null, discountSatang: 99999 }
    expect(codeOf(() => PriceQuoteEntity.price(input({ promotion }), now))).toBe('DISCOUNT_TOO_LARGE')
  })
})

describe('matching a request', () => {
  test('same branch, member and lines in any order match; repeated lines add up', () => {
    expect(stored().matches(request())).toBe(true)
    const split = request({ lines: [{ productId: 1, optionIds: [7], quantity: 1 }, { productId: 2, optionIds: [], quantity: 1 }, { productId: 1, optionIds: [7], quantity: 1 }] })
    expect(stored().matches(split)).toBe(true)
  })

  test('another branch, member, quantity, option or product does not match', () => {
    const quote = stored()
    expect(quote.matches(request({ branchId: 2 }))).toBe(false)
    expect(quote.matches(request({ memberId: 5 }))).toBe(false)
    expect(quote.matches(request({ lines: [{ productId: 2, optionIds: [], quantity: 1 }, { productId: 1, optionIds: [7], quantity: 3 }] }))).toBe(false)
    expect(quote.matches(request({ lines: [{ productId: 2, optionIds: [], quantity: 1 }, { productId: 1, optionIds: [], quantity: 2 }] }))).toBe(false)
    expect(quote.matches(request({ lines: [{ productId: 2, optionIds: [], quantity: 1 }] }))).toBe(false)
  })
})

describe('whether it can be sold against', () => {
  test('an open quote is sold before it expires, for the cart it was made for, with no QR', () => {
    expect(() => stored().assertSellable(request(), after(QUOTE_VALID_FOR_MS - 1), [])).not.toThrow()
  })

  test('an open quote expires', () => {
    expect(codeOf(() => stored().assertSellable(request(), after(QUOTE_VALID_FOR_MS), []))).toBe('QUOTE_EXPIRED')
  })

  test('a QR that was not made from this quote cannot pay for it', () => {
    expect(codeOf(() => stored().assertSellable(request(), now, ['QRABC']))).toBe('QUOTE_MISMATCH')
  })

  test('a quote held by a QR is sold only with that QR, and long after it would have expired', () => {
    const held = stored({ status: 'reserved', qrReference: 'QRABC' })
    expect(() => held.assertSellable(request(), after(QUOTE_VALID_FOR_MS * 10), ['QRABC'])).not.toThrow()
    expect(codeOf(() => held.assertSellable(request(), now, []))).toBe('QUOTE_NOT_OPEN')
    expect(codeOf(() => held.assertSellable(request(), now, ['QROTHER']))).toBe('QUOTE_NOT_OPEN')
  })

  test('a used or cancelled quote is not open', () => {
    for (const status of ['consumed', 'cancelled'] as const)
      expect(codeOf(() => stored({ status }).assertSellable(request(), now, []))).toBe('QUOTE_NOT_OPEN')
  })

  test('a different cart does not match, and that is not a reason to lose the quote', () => {
    const held = stored({ status: 'reserved', qrReference: 'QRABC' })
    expect(codeOf(() => held.assertSellable(request({ memberId: 9 }), now, ['QRABC']))).toBe('QUOTE_MISMATCH')
    expect(held.status).toBe('reserved')
  })
})

describe('life of a quote', () => {
  test('reserving ties it to a QR reference and only works while it is open and fresh', () => {
    const held = stored().reserve('QRABC', now)
    expect(held).toMatchObject({ status: 'reserved', qrReference: 'QRABC' })
    expect(codeOf(() => stored().reserve('QRABC', after(QUOTE_VALID_FOR_MS)))).toBe('QUOTE_EXPIRED')
    expect(codeOf(() => held.reserve('QROTHER', now))).toBe('QUOTE_NOT_OPEN')
  })

  test('reserving again with the same reference changes nothing (a retried request)', () => {
    const held = stored().reserve('QRABC', now)
    expect(held.reserve('QRABC', after(QUOTE_VALID_FOR_MS * 2))).toBe(held)
  })

  test('releasing returns it to open and forgets the reference; it is harmless when nothing is held', () => {
    const released = stored().reserve('QRABC', now).release('QRABC')
    expect(released).toMatchObject({ status: 'open', qrReference: null })
    const open = stored()
    expect(open.release('QRABC')).toBe(open)
    const held = stored({ status: 'reserved', qrReference: 'QRABC' })
    expect(held.release('QROTHER')).toBe(held)
  })

  test('cancelReserved closes a quote whose QR money will never be billed', () => {
    expect(stored({ status: 'reserved', qrReference: 'QRABC' }).cancelReserved('QRABC').status).toBe('cancelled')
    const open = stored()
    expect(open.cancelReserved('QRABC')).toBe(open)
  })

  test('only an open quote can be cancelled by the till', () => {
    expect(stored().cancel().status).toBe('cancelled')
    expect(stored().cancel().cancel().status).toBe('cancelled')
    expect(codeOf(() => stored({ status: 'reserved', qrReference: 'QRABC' }).cancel())).toBe('QUOTE_NOT_OPEN')
    expect(codeOf(() => stored({ status: 'consumed', saleId: 1 }).cancel())).toBe('QUOTE_NOT_OPEN')
  })

  test('consuming records the sale once', () => {
    expect(stored().consume(8)).toMatchObject({ status: 'consumed', saleId: 8 })
    expect(stored({ status: 'reserved', qrReference: 'QRABC' }).consume(8)).toMatchObject({ status: 'consumed', saleId: 8 })
    expect(codeOf(() => stored({ status: 'consumed', saleId: 8 }).consume(9))).toBe('QUOTE_NOT_OPEN')
  })

  test('a QR for part of the total is fine, one for more than the total is not', () => {
    expect(() => stored().assertQrAmount(15000)).not.toThrow()
    expect(() => stored().assertQrAmount(1)).not.toThrow()
    expect(codeOf(() => stored().assertQrAmount(15001))).toBe('QUOTE_AMOUNT_MISMATCH')
  })
})
```

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/price-quote.domain.test.ts`
Expected: FAIL (`Cannot find module './price-quote.domain'`)

- [ ] **Step 3: เขียนโค้ด**

สร้าง `apps/api/src/domains/price-quote.domain.ts`:

```ts
import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { lineKey, type LineOption } from './modifier.domain'
import { calculateTotals, type VatMode } from './pricing'
import { MAX_AMOUNT_SATANG, type SaleMember, type SalePromotion } from './sale.domain'

export const QUOTE_STATUSES = ['open', 'reserved', 'consumed', 'cancelled'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/** How long an open quote can be sold against. A quote held by a QR does not expire by time. */
export const QUOTE_VALID_FOR_MS = 15 * 60 * 1000

/** One priced line, as it was when the quote was made. `unitPriceSatang` includes the options. */
export interface QuoteLine {
  productId: number
  productName: string
  sku: string
  unitPriceSatang: number
  quantity: number
  options: LineOption[]
}

/** What a sale asks for, in the terms a quote can be compared with. */
export interface QuoteRequestLine {
  productId: number
  optionIds: readonly number[]
  quantity: number
}

export interface QuoteRequest {
  branchId: number
  memberId: number | null
  lines: readonly QuoteRequestLine[]
}

export interface NewPriceQuote {
  branchId: number
  memberId: number | null
  member: SaleMember | null
  /** The open order this quote prices; null for a one-step cart. */
  orderId: number | null
  lines: QuoteLine[]
  promotion: SalePromotion | null
  /** The VAT rules in force when the quote was made; the sale uses these, not the current ones. */
  vatMode: VatMode
  vatRateBp: number
  createdById: number
}

export interface PricedQuote extends NewPriceQuote {
  subtotalSatang: number
  discountSatang: number
  vatSatang: number
  totalSatang: number
  expiresAt: Date
}

export interface PriceQuoteProps extends PricedQuote {
  id: number
  status: QuoteStatus
  /** Reference 1 of the QR that holds this quote while it is `reserved`. */
  qrReference: string | null
  saleId: number | null
  createdAt: Date
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
const tooLarge = () => new DomainError('ยอดเงินเกินกว่าที่ระบบรองรับ', 'AMOUNT_TOO_LARGE')
const notOpen = () => new DomainConflictError('ราคานี้ถูกใช้หรือถูกยกเลิกไปแล้ว หรือกำลังรอการชำระด้วย QR', 'QUOTE_NOT_OPEN')
const mismatch = () =>
  new DomainConflictError('รายการ สมาชิก หรือสาขาไม่ตรงกับราคาที่ตรึงไว้ กรุณาขอราคาใหม่', 'QUOTE_MISMATCH')
const expired = () => new DomainConflictError('ราคาที่ตรึงไว้หมดอายุแล้ว กรุณาขอราคาใหม่', 'QUOTE_EXPIRED')

const keyOf = (productId: number, optionIds: readonly number[]) =>
  `${productId}:${lineKey(optionIds.map((optionId) => ({ optionId })))}`

/** Quantity per line of a cart, with repeated lines added together. */
function quantities(lines: readonly { productId: number; optionIds: readonly number[]; quantity: number }[]) {
  const byKey = new Map<string, number>()
  for (const line of lines) {
    const key = keyOf(line.productId, line.optionIds)
    byKey.set(key, (byKey.get(key) ?? 0) + line.quantity)
  }
  return byKey
}

/**
 * A cart the server has priced and pinned: the lines with their unit prices, the promotion and VAT
 * rules that applied, and the total. A sale made from it charges exactly this, whatever the shop
 * changed since, which is what lets money paid by QR always become a bill of the same amount.
 */
export class PriceQuoteEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly memberId: number | null
  public readonly member: Readonly<SaleMember> | null
  public readonly orderId: number | null
  public readonly lines: readonly QuoteLine[]
  public readonly promotion: Readonly<SalePromotion> | null
  public readonly vatMode: VatMode
  public readonly vatRateBp: number
  public readonly subtotalSatang: number
  public readonly discountSatang: number
  public readonly vatSatang: number
  public readonly totalSatang: number
  public readonly status: QuoteStatus
  public readonly qrReference: string | null
  public readonly saleId: number | null
  public readonly createdById: number
  public readonly expiresAt: Date
  public readonly createdAt: Date

  constructor(props: PriceQuoteProps) {
    if (!QUOTE_STATUSES.includes(props.status)) throw new DomainError('สถานะของราคาที่ตรึงไว้ไม่ถูกต้อง', 'INVALID_QUOTE')
    if (props.status === 'reserved' && props.qrReference === null)
      throw new DomainError('ราคาที่ถูกจองต้องมีรหัสอ้างอิงของ QR', 'INVALID_QUOTE')
    if (props.status === 'consumed' && props.saleId === null)
      throw new DomainError('ราคาที่ใช้แล้วต้องมีบิลขาย', 'INVALID_QUOTE')

    this.id = props.id
    this.branchId = props.branchId
    this.memberId = props.memberId
    this.member = props.member ? Object.freeze({ ...props.member }) : null
    this.orderId = props.orderId
    this.lines = props.lines.map((line) => ({ ...line, options: line.options.map((option) => ({ ...option })) }))
    this.promotion = props.promotion ? Object.freeze({ ...props.promotion }) : null
    this.vatMode = props.vatMode
    this.vatRateBp = props.vatRateBp
    this.subtotalSatang = props.subtotalSatang
    this.discountSatang = props.discountSatang
    this.vatSatang = props.vatSatang
    this.totalSatang = props.totalSatang
    this.status = props.status
    this.qrReference = props.qrReference
    this.saleId = props.saleId
    this.createdById = props.createdById
    this.expiresAt = props.expiresAt
    this.createdAt = props.createdAt
  }

  /** Prices the lines with the promotion chosen for them and the VAT rules given. */
  static price(input: NewPriceQuote, now: Date): PricedQuote {
    if (input.lines.length === 0) throw new DomainError('ตะกร้าต้องมีสินค้าอย่างน้อย 1 รายการ', 'EMPTY_SALE')
    if (input.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1))
      throw new DomainError('จำนวนสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 'INVALID_QUANTITY')

    const subtotalSatang = sum(input.lines.map((line) => line.unitPriceSatang * line.quantity))
    if (subtotalSatang > MAX_AMOUNT_SATANG) throw tooLarge()
    const discountSatang = input.promotion?.discountSatang ?? 0
    if (discountSatang > subtotalSatang) throw new DomainError('ส่วนลดมากกว่ายอดรวมสินค้า', 'DISCOUNT_TOO_LARGE')
    const { vatSatang, totalSatang } = calculateTotals({
      subtotalSatang, discountSatang, vatMode: input.vatMode, vatRateBp: input.vatRateBp,
    })
    if (totalSatang > MAX_AMOUNT_SATANG) throw tooLarge()

    return {
      ...input,
      lines: input.lines.map((line) => ({ ...line, options: [...line.options] })),
      vatRateBp: input.vatMode === 'none' ? 0 : input.vatRateBp,
      subtotalSatang,
      discountSatang,
      vatSatang,
      totalSatang,
      expiresAt: new Date(now.getTime() + QUOTE_VALID_FOR_MS),
    }
  }

  /** Whether a sale for this branch, member and cart is the one this quote was made for. */
  matches(request: QuoteRequest): boolean {
    if (request.branchId !== this.branchId || request.memberId !== this.memberId) return false
    const wanted = quantities(request.lines)
    const own = quantities(this.lines.map((line) => ({ ...line, optionIds: line.options.map((option) => option.optionId) })))
    if (wanted.size !== own.size) return false
    for (const [key, quantity] of own) if (wanted.get(key) !== quantity) return false
    return true
  }

  /**
   * Throws unless a sale for `request` may use this quote now. `claimedReferences` are the QR payments
   * backing the sale: a quote held by a QR is sold only with that QR, and a QR made without this quote
   * cannot pay for it.
   */
  assertSellable(request: QuoteRequest, now: Date, claimedReferences: readonly string[]): void {
    if (this.status === 'consumed' || this.status === 'cancelled') throw notOpen()
    if (this.status === 'open') {
      if (now.getTime() >= this.expiresAt.getTime()) throw expired()
      if (claimedReferences.length > 0) throw mismatch()
    } else if (claimedReferences.length === 0 || claimedReferences.some((reference) => reference !== this.qrReference)) {
      throw notOpen()
    }
    if (!this.matches(request)) throw mismatch()
  }

  /** A QR can be for part of the total (the rest paid another way) but never for more. */
  assertQrAmount(amountSatang: number): void {
    if (amountSatang > this.totalSatang)
      throw new DomainConflictError('ยอด QR เกินยอดของราคาที่ตรึงไว้', 'QUOTE_AMOUNT_MISMATCH', { totalSatang: this.totalSatang })
  }

  /** Holds the quote for the QR with this reference. The same reference again changes nothing. */
  reserve(reference: string, now: Date): PriceQuoteEntity {
    if (this.status === 'reserved' && this.qrReference === reference) return this
    if (this.status !== 'open') throw notOpen()
    if (now.getTime() >= this.expiresAt.getTime()) throw expired()
    return this.change({ status: 'reserved', qrReference: reference })
  }

  /** The QR was cancelled or never made: the quote is open again (and may have expired meanwhile). */
  release(reference: string): PriceQuoteEntity {
    if (this.status !== 'reserved' || this.qrReference !== reference) return this
    return this.change({ status: 'open', qrReference: null })
  }

  /** The QR's money was set aside by the owner and will never be billed: the quote is closed. */
  cancelReserved(reference: string): PriceQuoteEntity {
    if (this.status !== 'reserved' || this.qrReference !== reference) return this
    return this.change({ status: 'cancelled' })
  }

  /** The till abandons the quote. One that a QR holds, or a sale used, cannot be cancelled. */
  cancel(): PriceQuoteEntity {
    if (this.status === 'cancelled') return this
    if (this.status !== 'open') throw notOpen()
    return this.change({ status: 'cancelled' })
  }

  consume(saleId: number): PriceQuoteEntity {
    if (this.status !== 'open' && this.status !== 'reserved') throw notOpen()
    return this.change({ status: 'consumed', saleId })
  }

  toSnapshot(): PriceQuoteProps {
    return {
      id: this.id,
      branchId: this.branchId,
      memberId: this.memberId,
      member: this.member ? { ...this.member } : null,
      orderId: this.orderId,
      lines: this.lines.map((line) => ({ ...line, options: line.options.map((option) => ({ ...option })) })),
      promotion: this.promotion ? { ...this.promotion } : null,
      vatMode: this.vatMode,
      vatRateBp: this.vatRateBp,
      subtotalSatang: this.subtotalSatang,
      discountSatang: this.discountSatang,
      vatSatang: this.vatSatang,
      totalSatang: this.totalSatang,
      status: this.status,
      qrReference: this.qrReference,
      saleId: this.saleId,
      createdById: this.createdById,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
    }
  }

  private change(changes: Partial<PriceQuoteProps>): PriceQuoteEntity {
    return new PriceQuoteEntity({ ...this.toSnapshot(), ...changes })
  }
}
```

- [ ] **Step 4: รันการทดสอบให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/price-quote.domain.test.ts && bun run typecheck`
Expected: PASS ทุกกรณี (ถ้า `vatSatang` ของ inclusive 15000 ที่ 7% ไม่ใช่ 981 ให้แก้ตัวเลขคาดหวังตาม `Math.round(15000*700/10700)` = 981 ซึ่งตรงอยู่แล้ว)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/price-quote.domain.ts apps/api/src/domains/price-quote.domain.test.ts
gitcz --non-interactive --type=feat --scope=quotes --subject="add the pinned price quote entity"
```

---

### Task 4: ตารางฐานข้อมูล (`promotions`, `price_quotes`, คอลัมน์ใหม่ของ `sales`)

**Files:**
- Create: `apps/api/src/infrastructure/database/schema/promotions.ts`
- Create: `apps/api/src/infrastructure/database/schema/price-quotes.ts`
- Modify: `apps/api/src/infrastructure/database/schema/sales.ts`
- Modify: `apps/api/src/infrastructure/database/schema/index.ts`
- Create (สร้างโดย drizzle-kit): `apps/api/drizzle/0015_promotions.sql`, `apps/api/drizzle/meta/0015_snapshot.json`, แก้ `apps/api/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: ตาราง `promotions` (`promotions` export), `priceQuotes` (`price_quotes`), `quoteStatus` enum, คอลัมน์ `sales.promotion_id` และ `sales.promotion` (jsonb)

- [ ] **Step 1: เขียน schema**

สร้าง `apps/api/src/infrastructure/database/schema/promotions.ts`:

```ts
import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const promotionKind = pgEnum('promotion_kind', ['fixed', 'percent'])
export const promotionAudience = pgEnum('promotion_audience', ['everyone', 'members'])

// Shared by every branch and never deleted: a sale keeps its own snapshot, so a promotion that is over
// is just switched off. `value` is satang for `fixed` and basis points for `percent`.
export const promotions = pgTable(
  'promotions',
  {
    id: id(),
    name: text().notNull(),
    kind: promotionKind().notNull(),
    value: integer().notNull(),
    maxDiscountSatang: integer(),
    minSubtotalSatang: integer().notNull().default(0),
    // Dates in the shop's time zone, both included; null means unbounded.
    startsOn: date(),
    endsOn: date(),
    // 0 = Sunday ... 6 = Saturday; null means every day.
    weekdays: integer().array(),
    windowStartMinute: integer(),
    windowEndMinute: integer(),
    audience: promotionAudience().notNull().default('everyone'),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('promotions_name_lower_unique').on(sql`lower(${table.name})`),
    index('promotions_is_active_idx').on(table.isActive),
    check('promotions_value_positive', sql`${table.value} > 0`),
  ],
)
```

สร้าง `apps/api/src/infrastructure/database/schema/price-quotes.ts`:

```ts
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { QuoteLine } from '../../../domains/price-quote.domain'
import type { SaleMember, SalePromotion } from '../../../domains/sale.domain'
import { id, timestamps } from '../columns'
import { branches } from './branches'
import { members } from './members'
import { orders } from './orders'
import { sales } from './sales'
import { vatMode } from './shop-settings'
import { users } from './users'

export const quoteStatus = pgEnum('quote_status', ['open', 'reserved', 'consumed', 'cancelled'])

// A cart the server priced and pinned. `qr_reference` is the reference 1 of the QR holding it while it is
// `reserved`; `sale_id` is the sale made from it, which is what stops a quote being sold twice.
export const priceQuotes = pgTable(
  'price_quotes',
  {
    id: id(),
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    memberId: integer().references(() => members.id),
    member: jsonb().$type<SaleMember>(),
    orderId: integer().references(() => orders.id),
    lines: jsonb().$type<QuoteLine[]>().notNull(),
    promotion: jsonb().$type<SalePromotion>(),
    subtotalSatang: integer().notNull(),
    discountSatang: integer().notNull().default(0),
    vatMode: vatMode().notNull(),
    vatRateBp: integer().notNull(),
    vatSatang: integer().notNull(),
    totalSatang: integer().notNull(),
    status: quoteStatus().notNull().default('open'),
    qrReference: text(),
    saleId: integer().references(() => sales.id),
    createdById: integer()
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('price_quotes_qr_reference_unique').on(table.qrReference),
    uniqueIndex('price_quotes_sale_id_unique').on(table.saleId),
    index('price_quotes_order_status_idx').on(table.orderId, table.status),
  ],
)
```

ใน `apps/api/src/infrastructure/database/schema/sales.ts`:
- เปลี่ยน `import type { SaleMember } from '../../../domains/sale.domain'` เป็น `import type { SaleMember, SalePromotion } from '../../../domains/sale.domain'`
- เพิ่ม `import { promotions } from './promotions'` ต่อจาก `import { members } from './members'`
- ในตาราง `sales` ต่อจากบรรทัด `member: jsonb().$type<SaleMember>(),` เพิ่ม:

```ts
    // The promotion this sale was given: the rule as it was, beside the discount it produced.
    promotionId: integer().references(() => promotions.id),
    promotion: jsonb().$type<SalePromotion>(),
```

ใน `apps/api/src/infrastructure/database/schema/index.ts` ต่อท้ายไฟล์เพิ่ม:

```ts
export * from './promotions'
export * from './price-quotes'
```

- [ ] **Step 2: สร้าง migration**

Run: `cd apps/api && bun --env-file=../../.env drizzle-kit generate --name promotions`
Expected: สร้าง `drizzle/0015_promotions.sql` และ snapshot

- [ ] **Step 3: ตรวจ SQL ที่สร้าง**

Run: `grep -n "promotion\|price_quotes\|quote_status" apps/api/drizzle/0015_promotions.sql`
Expected: มี `CREATE TYPE "public"."promotion_kind"`, `"promotion_audience"`, `"quote_status"`, `CREATE TABLE "promotions"`, `CREATE TABLE "price_quotes"`, `ALTER TABLE "sales" ADD COLUMN "promotion_id" integer`, `ADD COLUMN "promotion" jsonb`, และ `CREATE UNIQUE INDEX "promotions_name_lower_unique" ... lower("name")` ถ้ามีคำสั่งที่ไม่เกี่ยวกับโปรโมชัน (ตารางหรือคอลัมน์อื่น) ให้หยุดแล้วดู `git diff` ของ schema อื่น ห้ามลบหรือแก้ migration ก่อนหน้า

- [ ] **Step 4: ตรวจว่า migration รันได้บนฐานข้อมูลทดสอบ**

Run: `cd apps/api && bun --env-file=.env.test test src/__tests__/integration/unit-of-work.integration.test.ts`
Expected: PASS (harness รัน migration ทั้งหมดก่อนทดสอบ) และ `bun run typecheck` ผ่าน

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/database/schema apps/api/drizzle
gitcz --non-interactive --type=feat --scope=promotions --subject="add promotion and price quote tables"
```

---

### Task 5: โมดูลโปรโมชัน (API จัดการโปรโมชัน)

**Files:**
- Create: `apps/api/src/modules/promotions/applications/ports/promotion.repository.ts`
- Create: `apps/api/src/modules/promotions/applications/schemas/promotion-schemas.ts`
- Create: `apps/api/src/modules/promotions/applications/usecases/{create-promotion,update-promotion,list-promotions,get-promotion}.usecase.ts`
- Create: `apps/api/src/modules/promotions/applications/usecases/promotion.usecases.test.ts`
- Create: `apps/api/src/modules/promotions/adapters/repository/promotion.drizzle.repository.ts`
- Create: `apps/api/src/modules/promotions/adapters/controllers/promotion.controller.ts`
- Create: `apps/api/src/modules/promotions/adapters/controllers/schemas/promotion.schema.ts`
- Create: `apps/api/src/modules/promotions/promotions.module.ts`
- Create: `apps/api/src/__tests__/integration/promotions.integration.test.ts`
- Modify: `apps/api/src/__tests__/mocks.ts`, `apps/api/src/modules/di-registrations.ts`, `apps/api/src/modules/app.module.ts`

**Interfaces:**
- Consumes: `PromotionEntity`, `PromotionProps` (Task 2), ตาราง `promotions` (Task 4), `TOKENS.Clock`, `TOKENS.UnitOfWork`
- Produces:
  - `IPromotionRepository { find(query: { isActive?: boolean; limit: number; offset: number }): Promise<Page<PromotionEntity>>; findById(id): Promise<PromotionEntity | null>; findByIdForUpdate(id): Promise<PromotionEntity | null>; create(entity): Promise<PromotionEntity>; update(entity): Promise<PromotionEntity> }` และ `promotionRepositoryToken`
  - `CreatePromotionUseCase.execute(input: unknown, actor: { role: string })`, `UpdatePromotionUseCase.execute(id: number, input: unknown, actor: { role: string })`, `ListPromotionsUseCase.execute(input: unknown)`, `GetPromotionUseCase.execute(input: { id: number })`
  - `mockPromotionRepository()` ใน `__tests__/mocks.ts`
  - เส้นทาง `GET /api/v1/promotions`, `GET /:id`, `POST /`, `PATCH /:id`

- [ ] **Step 1: port และ schema ของ use case**

`apps/api/src/modules/promotions/applications/ports/promotion.repository.ts`:

```ts
import type { Page } from '../../../../domains/page'
import type { PromotionEntity } from '../../../../domains/promotion.domain'

export interface PromotionListQuery {
  isActive?: boolean
  limit: number
  offset: number
}

export interface IPromotionRepository {
  /** One page ordered by name, with the total that match. */
  find(query: PromotionListQuery): Promise<Page<PromotionEntity>>
  findById(id: number): Promise<PromotionEntity | null>
  /** Like findById, but row-locks the promotion until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<PromotionEntity | null>
  /** Throws PROMOTION_NAME_TAKEN when another promotion has the name (ignoring case). */
  create(entity: PromotionEntity): Promise<PromotionEntity>
  update(entity: PromotionEntity): Promise<PromotionEntity>
}

export const promotionRepositoryToken = Symbol('IPromotionRepository').toString()
```

`apps/api/src/modules/promotions/applications/schemas/promotion-schemas.ts`:

```ts
import { z } from 'zod'
import { PROMOTION_AUDIENCES, PROMOTION_KINDS } from '../../../../domains/promotion.domain'

const minute = z.number().int().min(0).max(1439)
const fields = {
  name: z.string().trim().min(1).max(80),
  kind: z.enum(PROMOTION_KINDS),
  value: z.number().int().min(1),
  maxDiscountSatang: z.number().int().min(1).nullable(),
  minSubtotalSatang: z.number().int().min(0),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  windowStartMinute: minute.nullable(),
  windowEndMinute: minute.nullable(),
  audience: z.enum(PROMOTION_AUDIENCES),
  isActive: z.boolean(),
}

export const createPromotionSchema = z.object({
  name: fields.name,
  kind: fields.kind,
  value: fields.value,
  maxDiscountSatang: fields.maxDiscountSatang.optional(),
  minSubtotalSatang: fields.minSubtotalSatang.optional(),
  startsOn: fields.startsOn.optional(),
  endsOn: fields.endsOn.optional(),
  weekdays: fields.weekdays.optional(),
  windowStartMinute: fields.windowStartMinute.optional(),
  windowEndMinute: fields.windowEndMinute.optional(),
  audience: fields.audience.optional(),
  isActive: fields.isActive.optional(),
})

export const updatePromotionSchema = z.object({
  name: fields.name.optional(),
  kind: fields.kind.optional(),
  value: fields.value.optional(),
  maxDiscountSatang: fields.maxDiscountSatang.optional(),
  minSubtotalSatang: fields.minSubtotalSatang.optional(),
  startsOn: fields.startsOn.optional(),
  endsOn: fields.endsOn.optional(),
  weekdays: fields.weekdays.optional(),
  windowStartMinute: fields.windowStartMinute.optional(),
  windowEndMinute: fields.windowEndMinute.optional(),
  audience: fields.audience.optional(),
  isActive: fields.isActive.optional(),
})

export const promotionIdSchema = z.object({ id: z.number().int().positive() })

export const listPromotionsSchema = z.object({
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
})
```

- [ ] **Step 2: เพิ่ม mock และเขียนการทดสอบ use case ที่ล้มเหลว**

ใน `apps/api/src/__tests__/mocks.ts` เพิ่ม import ต่อจากบรรทัด import ของ `IMemberRepository`:

```ts
import type { IPromotionRepository } from '../modules/promotions/applications/ports/promotion.repository'
```

และต่อท้ายไฟล์:

```ts
export const mockPromotionRepository = (): Mocked<IPromotionRepository> => ({
  find: mock<IPromotionRepository['find']>(),
  findById: mock<IPromotionRepository['findById']>(),
  findByIdForUpdate: mock<IPromotionRepository['findByIdForUpdate']>(),
  create: mock<IPromotionRepository['create']>(),
  update: mock<IPromotionRepository['update']>(),
})
```

สร้าง `apps/api/src/modules/promotions/applications/usecases/promotion.usecases.test.ts`:

```ts
import 'reflect-metadata'
import { describe, expect, test } from 'bun:test'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import { mockClock, mockPromotionRepository } from '../../../../__tests__/mocks'
import { CreatePromotionUseCase } from './create-promotion.usecase'
import { GetPromotionUseCase } from './get-promotion.usecase'
import { ListPromotionsUseCase } from './list-promotions.usecase'
import { UpdatePromotionUseCase } from './update-promotion.usecase'

const now = new Date('2026-10-15T12:00:00Z')
const existing = new PromotionEntity({
  id: 1, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: 100, minSubtotalSatang: 0,
  startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
  audience: 'everyone', isActive: true, createdAt: now, updatedAt: now,
})

function setup() {
  const calls: string[] = []
  const repo = mockPromotionRepository()
  repo.find.mockImplementation(async () => ({ items: [existing], total: 1 }))
  repo.findById.mockImplementation(async (id) => (id === 1 ? existing : null))
  repo.findByIdForUpdate.mockImplementation(async (id) => {
    calls.push('lock')
    return id === 1 ? existing : null
  })
  repo.create.mockImplementation(async (entity) => new PromotionEntity({ ...entity.toSnapshot(), id: 2 }))
  repo.update.mockImplementation(async (entity) => {
    calls.push('write')
    return entity
  })
  const uow = { run: async <T>(work: () => Promise<T>) => { calls.push('uow'); return work() } }
  return { repo, calls, uow, clock: mockClock(now) }
}

describe('CreatePromotionUseCase', () => {
  test('the owner creates a promotion; omitted fields take their defaults and dates are the server’s', async () => {
    const { repo, clock } = setup()
    const created = await new CreatePromotionUseCase(repo, clock).execute(
      { name: ' ลดเงินสด ', kind: 'fixed', value: 2000, id: 99, createdAt: '2000-01-01' },
      { role: 'owner' },
    )
    expect(created.toSnapshot()).toMatchObject({
      id: 2, name: 'ลดเงินสด', kind: 'fixed', value: 2000, maxDiscountSatang: null, minSubtotalSatang: 0,
      startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
      audience: 'everyone', isActive: true, createdAt: now, updatedAt: now,
    })
  })

  test('refuses a cashier before anything is written', async () => {
    const { repo, clock } = setup()
    await expect(
      new CreatePromotionUseCase(repo, clock).execute({ name: 'x', kind: 'fixed', value: 1 }, { role: 'cashier' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('refuses what the rules refuse', async () => {
    const { repo, clock } = setup()
    const useCase = new CreatePromotionUseCase(repo, clock)
    await expect(useCase.execute({ name: 'x', kind: 'percent', value: 20000 }, { role: 'owner' })).rejects.toThrow()
    await expect(
      useCase.execute({ name: 'x', kind: 'fixed', value: 100, maxDiscountSatang: 50 }, { role: 'owner' }),
    ).rejects.toMatchObject({ code: 'INVALID_PROMOTION' })
    await expect(useCase.execute({ name: ' ', kind: 'fixed', value: 100 }, { role: 'owner' })).rejects.toThrow()
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('UpdatePromotionUseCase', () => {
  test('changes under the row lock, keeping what was not given and clearing what is null', async () => {
    const { repo, clock, uow, calls } = setup()
    const updated = await new UpdatePromotionUseCase(repo, uow, clock).execute(
      1, { isActive: false, maxDiscountSatang: null, id: 7 }, { role: 'owner' },
    )
    expect(calls).toEqual(['uow', 'lock', 'write'])
    expect(updated.toSnapshot()).toMatchObject({ id: 1, name: 'ลด 10%', isActive: false, maxDiscountSatang: null, updatedAt: now })
  })

  test('a cashier cannot edit, and an unknown promotion is not found', async () => {
    const { repo, clock, uow, calls } = setup()
    const useCase = new UpdatePromotionUseCase(repo, uow, clock)
    await expect(useCase.execute(1, { isActive: false }, { role: 'cashier' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(calls).toEqual([])
    await expect(useCase.execute(9, { isActive: false }, { role: 'owner' })).rejects.toMatchObject({ code: 'PROMOTION_NOT_FOUND' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('an edit that breaks a rule is refused whole', async () => {
    const { repo, clock, uow } = setup()
    await expect(
      new UpdatePromotionUseCase(repo, uow, clock).execute(1, { kind: 'fixed' }, { role: 'owner' }),
    ).rejects.toMatchObject({ code: 'INVALID_PROMOTION' })
    expect(repo.update).not.toHaveBeenCalled()
  })
})

describe('reading', () => {
  test('lists with the defaults of a page and passes the filter on', async () => {
    const { repo } = setup()
    const page = await new ListPromotionsUseCase(repo).execute({ isActive: true })
    expect(repo.find).toHaveBeenCalledWith({ isActive: true, limit: 100, offset: 0 })
    expect(page).toMatchObject({ total: 1 })
  })

  test('gets one, or says it is not found', async () => {
    const { repo } = setup()
    const useCase = new GetPromotionUseCase(repo)
    expect((await useCase.execute({ id: 1 })).id).toBe(1)
    await expect(useCase.execute({ id: 9 })).rejects.toMatchObject({ code: 'PROMOTION_NOT_FOUND' })
  })
})
```

- [ ] **Step 3: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/promotions`
Expected: FAIL (`Cannot find module './create-promotion.usecase'`)

- [ ] **Step 4: เขียน use case**

`create-promotion.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { createPromotionSchema } from '../schemas/promotion-schemas'

/** Command. */
@injectable()
export class CreatePromotionUseCase {
  constructor(
    @inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(input: unknown, actor: { role: string }) {
    const dto = createPromotionSchema.parse(input)
    if (actor.role !== 'owner') throw new DomainForbiddenError('เฉพาะเจ้าของร้านจัดการโปรโมชันได้', 'FORBIDDEN')
    const now = this.clock.now()
    return this.promotions.create(
      new PromotionEntity({
        id: 0,
        name: dto.name,
        kind: dto.kind,
        value: dto.value,
        maxDiscountSatang: dto.maxDiscountSatang ?? null,
        minSubtotalSatang: dto.minSubtotalSatang ?? 0,
        startsOn: dto.startsOn ?? null,
        endsOn: dto.endsOn ?? null,
        weekdays: dto.weekdays ?? null,
        windowStartMinute: dto.windowStartMinute ?? null,
        windowEndMinute: dto.windowEndMinute ?? null,
        audience: dto.audience ?? 'everyone',
        isActive: dto.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }
}
```

`update-promotion.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { promotionIdSchema, updatePromotionSchema } from '../schemas/promotion-schemas'

/** Command: edits or switches a promotion on or off. Quotes and sales keep their own snapshot. */
@injectable()
export class UpdatePromotionUseCase {
  constructor(
    @inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(id: number, input: unknown, actor: { role: string }) {
    promotionIdSchema.parse({ id })
    const dto = updatePromotionSchema.parse(input)
    if (actor.role !== 'owner') throw new DomainForbiddenError('เฉพาะเจ้าของร้านจัดการโปรโมชันได้', 'FORBIDDEN')
    return this.unitOfWork.run(async () => {
      const promotion = await this.promotions.findByIdForUpdate(id)
      if (!promotion) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
      return this.promotions.update(promotion.with(dto, this.clock.now()))
    })
  }
}
```

`list-promotions.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { listPromotionsSchema } from '../schemas/promotion-schemas'

/** Query. */
@injectable()
export class ListPromotionsUseCase {
  constructor(@inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository) {}

  async execute(input: unknown) {
    return this.promotions.find(listPromotionsSchema.parse(input))
  }
}
```

`get-promotion.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { promotionIdSchema } from '../schemas/promotion-schemas'

/** Query. */
@injectable()
export class GetPromotionUseCase {
  constructor(@inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository) {}

  async execute(input: unknown) {
    const { id } = promotionIdSchema.parse(input)
    const promotion = await this.promotions.findById(id)
    if (!promotion) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
    return promotion
  }
}
```

- [ ] **Step 5: รันการทดสอบ use case ให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/promotions`
Expected: PASS ทั้งหมด

- [ ] **Step 6: repository, controller, module**

`apps/api/src/modules/promotions/adapters/repository/promotion.drizzle.repository.ts`:

```ts
import { and, count, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import { promotions } from '../../../../infrastructure/database/schema/promotions'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IPromotionRepository, PromotionListQuery } from '../../applications/ports/promotion.repository'

const nameTaken = () => new DomainConflictError('ชื่อโปรโมชันนี้ถูกใช้แล้ว', 'PROMOTION_NAME_TAKEN')

@injectable()
export class DrizzlePromotionRepository implements IPromotionRepository {
  async find(query: PromotionListQuery) {
    const where = query.isActive === undefined ? undefined : and(eq(promotions.isActive, query.isActive))
    const rows = await currentExecutor()
      .select()
      .from(promotions)
      .where(where)
      .orderBy(promotions.name, promotions.id)
      .limit(query.limit)
      .offset(query.offset)
    const [counted] = await currentExecutor().select({ value: count() }).from(promotions).where(where)
    return { items: rows.map((row) => new PromotionEntity(row)), total: counted!.value }
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select().from(promotions).where(eq(promotions.id, id))
    return row ? new PromotionEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select().from(promotions).where(eq(promotions.id, id)).for('update')
    return row ? new PromotionEntity(row) : null
  }

  async create(entity: PromotionEntity) {
    const { id: _id, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(promotions).values(values).returning()
      return new PromotionEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }

  async update(entity: PromotionEntity) {
    const { id, createdAt: _createdAt, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().update(promotions).set(values).where(eq(promotions.id, id)).returning()
      if (!row) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
      return new PromotionEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }
}
```

`apps/api/src/modules/promotions/adapters/controllers/schemas/promotion.schema.ts`:

```ts
import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const kind = t.Union([t.Literal('fixed'), t.Literal('percent')])
const audience = t.Union([t.Literal('everyone'), t.Literal('members')])
const name = t.String({ minLength: 1, maxLength: 80 })
const day = t.String({ format: 'date' })
const minute = t.Integer({ minimum: 0, maximum: 1439 })
const weekdays = t.Array(t.Integer({ minimum: 0, maximum: 6 }), { maxItems: 7 })
const optionalRules = {
  maxDiscountSatang: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  minSubtotalSatang: t.Optional(satang()),
  startsOn: t.Optional(t.Nullable(day)),
  endsOn: t.Optional(t.Nullable(day)),
  weekdays: t.Optional(t.Nullable(weekdays)),
  windowStartMinute: t.Optional(t.Nullable(minute)),
  windowEndMinute: t.Optional(t.Nullable(minute)),
  audience: t.Optional(audience),
  isActive: t.Optional(t.Boolean()),
}

export const promotionSchemas = {
  promotion: t.Object({
    id: t.Integer(),
    name,
    kind,
    value: t.Integer(),
    maxDiscountSatang: t.Nullable(t.Integer()),
    minSubtotalSatang: t.Integer(),
    startsOn: t.Nullable(t.String()),
    endsOn: t.Nullable(t.String()),
    weekdays: t.Nullable(t.Array(t.Integer())),
    windowStartMinute: t.Nullable(t.Integer()),
    windowEndMinute: t.Nullable(t.Integer()),
    audience,
    isActive: t.Boolean(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  }),
  create: t.Object({ name, kind, value: t.Integer({ minimum: 1 }), ...optionalRules }),
  update: t.Partial(t.Object({ name, kind, value: t.Integer({ minimum: 1 }), ...optionalRules })),
  listQuery: t.Object({
    isActive: t.Optional(t.BooleanString()),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
}
export type PromotionResponse = typeof promotionSchemas.promotion.static
```

`apps/api/src/modules/promotions/adapters/controllers/promotion.controller.ts`:

```ts
import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreatePromotionUseCase } from '../../applications/usecases/create-promotion.usecase'
import { GetPromotionUseCase } from '../../applications/usecases/get-promotion.usecase'
import { ListPromotionsUseCase } from '../../applications/usecases/list-promotions.usecase'
import { UpdatePromotionUseCase } from '../../applications/usecases/update-promotion.usecase'
import { promotionSchemas } from './schemas/promotion.schema'

@injectable()
export class PromotionElysiaController {
  constructor(
    @inject(CreatePromotionUseCase) private readonly createPromotion: CreatePromotionUseCase,
    @inject(UpdatePromotionUseCase) private readonly updatePromotion: UpdatePromotionUseCase,
    @inject(GetPromotionUseCase) private readonly getPromotion: GetPromotionUseCase,
    @inject(ListPromotionsUseCase) private readonly listPromotions: ListPromotionsUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'promotions', prefix: '/promotions', detail: { tags: ['Promotions'] } })
      .use(auth)
      .get(
        '/',
        async ({ query }) => {
          const result = await this.listPromotions.execute(query)
          return { items: result.items.map((promotion) => promotion.toSnapshot()), total: result.total }
        },
        {
          auth: ['owner', 'cashier'],
          query: promotionSchemas.listQuery,
          response: page(promotionSchemas.promotion),
          detail: { summary: 'รายการโปรโมชัน' },
        },
      )
      .get('/:id', async ({ params }) => (await this.getPromotion.execute(params)).toSnapshot(), {
        auth: ['owner', 'cashier'],
        params: idParams,
        response: promotionSchemas.promotion,
        detail: { summary: 'รายละเอียดโปรโมชัน' },
      })
      .post('/', async ({ body, user }) => (await this.createPromotion.execute(body, user)).toSnapshot(), {
        auth: ['owner'],
        body: promotionSchemas.create,
        response: promotionSchemas.promotion,
        detail: { summary: 'สร้างโปรโมชัน' },
      })
      .patch(
        '/:id',
        async ({ params, body, user }) => (await this.updatePromotion.execute(params.id, body, user)).toSnapshot(),
        {
          auth: ['owner'],
          params: idParams,
          body: promotionSchemas.update,
          response: promotionSchemas.promotion,
          detail: { summary: 'แก้ไขโปรโมชันและเปิด/ปิดใช้' },
        },
      )
  }
}
```

`apps/api/src/modules/promotions/promotions.module.ts`:

```ts
import { container } from 'tsyringe'
import { PromotionElysiaController } from './adapters/controllers/promotion.controller'
import { DrizzlePromotionRepository } from './adapters/repository/promotion.drizzle.repository'
import { promotionRepositoryToken } from './applications/ports/promotion.repository'
import { CreatePromotionUseCase } from './applications/usecases/create-promotion.usecase'
import { GetPromotionUseCase } from './applications/usecases/get-promotion.usecase'
import { ListPromotionsUseCase } from './applications/usecases/list-promotions.usecase'
import { UpdatePromotionUseCase } from './applications/usecases/update-promotion.usecase'

container.register(promotionRepositoryToken, { useClass: DrizzlePromotionRepository })
container.registerSingleton(CreatePromotionUseCase)
container.registerSingleton(UpdatePromotionUseCase)
container.registerSingleton(GetPromotionUseCase)
container.registerSingleton(ListPromotionsUseCase)
container.registerSingleton(PromotionElysiaController)
```

ใน `apps/api/src/modules/di-registrations.ts` ต่อท้ายเพิ่ม `import './promotions/promotions.module'`

ใน `apps/api/src/modules/app.module.ts`:
- เพิ่ม `import { PromotionElysiaController } from './promotions/adapters/controllers/promotion.controller'` ต่อจาก import ของ `ProductElysiaController`
- ในโซ่ `appModule` ต่อจาก `.use(container.resolve(MemberElysiaController).getRoutes())` เพิ่ม `.use(container.resolve(PromotionElysiaController).getRoutes())`

- [ ] **Step 7: เขียนการทดสอบ HTTP**

สร้าง `apps/api/src/__tests__/integration/promotions.integration.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { baseUrl, ok, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const tenPercent = { name: 'ลด 10%', kind: 'percent' as const, value: 1000 }

describe('promotion management', () => {
  test('the owner creates a promotion with defaults and both roles read it', async () => {
    const created = ok(await owner.api.promotions.post(tenPercent))
    expect(created).toMatchObject({
      name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
      startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
      audience: 'everyone', isActive: true,
    })
    expect(ok(await cashier.api.promotions({ id: created.id }).get())).toMatchObject({ id: created.id })
    expect(ok(await cashier.api.promotions.get({ query: {} }))).toMatchObject({ total: 1, items: [{ id: created.id }] })
  })

  test('keeps every rule that was sent', async () => {
    const created = ok(
      await owner.api.promotions.post({
        name: 'ศุกร์ดึก', kind: 'percent', value: 500, maxDiscountSatang: 2000, minSubtotalSatang: 30000,
        startsOn: '2026-10-01', endsOn: '2026-12-31', weekdays: [5, 6], windowStartMinute: 1320, windowEndMinute: 120,
        audience: 'members',
      }),
    )
    expect(created).toMatchObject({
      maxDiscountSatang: 2000, minSubtotalSatang: 30000, startsOn: '2026-10-01', endsOn: '2026-12-31',
      weekdays: [5, 6], windowStartMinute: 1320, windowEndMinute: 120, audience: 'members',
    })
  })

  test('edits keep what was not sent, null clears a bound, and the promotion is switched off, never deleted', async () => {
    const created = ok(await owner.api.promotions.post({ ...tenPercent, maxDiscountSatang: 500, endsOn: '2026-12-31' }))
    const edited = ok(await owner.api.promotions({ id: created.id }).patch({ maxDiscountSatang: null, isActive: false }))
    expect(edited).toMatchObject({ name: 'ลด 10%', maxDiscountSatang: null, endsOn: '2026-12-31', isActive: false })
    const remove = await fetch(`${baseUrl}/promotions/${created.id}`, { method: 'DELETE' })
    expect(remove.status).toBe(404)
    expect(ok(await owner.api.promotions.get({ query: { isActive: false } })).items.map((item) => item.id)).toEqual([created.id])
    expect(ok(await owner.api.promotions.get({ query: { isActive: true } }))).toMatchObject({ items: [], total: 0 })
  })

  test('only the owner changes promotions', async () => {
    const created = ok(await owner.api.promotions.post(tenPercent))
    expect((await cashier.api.promotions.post(tenPercent)).status).toBe(403)
    expect((await cashier.api.promotions({ id: created.id }).patch({ isActive: false })).status).toBe(403)
    expect(ok(await owner.api.promotions({ id: created.id }).get()).isActive).toBe(true)
  })

  test('refuses rules that do not hold together, duplicate names and unknown ids', async () => {
    const tooMuch = await owner.api.promotions.post({ name: 'x', kind: 'percent', value: 10001 })
    expect(tooMuch.status).toBe(400)
    expect(tooMuch.error?.value).toMatchObject({ code: 'INVALID_PROMOTION' })
    const capOnFixed = await owner.api.promotions.post({ name: 'y', kind: 'fixed', value: 500, maxDiscountSatang: 100 })
    expect(capOnFixed.error?.value).toMatchObject({ code: 'INVALID_PROMOTION' })
    const reversed = await owner.api.promotions.post({ ...tenPercent, startsOn: '2026-12-01', endsOn: '2026-11-01' })
    expect(reversed.error?.value).toMatchObject({ code: 'INVALID_PROMOTION' })

    ok(await owner.api.promotions.post(tenPercent))
    const duplicate = await owner.api.promotions.post({ ...tenPercent, name: '  ลด 10%  ' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.error?.value).toMatchObject({ code: 'PROMOTION_NAME_TAKEN' })
    const sameWords = await owner.api.promotions.post({ name: 'LOWER', kind: 'fixed', value: 1 })
    expect(sameWords.error).toBeNull()
    expect((await owner.api.promotions.post({ name: 'lower', kind: 'fixed', value: 1 })).status).toBe(409)

    expect((await owner.api.promotions({ id: 99999 }).get()).status).toBe(404)
    expect((await owner.api.promotions({ id: 99999 }).patch({ isActive: false })).status).toBe(404)
  })

  test('requires a session', async () => {
    expect((await fetch(`${baseUrl}/promotions`)).status).toBe(401)
  })

  test('pages the list and always answers { items, total }', async () => {
    for (const name of ['A', 'B', 'C']) ok(await owner.api.promotions.post({ name, kind: 'fixed', value: 100 }))
    const first = ok(await owner.api.promotions.get({ query: { limit: 2, offset: 0 } }))
    expect(first.total).toBe(3)
    expect(first.items.map((item) => item.name)).toEqual(['A', 'B'])
    expect(ok(await owner.api.promotions.get({ query: { limit: 2, offset: 2 } })).items.map((item) => item.name)).toEqual(['C'])
  })
})
```

- [ ] **Step 8: รันการทดสอบ HTTP และ typecheck**

Run: `cd apps/api && bun --env-file=.env.test test src/__tests__/integration/promotions.integration.test.ts && bun run typecheck`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/promotions apps/api/src/__tests__/integration/promotions.integration.test.ts apps/api/src/__tests__/mocks.ts apps/api/src/modules/di-registrations.ts apps/api/src/modules/app.module.ts
gitcz --non-interactive --type=feat --scope=promotions --subject="manage promotions through the API"
```

---

### Task 6: โมดูล quote (คิดราคาและตรึงไว้)

**Files:**
- Create: `apps/api/src/modules/quotes/applications/ports/{price-quote.repository,quote-claims.port,promotion-catalog.port,order-quote-source.port}.ts`
- Create: `apps/api/src/modules/orders/applications/ports/order-edit-lock.port.ts`
- Create: `apps/api/src/modules/quotes/applications/schemas/quote-schemas.ts`
- Create: `apps/api/src/modules/quotes/applications/services/{quote-claims,order-edit-lock}.ts`
- Create: `apps/api/src/modules/quotes/applications/usecases/{create-quote,get-quote,cancel-quote}.usecase.ts`
- Create: `apps/api/src/modules/quotes/applications/usecases/quote.usecases.test.ts`, `apps/api/src/modules/quotes/applications/services/quote-claims.test.ts`
- Create: `apps/api/src/modules/quotes/adapters/repository/price-quote.drizzle.repository.ts`
- Create: `apps/api/src/modules/quotes/adapters/controllers/{quote.controller,quote.presenter}.ts`, `.../schemas/quote.schema.ts`
- Create: `apps/api/src/modules/quotes/quotes.module.ts`
- Create: `apps/api/src/modules/promotions/applications/services/promotion-catalog.ts`
- Create: `apps/api/src/modules/orders/applications/services/order-quote-source.ts`
- Create: `apps/api/src/__tests__/integration/quotes.integration.test.ts`
- Modify: `apps/api/src/__tests__/{mocks,factories}.ts`, `apps/api/src/modules/{di-registrations,app.module}.ts`, `apps/api/src/modules/promotions/promotions.module.ts`, `apps/api/src/modules/orders/orders.module.ts`

**Interfaces:**
- Consumes: `PriceQuoteEntity`, `PricedQuote`, `QuoteLine`, `QuoteRequest` (Task 3), `pickBestPromotion`, `PromotionEntity` (Task 2), ตาราง `priceQuotes` (Task 4), `IProductRepository`, `ILineOptionsResolver`, `IShopSettingsRepository`, `IMemberRepository`, `IOrderRepository`, `TOKENS.Clock`, `TOKENS.UnitOfWork`
- Produces:
  - `IPriceQuoteRepository { create(quote: PricedQuote); findById(id); findByIdForUpdate(id); findByQrReference(reference); findByQrReferenceForUpdate(reference); hasReservedForOrder(orderId): Promise<boolean>; save(quote: PriceQuoteEntity) }` + `priceQuoteRepositoryToken`
  - `IQuoteClaims { lockForCheckout(quoteId, request: QuoteRequest, claimedReferences: readonly string[]): Promise<PriceQuoteEntity>; findReservedByReference(reference): Promise<number | null>; consume(quote, saleId): Promise<void>; reserveForQr(quoteId, claim: { branchId; reference; amountSatang }): Promise<void>; releaseByReference(reference): Promise<void>; cancelByReference(reference): Promise<void> }` + `quoteClaimsToken`
  - `IPromotionCatalog { activePromotions(): Promise<PromotionEntity[]> }` + `promotionCatalogToken`
  - `IOrderQuoteSource { read(orderId, branchId): Promise<QuotedOrder>; lockOpenOrder(orderId, branchId): Promise<QuotedOrder> }`, `QuotedOrder { id; memberId: number | null; items: { productId; productName; sku; unitPriceSatang; quantity; options: LineOption[] }[] }` + `orderQuoteSourceToken`
  - `IOrderEditLock { assertEditable(orderId: number): Promise<void> }` + `orderEditLockToken` (อยู่ฝั่ง orders)
  - `CreateQuoteUseCase.execute(input: unknown, actor: { id: number }, branch: { id: number })`, `GetQuoteUseCase.execute(id: number, branchId: number)`, `CancelQuoteUseCase.execute(id: number, branchId: number)`
  - ใน `__tests__`: `makePriceQuote(overrides)`, `mockPriceQuoteRepository()`, `mockQuoteClaims()`, `mockPromotionCatalog()`, `mockOrderQuoteSource()`
  - เส้นทาง `POST /api/v1/quotes`, `GET /api/v1/quotes/:id`, `POST /api/v1/quotes/:id/cancel`

- [ ] **Step 1: port ทั้งหมด**

`apps/api/src/modules/quotes/applications/ports/price-quote.repository.ts`:

```ts
import type { PriceQuoteEntity, PricedQuote } from '../../../../domains/price-quote.domain'

export interface IPriceQuoteRepository {
  create(quote: PricedQuote): Promise<PriceQuoteEntity>
  findById(id: number): Promise<PriceQuoteEntity | null>
  /** Like findById, but row-locks the quote until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<PriceQuoteEntity | null>
  /** The quote a QR holds, by the reference 1 sent to the bank. */
  findByQrReference(reference: string): Promise<PriceQuoteEntity | null>
  findByQrReferenceForUpdate(reference: string): Promise<PriceQuoteEntity | null>
  /** Whether a quote of this order is held by a QR that has not been settled yet. */
  hasReservedForOrder(orderId: number): Promise<boolean>
  /** Writes the status, QR reference and sale of an existing quote. */
  save(quote: PriceQuoteEntity): Promise<PriceQuoteEntity>
}

const token: unique symbol = Symbol('IPriceQuoteRepository')
export const priceQuoteRepositoryToken = token.toString()
```

`apps/api/src/modules/quotes/applications/ports/quote-claims.port.ts`:

```ts
import type { PriceQuoteEntity, QuoteRequest } from '../../../../domains/price-quote.domain'

/**
 * How a sale and a QR use a quote. Kept apart from the rest of the module so they depend only on what
 * they need. Every call belongs inside the unit of work that stores the sale or the QR.
 */
export interface IQuoteClaims {
  /**
   * Row-locks the quote of this branch and throws unless a sale for `request` may use it now, given the
   * references of the QR payments backing the sale. QUOTE_NOT_FOUND for another branch's quote.
   */
  lockForCheckout(quoteId: number, request: QuoteRequest, claimedReferences: readonly string[]): Promise<PriceQuoteEntity>
  /** The id of the quote a QR holds, or null. Not locked: used to refuse a sale that left the quote out. */
  findReservedByReference(reference: string): Promise<number | null>
  /** Ties the (locked) quote to the sale it was used for. */
  consume(quote: PriceQuoteEntity, saleId: number): Promise<void>
  /**
   * Holds the quote for the QR that is about to be made. For a quote of an order the order is locked
   * first and must still be what was priced. The QR may be for part of the total but not more.
   */
  reserveForQr(quoteId: number, claim: { branchId: number; reference: string; amountSatang: number }): Promise<void>
  /** The QR was cancelled or never made: the quote is open again. Does nothing when no quote is held. */
  releaseByReference(reference: string): Promise<void>
  /** The QR's money was set aside by the owner: the quote is closed. Does nothing when no quote is held. */
  cancelByReference(reference: string): Promise<void>
}

const token: unique symbol = Symbol('IQuoteClaims')
export const quoteClaimsToken = token.toString()
```

`apps/api/src/modules/quotes/applications/ports/promotion-catalog.port.ts`:

```ts
import type { PromotionEntity } from '../../../../domains/promotion.domain'

/** The promotions a quote may choose from. The promotions module answers it. */
export interface IPromotionCatalog {
  /** Every promotion that is switched on. The quote decides which ones apply right now. */
  activePromotions(): Promise<PromotionEntity[]>
}

const token: unique symbol = Symbol('IPromotionCatalog')
export const promotionCatalogToken = token.toString()
```

`apps/api/src/modules/quotes/applications/ports/order-quote-source.port.ts`:

```ts
import type { LineOption } from '../../../../domains/modifier.domain'

export interface QuotedOrder {
  id: number
  memberId: number | null
  items: {
    productId: number
    productName: string
    sku: string
    /** The price quoted when the line was added, options included. */
    unitPriceSatang: number
    quantity: number
    options: LineOption[]
  }[]
}

/** The lines of an open order, for pricing it. The orders module answers it. */
export interface IOrderQuoteSource {
  /** An open order of this branch. ORDER_NOT_FOUND otherwise, and a conflict when it is no longer open. */
  read(orderId: number, branchId: number): Promise<QuotedOrder>
  /** Like read, but row-locks the order until the surrounding unit of work ends. */
  lockOpenOrder(orderId: number, branchId: number): Promise<QuotedOrder>
}

const token: unique symbol = Symbol('IOrderQuoteSource')
export const orderQuoteSourceToken = token.toString()
```

`apps/api/src/modules/orders/applications/ports/order-edit-lock.port.ts`:

```ts
/**
 * Whether an order may be changed. An order whose price a QR is waiting on must not change, or the money
 * would arrive for a bill that no longer matches. The quotes module answers it.
 */
export interface IOrderEditLock {
  /** Throws ORDER_LOCKED_BY_QR_PAYMENT when a QR holds a quote of this order. */
  assertEditable(orderId: number): Promise<void>
}

const token: unique symbol = Symbol('IOrderEditLock')
export const orderEditLockToken = token.toString()
```

- [ ] **Step 2: factory และ mock**

ใน `apps/api/src/__tests__/factories.ts` เพิ่ม import `import { PriceQuoteEntity, type PriceQuoteProps } from '../domains/price-quote.domain'` และต่อท้ายไฟล์:

```ts
/** An open quote for 3 x 10.00 made at 12:00 on 2026-10-15 (Bangkok), good for 15 minutes. */
export const makePriceQuote = (overrides: Partial<PriceQuoteProps> = {}) =>
  new PriceQuoteEntity({
    id: 5,
    branchId: 1,
    memberId: null,
    member: null,
    orderId: null,
    lines: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 3, options: [] }],
    promotion: null,
    vatMode: 'inclusive',
    vatRateBp: 700,
    subtotalSatang: 3000,
    discountSatang: 0,
    vatSatang: 196,
    totalSatang: 3000,
    status: 'open',
    qrReference: null,
    saleId: null,
    createdById: 1,
    expiresAt: new Date('2026-10-15T05:15:00Z'),
    createdAt: new Date('2026-10-15T05:00:00Z'),
    ...overrides,
  })
```

ใน `apps/api/src/__tests__/mocks.ts` เพิ่ม import:

```ts
import type { IPriceQuoteRepository } from '../modules/quotes/applications/ports/price-quote.repository'
import type { IQuoteClaims } from '../modules/quotes/applications/ports/quote-claims.port'
import type { IPromotionCatalog } from '../modules/quotes/applications/ports/promotion-catalog.port'
import type { IOrderQuoteSource } from '../modules/quotes/applications/ports/order-quote-source.port'
```

และต่อท้ายไฟล์:

```ts
export const mockPriceQuoteRepository = (): Mocked<IPriceQuoteRepository> => ({
  create: mock<IPriceQuoteRepository['create']>(),
  findById: mock<IPriceQuoteRepository['findById']>(),
  findByIdForUpdate: mock<IPriceQuoteRepository['findByIdForUpdate']>(),
  findByQrReference: mock<IPriceQuoteRepository['findByQrReference']>(async () => null),
  findByQrReferenceForUpdate: mock<IPriceQuoteRepository['findByQrReferenceForUpdate']>(async () => null),
  hasReservedForOrder: mock<IPriceQuoteRepository['hasReservedForOrder']>(async () => false),
  save: mock<IPriceQuoteRepository['save']>(async (quote) => quote),
})

/** No quote holds any QR by default, and every claim succeeds; a test sets what it is about. */
export const mockQuoteClaims = (): Mocked<IQuoteClaims> => ({
  lockForCheckout: mock<IQuoteClaims['lockForCheckout']>(),
  findReservedByReference: mock<IQuoteClaims['findReservedByReference']>(async () => null),
  consume: mock<IQuoteClaims['consume']>(async () => {}),
  reserveForQr: mock<IQuoteClaims['reserveForQr']>(async () => {}),
  releaseByReference: mock<IQuoteClaims['releaseByReference']>(async () => {}),
  cancelByReference: mock<IQuoteClaims['cancelByReference']>(async () => {}),
})

export const mockPromotionCatalog = (): Mocked<IPromotionCatalog> => ({
  activePromotions: mock<IPromotionCatalog['activePromotions']>(async () => []),
})

export const mockOrderQuoteSource = (): Mocked<IOrderQuoteSource> => ({
  read: mock<IOrderQuoteSource['read']>(),
  lockOpenOrder: mock<IOrderQuoteSource['lockOpenOrder']>(),
})
```

- [ ] **Step 3: เขียนการทดสอบ `QuoteClaims` ที่ล้มเหลว**

สร้าง `apps/api/src/modules/quotes/applications/services/quote-claims.test.ts`:

```ts
import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { makePriceQuote } from '../../../../__tests__/factories'
import { mockClock, mockOrderQuoteSource, mockPriceQuoteRepository } from '../../../../__tests__/mocks'
import { QuoteClaims } from './quote-claims'

const now = new Date('2026-10-15T05:05:00Z')
const cart = { branchId: 1, memberId: null, lines: [{ productId: 1, optionIds: [], quantity: 3 }] }

let quotes: ReturnType<typeof mockPriceQuoteRepository>
let orders: ReturnType<typeof mockOrderQuoteSource>
let claims: QuoteClaims

beforeEach(() => {
  quotes = mockPriceQuoteRepository()
  orders = mockOrderQuoteSource()
  claims = new QuoteClaims(quotes, orders, mockClock(now))
})

describe('lockForCheckout', () => {
  test('locks the quote and returns it when the sale is the one it was made for', async () => {
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    const quote = await claims.lockForCheckout(5, cart, [])
    expect(quote.id).toBe(5)
    expect(quotes.findByIdForUpdate).toHaveBeenCalledWith(5)
  })

  test("an unknown quote and another branch's quote are both not found", async () => {
    quotes.findByIdForUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(makePriceQuote({ branchId: 2 }))
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  })

  test('applies the rules of the quote with the time now', async () => {
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ expiresAt: new Date('2026-10-15T05:05:00Z') }))
    await expect(claims.lockForCheckout(5, cart, [])).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' })
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    await expect(claims.lockForCheckout(5, { ...cart, memberId: 3 }, [])).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
  })
})

describe('reserveForQr', () => {
  const claim = { branchId: 1, reference: 'QRABC', amountSatang: 3000 }

  test('holds an open quote for the reference', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    await claims.reserveForQr(5, claim)
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'reserved', qrReference: 'QRABC' })
    expect(orders.lockOpenOrder).not.toHaveBeenCalled()
  })

  test('a QR for part of the total is accepted and one for more is not', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    await claims.reserveForQr(5, { ...claim, amountSatang: 1000 })
    await expect(claims.reserveForQr(5, { ...claim, amountSatang: 3001 })).rejects.toMatchObject({ code: 'QUOTE_AMOUNT_MISMATCH' })
    expect(quotes.save).toHaveBeenCalledTimes(1)
  })

  test('refuses a quote that is taken, expired, or of another branch', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote({ branchId: 2 }))
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })

    quotes.findById.mockResolvedValue(makePriceQuote())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QROTHER' }))
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_NOT_OPEN' })

    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ expiresAt: new Date('2026-10-15T05:05:00Z') }))
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' })
  })

  test('a quote of an order locks the order first and must still match what the order holds', async () => {
    const steps: string[] = []
    const ordered = makePriceQuote({ orderId: 9, memberId: null })
    quotes.findById.mockResolvedValue(ordered)
    quotes.findByIdForUpdate.mockImplementation(async () => {
      steps.push('quote')
      return ordered
    })
    orders.lockOpenOrder.mockImplementation(async () => {
      steps.push('order')
      return { id: 9, memberId: null, items: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 3, options: [] }] }
    })
    await claims.reserveForQr(5, claim)
    expect(steps).toEqual(['order', 'quote'])

    orders.lockOpenOrder.mockResolvedValue({ id: 9, memberId: null, items: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 1000, quantity: 4, options: [] }] })
    await expect(claims.reserveForQr(5, claim)).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
  })
})

describe('settling a QR', () => {
  test('releasing reopens the quote the QR held', async () => {
    quotes.findByQrReferenceForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    await claims.releaseByReference('QRABC')
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'open', qrReference: null })
  })

  test('cancelling closes it', async () => {
    quotes.findByQrReferenceForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    await claims.cancelByReference('QRABC')
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'cancelled' })
  })

  test('a QR that held no quote changes nothing', async () => {
    await claims.releaseByReference('QRNONE')
    await claims.cancelByReference('QRNONE')
    expect(quotes.save).not.toHaveBeenCalled()
  })

  test('a quote already used is left alone', async () => {
    quotes.findByQrReferenceForUpdate.mockResolvedValue(makePriceQuote({ status: 'consumed', saleId: 3, qrReference: 'QRABC' }))
    await claims.releaseByReference('QRABC')
    await claims.cancelByReference('QRABC')
    expect(quotes.save).not.toHaveBeenCalled()
  })

  test('says which quote a QR holds, only while it is held', async () => {
    quotes.findByQrReference.mockResolvedValueOnce(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    expect(await claims.findReservedByReference('QRABC')).toBe(5)
    quotes.findByQrReference.mockResolvedValueOnce(makePriceQuote({ status: 'consumed', saleId: 3, qrReference: 'QRABC' }))
    expect(await claims.findReservedByReference('QRABC')).toBeNull()
    expect(await claims.findReservedByReference('QRNONE')).toBeNull()
  })

  test('consuming saves the quote with its sale', async () => {
    await claims.consume(makePriceQuote(), 8)
    expect(quotes.save.mock.calls[0]![0]).toMatchObject({ status: 'consumed', saleId: 8 })
  })
})
```

- [ ] **Step 4: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/quotes/applications/services/quote-claims.test.ts`
Expected: FAIL (`Cannot find module './quote-claims'`)

- [ ] **Step 5: เขียน `QuoteClaims` และ `OrderEditLock`**

`apps/api/src/modules/quotes/applications/services/quote-claims.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { PriceQuoteEntity, QuoteRequest } from '../../../../domains/price-quote.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { orderQuoteSourceToken, type IOrderQuoteSource } from '../ports/order-quote-source.port'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import type { IQuoteClaims } from '../ports/quote-claims.port'

const notFound = () => new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')

@injectable()
export class QuoteClaims implements IQuoteClaims {
  constructor(
    @inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository,
    @inject(orderQuoteSourceToken) private readonly orders: IOrderQuoteSource,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async lockForCheckout(quoteId: number, request: QuoteRequest, claimedReferences: readonly string[]) {
    const quote = await this.quotes.findByIdForUpdate(quoteId)
    // Another branch's quote is not even acknowledged to exist.
    if (!quote || quote.branchId !== request.branchId) throw notFound()
    quote.assertSellable(request, this.clock.now(), claimedReferences)
    return quote
  }

  async findReservedByReference(reference: string) {
    const quote = await this.quotes.findByQrReference(reference)
    return quote?.status === 'reserved' ? quote.id : null
  }

  async consume(quote: PriceQuoteEntity, saleId: number) {
    await this.quotes.save(quote.consume(saleId))
  }

  async reserveForQr(quoteId: number, { branchId, reference, amountSatang }: { branchId: number; reference: string; amountSatang: number }) {
    const found = await this.quotes.findById(quoteId)
    if (!found || found.branchId !== branchId) throw notFound()

    // An order is locked before its quote, as everywhere else, and must still be what was priced.
    const order = found.orderId === null ? null : await this.orders.lockOpenOrder(found.orderId, branchId)
    const quote = await this.quotes.findByIdForUpdate(quoteId)
    if (!quote || quote.branchId !== branchId) throw notFound()
    if (order) {
      const unchanged = quote.matches({
        branchId,
        memberId: order.memberId,
        lines: order.items.map((item) => ({
          productId: item.productId,
          optionIds: item.options.map((option) => option.optionId),
          quantity: item.quantity,
        })),
      })
      if (!unchanged)
        throw new DomainConflictError('ออเดอร์เปลี่ยนไปจากราคาที่ตรึงไว้ กรุณาขอราคาใหม่', 'QUOTE_MISMATCH')
    }
    quote.assertQrAmount(amountSatang)
    await this.quotes.save(quote.reserve(reference, this.clock.now()))
  }

  async releaseByReference(reference: string) {
    const quote = await this.quotes.findByQrReferenceForUpdate(reference)
    if (!quote) return
    const released = quote.release(reference)
    if (released !== quote) await this.quotes.save(released)
  }

  async cancelByReference(reference: string) {
    const quote = await this.quotes.findByQrReferenceForUpdate(reference)
    if (!quote) return
    const cancelled = quote.cancelReserved(reference)
    if (cancelled !== quote) await this.quotes.save(cancelled)
  }
}
```

`apps/api/src/modules/quotes/applications/services/order-edit-lock.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import type { IOrderEditLock } from '../../../orders/applications/ports/order-edit-lock.port'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'

@injectable()
export class OrderEditLock implements IOrderEditLock {
  constructor(@inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository) {}

  async assertEditable(orderId: number) {
    if (await this.quotes.hasReservedForOrder(orderId))
      throw new DomainConflictError(
        'ออเดอร์นี้กำลังรอการชำระด้วย QR แก้ไขไม่ได้จนกว่าจะยกเลิก QR หรือรับเงินเสร็จ',
        'ORDER_LOCKED_BY_QR_PAYMENT',
      )
  }
}
```

- [ ] **Step 6: รันการทดสอบ `QuoteClaims` ให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/quotes/applications/services/quote-claims.test.ts`
Expected: PASS ทั้งหมด

- [ ] **Step 7: schema และการทดสอบ use case ที่ล้มเหลว**

`apps/api/src/modules/quotes/applications/schemas/quote-schemas.ts`:

```ts
import { z } from 'zod'

const line = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  options: z.array(z.number().int().positive()).max(40).optional(),
})

export const createQuoteSchema = z
  .object({
    lines: z.array(line).min(1).max(100).optional(),
    memberId: z.number().int().positive().nullable().optional(),
    orderId: z.number().int().positive().optional(),
  })
  .refine((value) => (value.orderId !== undefined) !== (value.lines !== undefined), {
    message: 'ต้องระบุรายการสินค้า (lines) หรือออเดอร์ (orderId) อย่างใดอย่างหนึ่ง',
  })
  .refine((value) => value.orderId === undefined || value.memberId === undefined, {
    message: 'ออเดอร์มีสมาชิกของตัวเองอยู่แล้ว ไม่ต้องระบุ memberId',
  })

export const quoteIdSchema = z.object({ id: z.number().int().positive() })
```

สร้าง `apps/api/src/modules/quotes/applications/usecases/quote.usecases.test.ts`:

```ts
import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeProduct, makePriceQuote } from '../../../../__tests__/factories'
import {
  mockClock, mockLineOptionsResolver, mockMemberRepository, mockOrderQuoteSource, mockPriceQuoteRepository,
  mockProductRepository, mockPromotionCatalog, mockShopSettingsRepository, mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { MemberEntity } from '../../../../domains/member.domain'
import { PriceQuoteEntity } from '../../../../domains/price-quote.domain'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { CancelQuoteUseCase } from './cancel-quote.usecase'
import { CreateQuoteUseCase } from './create-quote.usecase'
import { GetQuoteUseCase } from './get-quote.usecase'

// 10:00 on Thursday 2026-10-15 in Bangkok.
const now = new Date('2026-10-15T03:00:00Z')
const actor = { id: 7 }
const branch = { id: 1 }
const promotion = (overrides: Partial<ConstructorParameters<typeof PromotionEntity>[0]> = {}) =>
  new PromotionEntity({
    id: 1, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
    startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
    audience: 'everyone', isActive: true, createdAt: now, updatedAt: now, ...overrides,
  })
const member = (isActive = true) =>
  new MemberEntity({ id: 8, name: 'ลูกค้าประจำ', phone: '0812345678', isActive, createdAt: now, updatedAt: now })

let products: ReturnType<typeof mockProductRepository>
let lineOptions: ReturnType<typeof mockLineOptionsResolver>
let settings: ReturnType<typeof mockShopSettingsRepository>
let members: ReturnType<typeof mockMemberRepository>
let catalog: ReturnType<typeof mockPromotionCatalog>
let orders: ReturnType<typeof mockOrderQuoteSource>
let quotes: ReturnType<typeof mockPriceQuoteRepository>
let create: CreateQuoteUseCase

beforeEach(() => {
  products = mockProductRepository()
  lineOptions = mockLineOptionsResolver()
  settings = mockShopSettingsRepository()
  members = mockMemberRepository()
  catalog = mockPromotionCatalog()
  orders = mockOrderQuoteSource()
  quotes = mockPriceQuoteRepository()
  settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
  products.findById.mockImplementation(async (id) => makeProduct({ id, name: `สินค้า ${id}`, sku: `S${id}`, priceSatang: 2500, stockQty: 10 }))
  quotes.create.mockImplementation(async (priced) =>
    new PriceQuoteEntity({ ...priced, id: 5, status: 'open', qrReference: null, saleId: null, createdAt: now }),
  )
  create = new CreateQuoteUseCase(products, lineOptions, settings, members, catalog, orders, quotes, mockClock(now))
})

describe('CreateQuoteUseCase', () => {
  test('prices a cart at the catalogue prices and pins the shop VAT rules', async () => {
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.toSnapshot()).toMatchObject({
      branchId: 1, memberId: null, orderId: null, subtotalSatang: 5000, discountSatang: 0, totalSatang: 5000,
      vatMode: 'inclusive', vatRateBp: 700, promotion: null, createdById: 7, status: 'open',
    })
    expect(quote.lines).toEqual([{ productId: 1, productName: 'สินค้า 1', sku: 'S1', unitPriceSatang: 2500, quantity: 2, options: [] }])
    expect(quote.expiresAt).toEqual(new Date(now.getTime() + 15 * 60_000))
  })

  test('adds the options to the unit price and keeps them on the line', async () => {
    const option = { groupId: 1, groupName: 'ท็อปปิง', optionId: 7, name: 'ไข่มุก', priceSatang: 500, costSatang: 200 }
    lineOptions.resolve.mockResolvedValue({ options: [option], priceSatang: 500, costSatang: 200, key: '7' })
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 1, options: [7] }] }, actor, branch)
    expect(lineOptions.resolve).toHaveBeenCalledWith(1, [7])
    expect(quote.lines[0]).toMatchObject({ unitPriceSatang: 3000, options: [option] })
    expect(quote.totalSatang).toBe(3000)
  })

  test('chooses the promotion that gives the most and prices with it', async () => {
    catalog.activePromotions.mockResolvedValue([promotion({ id: 1 }), promotion({ id: 2, name: 'ลด 300', kind: 'fixed', value: 300 })])
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.promotion).toEqual({ id: 1, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, discountSatang: 500 })
    expect(quote).toMatchObject({ discountSatang: 500, totalSatang: 4500 })
  })

  test('a promotion outside its hours is not chosen', async () => {
    catalog.activePromotions.mockResolvedValue([promotion({ windowStartMinute: 14 * 60, windowEndMinute: 17 * 60 })])
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.promotion).toBeNull()
    expect(quote.discountSatang).toBe(0)
  })

  test('a members-only promotion needs a member, who is kept on the quote', async () => {
    catalog.activePromotions.mockResolvedValue([promotion({ audience: 'members' })])
    members.findById.mockResolvedValue(member())
    expect((await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)).promotion).toBeNull()
    const withMember = await create.execute({ lines: [{ productId: 1, quantity: 2 }], memberId: 8 }, actor, branch)
    expect(withMember.promotion?.id).toBe(1)
    expect(withMember).toMatchObject({ memberId: 8, member: { id: 8, code: 'M000008', name: 'ลูกค้าประจำ' } })
  })

  test('refuses an unknown or inactive member', async () => {
    members.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(member(false))
    await expect(create.execute({ lines: [{ productId: 1, quantity: 1 }], memberId: 8 }, actor, branch)).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
    await expect(create.execute({ lines: [{ productId: 1, quantity: 1 }], memberId: 8 }, actor, branch)).rejects.toMatchObject({ code: 'MEMBER_INACTIVE' })
    expect(quotes.create).not.toHaveBeenCalled()
  })

  test('repeated lines are added together and stock is checked for the total of a product', async () => {
    const merged = await create.execute({ lines: [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 3 }] }, actor, branch)
    expect(merged.lines).toHaveLength(1)
    expect(merged.lines[0]!.quantity).toBe(5)
    await expect(
      create.execute({ lines: [{ productId: 1, quantity: 6 }, { productId: 1, quantity: 6, options: [7] }] }, actor, branch),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  test('refuses an unknown or inactive product', async () => {
    products.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(makeProduct({ isActive: false }))
    await expect(create.execute({ lines: [{ productId: 9, quantity: 1 }] }, actor, branch)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' })
    await expect(create.execute({ lines: [{ productId: 1, quantity: 1 }] }, actor, branch)).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE' })
  })

  test("prices an open order from the order's own lines and member, not from the catalogue", async () => {
    orders.read.mockResolvedValue({
      id: 9, memberId: 8,
      items: [{ productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2000, quantity: 3, options: [] }],
    })
    members.findById.mockResolvedValue(member())
    const quote = await create.execute({ orderId: 9 }, actor, branch)
    expect(orders.read).toHaveBeenCalledWith(9, 1)
    expect(products.findById).not.toHaveBeenCalled()
    expect(quote).toMatchObject({ orderId: 9, memberId: 8, subtotalSatang: 6000, totalSatang: 6000 })
    expect(quote.lines[0]).toMatchObject({ productName: 'ชา', unitPriceSatang: 2000 })
  })

  test('needs the lines or an order, and not both', async () => {
    await expect(create.execute({}, actor, branch)).rejects.toThrow()
    await expect(create.execute({ orderId: 9, lines: [{ productId: 1, quantity: 1 }] }, actor, branch)).rejects.toThrow()
    await expect(create.execute({ orderId: 9, memberId: 8 }, actor, branch)).rejects.toThrow()
  })
})

describe('GetQuoteUseCase and CancelQuoteUseCase', () => {
  test("another branch's quote and an unknown one are not found", async () => {
    quotes.findById.mockResolvedValueOnce(makePriceQuote({ branchId: 2 })).mockResolvedValueOnce(null)
    const get = new GetQuoteUseCase(quotes)
    await expect(get.execute(5, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
    await expect(get.execute(9, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  })

  test('reads without writing anything', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote())
    expect((await new GetQuoteUseCase(quotes).execute(5, 1)).id).toBe(5)
    expect(quotes.save).not.toHaveBeenCalled()
  })

  test('cancels an open quote under its lock, but not one a QR holds', async () => {
    const cancel = new CancelQuoteUseCase(quotes, mockUnitOfWork())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    expect((await cancel.execute(5, 1)).status).toBe('cancelled')
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    await expect(cancel.execute(5, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ branchId: 2 }))
    await expect(cancel.execute(5, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  })
})
```

- [ ] **Step 8: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/quotes/applications/usecases`
Expected: FAIL (`Cannot find module './create-quote.usecase'`)

- [ ] **Step 9: เขียน use case**

`apps/api/src/modules/quotes/applications/usecases/create-quote.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { lineKey } from '../../../../domains/modifier.domain'
import { PriceQuoteEntity, type QuoteLine } from '../../../../domains/price-quote.domain'
import { pickBestPromotion } from '../../../../domains/promotion.domain'
import type { ProductEntity } from '../../../../domains/product.domain'
import type { SaleMember } from '../../../../domains/sale.domain'
import { memberRepositoryToken, type IMemberRepository } from '../../../members/applications/ports/member.repository'
import { lineOptionsResolverToken, type ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
import { productRepositoryToken, type IProductRepository } from '../../../products/applications/ports/product.repository'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { orderQuoteSourceToken, type IOrderQuoteSource } from '../ports/order-quote-source.port'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import { promotionCatalogToken, type IPromotionCatalog } from '../ports/promotion-catalog.port'
import { createQuoteSchema } from '../schemas/quote-schemas'

/**
 * Command: prices a cart (or an open order) with the catalogue and the shop's rules as they are now,
 * chooses the promotion that gives the most, and pins the result. Nothing is locked or deducted: stock is
 * checked so the till hears about a shortage early, and again when the sale is made.
 */
@injectable()
export class CreateQuoteUseCase {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(promotionCatalogToken) private readonly catalog: IPromotionCatalog,
    @inject(orderQuoteSourceToken) private readonly orders: IOrderQuoteSource,
    @inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(input: unknown, actor: { id: number }, branch: { id: number }) {
    const dto = createQuoteSchema.parse(input)
    const now = this.clock.now()
    const shop = await this.settings.get()

    let memberId: number | null
    let lines: QuoteLine[]
    if (dto.orderId !== undefined) {
      const order = await this.orders.read(dto.orderId, branch.id)
      memberId = order.memberId
      lines = order.items.map((item) => ({ ...item, options: [...item.options] }))
    } else {
      memberId = dto.memberId ?? null
      lines = await this.priceLines(dto.lines!, branch.id)
    }

    let member: SaleMember | null = null
    if (memberId !== null) {
      const found = await this.members.findById(memberId)
      if (!found) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
      found.assertActive()
      member = { id: found.id, code: found.code, name: found.name }
    }

    const subtotalSatang = lines.reduce((total, line) => total + line.unitPriceSatang * line.quantity, 0)
    const best = pickBestPromotion(await this.catalog.activePromotions(), {
      subtotalSatang,
      hasMember: member !== null,
      at: now,
      timeZone: shop.timeZone,
    })

    return this.quotes.create(
      PriceQuoteEntity.price(
        {
          branchId: branch.id,
          memberId,
          member,
          orderId: dto.orderId ?? null,
          lines,
          promotion: best ? best.promotion.toSalePromotion(best.discountSatang) : null,
          vatMode: shop.vatMode,
          vatRateBp: shop.vatRateBp,
          createdById: actor.id,
        },
        now,
      ),
    )
  }

  /** The same product with the same options is one line; stock is the product's, so checked for the total. */
  private async priceLines(requested: { productId: number; quantity: number; options?: number[] }[], branchId: number) {
    const wanted = new Map<string, { productId: number; optionIds: number[]; quantity: number }>()
    for (const { productId, quantity, options = [] } of requested) {
      const optionIds = [...options].sort((a, b) => a - b)
      const key = `${productId}:${lineKey(optionIds.map((optionId) => ({ optionId })))}`
      const existing = wanted.get(key)
      if (existing) existing.quantity += quantity
      else wanted.set(key, { productId, optionIds, quantity })
    }

    const demand = new Map<number, number>()
    for (const line of wanted.values()) demand.set(line.productId, (demand.get(line.productId) ?? 0) + line.quantity)
    const productsById = new Map<number, ProductEntity>()
    for (const [productId, quantity] of demand) {
      const product = await this.products.findById(productId, branchId)
      if (!product) throw new DomainError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
      product.assertSellable(quantity)
      productsById.set(productId, product)
    }

    const lines: QuoteLine[] = []
    for (const line of wanted.values()) {
      const product = productsById.get(line.productId)!
      const resolved = await this.lineOptions.resolve(line.productId, line.optionIds)
      lines.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceSatang: product.priceSatang + resolved.priceSatang,
        quantity: line.quantity,
        options: resolved.options,
      })
    }
    return lines
  }
}
```

`apps/api/src/modules/quotes/applications/usecases/get-quote.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import { quoteIdSchema } from '../schemas/quote-schemas'

/** Query: a pure read. It never extends, expires or writes anything. */
@injectable()
export class GetQuoteUseCase {
  constructor(@inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository) {}

  async execute(id: number, branchId: number) {
    quoteIdSchema.parse({ id })
    const quote = await this.quotes.findById(id)
    if (!quote || quote.branchId !== branchId) throw new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')
    return quote
  }
}
```

`apps/api/src/modules/quotes/applications/usecases/cancel-quote.usecase.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import { quoteIdSchema } from '../schemas/quote-schemas'

/** Command: abandons an open quote. One that a QR holds is released by cancelling that QR instead. */
@injectable()
export class CancelQuoteUseCase {
  constructor(
    @inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, branchId: number) {
    quoteIdSchema.parse({ id })
    return this.unitOfWork.run(async () => {
      const quote = await this.quotes.findByIdForUpdate(id)
      if (!quote || quote.branchId !== branchId) throw new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')
      return this.quotes.save(quote.cancel())
    })
  }
}
```

- [ ] **Step 10: รันการทดสอบ use case ให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/quotes`
Expected: PASS ทั้งหมด (ถ้า "PRODUCT_INACTIVE" ไม่ใช่รหัสที่ `assertActive` ของสินค้าโยน ให้ดู `ProductEntity.assertActive` ใน `domains/product.domain.ts` แล้วใช้รหัสนั้นในการทดสอบ)

- [ ] **Step 11: repository, controller, ตัวตอบ port ของโมดูลอื่น, module**

`apps/api/src/modules/quotes/adapters/repository/price-quote.drizzle.repository.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { PriceQuoteEntity, type PricedQuote } from '../../../../domains/price-quote.domain'
import { priceQuotes } from '../../../../infrastructure/database/schema/price-quotes'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IPriceQuoteRepository } from '../../applications/ports/price-quote.repository'

@injectable()
export class DrizzlePriceQuoteRepository implements IPriceQuoteRepository {
  async create(quote: PricedQuote) {
    const [row] = await currentExecutor().insert(priceQuotes).values(quote).returning()
    return new PriceQuoteEntity(row!)
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select().from(priceQuotes).where(eq(priceQuotes.id, id))
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select().from(priceQuotes).where(eq(priceQuotes.id, id)).for('update')
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByQrReference(reference: string) {
    const [row] = await currentExecutor().select().from(priceQuotes).where(eq(priceQuotes.qrReference, reference))
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByQrReferenceForUpdate(reference: string) {
    const [row] = await currentExecutor()
      .select()
      .from(priceQuotes)
      .where(eq(priceQuotes.qrReference, reference))
      .for('update')
    return row ? new PriceQuoteEntity(row) : null
  }

  async hasReservedForOrder(orderId: number) {
    const [row] = await currentExecutor()
      .select({ id: priceQuotes.id })
      .from(priceQuotes)
      .where(and(eq(priceQuotes.orderId, orderId), eq(priceQuotes.status, 'reserved')))
      .limit(1)
    return row !== undefined
  }

  async save(quote: PriceQuoteEntity) {
    const { id, status, qrReference, saleId } = quote.toSnapshot()
    const [row] = await currentExecutor()
      .update(priceQuotes)
      .set({ status, qrReference, saleId, updatedAt: new Date() })
      .where(eq(priceQuotes.id, id))
      .returning()
    if (!row) throw new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')
    return new PriceQuoteEntity(row)
  }
}
```

`apps/api/src/modules/quotes/adapters/controllers/schemas/quote.schema.ts`:

```ts
import { t } from 'elysia'

const lineOption = t.Object({
  groupId: t.Integer(),
  groupName: t.String(),
  optionId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
})

export const quoteSchemas = {
  quote: t.Object({
    id: t.Integer(),
    branchId: t.Integer(),
    memberId: t.Nullable(t.Integer()),
    member: t.Nullable(t.Object({ id: t.Integer(), code: t.String(), name: t.String() })),
    orderId: t.Nullable(t.Integer()),
    lines: t.Array(
      t.Object({
        productId: t.Integer(),
        productName: t.String(),
        sku: t.String(),
        unitPriceSatang: t.Integer(),
        quantity: t.Integer(),
        options: t.Array(lineOption),
      }),
    ),
    subtotalSatang: t.Integer(),
    promotion: t.Nullable(
      t.Object({
        id: t.Integer(),
        name: t.String(),
        kind: t.Union([t.Literal('fixed'), t.Literal('percent')]),
        value: t.Integer(),
        maxDiscountSatang: t.Nullable(t.Integer()),
        discountSatang: t.Integer(),
      }),
    ),
    discountSatang: t.Integer(),
    vatMode: t.Union([t.Literal('inclusive'), t.Literal('exclusive'), t.Literal('none')]),
    vatRateBp: t.Integer(),
    vatSatang: t.Integer(),
    totalSatang: t.Integer(),
    status: t.Union([t.Literal('open'), t.Literal('reserved'), t.Literal('consumed'), t.Literal('cancelled')]),
    expiresAt: t.Date(),
    createdAt: t.Date(),
  }),
  create: t.Object({
    lines: t.Optional(
      t.Array(
        t.Object({
          productId: t.Integer({ minimum: 1 }),
          quantity: t.Integer({ minimum: 1 }),
          options: t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 40 })),
        }),
        { minItems: 1, maxItems: 100 },
      ),
    ),
    memberId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
    orderId: t.Optional(t.Integer({ minimum: 1 })),
  }),
}
export type QuoteResponse = typeof quoteSchemas.quote.static
```

`apps/api/src/modules/quotes/adapters/controllers/quote.presenter.ts`:

```ts
import type { PriceQuoteEntity } from '../../../../domains/price-quote.domain'
import type { QuoteResponse } from './schemas/quote.schema'

/** The cost of a line's options is internal, like the cost of a sale line: it is not part of the answer. */
export function toQuoteResponse(quote: PriceQuoteEntity): QuoteResponse {
  const snapshot = quote.toSnapshot()
  return {
    id: snapshot.id,
    branchId: snapshot.branchId,
    memberId: snapshot.memberId,
    member: snapshot.member,
    orderId: snapshot.orderId,
    lines: snapshot.lines.map(({ options, ...line }) => ({
      ...line,
      options: options.map(({ costSatang: _cost, ...option }) => option),
    })),
    subtotalSatang: snapshot.subtotalSatang,
    promotion: snapshot.promotion,
    discountSatang: snapshot.discountSatang,
    vatMode: snapshot.vatMode,
    vatRateBp: snapshot.vatRateBp,
    vatSatang: snapshot.vatSatang,
    totalSatang: snapshot.totalSatang,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt,
    createdAt: snapshot.createdAt,
  }
}
```

`apps/api/src/modules/quotes/adapters/controllers/quote.controller.ts`:

```ts
import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CancelQuoteUseCase } from '../../applications/usecases/cancel-quote.usecase'
import { CreateQuoteUseCase } from '../../applications/usecases/create-quote.usecase'
import { GetQuoteUseCase } from '../../applications/usecases/get-quote.usecase'
import { toQuoteResponse } from './quote.presenter'
import { quoteSchemas } from './schemas/quote.schema'

@injectable()
export class QuoteElysiaController {
  constructor(
    @inject(CreateQuoteUseCase) private readonly createQuote: CreateQuoteUseCase,
    @inject(GetQuoteUseCase) private readonly getQuote: GetQuoteUseCase,
    @inject(CancelQuoteUseCase) private readonly cancelQuote: CancelQuoteUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'quotes', prefix: '/quotes', detail: { tags: ['Quotes'] } })
      .use(auth)
      .post(
        '/',
        async ({ body, user, branch }) => toQuoteResponse(await this.createQuote.execute(body, user, await branch())),
        {
          auth: ['owner', 'cashier'],
          body: quoteSchemas.create,
          response: quoteSchemas.quote,
          detail: { summary: 'คิดราคาตะกร้าหรือออเดอร์ เลือกโปรโมชัน และตรึงราคาไว้' },
        },
      )
      .get('/:id', async ({ params, branch }) => toQuoteResponse(await this.getQuote.execute(params.id, (await branch()).id)), {
        auth: ['owner', 'cashier'],
        params: idParams,
        response: quoteSchemas.quote,
        detail: { summary: 'อ่านราคาที่ตรึงไว้ (อ่านอย่างเดียว)' },
      })
      .post(
        '/:id/cancel',
        async ({ params, branch }) => toQuoteResponse(await this.cancelQuote.execute(params.id, (await branch()).id)),
        {
          auth: ['owner', 'cashier'],
          params: idParams,
          response: quoteSchemas.quote,
          detail: { summary: 'เลิกใช้ราคาที่ตรึงไว้ (ใช้ไม่ได้ถ้ามี QR จองอยู่)' },
        },
      )
  }
}
```

`apps/api/src/modules/quotes/quotes.module.ts`:

```ts
import { container } from 'tsyringe'
import { QuoteElysiaController } from './adapters/controllers/quote.controller'
import { DrizzlePriceQuoteRepository } from './adapters/repository/price-quote.drizzle.repository'
import { orderEditLockToken } from '../orders/applications/ports/order-edit-lock.port'
import { priceQuoteRepositoryToken } from './applications/ports/price-quote.repository'
import { quoteClaimsToken } from './applications/ports/quote-claims.port'
import { OrderEditLock } from './applications/services/order-edit-lock'
import { QuoteClaims } from './applications/services/quote-claims'
import { CancelQuoteUseCase } from './applications/usecases/cancel-quote.usecase'
import { CreateQuoteUseCase } from './applications/usecases/create-quote.usecase'
import { GetQuoteUseCase } from './applications/usecases/get-quote.usecase'

container.register(priceQuoteRepositoryToken, { useClass: DrizzlePriceQuoteRepository })
container.register(quoteClaimsToken, { useClass: QuoteClaims })
// The orders module asks whether an order may change; quotes know which orders a QR is waiting on.
container.register(orderEditLockToken, { useClass: OrderEditLock })
container.registerSingleton(CreateQuoteUseCase)
container.registerSingleton(GetQuoteUseCase)
container.registerSingleton(CancelQuoteUseCase)
container.registerSingleton(QuoteElysiaController)
```

`apps/api/src/modules/promotions/applications/services/promotion-catalog.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import type { IPromotionCatalog } from '../../../quotes/applications/ports/promotion-catalog.port'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'

/** Answers the quotes module: the promotions that are switched on. */
@injectable()
export class PromotionCatalog implements IPromotionCatalog {
  constructor(@inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository) {}

  async activePromotions() {
    // A shop has a handful of promotions; one page of the maximum size holds them all.
    return (await this.promotions.find({ isActive: true, limit: 500, offset: 0 })).items
  }
}
```

ใน `apps/api/src/modules/promotions/promotions.module.ts` เพิ่ม:

```ts
import { promotionCatalogToken } from '../quotes/applications/ports/promotion-catalog.port'
import { PromotionCatalog } from './applications/services/promotion-catalog'
// ...
container.register(promotionCatalogToken, { useClass: PromotionCatalog })
```

`apps/api/src/modules/orders/applications/services/order-quote-source.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import type { OrderEntity } from '../../../../domains/order.domain'
import type { IOrderQuoteSource, QuotedOrder } from '../../../quotes/applications/ports/order-quote-source.port'
import { orderRepositoryToken, type IOrderRepository } from '../ports/order.repository'
import { inBranch } from './order-access'

/** Answers the quotes module: the lines an open order holds, at the prices it quoted. */
@injectable()
export class OrderQuoteSource implements IOrderQuoteSource {
  constructor(@inject(orderRepositoryToken) private readonly orders: IOrderRepository) {}

  async read(orderId: number, branchId: number) {
    return this.toQuoted(inBranch(await this.orders.findById(orderId), branchId))
  }

  async lockOpenOrder(orderId: number, branchId: number) {
    return this.toQuoted(inBranch(await this.orders.findByIdForUpdate(orderId), branchId))
  }

  private toQuoted(order: OrderEntity): QuotedOrder {
    order.assertOpen()
    return {
      id: order.id,
      memberId: order.memberId,
      items: order.items.map(({ productId, productName, sku, unitPriceSatang, quantity, options }) => ({
        productId, productName, sku, unitPriceSatang, quantity, options: [...options],
      })),
    }
  }
}
```

ใน `apps/api/src/modules/orders/orders.module.ts` เพิ่ม import `import { orderQuoteSourceToken } from '../quotes/applications/ports/order-quote-source.port'` และ `import { OrderQuoteSource } from './applications/services/order-quote-source'` แล้วต่อจาก `container.register(tableOccupancyToken, ...)` เพิ่ม `container.register(orderQuoteSourceToken, { useClass: OrderQuoteSource })`

ใน `apps/api/src/modules/di-registrations.ts` ต่อท้ายเพิ่ม `import './quotes/quotes.module'`

ใน `apps/api/src/modules/app.module.ts` เพิ่ม `import { QuoteElysiaController } from './quotes/adapters/controllers/quote.controller'` และในโซ่ต่อจาก `.use(container.resolve(PromotionElysiaController).getRoutes())` เพิ่ม `.use(container.resolve(QuoteElysiaController).getRoutes())`

- [ ] **Step 12: เขียนการทดสอบ HTTP ของ quote**

สร้าง `apps/api/src/__tests__/integration/quotes.integration.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { baseUrl, ok, resetDatabase, seedBranch, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const tenPercent = { name: 'ลด 10%', kind: 'percent' as const, value: 1000 }

describe('creating a quote', () => {
  test('prices the cart, picks the best promotion and pins the VAT rules', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    ok(await owner.api.promotions.post(tenPercent))
    ok(await owner.api.promotions.post({ name: 'ลด 3 บาท', kind: 'fixed', value: 300 }))

    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] }))

    expect(quote).toMatchObject({
      status: 'open', branchId: 1, memberId: null, orderId: null, subtotalSatang: 5000, discountSatang: 500,
      totalSatang: 4500, vatMode: 'inclusive', vatRateBp: 700, vatSatang: 294,
      promotion: { name: 'ลด 10%', kind: 'percent', value: 1000, discountSatang: 500 },
    })
    expect(quote.lines).toEqual([
      { productId: tea.id, productName: tea.name, sku: tea.sku, unitPriceSatang: 2500, quantity: 2, options: [] },
    ])
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
  })

  test('a cart with no promotion that applies is still priced and pinned', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    ok(await owner.api.promotions.post({ ...tenPercent, audience: 'members' }))
    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1 }] }))
    expect(quote).toMatchObject({ promotion: null, discountSatang: 0, totalSatang: 2500 })
  })

  test('a members-only promotion applies once a member is on the quote', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    ok(await owner.api.promotions.post({ ...tenPercent, audience: 'members' }))
    const member = ok(await cashier.api.members.post({ name: 'ลูกค้าประจำ', phone: '0812345678' }))
    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }], memberId: member.id }))
    expect(quote).toMatchObject({ memberId: member.id, member: { id: member.id, name: 'ลูกค้าประจำ' }, discountSatang: 500 })
  })

  test('a switched-off promotion is left out', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const promotion = ok(await owner.api.promotions.post(tenPercent))
    ok(await owner.api.promotions({ id: promotion.id }).patch({ isActive: false }))
    expect(ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] })).promotion).toBeNull()
  })

  test("prices an open order at the prices it quoted, whatever the menu says now", async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 2 }] }))
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))
    const quote = ok(await cashier.api.quotes.post({ orderId: order.id }))
    expect(quote).toMatchObject({ orderId: order.id, subtotalSatang: 5000, totalSatang: 5000 })
  })

  test('refuses an empty request, both lines and an order, a short stock and an unknown order', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 1 })
    expect((await cashier.api.quotes.post({})).status).toBe(422)
    expect((await cashier.api.quotes.post({ orderId: 1, lines: [{ productId: tea.id, quantity: 1 }] })).status).toBe(422)
    const short = await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] })
    expect(short.status).toBe(409)
    expect(short.error?.value).toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    expect((await cashier.api.quotes.post({ orderId: 99999 })).status).toBe(404)
    expect((await fetch(`${baseUrl}/quotes/1`)).status).toBe(401)
  })
})

describe('reading and cancelling', () => {
  test('a quote is read as it was made, and a read changes nothing', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const made = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 2 }] }))
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))
    expect(ok(await cashier.api.quotes({ id: made.id }).get())).toEqual(made)
  })

  test('an open quote can be cancelled, once, and then it is cancelled for good', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const made = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1 }] }))
    expect(ok(await cashier.api.quotes({ id: made.id }).cancel.post()).status).toBe('cancelled')
    expect(ok(await cashier.api.quotes({ id: made.id }).cancel.post()).status).toBe('cancelled')
    expect(ok(await cashier.api.quotes({ id: made.id }).get()).status).toBe('cancelled')
  })

  test("another branch's quote is not found", async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const made = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1 }] }))
    const other = await seedBranch('BKK', 'สาขากรุงเทพ')
    const away = await signIn('cashier', 'bkk-cashier', { branchId: other.id })
    expect((await away.api.quotes({ id: made.id }).get()).status).toBe(404)
    expect((await away.api.quotes({ id: made.id }).cancel.post()).status).toBe(404)
  })
})
```

- [ ] **Step 13: รันการทดสอบและ typecheck**

Run: `cd apps/api && bun --env-file=.env.test test src/__tests__/integration/quotes.integration.test.ts && bun run typecheck && bun run test:unit`
Expected: PASS ทั้งหมด (`bun run test:unit` ยืนยันว่า unit test เดิมยังผ่าน)

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/modules/quotes apps/api/src/modules/promotions apps/api/src/modules/orders apps/api/src/modules/di-registrations.ts apps/api/src/modules/app.module.ts apps/api/src/__tests__
gitcz --non-interactive --type=feat --scope=quotes --subject="price and pin a cart with a quote"
```

---

### Task 7: QR ที่ยืนยันแล้วบอกรหัสอ้างอิงของตัวเอง

ตอนขาย ระบบต้องรู้ว่า QR ที่ใช้ชำระมีรหัสอ้างอิงอะไร เพื่อเทียบกับ quote ที่ QR นั้นจองไว้

**Files:**
- Modify: `apps/api/src/modules/qr-payments/applications/ports/qr-payment-claims.port.ts`
- Modify: `apps/api/src/modules/qr-payments/applications/services/qr-payment-claims.ts`
- Modify: `apps/api/src/__tests__/mocks.ts`
- Modify: `apps/api/src/modules/qr-payments/applications/usecases/qr-payments.usecases.test.ts`

**Interfaces:**
- Produces: `IQrPaymentClaims.reference(qrPaymentId: number): Promise<string>` (โยน `QR_PAYMENT_NOT_FOUND` ถ้าไม่มี) และ `mockQrPaymentClaims().reference` ที่คืน `'QR0123456789ABCD'` เป็นค่าเริ่มต้น

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

ใน `qr-payments.usecases.test.ts` ในบล็อก `describe('QrPaymentClaims', ...)` ต่อจากการทดสอบ `consume stores the sale on the payment` เพิ่ม:

```ts
  test('tells the reference 1 the bank was given, and not found for an unknown payment', async () => {
    repo.findByIdForUpdate.mockResolvedValueOnce(makeQrPayment({ reference: 'QRABC' }))
    expect(await claims().reference(1)).toBe('QRABC')

    repo.findByIdForUpdate.mockResolvedValueOnce(null)
    await expect(claims().reference(9)).rejects.toMatchObject({ code: 'QR_PAYMENT_NOT_FOUND' })
  })
```

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/qr-payments/applications/usecases/qr-payments.usecases.test.ts`
Expected: FAIL (`claims().reference is not a function`)

- [ ] **Step 3: เขียนโค้ด**

ใน `qr-payment-claims.port.ts` ต่อจาก `consume(...)` เพิ่ม:

```ts
  /** The reference 1 the bank was given for this payment: how a quote that the QR holds is found. */
  reference(qrPaymentId: number): Promise<string>
```

ใน `qr-payment-claims.ts` ต่อจากเมธอด `consume` เพิ่ม:

```ts
  async reference(qrPaymentId: number) {
    return (await this.find(qrPaymentId)).reference
  }
```

ใน `__tests__/mocks.ts` ในฟังก์ชัน `mockQrPaymentClaims` ต่อจากบรรทัด `consume: ...` เพิ่ม:

```ts
  reference: mock<IQrPaymentClaims['reference']>(async () => 'QR0123456789ABCD'),
```

- [ ] **Step 4: รันการทดสอบให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/qr-payments && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/qr-payments apps/api/src/__tests__/mocks.ts
gitcz --non-interactive --type=feat --scope=qr-payments --subject="expose the reference of a claimed QR payment"
```

---

### Task 8: ขายและชำระออเดอร์ด้วย quote (`SaleCheckout`)

**Files:**
- Modify: `apps/api/src/modules/sales/applications/ports/sale-checkout.port.ts`
- Modify (แทนที่ทั้งไฟล์): `apps/api/src/modules/sales/applications/services/sale-checkout.ts`
- Modify: `apps/api/src/modules/sales/applications/schemas/sale-schemas.ts`, `apps/api/src/modules/orders/applications/schemas/order-schemas.ts`
- Modify: `apps/api/src/modules/sales/applications/usecases/{complete-sale,complete-sale-v2}.usecase.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/{pay-order,pay-order-v2}.usecase.ts`
- Modify: `apps/api/src/modules/sales/adapters/controllers/schemas/sale.schema.ts`, `apps/api/src/modules/sales/adapters/controllers/sale.presenter.ts`, `apps/api/src/modules/sales/adapters/controllers/sale-v2.presenter.ts` (ถ้าไม่ได้ใช้ `toSaleResponse` ต่อ)
- Modify: `apps/api/src/modules/orders/adapters/controllers/schemas/order.schema.ts`
- Modify: `apps/api/src/modules/sales/adapters/repository/sale.drizzle.repository.ts`
- Modify: `apps/api/src/modules/sales/applications/usecases/sales.usecases.test.ts`, `apps/api/src/modules/sales/applications/services/sale-checkout-members.test.ts`
- Create: `apps/api/src/modules/sales/applications/services/sale-checkout-quotes.test.ts`

**Interfaces:**
- Consumes: `IQuoteClaims`, `quoteClaimsToken` (Task 6), `IQrPaymentClaims.reference` (Task 7), `SalePromotion` (Task 1), `PriceQuoteEntity` (Task 3)
- Produces:
  - `CheckoutRequest.quoteId?: number | null`
  - `SaleCheckout` constructor ได้ `quotes: IQuoteClaims` เป็นพารามิเตอร์ตัวที่ 11 (ต่อท้าย `members`)
  - ข้อผิดพลาดใหม่จากการขาย: `PROMOTION_AND_DISCOUNT_CONFLICT`, `QUOTE_REQUIRED` (มี `params.quoteId`), และข้อผิดพลาดของ quote (`QUOTE_NOT_FOUND`, `QUOTE_EXPIRED`, `QUOTE_NOT_OPEN`, `QUOTE_MISMATCH`)
  - response ของบิลมีช่อง `promotion: { id, name, kind, value, maxDiscountSatang, discountSatang } | null`
  - คำขอ `POST /sales` (v1, v2) และ `POST /orders/:id/pay` (v1, v2) รับ `quoteId` ที่ไม่บังคับ

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

สร้าง `apps/api/src/modules/sales/applications/services/sale-checkout-quotes.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeBranch, makePriceQuote, makeProduct, makeSale } from '../../../../__tests__/factories'
import {
  mockBranchRepository, mockCheckoutPolicy, mockLineOptionsResolver, mockMemberRepository,
  mockProductRepository, mockQrPaymentClaims, mockQuoteClaims, mockSaleRepository, mockShiftLedger,
  mockShopSettingsRepository, mockStockLedger,
} from '../../../../__tests__/mocks'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { SaleCheckout } from './sale-checkout'

const promotion = { id: 4, name: 'ลด 3 บาท', kind: 'fixed' as const, value: 300, maxDiscountSatang: null, discountSatang: 300 }
// 3 x 8.00, less 3.00, VAT included: the price pinned when the shop sold it for 8.00.
const pinned = (overrides = {}) =>
  makePriceQuote({
    id: 7,
    lines: [{ productId: 1, productName: 'น้ำดื่ม', sku: 'SKU-1', unitPriceSatang: 800, quantity: 3, options: [] }],
    subtotalSatang: 2400, discountSatang: 300, promotion, vatSatang: 137, totalSatang: 2100,
    ...overrides,
  })
const cart = { productId: 1, quantity: 3, optionIds: [] as number[] }

describe('SaleCheckout with a pinned price', () => {
  let products: ReturnType<typeof mockProductRepository>
  let members: ReturnType<typeof mockMemberRepository>
  let sales: ReturnType<typeof mockSaleRepository>
  let ledger: ReturnType<typeof mockStockLedger>
  let qr: ReturnType<typeof mockQrPaymentClaims>
  let quotes: ReturnType<typeof mockQuoteClaims>
  let settings: ReturnType<typeof mockShopSettingsRepository>
  let checkout: SaleCheckout
  const request = {
    lines: [cart], discountSatang: 0, quoteId: 7,
    payments: [{ method: 'cash' as const, amountSatang: 2100 }],
    cashier: { id: 1, displayName: 'แคชเชียร์' }, branch: { id: 1, code: 'MAIN' },
  }

  beforeEach(() => {
    products = mockProductRepository()
    members = mockMemberRepository()
    sales = mockSaleRepository()
    ledger = mockStockLedger()
    qr = mockQrPaymentClaims()
    quotes = mockQuoteClaims()
    settings = mockShopSettingsRepository()
    const branches = mockBranchRepository()
    // The shop has since raised the price to 10.00 and moved to VAT added on top.
    settings.get.mockResolvedValue(new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, vatMode: 'exclusive' }))
    branches.findById.mockResolvedValue(makeBranch())
    products.findManyForUpdate.mockResolvedValue([makeProduct({ priceSatang: 1000, stockQty: 10 })])
    quotes.lockForCheckout.mockResolvedValue(pinned())
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261015-00001')
    sales.create.mockImplementation(async (sale, receiptNo) => makeSale({ ...sale, id: 31, receiptNo }))
    checkout = new SaleCheckout(
      sales, products, ledger, settings, qr, mockCheckoutPolicy(), mockShiftLedger(), branches,
      mockLineOptionsResolver(), members, quotes,
    )
  })

  test('sells at the pinned prices, discount, promotion and VAT rules, not the shop’s current ones', async () => {
    const sale = await checkout.checkout(request)

    expect(sale.id).toBe(31)
    const stored = sales.create.mock.calls[0]![0]
    expect(stored).toMatchObject({
      subtotalSatang: 2400, discountSatang: 300, totalSatang: 2100, vatSatang: 137,
      vatMode: 'inclusive', vatRateBp: 700, promotion,
    })
    expect(stored.items[0]).toMatchObject({ unitPriceSatang: 800, quantity: 3, lineTotalSatang: 2400 })
  })

  test('hands the quote the cart it was asked for, and uses it up with the sale', async () => {
    await checkout.checkout(request)

    expect(quotes.lockForCheckout).toHaveBeenCalledWith(7, { branchId: 1, memberId: null, lines: [cart] }, [])
    expect(quotes.consume).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 31)
  })

  test('takes the quote’s member without asking whether the member is still active', async () => {
    quotes.lockForCheckout.mockResolvedValue(pinned({ memberId: 8, member: { id: 8, code: 'M000008', name: 'ลูกค้าประจำ' } }))
    const sale = await checkout.checkout({ ...request, memberId: 8 })

    expect(members.findByIdForUpdate).not.toHaveBeenCalled()
    expect(sale.member).toEqual({ id: 8, code: 'M000008', name: 'ลูกค้าประจำ' })
  })

  test('still refuses when there is not enough stock, and writes nothing', async () => {
    products.findManyForUpdate.mockResolvedValue([makeProduct({ stockQty: 2 })])
    await expect(checkout.checkout(request)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    expect(sales.create).not.toHaveBeenCalled()
    expect(quotes.consume).not.toHaveBeenCalled()
  })

  test('a typed discount cannot be added to a promotion, and nothing is locked first', async () => {
    await expect(checkout.checkout({ ...request, discountSatang: 100 })).rejects.toMatchObject({
      code: 'PROMOTION_AND_DISCOUNT_CONFLICT',
    })
    expect(quotes.lockForCheckout).not.toHaveBeenCalled()
    expect(products.findManyForUpdate).not.toHaveBeenCalled()
  })

  test('a quote that does not fit the sale stops it before any write', async () => {
    quotes.lockForCheckout.mockRejectedValue(Object.assign(new Error('x'), { code: 'QUOTE_MISMATCH' }))
    await expect(checkout.checkout(request)).rejects.toMatchObject({ code: 'QUOTE_MISMATCH' })
    expect(products.findManyForUpdate).not.toHaveBeenCalled()
    expect(sales.nextReceiptNo).not.toHaveBeenCalled()
    expect(ledger.record).not.toHaveBeenCalled()
  })

  test('payments are not enough when they fall short of the pinned total', async () => {
    await expect(
      checkout.checkout({ ...request, payments: [{ method: 'cash', amountSatang: 2099 }] }),
    ).rejects.toMatchObject({ code: 'UNDERPAID' })
    expect(quotes.consume).not.toHaveBeenCalled()
  })

  describe('with a QR', () => {
    const withQr = { ...request, payments: [{ method: 'promptpay' as const, amountSatang: 2100, qrPaymentId: 9 }] }

    test('claims the QR before locking the quote, gives the quote its reference, and uses both up', async () => {
      const steps: string[] = []
      qr.assertClaimable.mockImplementation(async () => { steps.push('qr') })
      qr.reference.mockResolvedValue('QRABC')
      quotes.lockForCheckout.mockImplementation(async () => { steps.push('quote'); return pinned({ status: 'reserved', qrReference: 'QRABC' }) })
      products.findManyForUpdate.mockImplementation(async () => { steps.push('products'); return [makeProduct()] })

      await checkout.checkout(withQr)

      expect(steps).toEqual(['qr', 'quote', 'products'])
      expect(quotes.lockForCheckout).toHaveBeenCalledWith(7, expect.anything(), ['QRABC'])
      expect(qr.consume).toHaveBeenCalledWith(9, 31)
      expect(quotes.consume).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 31)
    })

    test('a QR that holds a quote cannot be used without it', async () => {
      qr.reference.mockResolvedValue('QRABC')
      quotes.findReservedByReference.mockResolvedValue(7)

      const refused = checkout.checkout({ ...withQr, quoteId: undefined })

      await expect(refused).rejects.toMatchObject({ code: 'QUOTE_REQUIRED', params: { quoteId: 7 } })
      expect(sales.create).not.toHaveBeenCalled()
      expect(qr.consume).not.toHaveBeenCalled()
    })
  })
})

describe('SaleCheckout without a quote', () => {
  test('never asks the quotes about a sale that carries none', async () => {
    const products = mockProductRepository()
    const sales = mockSaleRepository()
    const quotes = mockQuoteClaims()
    const settings = mockShopSettingsRepository()
    const branches = mockBranchRepository()
    settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
    branches.findById.mockResolvedValue(makeBranch())
    products.findManyForUpdate.mockResolvedValue([makeProduct()])
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261015-00002')
    sales.create.mockImplementation(async (sale, receiptNo) => makeSale({ ...sale, id: 2, receiptNo }))
    const checkout = new SaleCheckout(
      sales, products, mockStockLedger(), settings, mockQrPaymentClaims(), mockCheckoutPolicy(), mockShiftLedger(),
      branches, mockLineOptionsResolver(), mockMemberRepository(), quotes,
    )

    const sale = await checkout.checkout({
      lines: [{ productId: 1, quantity: 1 }], discountSatang: 0,
      payments: [{ method: 'cash', amountSatang: 1000 }],
      cashier: { id: 1, displayName: 'แคชเชียร์' }, branch: { id: 1, code: 'MAIN' },
    })

    expect(sale.promotion).toBeNull()
    expect(quotes.lockForCheckout).not.toHaveBeenCalled()
    expect(quotes.consume).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: ให้ตัวสร้างเดิมของ `SaleCheckout` ในการทดสอบเดิมใช้พารามิเตอร์ใหม่**

ใน `apps/api/src/modules/sales/applications/services/sale-checkout-members.test.ts`:
- เพิ่ม `mockQuoteClaims` ในรายการ import จาก `'../../../../__tests__/mocks'`
- เปลี่ยน `mockLineOptionsResolver(), members)` เป็น `mockLineOptionsResolver(), members, mockQuoteClaims())`

ใน `apps/api/src/modules/sales/applications/usecases/sales.usecases.test.ts`:
- เพิ่ม `mockQuoteClaims` ในรายการ import จาก `'../../../../__tests__/mocks'`
- ทุกที่ที่เป็น `lineOptions, mockMemberRepository())` (สามที่ ที่บรรทัดที่สร้าง `new SaleCheckout(...)`) เปลี่ยนเป็น `lineOptions, mockMemberRepository(), mockQuoteClaims())`

- [ ] **Step 3: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/sales`
Expected: FAIL (`quoteId` ไม่อยู่ใน `CheckoutRequest`, `SaleCheckout` ไม่รับ `quotes`)

- [ ] **Step 4: เพิ่ม `quoteId` ในคำขอ**

ใน `sale-checkout.port.ts` ใน `interface CheckoutRequest` ต่อจาก `memberId?: number | null` เพิ่ม:

```ts
  /**
   * A price pinned earlier by a quote. The sale then charges that quote's prices, discount, promotion and
   * VAT rules, and the quote is used up with it. A sale without one prices the lines as they are now.
   */
  quoteId?: number | null
```

- [ ] **Step 5: แทนที่ `sale-checkout.ts` ทั้งไฟล์**

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { memberRepositoryToken, type IMemberRepository } from '../../../members/applications/ports/member.repository'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { lineKey, type LineOption } from '../../../../domains/modifier.domain'
import type { PriceQuoteEntity, QuoteRequestLine } from '../../../../domains/price-quote.domain'
import { SaleEntity, type SaleMember } from '../../../../domains/sale.domain'
import { branchRepositoryToken } from '../../../branches/applications/ports/branch.repository'
import type { IBranchRepository } from '../../../branches/applications/ports/branch.repository'
import { stockLedgerToken } from '../../../inventory/applications/ports/stock-ledger.port'
import { lineOptionsResolverToken } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { IStockLedger } from '../../../inventory/applications/ports/stock-ledger.port'
import { qrPaymentClaimsToken } from '../../../qr-payments/applications/ports/qr-payment-claims.port'
import type { IQrPaymentClaims } from '../../../qr-payments/applications/ports/qr-payment-claims.port'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { TOKENS } from '../../../tokens'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import type { CheckoutLine, CheckoutRequest, ISaleCheckout } from '../ports/sale-checkout.port'

/** A QR payment that backs one of the sale's payments, with the reference the bank knows it by. */
interface ClaimedQr {
  id: number
  reference: string
}

/** What a request line is, in the terms a quote can be compared with. */
const toQuoteLine = (line: CheckoutLine): QuoteRequestLine => ({
  productId: line.productId,
  optionIds: line.options ? line.options.map((option) => option.optionId) : [...(line.optionIds ?? [])],
  quantity: line.quantity,
})

@injectable()
export class SaleCheckout implements ISaleCheckout {
  constructor(
    @inject(saleRepositoryToken) private readonly sales: ISaleRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(qrPaymentClaimsToken) private readonly qrPayments: IQrPaymentClaims,
    @inject(TOKENS.CheckoutPolicy) private readonly checkoutPolicy: ICheckoutPolicy,
    @inject(TOKENS.ShiftLedger) private readonly shiftLedger: IShiftLedger,
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
  ) {}

  async checkout({ lines: requested, discountSatang, payments, cashier, branch, shiftId, memberId, quoteId }: CheckoutRequest) {
    const shiftsEnabled = await this.checkoutPolicy.isShiftsEnabled()
    if (shiftsEnabled && shiftId === undefined)
      throw new DomainConflictError('กรุณาระบุกะที่เปิดอยู่ก่อนรับชำระ', 'SHIFT_REQUIRED')
    if (!shiftsEnabled && shiftId !== undefined)
      throw new DomainConflictError('การชำระด้วยกะต้องเปิด CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    if (shiftId !== undefined) await this.shiftLedger.assertOpenForCheckout(shiftId, branch.id)

    // A sale from a pinned price claims its QR payments first and locks the quote after them: the same
    // order the QR commands lock in, and before any member or product, so none of them can wait in a circle.
    let quote: PriceQuoteEntity | null = null
    let claimed: ClaimedQr[] | null = null
    if (quoteId != null) {
      if (discountSatang > 0)
        throw new DomainConflictError('ใช้ราคาที่ตรึงไว้พร้อมส่วนลดที่กรอกเองไม่ได้', 'PROMOTION_AND_DISCOUNT_CONFLICT')
      claimed = await this.claimQrPayments(payments, branch.id, quoteId)
      quote = await this.quotes.lockForCheckout(
        quoteId,
        { branchId: branch.id, memberId: memberId ?? null, lines: requested.map(toQuoteLine) },
        claimed.map((qr) => qr.reference),
      )
    }

    // Member lock precedes product locks, and the caller has already locked an order if present.
    // A quote carries its member: they were checked when the price was pinned, and the money may already
    // be paid, so a member who was switched off since does not stop the sale.
    let member: SaleMember | null
    if (quote) {
      member = quote.member ? { ...quote.member } : null
    } else {
      const selectedMember = memberId == null ? null : await this.members.findByIdForUpdate(memberId)
      if (memberId != null && !selectedMember)
        throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
      selectedMember?.assertActive()
      member = selectedMember ? { id: selectedMember.id, code: selectedMember.code, name: selectedMember.name } : null
    }

    // Lines are the product with its options: the same choice repeated is merged, a Map keeps the order
    // they were added, and the first quoted price of a line wins.
    interface WantedLine {
      productId: number
      options: LineOption[]
      quantity: number
      quotedUnitPriceSatang: number | undefined
    }
    const wanted = new Map<string, WantedLine>()
    if (quote) {
      // The quote has the options and the price of every line; nothing is resolved or priced again.
      for (const line of quote.lines) {
        const key = `${line.productId}:${lineKey(line.options)}`
        const existing = wanted.get(key)
        if (existing) existing.quantity += line.quantity
        else
          wanted.set(key, {
            productId: line.productId,
            options: [...line.options],
            quantity: line.quantity,
            quotedUnitPriceSatang: line.unitPriceSatang,
          })
      }
    } else {
      for (const line of requested) {
        // An order has already resolved its options and quoted a price; a one-step sale is resolved here.
        const options = line.options
          ? [...line.options]
          : (await this.lineOptions.resolve(line.productId, line.optionIds ?? [])).options
        const key = `${line.productId}:${lineKey(options)}`
        const existing = wanted.get(key)
        if (existing) existing.quantity += line.quantity
        else
          wanted.set(key, { productId: line.productId, options, quantity: line.quantity, quotedUnitPriceSatang: line.unitPriceSatang })
      }
    }

    // Read inside the caller's unit of work, so the sale is priced with the settings in force when it is recorded.
    const shop = await this.settings.get()
    const sellingBranch = await this.branches.findById(branch.id)

    // Stock is the product's, whichever options the lines have, so it is checked for the total.
    const quantities = new Map<number, number>()
    for (const line of wanted.values())
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity)

    // Locked until the sale commits, so two tills cannot sell the same last unit.
    const locked = await this.products.findManyForUpdate([...quantities.keys()], branch.id)
    const productsById = new Map(locked.map((product) => [product.id, product]))
    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)
      if (!product) throw new DomainError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
      product.assertSellable(quantity)
    }

    const lines = [...wanted.values()].map((line) => {
      const product = productsById.get(line.productId)!
      if (line.quotedUnitPriceSatang === undefined) return { product, quantity: line.quantity, options: line.options }
      // The quote includes the options and the entity adds them back, so the product carries the base price.
      const optionsPrice = line.options.reduce((total, option) => total + option.priceSatang, 0)
      return {
        product: product.with({ priceSatang: line.quotedUnitPriceSatang - optionsPrice }),
        quantity: line.quantity,
        options: line.options,
      }
    })

    const priced = SaleEntity.complete({
      lines,
      member,
      discountSatang: quote ? quote.discountSatang : discountSatang,
      promotion: quote?.promotion ?? null,
      payments: payments.map(({ method, amountSatang }) => ({ method, amountSatang })),
      vatMode: quote ? quote.vatMode : shop.vatMode,
      vatRateBp: quote ? quote.vatRateBp : shop.vatRateBp,
      branchId: branch.id,
      shiftId: shiftId ?? null,
      cashier,
      // Kept on the sale, so its receipt still reads the same after the shop is renamed or the branch moves.
      seller: {
        shopName: shop.shopName,
        shopTaxId: shop.taxId,
        branchName: sellingBranch?.name ?? null,
        shopAddress: sellingBranch?.address ?? shop.address,
        shopPhone: sellingBranch?.phone ?? shop.phone,
      },
    })
    // The pinned values are what the sale is made of, so this cannot differ; it guards the money all the same.
    if (quote && priced.totalSatang !== quote.totalSatang)
      throw new DomainConflictError('ยอดไม่ตรงกับราคาที่ตรึงไว้ กรุณาขอราคาใหม่', 'QUOTE_MISMATCH')

    // Money that a bank has confirmed backs QR payments; checked here, after the amounts are known to add up.
    const qrClaimed = claimed ?? (await this.claimQrPayments(payments, branch.id, null))

    // Taken only after every rule has passed; it still rolls back with the sale if a later step fails.
    const sale = await this.sales.create(priced, await this.sales.nextReceiptNo(branch))

    for (const { id } of qrClaimed) await this.qrPayments.consume(id, sale.id)
    if (quote) await this.quotes.consume(quote, sale.id)

    for (const item of sale.items)
      await this.ledger.record({
        branchId: branch.id,
        productId: item.productId,
        type: 'sale',
        quantity: -item.quantity,
        reference: sale.receiptNo,
        userId: cashier.id,
      })

    if (shiftId !== undefined) {
      const cashTendered = sale.payments
        .filter((payment) => payment.method === 'cash')
        .reduce((amount, payment) => amount + payment.amountSatang, 0)
      const netCash = cashTendered - sale.changeSatang
      await this.shiftLedger.recordSaleCash({
        shiftId, branchId: branch.id, saleId: sale.id, receiptNo: sale.receiptNo,
        actorId: cashier.id, actorName: cashier.displayName, amountSatang: netCash, createdAt: sale.createdAt,
      })
    }

    return sale
  }

  /**
   * Checks the QR payments that back `promptpay` payments and returns them. When QR payment is
   * configured, a `promptpay` payment without one is refused: a cashier cannot just say it was paid.
   * Without a quote, a QR that holds one is refused too: the sale has to carry that quote or the quote
   * would stay held for good.
   */
  private async claimQrPayments(
    payments: CheckoutRequest['payments'],
    branchId: number,
    quoteId: number | null,
  ): Promise<ClaimedQr[]> {
    const claimed: ClaimedQr[] = []

    for (const payment of payments) {
      if (payment.qrPaymentId === undefined) {
        if (payment.method === 'promptpay' && this.qrPayments.isRequired())
          throw new DomainError('การชำระด้วยพร้อมเพย์ต้องรอธนาคารยืนยันก่อน', 'QR_PAYMENT_REQUIRED')
        continue
      }
      if (payment.method !== 'promptpay')
        throw new DomainError('ใช้การชำระด้วย QR ได้เฉพาะรายการพร้อมเพย์', 'QR_PAYMENT_REQUIRED')
      if (claimed.some((qr) => qr.id === payment.qrPaymentId))
        throw new DomainError('ใช้การชำระด้วย QR เดียวกันซ้ำในบิลเดียวไม่ได้', 'QR_ALREADY_USED')

      await this.qrPayments.assertClaimable(payment.qrPaymentId, { branchId, amountSatang: payment.amountSatang })
      const reference = await this.qrPayments.reference(payment.qrPaymentId)
      if (quoteId === null) {
        const held = await this.quotes.findReservedByReference(reference)
        if (held !== null)
          throw new DomainConflictError(
            'QR นี้ถูกสร้างจากราคาที่ตรึงไว้ กรุณาชำระด้วยราคานั้น',
            'QUOTE_REQUIRED',
            { quoteId: held },
          )
      }
      claimed.push({ id: payment.qrPaymentId, reference })
    }
    return claimed
  }
}
```

- [ ] **Step 6: รันการทดสอบให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/sales`
Expected: PASS ทั้งหมด รวมการทดสอบเดิมของการขาย (`sales.usecases.test.ts`) ที่ต้องไม่เปลี่ยน assertion

- [ ] **Step 7: ช่องรับ `quoteId` ที่ use case, schema และ controller**

`apps/api/src/modules/sales/applications/schemas/sale-schemas.ts` ใน `completeSaleSchema` ต่อจาก `memberId: ...` เพิ่ม:

```ts
  quoteId: z.number().int().positive().nullable().optional(),
```

`apps/api/src/modules/orders/applications/schemas/order-schemas.ts` ใน `payOrderSchema` ต่อจาก `discountSatang: ...` เพิ่ม:

```ts
  quoteId: z.number().int().positive().nullable().optional(),
```

ใน `complete-sale.usecase.ts` และ `complete-sale-v2.usecase.ts` ใน object ที่ส่งให้ `checkout.checkout({ ... })` ต่อจาก `memberId: dto.memberId ?? null,` เพิ่ม `quoteId: dto.quoteId ?? null,`

ใน `pay-order.usecase.ts` และ `pay-order-v2.usecase.ts` ใน object ที่ส่งให้ `this.checkout.checkout({ ... })` ต่อจาก `memberId: order.memberId,` เพิ่ม `quoteId: dto.quoteId ?? null,`

`apps/api/src/modules/sales/adapters/controllers/schemas/sale.schema.ts`:
- ต่อจาก `const memberInput = ...` เพิ่ม `const quoteInput = t.Optional(t.Nullable(t.Integer({ minimum: 1 })))`
- ใน `header` ต่อจาก `member: t.Nullable(...)` เพิ่ม:

```ts
  // The promotion the sale was given, as it was when sold; null when it had none.
  promotion: t.Nullable(
    t.Object({
      id: t.Integer(),
      name: t.String(),
      kind: t.Union([t.Literal('fixed'), t.Literal('percent')]),
      value: t.Integer(),
      maxDiscountSatang: t.Nullable(t.Integer()),
      discountSatang: t.Integer(),
    }),
  ),
```

- ใน `create` และ `createV2` ต่อจาก `memberId: memberInput,` เพิ่ม `quoteId: quoteInput,`

`apps/api/src/modules/orders/adapters/controllers/schemas/order.schema.ts` ใน `const pay = t.Object({ ... })` ต่อจาก `discountSatang: t.Optional(satang()),` เพิ่ม `quoteId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),`

`apps/api/src/modules/sales/adapters/controllers/sale.presenter.ts` ใน object ที่ return ต่อจาก `member: sale.member,` เพิ่ม `promotion: sale.promotion,`

ตรวจ `sale-v2.presenter.ts`: ถ้ามันสร้าง object ของตัวเองแทนที่จะเรียก `toSaleResponse` ให้เพิ่ม `promotion: sale.promotion,` ที่นั่นด้วย

`apps/api/src/modules/sales/adapters/repository/sale.drizzle.repository.ts`:
- ใน `headerColumns` ต่อจาก `member: sales.member,` เพิ่ม `promotion: sales.promotion,`
- ใน `create` เปลี่ยน `.values({ receiptNo, ...totals, memberId: sale.member?.id ?? null })` เป็น `.values({ receiptNo, ...totals, memberId: sale.member?.id ?? null, promotionId: sale.promotion?.id ?? null })`

- [ ] **Step 8: ตรวจชนิดและรันการทดสอบหน่วยทั้งหมด**

Run: `cd apps/api && bun run typecheck && bun run test:unit`
Expected: ผ่าน ถ้า typecheck บ่นที่ที่สร้าง `ISaleHeader` ให้เพิ่ม `promotion` ที่นั่นตามชนิด (สมาชิกทำแบบเดียวกันกับ `member`)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/sales apps/api/src/modules/orders
gitcz --non-interactive --type=feat --scope=sales --subject="sell and pay orders at a pinned price"
```

---

### Task 9: ขอ QR จาก quote และปล่อย quote เมื่อ QR จบ

**Files:**
- Modify: `apps/api/src/modules/qr-payments/applications/schemas/qr-payment-schemas.ts`
- Modify: `apps/api/src/modules/qr-payments/applications/usecases/{create-qr-payment,create-qr-payment-v2,cancel-qr-payment,dismiss-qr-payment,resolve-qr-attempt}.usecase.ts`
- Modify: `apps/api/src/modules/qr-payments/adapters/controllers/schemas/qr-payment.schema.ts`, `apps/api/src/modules/qr-payments/adapters/controllers/qr-payment-v2.controller.ts`
- Modify: `apps/api/src/modules/qr-payments/applications/usecases/qr-payments.usecases.test.ts`

**Interfaces:**
- Consumes: `IQuoteClaims`, `quoteClaimsToken` (Task 6)
- Produces:
  - `POST /payments/qr` (v1) และ `POST /api/v2/payments/qr` รับ `quoteId` ที่ไม่บังคับ
  - constructor ใหม่: `CreateQrPaymentUseCase(gateway, payments, clock, quotes, unitOfWork)`, `CreateQrPaymentV2UseCase(..., quotes)` ต่อท้าย, `CancelQrPaymentUseCase(payments, refresher, unitOfWork, quotes)`, `DismissQrPaymentUseCase(payments, unitOfWork, clock, quotes)`, `ResolveQrAttemptUseCase(attempts, payments, gateway, unitOfWork, clock, quotes)`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

ใน `qr-payments.usecases.test.ts`:

(ก) เพิ่ม `mockQuoteClaims` ในรายการ import จาก `'../../../../__tests__/mocks'`

(ข) ตัวแปรระดับไฟล์ ต่อจาก `let refresher: QrPaymentRefresher` เพิ่ม `let quotes: ReturnType<typeof mockQuoteClaims>` และใน `beforeEach` ระดับไฟล์ เพิ่ม `quotes = mockQuoteClaims()`

(ค) ในบล็อก `describe('CreateQrPaymentUseCase', ...)` เปลี่ยน `useCase = new CreateQrPaymentUseCase(gateway, repo, mockClock(now))` เป็น `useCase = new CreateQrPaymentUseCase(gateway, repo, mockClock(now), quotes, mockUnitOfWork())` และต่อท้ายบล็อกนั้นเพิ่มการทดสอบ:

```ts
  test('a QR made from a quote holds the quote for the reference it gives the bank', async () => {
    await useCase.execute({ amountSatang: 2100, quoteId: 7 }, actor)

    const reference = gateway.createQr.mock.calls[0]![0].reference
    expect(quotes.reserveForQr).toHaveBeenCalledWith(7, { branchId: 1, reference, amountSatang: 2100 })
    expect(repo.create.mock.calls[0]![0]).toMatchObject({ reference, amountSatang: 2100 })
  })

  test('a quote that cannot be held stops the QR before the bank is asked', async () => {
    quotes.reserveForQr.mockRejectedValue(Object.assign(new Error('x'), { code: 'QUOTE_NOT_OPEN' }))

    await expect(useCase.execute({ amountSatang: 2100, quoteId: 7 }, actor)).rejects.toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    expect(gateway.createQr).not.toHaveBeenCalled()
  })

  test('a bank that refuses gives the quote back', async () => {
    gateway.createQr.mockRejectedValue(new DomainExternalServiceError('ธนาคารปฏิเสธ', 'QR_GATEWAY_ERROR'))

    await expect(useCase.execute({ amountSatang: 2100, quoteId: 7 }, actor)).rejects.toMatchObject({ code: 'QR_GATEWAY_ERROR' })
    const reference = quotes.reserveForQr.mock.calls[0]![1].reference
    expect(quotes.releaseByReference).toHaveBeenCalledWith(reference)
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('a QR without a quote touches no quote', async () => {
    await useCase.execute({ amountSatang: 5000 }, actor)
    expect(quotes.reserveForQr).not.toHaveBeenCalled()
  })
```

(ง) ในบล็อก `describe('CancelQrPaymentUseCase', ...)` เปลี่ยนทุก `new CancelQrPaymentUseCase(repo, refresher, mockUnitOfWork())` เป็น `new CancelQrPaymentUseCase(repo, refresher, mockUnitOfWork(), quotes)` และต่อท้ายบล็อกเพิ่ม:

```ts
  test('gives back the quote the QR held', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment({ reference: 'QRABC' }))
    gateway.findPayment.mockResolvedValue(null)

    await new CancelQrPaymentUseCase(repo, refresher, mockUnitOfWork(), quotes).execute(1, 1)

    expect(quotes.releaseByReference).toHaveBeenCalledWith('QRABC')
  })

  test('keeps the quote when the money turned out to be there', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment({ lastCheckedAt: new Date(now.getTime() - 1) }))
    gateway.findPayment.mockResolvedValue(found)

    await expect(new CancelQrPaymentUseCase(repo, refresher, mockUnitOfWork(), quotes).execute(1, 1)).rejects.toThrow()

    expect(quotes.releaseByReference).not.toHaveBeenCalled()
  })
```

(จ) เพิ่มบล็อกใหม่ท้ายไฟล์:

```ts
describe('DismissQrPaymentUseCase', () => {
  test('closes the quote of money that will never be billed', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment({ reference: 'QRABC' }).markPaid(found))

    await new DismissQrPaymentUseCase(repo, mockUnitOfWork(), mockClock(now), quotes).execute(
      1, { reason: 'คืนเงินแล้ว' }, { id: 1 }, 1,
    )

    expect(repo.save.mock.calls[0]![0].dismissedAt).toEqual(now)
    expect(quotes.cancelByReference).toHaveBeenCalledWith('QRABC')
  })
})
```

และเพิ่ม `import { DismissQrPaymentUseCase } from './dismiss-qr-payment.usecase'` ที่ส่วน import

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/qr-payments`
Expected: FAIL (constructor ไม่รับ `quotes`)

- [ ] **Step 3: เขียนโค้ด**

`qr-payment-schemas.ts` ต่อจาก `amountSatang` ของ `createQrPaymentSchema` และ `createQrPaymentV2Schema` เพิ่มทั้งสองที่: `quoteId: z.number().int().positive().optional(),`

`create-qr-payment.usecase.ts`: เพิ่ม import

```ts
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
```

constructor ต่อท้าย:

```ts
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
```

และเปลี่ยนส่วนในเมธอด `execute` ตั้งแต่ `const reference = ...` ถึง `const payment = ...` เป็น:

```ts
    // Reference 1: 16 characters of A-Z and 0-9, unique, and unguessable.
    const reference = 'QR' + crypto.randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()

    // A QR made from a pinned price holds that quote first, so the price cannot move while the customer pays.
    if (dto.quoteId !== undefined) {
      const quoteId = dto.quoteId
      await this.unitOfWork.run(() =>
        this.quotes.reserveForQr(quoteId, { branchId: actor.branch.id, reference, amountSatang: dto.amountSatang }),
      )
    }

    let qr
    try {
      qr = await this.gateway.createQr({
        reference,
        amountSatang: dto.amountSatang,
        branchCode: actor.branch.code,
      })
    } catch (error) {
      // No QR was made, so nobody can pay: the quote goes back to being open.
      if (dto.quoteId !== undefined) await this.unitOfWork.run(() => this.quotes.releaseByReference(reference))
      throw error
    }

    const payment = await this.payments.create({
      branchId: actor.branch.id,
      reference,
      amountSatang: dto.amountSatang,
      qrRawData: qr.qrRawData,
      expiresAt: new Date(this.clock.now().getTime() + QR_VALID_FOR_MS),
      createdById: actor.userId,
      originShiftId: null,
    })
    return { payment, qrImage: qr.qrImage }
```

`create-qr-payment-v2.usecase.ts`:
- เพิ่ม `import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'`
- constructor ต่อท้ายหลัง `clock`: `@inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,`
- ในขั้น 1 ภายใน `this.unitOfWork.run(async () => { ... })` ต่อจากบรรทัด `const reference = ...` และก่อน `const attempt = await this.attempts.create(` เพิ่ม:

```ts
      // The quote is held under the same shift lock, so counting the shift cannot start between the two.
      if (dto.quoteId !== undefined)
        await this.quotes.reserveForQr(dto.quoteId, { branchId: branch.id, reference, amountSatang: dto.amountSatang })
```

- ในขั้น 2 ใน `catch` ตรง `if (error.params?.outcome !== 'unknown') { ... }` หลังบรรทัด `await this.attempts.save(attempt.fail())` เพิ่ม:

```ts
        // The bank never made a QR, so the quote goes back to being open. An unknown outcome keeps it held.
        await this.unitOfWork.run(() => this.quotes.releaseByReference(attempt.reference))
```

`cancel-qr-payment.usecase.ts`: เพิ่ม import `quoteClaimsToken`/`IQuoteClaims`, constructor ต่อท้าย `@inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,` และแทนบรรทัด `return this.payments.save(payment.cancel())` ด้วย:

```ts
      const cancelled = await this.payments.save(payment.cancel())
      // Nobody will pay this QR now, so the quote it held is open again.
      await this.quotes.releaseByReference(cancelled.reference)
      return cancelled
```

`dismiss-qr-payment.usecase.ts`: เพิ่ม import, constructor ต่อท้ายหลัง `clock` เพิ่ม `@inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,` และแทนบรรทัด `return this.payments.save(payment.dismiss(reason, actor.id, this.clock.now()))` ด้วย:

```ts
      const dismissed = await this.payments.save(payment.dismiss(reason, actor.id, this.clock.now()))
      // The money will never be billed here, so the price it held is closed with it.
      await this.quotes.cancelByReference(dismissed.reference)
      return dismissed
```

`resolve-qr-attempt.usecase.ts`: เพิ่ม import, constructor ต่อท้ายหลัง `clock` เพิ่ม `@inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,` และแทนบรรทัด `if (!found) return this.attempts.save(attempt.fail())` ด้วย:

```ts
      if (!found) {
        // The QR was never shown to anyone, so the quote it held is open again.
        await this.quotes.releaseByReference(attempt.reference)
        return this.attempts.save(attempt.fail())
      }
```

`adapters/controllers/schemas/qr-payment.schema.ts`: เปลี่ยน `create: t.Object({ amountSatang: satang({ minimum: 1 }) }),` เป็น `create: t.Object({ amountSatang: satang({ minimum: 1 }), quoteId: t.Optional(t.Integer({ minimum: 1 })) }),`

`adapters/controllers/qr-payment-v2.controller.ts`: เปลี่ยน `body: t.Object({ amountSatang: satang({ minimum: 1 }), shiftId: t.Integer({ minimum: 1 }) }),` เป็น `body: t.Object({ amountSatang: satang({ minimum: 1 }), shiftId: t.Integer({ minimum: 1 }), quoteId: t.Optional(t.Integer({ minimum: 1 })) }),`

- [ ] **Step 4: รันการทดสอบให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/qr-payments && bun run typecheck`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/qr-payments
gitcz --non-interactive --type=feat --scope=qr-payments --subject="hold a quote for the QR made from it"
```

---

### Task 10: กันแก้ออเดอร์ขณะรอ QR

**Files:**
- Create: `apps/api/src/modules/orders/adapters/repository/guarded-order.repository.ts`
- Create: `apps/api/src/modules/orders/adapters/repository/guarded-order.repository.test.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`

**Interfaces:**
- Consumes: `IOrderEditLock`, `orderEditLockToken` (Task 6), `DrizzleOrderRepository`
- Produces: `GuardedOrderRepository implements IOrderRepository` (ลงทะเบียนเป็น `orderRepositoryToken`) ซึ่ง `save()` ของออเดอร์ที่มี id แล้วโยน `ORDER_LOCKED_BY_QR_PAYMENT` ถ้า quote ของออเดอร์นั้นถูก QR จองอยู่ ส่วน `create` และการอ่านผ่านตรง

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว**

สร้าง `apps/api/src/modules/orders/adapters/repository/guarded-order.repository.test.ts`:

```ts
import 'reflect-metadata'
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { makeOrder } from '../../../../__tests__/factories'
import { mockOrderRepository } from '../../../../__tests__/mocks'
import type { DrizzleOrderRepository } from './order.drizzle.repository'
import { GuardedOrderRepository } from './guarded-order.repository'

let inner: ReturnType<typeof mockOrderRepository>
let lock: { assertEditable: ReturnType<typeof mock<(orderId: number) => Promise<void>>> }
let guarded: GuardedOrderRepository

beforeEach(() => {
  inner = mockOrderRepository()
  lock = { assertEditable: mock(async () => {}) }
  guarded = new GuardedOrderRepository(inner as unknown as DrizzleOrderRepository, lock)
})

describe('GuardedOrderRepository', () => {
  test('writes an order that no QR is waiting on', async () => {
    const order = makeOrder({ id: 4 })
    inner.save.mockResolvedValue(order)

    expect(await guarded.save(order)).toBe(order)
    expect(lock.assertEditable).toHaveBeenCalledWith(4)
  })

  test('refuses to write an order a QR is waiting on, and writes nothing', async () => {
    lock.assertEditable.mockRejectedValue(Object.assign(new Error('x'), { code: 'ORDER_LOCKED_BY_QR_PAYMENT' }))

    await expect(guarded.save(makeOrder({ id: 4 }))).rejects.toMatchObject({ code: 'ORDER_LOCKED_BY_QR_PAYMENT' })
    expect(inner.save).not.toHaveBeenCalled()
  })

  test('a new order has nothing to wait on and reads pass straight through', async () => {
    const order = makeOrder({ id: 0 })
    inner.create.mockResolvedValue(order)
    inner.findById.mockResolvedValue(order)
    inner.findByIdForUpdate.mockResolvedValue(order)
    inner.findAll.mockResolvedValue({ items: [order], total: 1 })

    expect(await guarded.create(order)).toBe(order)
    expect(await guarded.findById(1)).toBe(order)
    expect(await guarded.findByIdForUpdate(1)).toBe(order)
    expect((await guarded.findAll({ branchId: 1 })).total).toBe(1)
    expect(lock.assertEditable).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/orders/adapters`
Expected: FAIL (`Cannot find module './guarded-order.repository'`)

- [ ] **Step 3: เขียนโค้ด**

`apps/api/src/modules/orders/adapters/repository/guarded-order.repository.ts`:

```ts
import { inject, injectable } from 'tsyringe'
import type { NewOrder, OrderEntity } from '../../../../domains/order.domain'
import { orderEditLockToken, type IOrderEditLock } from '../../applications/ports/order-edit-lock.port'
import type { IFindOrdersQuery, IOrderRepository } from '../../applications/ports/order.repository'
import { DrizzleOrderRepository } from './order.drizzle.repository'

/**
 * The order repository with one more rule: an order whose price a QR is waiting on is not written.
 * Every command that changes an order locks it and saves it here, so the rule holds for all of them
 * (adding, removing, merging, splitting, moving, renaming, cancelling) without each one asking.
 * Paying uses the quote up first, so the order that is paid is no longer held when it is saved.
 */
@injectable()
export class GuardedOrderRepository implements IOrderRepository {
  constructor(
    @inject(DrizzleOrderRepository) private readonly orders: DrizzleOrderRepository,
    @inject(orderEditLockToken) private readonly lock: IOrderEditLock,
  ) {}

  create(order: NewOrder) {
    return this.orders.create(order)
  }

  findById(id: number) {
    return this.orders.findById(id)
  }

  findByIdForUpdate(id: number) {
    return this.orders.findByIdForUpdate(id)
  }

  findAll(query: IFindOrdersQuery) {
    return this.orders.findAll(query)
  }

  async save(order: OrderEntity) {
    if (order.id !== 0) await this.lock.assertEditable(order.id)
    return this.orders.save(order)
  }
}
```

ใน `apps/api/src/modules/orders/orders.module.ts` เปลี่ยน `container.register(orderRepositoryToken, { useClass: DrizzleOrderRepository })` เป็น `container.register(orderRepositoryToken, { useClass: GuardedOrderRepository })` และเพิ่ม import `import { GuardedOrderRepository } from './adapters/repository/guarded-order.repository'` (คง import `DrizzleOrderRepository` ไว้เพราะ `GuardedOrderRepository` inject ตัวมัน)

- [ ] **Step 4: รันการทดสอบให้ผ่าน แล้วรันการทดสอบออเดอร์ทั้งหมดกับ PostgreSQL**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/orders && bun --env-file=.env.test test src/__tests__/integration/orders.integration.test.ts src/__tests__/integration/tables.integration.test.ts && bun run typecheck`
Expected: PASS ทั้งหมด (การทดสอบออเดอร์และโต๊ะเดิมต้องไม่เปลี่ยน assertion)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders
gitcz --non-interactive --type=feat --scope=orders --subject="stop editing an order while a QR waits on its price"
```

---

### Task 11: ทดสอบเงินที่สำคัญผ่าน HTTP กับ PostgreSQL

การทดสอบนี้คือการยืนยันเกณฑ์ข้อ 3 ของ spec และ Review Focus ข้อ 1–4 และ 6

**Files:**
- Create: `apps/api/src/__tests__/integration/promotion-payments.integration.test.ts`
- Create: `apps/api/src/__tests__/integration/promotion-shifts.integration.test.ts`

**Interfaces:**
- Consumes: ทุกอย่างที่ Task 1–10 สร้าง ผ่าน `test/harness.ts` (`signIn`, `seedProduct`, `ok`, `resetDatabase`) และ `test/scb-server.ts` (`fakeScb`)
- Produces: ไม่มี (การทดสอบเท่านั้น) ถ้าการทดสอบใดล้มเหลว ให้แก้โค้ดของ Task ที่เป็นเจ้าของพฤติกรรมนั้น ไม่แก้การทดสอบให้ตรงกับพฤติกรรมผิด

- [ ] **Step 1: เขียนการทดสอบโหมดเดิม (legacy)**

สร้าง `apps/api/src/__tests__/integration/promotion-payments.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { priceQuotes } from '../../infrastructure/database/schema/price-quotes'
import { qrPayments } from '../../infrastructure/database/schema/qr-payments'
import { db } from '../../libs/db'
import { fakeScb, SCB_ENV_KEYS } from '../../../test/scb-server'
import { ok, resetDatabase, seedBranch, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  fakeScb.reset()
  fakeScb.enableIn(Bun.env)
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

afterEach(() => {
  for (const key of SCB_ENV_KEYS) delete Bun.env[key]
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const promptpay = (amountSatang: number, qrPaymentId: number) => [{ method: 'promptpay' as const, amountSatang, qrPaymentId }]
const lines = (productId: number, quantity = 2) => [{ productId, quantity }]

/** A product of 25.00 with 10 in stock, and a 10% promotion: 2 of them are 50.00 less 5.00 = 45.00. */
async function shop() {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  const promotion = ok(await owner.api.promotions.post({ name: 'ลด 10%', kind: 'percent', value: 1000 }))
  return { tea, promotion }
}
const quoteFor = async (productId: number, quantity = 2, extra: { memberId?: number } = {}) =>
  ok(await cashier.api.quotes.post({ lines: lines(productId, quantity), ...extra }))
const statusOf = async (quoteId: number) => ok(await cashier.api.quotes({ id: quoteId }).get()).status
const stockOf = async (productId: number) => ok(await owner.api.catalog.products({ id: productId }).get()).stockQty
const createQr = async (amountSatang: number, quoteId?: number) =>
  ok(await cashier.api.payments.qr.post({ amountSatang, ...(quoteId !== undefined && { quoteId }) }))

/** The customer pays at the bank and the till's next poll sees it. */
async function customerPays(payment: { id: number; reference: string }) {
  fakeScb.pay(payment.reference)
  await db.update(qrPayments).set({ lastCheckedAt: null }).where(eq(qrPayments.id, payment.id))
  return ok(await cashier.api.payments.qr({ id: payment.id }).get())
}

/** What the shop might change after a price was pinned: the promotion, the menu and the VAT. */
async function shopMovesOn(tea: { id: number }, promotion: { id: number }) {
  ok(await owner.api.promotions({ id: promotion.id }).patch({ isActive: false }))
  ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))
  ok(await owner.api.settings.patch({ vatMode: 'exclusive' }))
}

describe('a sale at a pinned price', () => {
  test('charges the quote, records the promotion, uses the quote up, and cannot be repeated', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }))

    expect(sale).toMatchObject({
      subtotalSatang: 5000, discountSatang: 500, totalSatang: 4500, vatSatang: 294, paidSatang: 5000, changeSatang: 500,
      promotion: { name: 'ลด 10%', kind: 'percent', value: 1000, discountSatang: 500 },
    })
    expect(ok(await cashier.api.sales({ id: sale.id }).get()).promotion).toMatchObject({ name: 'ลด 10%' })
    expect(await statusOf(quote.id)).toBe('consumed')
    expect(await stockOf(tea.id)).toBe(8)

    const again = await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })
    expect(again.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    expect(await stockOf(tea.id)).toBe(8)
  })

  test('two tills selling the same quote at once make one sale', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const results = await Promise.all([
      cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }),
      owner.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(await stockOf(tea.id)).toBe(8)
    expect(ok(await owner.api.sales.get({ query: {} })).total).toBe(1)
  })

  test('a promotion switched off, a new price and new VAT rules change nothing for a quote already made', async () => {
    const { tea, promotion } = await shop()
    const quote = await quoteFor(tea.id)
    await shopMovesOn(tea, promotion)

    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }))

    expect(sale).toMatchObject({ subtotalSatang: 5000, discountSatang: 500, totalSatang: 4500, vatMode: 'inclusive', vatSatang: 294 })
    // A sale without a quote now meets the new rules: no promotion, 90.00 a unit, VAT on top.
    const fresh = ok(await cashier.api.sales.post({ items: lines(tea.id, 1), payments: cash(10000) }))
    expect(fresh).toMatchObject({ discountSatang: 0, subtotalSatang: 9000, vatMode: 'exclusive', promotion: null })
  })

  test('an expired quote is refused and nothing is sold', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    await db.update(priceQuotes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(priceQuotes.id, quote.id))

    const refused = await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_EXPIRED' })
    expect(await stockOf(tea.id)).toBe(10)
  })

  test('a typed discount cannot be added to a quote, and another cart does not match it', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const both = await cashier.api.sales.post({ items: lines(tea.id), discountSatang: 100, payments: cash(5000), quoteId: quote.id })
    expect(both.error?.value).toMatchObject({ code: 'PROMOTION_AND_DISCOUNT_CONFLICT' })

    const other = await cashier.api.sales.post({ items: lines(tea.id, 3), payments: cash(9000), quoteId: quote.id })
    expect(other.status).toBe(409)
    expect(other.error?.value).toMatchObject({ code: 'QUOTE_MISMATCH' })
    // The quote was not lost: the right cart still sells.
    expect(await statusOf(quote.id)).toBe('open')
    ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }))
  })

  test("another branch's quote is not found", async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    const other = await seedBranch('BKK', 'สาขากรุงเทพ')
    const away = await signIn('cashier', 'bkk-cashier', { branchId: other.id })

    const refused = await away.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })

    expect(refused.status).toBe(404)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  })

  test('a sale without a quote is the sale it always was', async () => {
    const { tea } = await shop()
    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), discountSatang: 300, payments: cash(5000) }))
    expect(sale).toMatchObject({ discountSatang: 300, totalSatang: 4700, promotion: null })
  })
})

describe('a QR made from a quote', () => {
  test('is billed at the quoted price however long the customer takes and whatever the shop changed', async () => {
    const { tea, promotion } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)
    expect(await statusOf(quote.id)).toBe('reserved')

    await shopMovesOn(tea, promotion)
    await customerPays(qr)
    // The quote does not expire by time while its QR is waiting.
    await db.update(priceQuotes).set({ expiresAt: new Date(Date.now() - 60 * 60_000) }).where(eq(priceQuotes.id, quote.id))

    const sale = ok(await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: quote.id }))

    expect(sale).toMatchObject({ totalSatang: 4500, discountSatang: 500, vatMode: 'inclusive', promotion: { name: 'ลด 10%' } })
    expect(await statusOf(quote.id)).toBe('consumed')
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get()).saleId).toBe(sale.id)
  })

  test('may be for part of the total, with the rest paid another way, but not for more', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)

    const tooMuch = await cashier.api.payments.qr.post({ amountSatang: 4501, quoteId: quote.id })
    expect(tooMuch.status).toBe(409)
    expect(tooMuch.error?.value).toMatchObject({ code: 'QUOTE_AMOUNT_MISMATCH' })
    expect(fakeScb.created.size).toBe(0)
    expect(await statusOf(quote.id)).toBe('open')

    const qr = await createQr(3000, quote.id)
    await customerPays(qr)
    const sale = ok(
      await cashier.api.sales.post({
        items: lines(tea.id), payments: [...promptpay(3000, qr.id), ...cash(1500)], quoteId: quote.id,
      }),
    )
    expect(sale).toMatchObject({ totalSatang: 4500, paidSatang: 4500, changeSatang: 0 })
  })

  test('a changed cart is refused without losing the quote or the money', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)
    await customerPays(qr)

    const wrong = await cashier.api.sales.post({ items: lines(tea.id, 3), payments: promptpay(4500, qr.id), quoteId: quote.id })
    expect(wrong.status).toBe(409)
    expect(wrong.error?.value).toMatchObject({ code: 'QUOTE_MISMATCH' })
    expect(await statusOf(quote.id)).toBe('reserved')
    expect(ok(await cashier.api.payments.qr({ id: qr.id }).get())).toMatchObject({ status: 'paid', saleId: null })

    ok(await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: quote.id }))
    expect(await statusOf(quote.id)).toBe('consumed')
  })

  test('cannot be used without its quote, and says which quote that is', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)
    await customerPays(qr)

    const refused = await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id) })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_REQUIRED', params: { quoteId: quote.id } })
    expect(await statusOf(quote.id)).toBe('reserved')
    expect(await stockOf(tea.id)).toBe(10)
  })

  test('another quote cannot be paid with it', async () => {
    const { tea } = await shop()
    const first = await quoteFor(tea.id)
    const second = await quoteFor(tea.id)
    const qr = await createQr(4500, first.id)
    await customerPays(qr)

    const wrongQuote = await cashier.api.sales.post({ items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: second.id })
    expect(wrongQuote.status).toBe(409)
    expect(wrongQuote.error?.value).toMatchObject({ code: 'QUOTE_MISMATCH' })
  })

  test('a quote is held by one QR at a time, and cancelling the QR gives it back', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    const qr = await createQr(4500, quote.id)

    const second = await cashier.api.payments.qr.post({ amountSatang: 4500, quoteId: quote.id })
    expect(second.status).toBe(409)
    expect(second.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    const cancelByTill = await cashier.api.quotes({ id: quote.id }).cancel.post()
    expect(cancelByTill.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })

    ok(await cashier.api.payments.qr({ id: qr.id }).cancel.post())
    expect(await statusOf(quote.id)).toBe('open')
    ok(await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id }))
  })

  test('a cash sale cannot use a quote that a QR is holding', async () => {
    const { tea } = await shop()
    const quote = await quoteFor(tea.id)
    await createQr(4500, quote.id)

    const refused = await cashier.api.sales.post({ items: lines(tea.id), payments: cash(5000), quoteId: quote.id })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_NOT_OPEN' })
  })

  test('still sells when the member was switched off while the customer paid', async () => {
    const { tea } = await shop()
    const member = ok(await cashier.api.members.post({ name: 'ลูกค้าประจำ', phone: '0812345678' }))
    const quote = await quoteFor(tea.id, 2, { memberId: member.id })
    const qr = await createQr(4500, quote.id)
    ok(await owner.api.members({ id: member.id }).patch({ isActive: false }))
    await customerPays(qr)

    const sale = ok(
      await cashier.api.sales.post({
        items: lines(tea.id), payments: promptpay(4500, qr.id), quoteId: quote.id, memberId: member.id,
      }),
    )

    expect(sale.member).toMatchObject({ id: member.id, name: 'ลูกค้าประจำ' })
  })
})

describe('an order at a pinned price', () => {
  async function orderWithQuote() {
    const { tea } = await shop()
    const order = ok(await cashier.api.orders.post({ items: lines(tea.id) }))
    const quote = ok(await cashier.api.quotes.post({ orderId: order.id }))
    return { tea, order, quote }
  }

  test('is paid with the quote at the price the order quoted', async () => {
    const { tea, order, quote } = await orderWithQuote()
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 9000 }))

    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(5000), quoteId: quote.id }))

    expect(sale).toMatchObject({ totalSatang: 4500, discountSatang: 500, promotion: { name: 'ลด 10%' } })
    expect(ok(await cashier.api.orders({ id: order.id }).get())).toMatchObject({ status: 'paid', saleId: sale.id })
    expect(await statusOf(quote.id)).toBe('consumed')
  })

  test('cannot be changed, renamed, moved or cancelled while a QR waits on it, and can be paid with that QR', async () => {
    const { tea, order, quote } = await orderWithQuote()
    const qr = await createQr(4500, quote.id)

    const edits = [
      await cashier.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 }),
      await cashier.api.orders({ id: order.id }).patch({ label: 'โต๊ะ 9' }),
      await cashier.api.orders({ id: order.id }).cancel.post({ reason: 'ลูกค้าเปลี่ยนใจ' }),
      await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(5000) }),
    ]
    for (const edit of edits) {
      expect(edit.status).toBe(409)
      expect(edit.error?.value).toMatchObject({ code: 'ORDER_LOCKED_BY_QR_PAYMENT' })
    }
    expect(ok(await cashier.api.orders({ id: order.id }).get())).toMatchObject({ status: 'open', label: 'โต๊ะ 4' })
    expect(await stockOf(tea.id)).toBe(10)

    await customerPays(qr)
    const sale = ok(await cashier.api.orders({ id: order.id }).pay.post({ payments: promptpay(4500, qr.id), quoteId: quote.id }))
    expect(sale.totalSatang).toBe(4500)
  })

  test('is editable again once the QR is cancelled', async () => {
    const { tea, order, quote } = await orderWithQuote()
    const qr = await createQr(4500, quote.id)
    ok(await cashier.api.payments.qr({ id: qr.id }).cancel.post())

    const added = ok(await cashier.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 }))

    expect(added.items[0]).toMatchObject({ quantity: 3 })
    // The quote no longer matches the order, which is how the till learns to ask for a new one.
    const stale = await cashier.api.orders({ id: order.id }).pay.post({ payments: cash(9000), quoteId: quote.id })
    expect(stale.error?.value).toMatchObject({ code: 'QUOTE_MISMATCH' })
  })
})
```

- [ ] **Step 2: รันการทดสอบ**

Run: `cd apps/api && bun --env-file=.env.test test src/__tests__/integration/promotion-payments.integration.test.ts`
Expected: PASS ทั้งหมด ถ้าล้มเหลว ให้ดูว่าพฤติกรรมไหนผิดจาก spec แล้วแก้โค้ดของ Task ที่เกี่ยวข้อง

- [ ] **Step 3: เขียนการทดสอบโหมดกะ (shifts)**

สร้าง `apps/api/src/__tests__/integration/promotion-shifts.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { priceQuotes } from '../../infrastructure/database/schema/price-quotes'
import { qrPayments } from '../../infrastructure/database/schema/qr-payments'
import { shiftQrAttempts } from '../../infrastructure/database/schema/shift-qr-attempts'
import { db } from '../../libs/db'
import { fakeScb, SCB_ENV_KEYS } from '../../../test/scb-server'
import { ok, resetDatabase, seedProduct, signIn } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const key = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
let owner: Awaited<ReturnType<typeof signIn>>
let cashier: Awaited<ReturnType<typeof signIn>>
let shiftId: number

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  fakeScb.reset()
  fakeScb.enableIn(Bun.env)
  owner = await signIn('owner')
  cashier = await signIn('cashier')
  const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
  shiftId = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, key())).id
})

afterEach(() => {
  for (const name of SCB_ENV_KEYS) delete Bun.env[name]
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

const lines = (productId: number, quantity = 2) => [{ productId, quantity }]
const promptpay = (amountSatang: number, qrPaymentId: number) => [{ method: 'promptpay' as const, amountSatang, qrPaymentId }]
const statusOf = async (quoteId: number) => ok(await cashier.api.quotes({ id: quoteId }).get()).status

async function shop() {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  ok(await owner.api.promotions.post({ name: 'ลด 10%', kind: 'percent', value: 1000 }))
  const quote = ok(await cashier.api.quotes.post({ lines: lines(tea.id) }))
  return { tea, quote }
}

async function customerPays(payment: { id: number; reference: string }) {
  fakeScb.pay(payment.reference)
  await db.update(qrPayments).set({ lastCheckedAt: null }).where(eq(qrPayments.id, payment.id))
  return ok(await cashier.apiV2.payments.qr({ id: payment.id }).refresh.post())
}

describe('a QR asked for in a shift from a quote', () => {
  test('holds the quote, is sold with it, and the sale is replayed with the same key', async () => {
    const { tea, quote } = await shop()
    const qr = ok(await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key()))
    expect(await statusOf(quote.id)).toBe('reserved')
    await customerPays(qr)

    const saleKey = key()
    const body = { items: lines(tea.id), payments: promptpay(4500, qr.id), shiftId, quoteId: quote.id }
    const sale = ok(await cashier.apiV2.sales.post(body, saleKey))
    expect(sale).toMatchObject({ totalSatang: 4500, discountSatang: 500, promotion: { name: 'ลด 10%' } })
    expect(await statusOf(quote.id)).toBe('consumed')

    const replay = ok(await cashier.apiV2.sales.post(body, saleKey))
    expect(replay.id).toBe(sale.id)
  })

  test('a bank that refuses gives the quote back', async () => {
    const { quote } = await shop()
    Bun.env.SCB_BILLER_ID = '999999999999999'
    const refused = await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key())
    expect(refused.status).toBe(502)
    expect(await statusOf(quote.id)).toBe('open')
    expect((await db.select().from(shiftQrAttempts))[0]?.state).toBe('failed')
  })

  test('the owner setting the money aside closes the quote with it', async () => {
    const { quote } = await shop()
    const qr = ok(await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key()))
    await customerPays(qr)

    ok(await owner.apiV2.payments.qr({ id: qr.id }).dismiss.post({ reason: 'คืนเงินที่ธนาคารแล้ว' }))

    expect(await statusOf(quote.id)).toBe('cancelled')
  })

  test('a quote that is no longer open cannot be held', async () => {
    const { quote } = await shop()
    await db.update(priceQuotes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(priceQuotes.id, quote.id))

    const refused = await cashier.apiV2.payments.qr.post({ amountSatang: 4500, shiftId, quoteId: quote.id }, key())

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'QUOTE_EXPIRED' })
    expect(fakeScb.created.size).toBe(0)
    expect(await db.select().from(shiftQrAttempts)).toEqual([])
  })
})
```

- [ ] **Step 4: รันการทดสอบโหมดกะ**

Run: `cd apps/api && bun --env-file=.env.test test src/__tests__/integration/promotion-shifts.integration.test.ts`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/__tests__/integration/promotion-payments.integration.test.ts apps/api/src/__tests__/integration/promotion-shifts.integration.test.ts
gitcz --non-interactive --type=test --scope=promotions --subject="cover pinned prices with QR, orders and shifts"
```

---

### Task 12: สัญญา API (OpenAPI) และการตรวจฝั่ง API ทั้งหมด

**Files:**
- Modify (หลังเจ้าของโครงการอนุญาต): `apps/api/test/openapi-baseline.json`, `apps/api/test/openapi-v2-baseline.json`

- [ ] **Step 1: ให้ `openapi:check` บอกความต่าง**

Run: `cd apps/api && bun run openapi:check`
Expected: FAIL พร้อมข้อความ `OpenAPI differs from its versioned baseline` และเขียน `test/openapi-v1-current.json` กับ `test/openapi-v2-current.json`

- [ ] **Step 2: ตรวจว่าความต่างเป็นแบบเพิ่มอย่างเดียว**

Run:

```bash
cd apps/api && bun -e '
const read = async (path) => JSON.parse(await Bun.file(path).text())
const problems = []
const walk = (before, after, path) => {
  if (before === null || typeof before !== "object") {
    if (JSON.stringify(before) !== JSON.stringify(after)) problems.push(`changed ${path}`)
    return
  }
  if (after === null || typeof after !== "object") return void problems.push(`removed ${path}`)
  if (Array.isArray(before) && Array.isArray(after) && path.endsWith("/required") && after.length > before.length)
    problems.push(`more required ${path}`)
  for (const key of Object.keys(before)) {
    if (!(key in after)) problems.push(`removed ${path}/${key}`)
    else walk(before[key], after[key], `${path}/${key}`)
  }
}
walk(await read("test/openapi-baseline.json"), await read("test/openapi-v1-current.json"), "v1")
walk(await read("test/openapi-v2-baseline.json"), await read("test/openapi-v2-current.json"), "v2")
console.log(problems.length === 0 ? "additive only" : problems.join("\n"))
'
```

Expected: `additive only` หรือรายการ `more required ...` ที่อยู่ใต้ `responses` เท่านั้น (ช่อง `promotion` ในคำตอบของบิลเป็นช่องบังคับที่เป็น `null` ได้) ถ้ามีบรรทัด `removed`, `changed` หรือ `more required` ใต้ `requestBody` แปลว่าสัญญาเดิมพัง ให้หยุดและแก้โค้ด

- [ ] **Step 3: แจ้งเจ้าของโครงการก่อนบันทึก baseline**

ตาม `AGENTS.md` ต้องบอกเจ้าของโครงการก่อน หยุดตรงนี้และรายงานว่า: เพิ่มเส้นทาง `/promotions` (4), `/quotes` (3), ช่อง `quoteId` ที่ไม่บังคับใน `POST /sales`, `POST /orders/{id}/pay`, `POST /payments/qr` (v1) และ `POST /sales`, `POST /orders/{id}/pay`, `POST /payments/qr` (v2), และช่อง `promotion` ที่เป็น `null` ได้ในคำตอบของบิล รอให้เจ้าของโครงการตอบก่อนทำขั้นถัดไป

- [ ] **Step 4: บันทึก baseline ใหม่ (หลังเจ้าของโครงการอนุญาตแล้วเท่านั้น)**

Run:

```bash
cd apps/api && cp test/openapi-v1-current.json test/openapi-baseline.json && bun --env-file=.env.test test/openapi-snapshot.ts write && rm -f test/openapi-v1-current.json test/openapi-v2-current.json && bun run openapi:check
```

Expected: `OpenAPI v1 and v2 documents match their baselines`

- [ ] **Step 5: ตรวจ API ทั้งหมด**

Run: `bun run typecheck && bun run test` (ที่ root; ต้องมี PostgreSQL ทดสอบ)
Expected: PASS ทั้งหมด รวมการทดสอบเดิม `repo-secrets.test.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/openapi-baseline.json apps/api/test/openapi-v2-baseline.json
gitcz --non-interactive --type=chore --scope=api --subject="record the promotions and quotes contract"
```

---

### Task 13: หน้าจัดการโปรโมชัน (เว็บ)

**Files:**
- Create: `apps/web/src/features/promotions/lib/promotion-form.ts`, `apps/web/src/features/promotions/lib/promotion-form.test.ts`
- Create: `apps/web/src/features/promotions/lib/held-quote.ts`, `apps/web/src/features/promotions/lib/held-quote.test.ts`
- Create: `apps/web/src/features/promotions/api.ts`, `hooks/use-best-promotion.ts`, `locales.ts`, `index.ts`
- Create: `apps/web/src/features/promotions/components/PromotionsPage.tsx`, `PromotionFormDialog.tsx`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/{App.tsx,AppSidebar.tsx,i18n.ts,locales.ts}`, `apps/web/src/locales/errors.ts`

**Interfaces:**
- Consumes: `evaluatePromotion`/`pickBestPromotion` จาก `@pos/api/promotions` (Task 2), เส้นทาง `/promotions` และ `/quotes` (Task 5, 6), `useFormat()`, `useSettings()`, `meQuery`
- Produces (ผ่าน `@/features/promotions`):
  - `PromotionsPage`, `promotionsQuery(filters)`, `activePromotionsQuery`, `promotionKeys`, ชนิด `Promotion`, `Quote`
  - `useBestPromotion({ subtotalSatang, hasMember }): { id: number; name: string; discountSatang: number } | null`
  - `useCreateQuote()` (mutation; รับ `{ lines?, memberId?, orderId? }` คืน `Quote`)
  - `withHeldQuote<T>(quoteId: number | undefined, run: (quoteId: number | undefined) => Promise<T>): Promise<T>`
  - `promotionsLocales`
- ที่ `@/lib/api`: `ApiError` มีช่อง `params` เพิ่ม

- [ ] **Step 1: เขียนการทดสอบของฟังก์ชันแปลงฟอร์ม (ล้มเหลวก่อน)**

สร้าง `apps/web/src/features/promotions/lib/promotion-form.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { createMoney } from '@/lib/money'
import {
  bpToPercent, emptyPromotionForm, fromPromotion, minuteOf, percentToBp, timeOf, toBody, todayIn, weekdayName,
  type PromotionForm,
} from './promotion-form'

const baht = createMoney('THB', 'th')
const form = (overrides: Partial<PromotionForm> = {}): PromotionForm => ({
  ...emptyPromotionForm, name: 'ลดเปิดร้าน', kind: 'percent', value: '10', ...overrides,
})

describe('percent and basis points', () => {
  test.each([['10', 1000], ['12.5', 1250], ['0.01', 1], ['100', 10000], [' 7 ', 700], ['0.5', 50]])(
    '%p is %p basis points', (input, bp) => expect(percentToBp(input)).toBe(bp),
  )

  test.each(['0', '100.01', '1.234', '-5', 'abc', '', '1,5'])('%p is not a percent', (input) =>
    expect(percentToBp(input)).toBeNull(),
  )

  test('goes back to the text that was typed', () => {
    for (const bp of [1, 50, 1000, 1250, 9999, 10000]) expect(percentToBp(bpToPercent(bp))).toBe(bp)
    expect(bpToPercent(1250)).toBe('12.5')
    expect(bpToPercent(1000)).toBe('10')
  })
})

describe('time of day', () => {
  test('reads HH:MM into minutes and back', () => {
    expect(minuteOf('22:30')).toBe(1350)
    expect(minuteOf('00:00')).toBe(0)
    expect(timeOf(1350)).toBe('22:30')
    expect(timeOf(120)).toBe('02:00')
  })

  test.each(['24:00', '9:00', '12:60', '', 'noon'])('%p is not a time', (input) => expect(minuteOf(input)).toBeNull())
})

describe('today and weekday names', () => {
  test('today is the date in the shop time zone', () => {
    expect(todayIn('Asia/Bangkok', new Date('2026-10-15T17:30:00Z'))).toBe('2026-10-16')
    expect(todayIn('UTC', new Date('2026-10-15T17:30:00Z'))).toBe('2026-10-15')
  })

  test('0 is Sunday in either language', () => {
    expect(weekdayName('en', 0)).toBe('Sun')
    expect(weekdayName('en', 6)).toBe('Sat')
    expect(weekdayName('th', 0)).toContain('อา')
  })
})

describe('toBody', () => {
  test('a percent promotion in basis points, with a cap in satang', () => {
    const result = toBody(form({ value: '12.5', maxDiscount: '100', minSubtotal: '300' }), baht)
    expect(result).toEqual({
      ok: true,
      body: {
        name: 'ลดเปิดร้าน', kind: 'percent', value: 1250, maxDiscountSatang: 10000, minSubtotalSatang: 30000,
        startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
        audience: 'everyone', isActive: true,
      },
    })
  })

  test('a fixed promotion is in satang and drops a cap that was typed before the kind changed', () => {
    const result = toBody(form({ kind: 'fixed', value: '20', maxDiscount: '50' }), baht)
    expect(result.ok && result.body).toMatchObject({ kind: 'fixed', value: 2000, maxDiscountSatang: null })
  })

  test('weekdays are sorted, and none chosen means every day', () => {
    expect(toBody(form({ weekdays: [5, 1, 0] }), baht)).toMatchObject({ ok: true, body: { weekdays: [0, 1, 5] } })
    expect(toBody(form({ weekdays: [] }), baht)).toMatchObject({ ok: true, body: { weekdays: null } })
  })

  test('a window has both ends, which differ, and the dates are in order', () => {
    expect(toBody(form({ windowStart: '22:00', windowEnd: '02:00' }), baht)).toMatchObject({
      ok: true, body: { windowStartMinute: 1320, windowEndMinute: 120 },
    })
    expect(toBody(form({ windowStart: '22:00' }), baht)).toEqual({ ok: false, problems: ['window'] })
    expect(toBody(form({ windowStart: '10:00', windowEnd: '10:00' }), baht)).toEqual({ ok: false, problems: ['window'] })
    expect(toBody(form({ startsOn: '2026-12-01', endsOn: '2026-11-01' }), baht)).toEqual({ ok: false, problems: ['dates'] })
  })

  test('names every problem at once', () => {
    expect(toBody(form({ name: '  ', value: '0', maxDiscount: 'x', minSubtotal: '-' }), baht)).toEqual({
      ok: false, problems: ['name', 'value', 'maxDiscount', 'minSubtotal'],
    })
  })
})

describe('fromPromotion', () => {
  test('puts a stored promotion back into what the owner would have typed', () => {
    const stored = {
      id: 3, name: 'ศุกร์ดึก', kind: 'percent' as const, value: 1250, maxDiscountSatang: 10000, minSubtotalSatang: 30000,
      startsOn: '2026-10-01', endsOn: null, weekdays: [5, 6], windowStartMinute: 1320, windowEndMinute: 120,
      audience: 'members' as const, isActive: false,
    }
    expect(fromPromotion(stored, baht)).toEqual({
      name: 'ศุกร์ดึก', kind: 'percent', value: '12.5', maxDiscount: '100', minSubtotal: '300',
      startsOn: '2026-10-01', endsOn: '', weekdays: [5, 6], windowStart: '22:00', windowEnd: '02:00',
      audience: 'members', isActive: false,
    })
    const again = toBody(fromPromotion(stored, baht), baht)
    expect(again.ok && again.body).toMatchObject({ value: 1250, maxDiscountSatang: 10000, minSubtotalSatang: 30000 })
  })
})
```

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/web && bun test src/features/promotions/lib/promotion-form.test.ts`
Expected: FAIL (`Cannot find module './promotion-form'`)

- [ ] **Step 3: เขียน `promotion-form.ts`**

```ts
export type PromotionKind = 'fixed' | 'percent'
export type PromotionAudience = 'everyone' | 'members'

/** What the owner has typed into the promotion form, as text; `toBody` turns it into what the API takes. */
export interface PromotionForm {
  name: string
  kind: PromotionKind
  /** Baht for a fixed promotion, percent for a percent one. */
  value: string
  maxDiscount: string
  minSubtotal: string
  /** Civil dates, `YYYY-MM-DD`, or empty. */
  startsOn: string
  endsOn: string
  weekdays: number[]
  /** `HH:MM` or empty. */
  windowStart: string
  windowEnd: string
  audience: PromotionAudience
  isActive: boolean
}

export const emptyPromotionForm: PromotionForm = {
  name: '', kind: 'percent', value: '', maxDiscount: '', minSubtotal: '', startsOn: '', endsOn: '',
  weekdays: [], windowStart: '', windowEnd: '', audience: 'everyone', isActive: true,
}

/** How amounts in the shop currency are read and written (the shop's `money`). */
export interface AmountFormat {
  parse: (input: string) => number | null
  toInput: (satang: number) => string
}

export interface PromotionBody {
  name: string
  kind: PromotionKind
  value: number
  maxDiscountSatang: number | null
  minSubtotalSatang: number
  startsOn: string | null
  endsOn: string | null
  weekdays: number[] | null
  windowStartMinute: number | null
  windowEndMinute: number | null
  audience: PromotionAudience
  isActive: boolean
}

export type FormProblem = 'name' | 'value' | 'maxDiscount' | 'minSubtotal' | 'dates' | 'window'

/** `12.5` is 1250 basis points. Two decimals at most, from 0.01 to 100. */
export function percentToBp(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const bp = Number(match[1]) * 100 + Number(((match[2] ?? '') + '00').slice(0, 2))
  return bp >= 1 && bp <= 10_000 ? bp : null
}

export function bpToPercent(bp: number): string {
  const whole = Math.floor(bp / 100)
  const fraction = bp % 100
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`
}

export function minuteOf(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export const timeOf = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** The calendar date in a time zone, as `YYYY-MM-DD`. */
export function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Short name of a weekday (0 = Sunday) in the shop's language. */
export function weekdayName(locale: string, day: number): string {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)))
}

export function toBody(
  form: PromotionForm,
  amounts: AmountFormat,
): { ok: true; body: PromotionBody } | { ok: false; problems: FormProblem[] } {
  const problems: FormProblem[] = []

  const name = form.name.trim()
  if (name.length < 1 || name.length > 80) problems.push('name')

  const value = form.kind === 'percent' ? percentToBp(form.value) : amounts.parse(form.value)
  if (value === null || value < 1) problems.push('value')

  // A cap belongs to percent promotions only; what was typed before the kind changed is dropped.
  const typedCap = form.kind === 'percent' && form.maxDiscount.trim() !== ''
  const maxDiscount = typedCap ? amounts.parse(form.maxDiscount) : null
  if (typedCap && (maxDiscount === null || maxDiscount < 1)) problems.push('maxDiscount')

  const minSubtotal = form.minSubtotal.trim() === '' ? 0 : amounts.parse(form.minSubtotal)
  if (minSubtotal === null || minSubtotal < 0) problems.push('minSubtotal')

  if (form.startsOn !== '' && form.endsOn !== '' && form.startsOn > form.endsOn) problems.push('dates')

  const start = form.windowStart === '' ? null : minuteOf(form.windowStart)
  const end = form.windowEnd === '' ? null : minuteOf(form.windowEnd)
  const oneEnd = (form.windowStart === '') !== (form.windowEnd === '')
  const badTime = (form.windowStart !== '' && start === null) || (form.windowEnd !== '' && end === null)
  if (oneEnd || badTime || (start !== null && start === end)) problems.push('window')

  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    body: {
      name,
      kind: form.kind,
      value: value!,
      maxDiscountSatang: maxDiscount,
      minSubtotalSatang: minSubtotal!,
      startsOn: form.startsOn === '' ? null : form.startsOn,
      endsOn: form.endsOn === '' ? null : form.endsOn,
      weekdays: form.weekdays.length === 0 ? null : [...new Set(form.weekdays)].sort((a, b) => a - b),
      windowStartMinute: start,
      windowEndMinute: end,
      audience: form.audience,
      isActive: form.isActive,
    },
  }
}

/** The form for a stored promotion: what the owner would have typed to make it. */
export function fromPromotion(
  promotion: {
    name: string
    kind: PromotionKind
    value: number
    maxDiscountSatang: number | null
    minSubtotalSatang: number
    startsOn: string | null
    endsOn: string | null
    weekdays: readonly number[] | null
    windowStartMinute: number | null
    windowEndMinute: number | null
    audience: PromotionAudience
    isActive: boolean
  },
  amounts: AmountFormat,
): PromotionForm {
  return {
    name: promotion.name,
    kind: promotion.kind,
    value: promotion.kind === 'percent' ? bpToPercent(promotion.value) : amounts.toInput(promotion.value),
    maxDiscount: promotion.maxDiscountSatang === null ? '' : amounts.toInput(promotion.maxDiscountSatang),
    minSubtotal: promotion.minSubtotalSatang === 0 ? '' : amounts.toInput(promotion.minSubtotalSatang),
    startsOn: promotion.startsOn ?? '',
    endsOn: promotion.endsOn ?? '',
    weekdays: promotion.weekdays ? [...promotion.weekdays] : [],
    windowStart: promotion.windowStartMinute === null ? '' : timeOf(promotion.windowStartMinute),
    windowEnd: promotion.windowEndMinute === null ? '' : timeOf(promotion.windowEndMinute),
    audience: promotion.audience,
    isActive: promotion.isActive,
  }
}
```

- [ ] **Step 4: รันการทดสอบให้ผ่าน**

Run: `cd apps/web && bun test src/features/promotions/lib/promotion-form.test.ts`
Expected: PASS ทุกกรณี

- [ ] **Step 5: ทดสอบและเขียน `held-quote.ts`**

สร้าง `apps/web/src/features/promotions/lib/held-quote.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { heldQuoteOf, withHeldQuote } from './held-quote'

const heldBy = (quoteId: number) => Object.assign(new Error('x'), { code: 'QUOTE_REQUIRED', params: { quoteId } })

describe('heldQuoteOf', () => {
  test('reads the quote a refused sale has to carry', () => {
    expect(heldQuoteOf(heldBy(7))).toBe(7)
  })

  test('is null for any other error', () => {
    expect(heldQuoteOf(new Error('x'))).toBeNull()
    expect(heldQuoteOf(Object.assign(new Error('x'), { code: 'QUOTE_MISMATCH', params: { quoteId: 7 } }))).toBeNull()
    expect(heldQuoteOf(Object.assign(new Error('x'), { code: 'QUOTE_REQUIRED' }))).toBeNull()
    expect(heldQuoteOf(null)).toBeNull()
  })
})

describe('withHeldQuote', () => {
  test('returns the answer of the first try', async () => {
    const calls: (number | undefined)[] = []
    const result = await withHeldQuote(undefined, async (quoteId) => { calls.push(quoteId); return 'sale' })
    expect(result).toBe('sale')
    expect(calls).toEqual([undefined])
  })

  test('tries once more with the quote the server named', async () => {
    const calls: (number | undefined)[] = []
    const result = await withHeldQuote(undefined, async (quoteId) => {
      calls.push(quoteId)
      if (quoteId === undefined) throw heldBy(7)
      return 'sale'
    })
    expect(result).toBe('sale')
    expect(calls).toEqual([undefined, 7])
  })

  test('does not retry when a quote was already sent, and passes other errors on', async () => {
    let calls = 0
    await expect(withHeldQuote(3, async () => { calls++; throw heldBy(7) })).rejects.toThrow('x')
    await expect(withHeldQuote(undefined, async () => { calls++; throw new Error('other') })).rejects.toThrow('other')
    expect(calls).toBe(2)
  })

  test('gives up when the second try is refused too', async () => {
    let calls = 0
    await expect(withHeldQuote(undefined, async () => { calls++; throw heldBy(7) })).rejects.toThrow('x')
    expect(calls).toBe(2)
  })
})
```

`apps/web/src/features/promotions/lib/held-quote.ts`:

```ts
/** The quote a QR holds, when the server refused a sale because it left that quote out. */
export function heldQuoteOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const { code, params } = error as { code?: unknown; params?: { quoteId?: unknown } }
  return code === 'QUOTE_REQUIRED' && typeof params?.quoteId === 'number' ? params.quoteId : null
}

/**
 * Money that arrived for a QR made from a pinned price has to be sold with that price. The till may not
 * have it any more (the page was reloaded, or another till made the QR); the server names it, and the
 * sale is tried once more with it.
 */
export async function withHeldQuote<T>(
  quoteId: number | undefined,
  run: (quoteId: number | undefined) => Promise<T>,
): Promise<T> {
  try {
    return await run(quoteId)
  } catch (error) {
    const held = quoteId === undefined ? heldQuoteOf(error) : null
    if (held === null) throw error
    return run(held)
  }
}
```

Run: `cd apps/web && bun test src/features/promotions/lib/held-quote.test.ts`
Expected: PASS

- [ ] **Step 6: `ApiError` พก `params`**

ใน `apps/web/src/lib/api.ts` แทนคลาส `ApiError` ด้วย:

```ts
export class ApiError extends Error {
  status: number
  code: string
  /** Data the API sent to fill into its message, such as which quote a sale has to carry. */
  params: Record<string, string | number> | undefined

  constructor(status: number, code: string, message: string, params?: Record<string, string | number>) {
    super(message)
    this.status = status
    this.code = code
    this.params = params
  }
}
```

และในฟังก์ชัน `unwrap` เปลี่ยนบรรทัด `throw new ApiError(...)` เป็น:

```ts
    throw new ApiError(Number(error.status), problem?.code ?? 'UNKNOWN', messageFor(problem), problem?.params)
```

- [ ] **Step 7: `api.ts` ของ feature, hook ของโปรโมชันที่ใช้ได้, และข้อความ**

`apps/web/src/features/promotions/api.ts`:

```ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { PromotionBody } from './lib/promotion-form'

export const promotionKeys = { all: ['promotions'] as const }

export interface PromotionFilters {
  isActive?: boolean
  limit?: number
  offset?: number
}

const fetchPromotions = (filters: PromotionFilters) =>
  unwrap(api.promotions.get({ query: { limit: 100, offset: 0, ...filters } }))

export type Promotion = Awaited<ReturnType<typeof fetchPromotions>>['items'][number]

export const promotionsQuery = (filters: PromotionFilters = {}) =>
  queryOptions({
    queryKey: [...promotionKeys.all, 'list', filters],
    queryFn: () => fetchPromotions(filters),
  })

/** What the till reads to show the promotion the cart will be given. The server decides again at payment. */
export const activePromotionsQuery = queryOptions({
  queryKey: [...promotionKeys.all, 'active'],
  queryFn: () => fetchPromotions({ isActive: true, limit: 500 }),
  staleTime: 60_000,
})

export function useCreatePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PromotionBody) => unwrap(api.promotions.post(body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.all }),
  })
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<PromotionBody> }) =>
      unwrap(api.promotions({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: promotionKeys.all }),
  })
}

export interface QuoteInput {
  lines?: { productId: number; quantity: number; options?: number[] }[]
  memberId?: number | null
  orderId?: number
}

const requestQuote = (input: QuoteInput) => unwrap(api.quotes.post(input))

export type Quote = Awaited<ReturnType<typeof requestQuote>>

/** Prices the cart (or an open order) on the server and pins the result. Nothing is locked or deducted. */
export function useCreateQuote() {
  return useMutation({ mutationFn: requestQuote })
}
```

`apps/web/src/features/promotions/hooks/use-best-promotion.ts`:

```ts
import { pickBestPromotion } from '@pos/api/promotions'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '@/features/settings'
import { activePromotionsQuery } from '../api'

/**
 * The promotion the server will most likely give a cart of this size, worked out with the same rule the
 * server uses. It only shows the cashier what to expect: the server chooses again when the price is pinned.
 */
export function useBestPromotion({ subtotalSatang, hasMember }: { subtotalSatang: number; hasMember: boolean }) {
  const promotions = useQuery(activePromotionsQuery)
  const { timeZone } = useSettings()
  // Windows open and close during the day, so the answer is worked out again every so often.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  return useMemo(() => {
    const best = pickBestPromotion(promotions.data?.items ?? [], { subtotalSatang, hasMember, at: now, timeZone })
    return best ? { id: best.promotion.id, name: best.promotion.name, discountSatang: best.discountSatang } : null
  }, [promotions.data, subtotalSatang, hasMember, now, timeZone])
}
```

`apps/web/src/features/promotions/locales.ts`:

```ts
const th = {
  title: 'โปรโมชัน',
  description: 'ส่วนลดท้ายบิลที่ระบบเลือกให้เองตามเงื่อนไข ใช้ร่วมทุกสาขา',
  create: 'เพิ่มโปรโมชัน',
  retry: 'ลองอีกครั้ง',
  list: {
    title: 'รายการโปรโมชัน',
    description: 'ถ้ามีหลายโปรโมชันที่ตรงเงื่อนไข ระบบเลือกอันที่ลดมากสุดให้',
    empty: 'ยังไม่มีโปรโมชัน',
    readOnly: 'เฉพาะเจ้าของร้านเพิ่มและแก้โปรโมชันได้',
  },
  columns: { name: 'ชื่อโปรโมชัน', discount: 'ส่วนลด', when: 'เงื่อนไข', audience: 'ใช้กับ', status: 'สถานะ' },
  status: { active: 'ใช้งานอยู่', inactive: 'ปิดใช้งาน' },
  audience: { everyone: 'ลูกค้าทุกคน', members: 'เฉพาะสมาชิก' },
  kind: { fixed: 'ลดเป็นบาท', percent: 'ลดเป็นเปอร์เซ็นต์' },
  summary: {
    fixed: 'ลด {{amount}}',
    percent: 'ลด {{percent}}%',
    percentCapped: 'ลด {{percent}}% สูงสุด {{max}}',
  },
  when: {
    always: 'ทุกบิล',
    minimum: 'ซื้อครบ {{amount}}',
    from: 'ตั้งแต่ {{date}}',
    until: 'ถึง {{date}}',
    between: '{{from}} – {{to}}',
    onDays: 'วัน {{days}}',
    window: '{{start}}–{{end}} น.',
  },
  actions: { more: 'การทำงานอื่นของ {{name}}', edit: 'แก้ไข', activate: 'เปิดใช้งาน', deactivate: 'ปิดใช้งาน' },
  toast: {
    created: 'เพิ่มโปรโมชัน "{{name}}" แล้ว',
    updated: 'บันทึกโปรโมชัน "{{name}}" แล้ว',
    activated: 'เปิดใช้งาน "{{name}}" แล้ว',
    deactivated: 'ปิดใช้งาน "{{name}}" แล้ว',
  },
  form: {
    titleNew: 'เพิ่มโปรโมชัน',
    titleEdit: 'แก้ไขโปรโมชัน',
    description: 'โปรโมชันที่ตรงเงื่อนไขจะถูกใช้กับบิลโดยอัตโนมัติ',
    name: 'ชื่อโปรโมชัน',
    kind: 'แบบส่วนลด',
    valueFixed: 'ส่วนลด ({{currency}})',
    valuePercent: 'ส่วนลด (%)',
    maxDiscount: 'ลดสูงสุด ({{currency}})',
    maxDiscountHint: 'เว้นว่างถ้าไม่จำกัด',
    minSubtotal: 'ยอดซื้อขั้นต่ำ ({{currency}})',
    minSubtotalHint: 'นับจากยอดสินค้าก่อนหักส่วนลดและก่อน VAT ที่บวกเพิ่ม',
    startsOn: 'เริ่มวันที่',
    endsOn: 'สิ้นสุดวันที่ (รวมวันนี้)',
    clearDate: 'ล้างวันที่',
    weekdays: 'วันในสัปดาห์',
    weekdaysHint: 'ไม่เลือกเลย = ทุกวัน',
    windowStart: 'ตั้งแต่เวลา',
    windowEnd: 'ถึงเวลา',
    windowHint: 'เว้นว่างทั้งคู่ = ทั้งวัน ถ้าเวลาสิ้นสุดน้อยกว่าเวลาเริ่ม ถือว่าข้ามเที่ยงคืน',
    audience: 'ใช้กับ',
    isActive: 'เปิดใช้งาน',
    save: 'บันทึก',
    saving: 'กำลังบันทึก…',
  },
  problems: {
    name: 'ชื่อโปรโมชันต้องยาว 1 ถึง 80 ตัวอักษร',
    value: 'กรอกส่วนลดให้ถูกต้อง (เปอร์เซ็นต์ 0.01–100)',
    maxDiscount: 'ลดสูงสุดต้องเป็นจำนวนเงินที่มากกว่า 0',
    minSubtotal: 'ยอดขั้นต่ำต้องเป็นจำนวนเงินที่ไม่ติดลบ',
    dates: 'วันเริ่มต้องไม่เกินวันสิ้นสุด',
    window: 'กรอกเวลาเริ่มและสิ้นสุดให้ครบ และต้องไม่เท่ากัน',
  },
}

const en = {
  title: 'Promotions',
  description: 'Bill discounts the system picks by itself when their conditions are met. Shared by every branch.',
  create: 'Add promotion',
  retry: 'Try again',
  list: {
    title: 'Promotions',
    description: 'When several apply, the one that gives the most is used.',
    empty: 'There are no promotions yet',
    readOnly: 'Only the owner can add and edit promotions.',
  },
  columns: { name: 'Promotion', discount: 'Discount', when: 'Conditions', audience: 'Applies to', status: 'Status' },
  status: { active: 'Active', inactive: 'Off' },
  audience: { everyone: 'Everyone', members: 'Members only' },
  kind: { fixed: 'Amount off', percent: 'Percent off' },
  summary: {
    fixed: '{{amount}} off',
    percent: '{{percent}}% off',
    percentCapped: '{{percent}}% off, up to {{max}}',
  },
  when: {
    always: 'Every bill',
    minimum: 'Spend {{amount}} or more',
    from: 'From {{date}}',
    until: 'Until {{date}}',
    between: '{{from}} – {{to}}',
    onDays: 'On {{days}}',
    window: '{{start}}–{{end}}',
  },
  actions: { more: 'More actions for {{name}}', edit: 'Edit', activate: 'Switch on', deactivate: 'Switch off' },
  toast: {
    created: 'Added promotion "{{name}}"',
    updated: 'Saved promotion "{{name}}"',
    activated: 'Switched on "{{name}}"',
    deactivated: 'Switched off "{{name}}"',
  },
  form: {
    titleNew: 'Add promotion',
    titleEdit: 'Edit promotion',
    description: 'A promotion whose conditions are met is applied to the bill automatically.',
    name: 'Name',
    kind: 'Kind of discount',
    valueFixed: 'Discount ({{currency}})',
    valuePercent: 'Discount (%)',
    maxDiscount: 'Largest discount ({{currency}})',
    maxDiscountHint: 'Leave empty for no limit',
    minSubtotal: 'Minimum spend ({{currency}})',
    minSubtotalHint: 'Counted from the items before the discount and before VAT that is added on top',
    startsOn: 'Starts on',
    endsOn: 'Ends on (this day included)',
    clearDate: 'Clear date',
    weekdays: 'Days of the week',
    weekdaysHint: 'None chosen = every day',
    windowStart: 'From',
    windowEnd: 'Until',
    windowHint: 'Leave both empty for the whole day. An end before the start crosses midnight.',
    audience: 'Applies to',
    isActive: 'Switched on',
    save: 'Save',
    saving: 'Saving…',
  },
  problems: {
    name: 'The name must be 1 to 80 characters.',
    value: 'Enter a valid discount (percent from 0.01 to 100).',
    maxDiscount: 'The largest discount must be an amount above 0.',
    minSubtotal: 'The minimum spend must be an amount that is not negative.',
    dates: 'The start date must not be after the end date.',
    window: 'Enter both times, and they must differ.',
  },
} satisfies typeof th

export const locales = { th, en }
```

- [ ] **Step 8: คอมโพเนนต์**

`apps/web/src/features/promotions/components/PromotionFormDialog.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DatePicker } from '@/components/DatePicker'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useFormat, useSettings } from '@/features/settings'
import { cn } from '@/lib/utils'
import { useCreatePromotion, useUpdatePromotion, type Promotion } from '../api'
import {
  emptyPromotionForm, fromPromotion, toBody, todayIn, weekdayName,
  type PromotionForm,
} from '../lib/promotion-form'

export function PromotionFormDialog({ promotion, onClose }: { promotion?: Promotion; onClose: () => void }) {
  const { t } = useTranslation('promotions')
  const { t: tc } = useTranslation()
  const { money, date, locale, currency } = useFormat()
  const shop = useSettings()
  const [form, setForm] = useState<PromotionForm>(() => (promotion ? fromPromotion(promotion, money) : emptyPromotionForm))
  const [today] = useState(() => todayIn(shop.timeZone, new Date()))
  const create = useCreatePromotion()
  const update = useUpdatePromotion()
  const mutation = promotion ? update : create
  const result = toBody(form, money)
  const problems = result.ok ? [] : result.problems

  const set = <K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const toggleDay = (day: number) =>
    set('weekdays', form.weekdays.includes(day) ? form.weekdays.filter((chosen) => chosen !== day) : [...form.weekdays, day])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!result.ok || mutation.isPending) return
    const done = (saved: Promotion) => {
      toast.success(t(promotion ? 'toast.updated' : 'toast.created', { name: saved.name }))
      onClose()
    }
    if (promotion) update.mutate({ id: promotion.id, changes: result.body }, { onSuccess: done })
    else create.mutate(result.body, { onSuccess: done })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(promotion ? 'form.titleEdit' : 'form.titleNew')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="promotion-name">{t('form.name')}</FieldLabel>
              <Input
                id="promotion-name" autoFocus required maxLength={80} className="h-11"
                aria-invalid={problems.includes('name') && form.name !== ''}
                value={form.name} onChange={(event) => set('name', event.target.value)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="promotion-kind">{t('form.kind')}</FieldLabel>
                <Select value={form.kind} onValueChange={(value) => set('kind', value === 'fixed' ? 'fixed' : 'percent')}>
                  <SelectTrigger id="promotion-kind" className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="percent">{t('kind.percent')}</SelectItem>
                      <SelectItem value="fixed">{t('kind.fixed')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="promotion-value">
                  {form.kind === 'percent' ? t('form.valuePercent') : t('form.valueFixed', { currency })}
                </FieldLabel>
                <Input
                  id="promotion-value" inputMode="decimal" className="h-11 text-right tabular-nums"
                  aria-invalid={problems.includes('value') && form.value !== ''}
                  value={form.value} onChange={(event) => set('value', event.target.value)}
                />
              </Field>
            </div>

            {form.kind === 'percent' && (
              <Field>
                <FieldLabel htmlFor="promotion-max">{t('form.maxDiscount', { currency })}</FieldLabel>
                <Input
                  id="promotion-max" inputMode="decimal" className="h-11 text-right tabular-nums"
                  aria-invalid={problems.includes('maxDiscount')}
                  value={form.maxDiscount} onChange={(event) => set('maxDiscount', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('form.maxDiscountHint')}</p>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="promotion-min">{t('form.minSubtotal', { currency })}</FieldLabel>
              <Input
                id="promotion-min" inputMode="decimal" className="h-11 text-right tabular-nums"
                aria-invalid={problems.includes('minSubtotal')}
                value={form.minSubtotal} onChange={(event) => set('minSubtotal', event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('form.minSubtotalHint')}</p>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="promotion-starts">{t('form.startsOn')}</FieldLabel>
                <DatePicker
                  id="promotion-starts" label={t('form.startsOn')} value={form.startsOn} today={today}
                  locale={locale} dateFormat={date} invalid={problems.includes('dates')}
                  onChange={(value) => set('startsOn', value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="promotion-ends">{t('form.endsOn')}</FieldLabel>
                <DatePicker
                  id="promotion-ends" label={t('form.endsOn')} value={form.endsOn} today={today}
                  locale={locale} dateFormat={date} invalid={problems.includes('dates')}
                  onChange={(value) => set('endsOn', value)}
                />
              </Field>
            </div>
            {(form.startsOn !== '' || form.endsOn !== '') && (
              <Button
                type="button" variant="outline" className="h-11 self-start"
                onClick={() => setForm((current) => ({ ...current, startsOn: '', endsOn: '' }))}
              >
                {t('form.clearDate')}
              </Button>
            )}
            {problems.includes('dates') && <p role="alert" className="text-sm text-destructive">{t('problems.dates')}</p>}

            <Field>
              <FieldLabel>{t('form.weekdays')}</FieldLabel>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('form.weekdays')}>
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <button
                    key={day} type="button" aria-pressed={form.weekdays.includes(day)} onClick={() => toggleDay(day)}
                    className={cn(
                      'h-11 min-w-11 rounded-lg border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      form.weekdays.includes(day) ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
                    )}
                  >
                    {weekdayName(locale, day)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t('form.weekdaysHint')}</p>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="promotion-window-start">{t('form.windowStart')}</FieldLabel>
                <Input
                  id="promotion-window-start" type="time" className="h-11" aria-invalid={problems.includes('window')}
                  value={form.windowStart} onChange={(event) => set('windowStart', event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="promotion-window-end">{t('form.windowEnd')}</FieldLabel>
                <Input
                  id="promotion-window-end" type="time" className="h-11" aria-invalid={problems.includes('window')}
                  value={form.windowEnd} onChange={(event) => set('windowEnd', event.target.value)}
                />
              </Field>
            </div>
            <p className={cn('text-xs', problems.includes('window') ? 'text-destructive' : 'text-muted-foreground')}>
              {problems.includes('window') ? t('problems.window') : t('form.windowHint')}
            </p>

            <Field>
              <FieldLabel htmlFor="promotion-audience">{t('form.audience')}</FieldLabel>
              <Select value={form.audience} onValueChange={(value) => set('audience', value === 'members' ? 'members' : 'everyone')}>
                <SelectTrigger id="promotion-audience" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="everyone">{t('audience.everyone')}</SelectItem>
                    <SelectItem value="members">{t('audience.members')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <label className="flex h-11 items-center justify-between gap-3 text-sm font-medium">
              <span>{t('form.isActive')}</span>
              <Switch checked={form.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
            </label>
          </FieldGroup>

          {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={mutation.isPending} onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={!result.ok || mutation.isPending}>
              {t(mutation.isPending ? 'form.saving' : 'form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

`apps/web/src/features/promotions/components/PromotionsPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { PaginationBar } from '@/components/PaginationBar'
import { Panel } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { meQuery } from '@/features/auth'
import { useFormat } from '@/features/settings'
import { useListPagination } from '@/hooks/use-list-pagination'
import { promotionsQuery, useUpdatePromotion, type Promotion } from '../api'
import { bpToPercent, timeOf, weekdayName } from '../lib/promotion-form'
import { PromotionFormDialog } from './PromotionFormDialog'

/** The owner sets promotions up; a cashier can read them so they know what the till will give. */
export function PromotionsPage() {
  const { t } = useTranslation('promotions')
  const { money, date, locale } = useFormat()
  const isOwner = useQuery(meQuery).data?.role === 'owner'
  const promotions = useQuery(promotionsQuery({ limit: 500 }))
  const update = useUpdatePromotion()
  const [dialog, setDialog] = useState<{ promotion?: Promotion } | null>(null)
  const paging = useListPagination('promotions')
  const all = promotions.data?.items ?? []

  const discountText = (promotion: Promotion) => {
    if (promotion.kind === 'fixed') return t('summary.fixed', { amount: money.format(promotion.value) })
    const percent = bpToPercent(promotion.value)
    return promotion.maxDiscountSatang === null
      ? t('summary.percent', { percent })
      : t('summary.percentCapped', { percent, max: money.format(promotion.maxDiscountSatang) })
  }

  const whenText = (promotion: Promotion) => {
    const parts: string[] = []
    if (promotion.minSubtotalSatang > 0) parts.push(t('when.minimum', { amount: money.format(promotion.minSubtotalSatang) }))
    if (promotion.startsOn && promotion.endsOn)
      parts.push(t('when.between', { from: date.calendarDate(promotion.startsOn), to: date.calendarDate(promotion.endsOn) }))
    else if (promotion.startsOn) parts.push(t('when.from', { date: date.calendarDate(promotion.startsOn) }))
    else if (promotion.endsOn) parts.push(t('when.until', { date: date.calendarDate(promotion.endsOn) }))
    if (promotion.weekdays && promotion.weekdays.length > 0)
      parts.push(t('when.onDays', { days: promotion.weekdays.map((day) => weekdayName(locale, day)).join(' ') }))
    if (promotion.windowStartMinute !== null && promotion.windowEndMinute !== null)
      parts.push(t('when.window', { start: timeOf(promotion.windowStartMinute), end: timeOf(promotion.windowEndMinute) }))
    return parts.length > 0 ? parts.join(' · ') : t('when.always')
  }

  const setActive = (promotion: Promotion, isActive: boolean) =>
    update.mutate(
      { id: promotion.id, changes: { isActive } },
      {
        onSuccess: () => toast.success(t(isActive ? 'toast.activated' : 'toast.deactivated', { name: promotion.name })),
        onError: (error) => toast.error(error.message),
      },
    )

  return (
    <>
      <PageHeader title={t('title')} description={t('description')}>
        {isOwner && (
          <Button className="h-11 px-3" onClick={() => setDialog({})}>
            <Plus />
            {t('create')}
          </Button>
        )}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Panel title={t('list.title')} description={isOwner ? t('list.description') : t('list.readOnly')}>
          {promotions.error && (
            <p role="alert" className="p-4 text-sm text-destructive">
              {promotions.error.message}
              <Button variant="link" className="h-11" onClick={() => void promotions.refetch()}>{t('retry')}</Button>
            </p>
          )}
          {!promotions.error && (
            <DataTable
              rows={all.slice(paging.offset, paging.offset + paging.pageSize)}
              rowKey={(promotion) => promotion.id}
              isPending={promotions.isPending}
              empty={t('list.empty')}
              muted={(promotion) => !promotion.isActive}
              columns={[
                { id: 'name', header: t('columns.name'), priority: 'primary', className: 'font-medium', cell: (promotion) => promotion.name },
                { id: 'discount', header: t('columns.discount'), priority: 'primary', cell: discountText },
                { id: 'when', header: t('columns.when'), priority: 'secondary', cell: whenText },
                {
                  id: 'audience', header: t('columns.audience'), priority: 'wide-only',
                  cell: (promotion) => t(`audience.${promotion.audience}`),
                },
                {
                  id: 'status', header: t('columns.status'), priority: 'secondary',
                  cell: (promotion) => (
                    <StatusBadge tone={promotion.isActive ? 'success' : 'neutral'}>
                      {promotion.isActive ? t('status.active') : t('status.inactive')}
                    </StatusBadge>
                  ),
                },
              ]}
              actions={
                isOwner
                  ? (promotion) => (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="size-11" aria-label={t('actions.more', { name: promotion.name })}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ promotion })}>{t('actions.edit')}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setActive(promotion, !promotion.isActive)}>
                            {promotion.isActive ? t('actions.deactivate') : t('actions.activate')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  : undefined
              }
            />
          )}
          <PaginationBar {...paging} total={all.length} isLoading={promotions.isFetching} onPageChange={paging.setPage} />
        </Panel>
      </div>

      {dialog && <PromotionFormDialog promotion={dialog.promotion} onClose={() => setDialog(null)} />}
    </>
  )
}
```

`apps/web/src/features/promotions/index.ts`:

```ts
export {
  activePromotionsQuery, promotionKeys, promotionsQuery, useCreateQuote,
  type Promotion, type Quote,
} from './api'
export { PromotionsPage } from './components/PromotionsPage'
export { useBestPromotion } from './hooks/use-best-promotion'
export { withHeldQuote } from './lib/held-quote'
export { locales as promotionsLocales } from './locales'
```

- [ ] **Step 9: ต่อเข้ากับแอป**

`apps/web/src/app/i18n.ts`: เพิ่ม `import { promotionsLocales } from '@/features/promotions'` ต่อจาก import ของ `posLocales`, เพิ่ม `promotions: promotionsLocales.th,` ในออบเจ็กต์ `th` และ `promotions: promotionsLocales.en,` ในออบเจ็กต์ `en` ต่อจากบรรทัด `members:`

`apps/web/src/app/locales.ts`: ในออบเจ็กต์ `nav` ของ `th` เพิ่ม `promotions: 'โปรโมชัน',` ต่อจาก `members: ...` และของ `en` เพิ่ม `promotions: 'Promotions',` ต่อจาก `members: 'Members',`

`apps/web/src/app/App.tsx`: เพิ่ม `import { PromotionsPage } from '@/features/promotions'` ต่อจาก import ของ `ModifiersPage` และเพิ่มเส้นทางต่อจาก `<Route path="members/:id" element={<MemberDetailsPage />} />`:

```tsx
          <Route path="promotions" element={<PromotionsPage />} />
```

`apps/web/src/app/AppSidebar.tsx`: ใน `groups` ของ "งานขาย" ต่อจากบรรทัด `{ to: '/members', label: t('nav.members'), icon: UserRound },` เพิ่ม `{ to: '/promotions', label: t('nav.promotions'), icon: BadgePercent },` และเพิ่ม `BadgePercent` ใน import จาก `lucide-react` ของไฟล์นั้น

`apps/web/src/locales/errors.ts`: ต่อจากบรรทัด `QR_DISMISSED: 'This payment was dismissed and can no longer pay for a sale.',` ในออบเจ็กต์ `en` เพิ่ม:

```ts
    PROMOTION_NOT_FOUND: 'Promotion not found.',
    PROMOTION_NAME_TAKEN: 'Another promotion already has this name.',
    INVALID_PROMOTION: 'These promotion settings are not valid.',
    QUOTE_NOT_FOUND: 'The pinned price was not found.',
    QUOTE_EXPIRED: 'The pinned price has expired. Ask for the price again.',
    QUOTE_NOT_OPEN: 'This price was already used or cancelled, or is waiting for a QR payment.',
    QUOTE_MISMATCH: 'The items, member or branch no longer match the pinned price. Ask for the price again.',
    QUOTE_AMOUNT_MISMATCH: 'The QR amount is more than the pinned total.',
    QUOTE_REQUIRED: 'This QR was made from a pinned price. Pay with that price.',
    PROMOTION_AND_DISCOUNT_CONFLICT: 'A typed discount cannot be combined with a promotion.',
    ORDER_LOCKED_BY_QR_PAYMENT: 'This order is waiting for a QR payment and cannot be changed until that QR is paid or cancelled.',
```

- [ ] **Step 10: ตรวจ**

Run: `cd apps/web && bun test src/features/promotions && bun run typecheck && bun run lint`
Expected: PASS (ถ้า `typecheck` หรือ lint บ่นเรื่องชนิดของ `t(`audience.${...}`)` ให้ใช้ `promotion.audience === 'members' ? t('audience.members') : t('audience.everyone')` แทน)

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/promotions apps/web/src/lib/api.ts apps/web/src/app apps/web/src/locales/errors.ts
gitcz --non-interactive --type=feat --scope=web --subject="add the promotions page and quote client"
```

---

### Task 14: หน้าขาย: แสดงโปรโมชัน ตรึงราคาก่อนชำระ และใช้ quote กับ QR

**Files:**
- Modify: `apps/web/src/features/pos/lib/cart.ts`, `apps/web/src/features/pos/lib/cart.test.ts`
- Modify: `apps/web/src/features/pos/store/cart.store.ts`, `apps/web/src/features/pos/store/cart.store.test.ts`
- Modify: `apps/web/src/features/pos/hooks/use-cart.ts`, `use-qr-payment.ts`
- Modify: `apps/web/src/features/pos/api.ts`, `apps/web/src/features/orders/api.ts`
- Modify: `apps/web/src/features/pos/components/{CartPanel,PosPage,PaymentDialog}.tsx`
- Create: `apps/web/src/features/pos/components/QuotePendingDialog.tsx`
- Modify: `apps/web/src/features/pos/locales.ts`, `apps/web/src/features/sales/locales.ts`, `apps/web/src/features/sales/components/Receipt.tsx`

**Interfaces:**
- Consumes: `useBestPromotion`, `useCreateQuote`, `withHeldQuote`, `Quote` จาก `@/features/promotions` (Task 13)
- Produces:
  - `PricingOptions.promotion?: { id; name; discountSatang } | null`, `PricedCart.promotion`
  - `useCartStore`: `promotionDeclined: boolean`, `setPromotionDeclined(declined: boolean)`
  - `useCart()` เพิ่ม `promotion`, `availablePromotion`, `promotionDeclined`, `usesQuote`
  - `CheckoutInput.quoteId?`, `PayOrderInput.quoteId?`, `CreateQrInput.quoteId?`

- [ ] **Step 1: เขียนการทดสอบสูตรตะกร้าที่ล้มเหลว**

ต่อท้าย `apps/web/src/features/pos/lib/cart.test.ts`:

```ts
describe('a promotion', () => {
  const tea = product({ id: 1, priceSatang: 2500 })
  const lines = [{ key: '1:', productId: 1, optionIds: [], quantity: 2 }]
  const promotion = { id: 4, name: 'ลด 10%', discountSatang: 500 }

  test('sets the discount and is part of the total', () => {
    const cart = priceCart(lines, catalogue(tea), '', { ...inclusive, promotion })
    expect(cart).toMatchObject({ discountSatang: 500, totalSatang: 4500, promotion, isDiscountValid: true, canPay: true })
  })

  test('replaces whatever was typed in the discount field', () => {
    const cart = priceCart(lines, catalogue(tea), '99', { ...inclusive, promotion })
    expect(cart).toMatchObject({ discountSatang: 500, totalSatang: 4500, isDiscountValid: true })
  })

  test('never takes more than the subtotal', () => {
    const cart = priceCart(lines, catalogue(tea), '', { ...inclusive, promotion: { ...promotion, discountSatang: 9000 } })
    expect(cart).toMatchObject({ discountSatang: 5000, totalSatang: 0 })
  })

  test('without one nothing changes and promotion is null', () => {
    expect(priceCart(lines, catalogue(tea), '7.50', inclusive)).toMatchObject({ promotion: null, discountSatang: 750 })
  })

  test('an order is priced the same way, at the prices it quoted', () => {
    const items: Order['items'] = [
      { lineId: 1, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2000, quantity: 2, lineTotalSatang: 4000, options: [] },
    ]
    const cart = priceOrder(items, catalogue(tea), '', { ...inclusive, promotion: { id: 4, name: 'ลด 10%', discountSatang: 400 } })
    expect(cart).toMatchObject({ subtotalSatang: 4000, discountSatang: 400, totalSatang: 3600 })
  })
})
```

ต่อท้าย `apps/web/src/features/pos/store/cart.store.test.ts` (ภายใน `describe('cart store', ...)` ก่อนปีกกาปิดสุดท้าย):

```ts
  test('a declined promotion is forgotten when the cart is cleared or an order is chosen', () => {
    cart().setPromotionDeclined(true)
    expect(cart().promotionDeclined).toBe(true)

    cart().clear()
    expect(cart().promotionDeclined).toBe(false)

    cart().setPromotionDeclined(true)
    cart().workOnOrder(5)
    expect(cart().promotionDeclined).toBe(false)
  })
```

- [ ] **Step 2: รันเพื่อดูว่าล้มเหลว**

Run: `cd apps/web && bun test src/features/pos`
Expected: FAIL (`promotion` ไม่อยู่ใน `PricingOptions`, `setPromotionDeclined` ไม่มี)

- [ ] **Step 3: สูตรและ store**

ใน `apps/web/src/features/pos/lib/cart.ts`:

ใน `interface PricedCart` ต่อจาก `isDiscountValid: boolean` เพิ่ม:

```ts
  /** The promotion that gives this discount; it replaces a typed discount. Null when there is none. */
  promotion: { id: number; name: string; discountSatang: number } | null
```

ใน `interface PricingOptions` ต่อจาก `parseAmount: ...` เพิ่ม:

```ts
  /** The promotion the till will be given. It sets the discount, so a typed one is ignored. */
  promotion?: { id: number; name: string; discountSatang: number } | null
```

แทนฟังก์ชัน `summarize` ทั้งฟังก์ชันด้วย:

```ts
function summarize(
  priced: PricedLine[],
  discountInput: string,
  { vatMode, vatRateBp, parseAmount, promotion = null }: PricingOptions,
): PricedCart {
  const subtotalSatang = priced.reduce((sum, line) => sum + line.lineTotalSatang, 0)
  const itemCount = priced.reduce((sum, line) => sum + line.quantity, 0)

  // A promotion and a typed discount are never added together: the promotion wins while it applies.
  const typed = promotion || discountInput.trim() === '' ? 0 : parseAmount(discountInput)
  const isDiscountValid = typed !== null && typed <= subtotalSatang
  const discountSatang = promotion
    ? Math.min(promotion.discountSatang, subtotalSatang)
    : isDiscountValid
      ? typed
      : 0
  const { vatSatang, totalSatang } = calculateTotals({ subtotalSatang, discountSatang, vatMode, vatRateBp })

  return {
    lines: priced,
    itemCount,
    subtotalSatang,
    discountSatang,
    isDiscountValid,
    promotion,
    vatSatang,
    totalSatang,
    canPay:
      priced.length > 0 &&
      isDiscountValid &&
      totalSatang > 0 &&
      !priced.some((line) => line.exceedsStock || line.unavailable),
  }
}
```

ใน `apps/web/src/features/pos/store/cart.store.ts`:
- ใน `interface CartState` ต่อจาก `setDiscount: (discount: string) => void` เพิ่ม:

```ts
  /** The cashier chose to sell without the promotion that applies, e.g. to type a discount instead. */
  promotionDeclined: boolean
  setPromotionDeclined: (declined: boolean) => void
```

- ในค่าเริ่มต้นของ store ต่อจาก `memberId: null,` เพิ่ม `promotionDeclined: false,` และต่อจาก `setDiscount: ...` เพิ่ม `setPromotionDeclined: (promotionDeclined) => set({ promotionDeclined }),`
- เปลี่ยน `workOnOrder` เป็น `workOnOrder: (orderId) => set({ orderId, lines: [], discount: '', memberId: null, promotionDeclined: false }),` และ `clear` เป็น `clear: () => set({ lines: [], discount: '', orderId: null, memberId: null, promotionDeclined: false }),`

- [ ] **Step 4: รันการทดสอบให้ผ่าน**

Run: `cd apps/web && bun test src/features/pos`
Expected: PASS

- [ ] **Step 5: `useCart`**

ใน `apps/web/src/features/pos/hooks/use-cart.ts`:
- เพิ่ม `import { useBestPromotion } from '@/features/promotions'` และเปลี่ยน import ของ cart เป็น `import { priceCart, priceOrder, type PricingOptions } from '../lib/cart'`
- ต่อจาก `const clear = useCartStore((state) => state.clear)` เพิ่ม `const declined = useCartStore((state) => state.promotionDeclined)`
- แทนบล็อก

```ts
  const options = { vatMode, vatRateBp, parseAmount: money.parse }
  const priced = orderId === null
    ? priceCart(lines, productsById, discount, options, optionsById)
    : priceOrder(order.data?.items ?? [], productsById, discount, options)
```

ด้วย:

```ts
  const price = (promotion: PricingOptions['promotion']) => {
    const options: PricingOptions = { vatMode, vatRateBp, parseAmount: money.parse, promotion }
    return orderId === null
      ? priceCart(lines, productsById, discount, options, optionsById)
      : priceOrder(order.data?.items ?? [], productsById, discount, options)
  }
  // The promotion the server would give a cart this size, then the cart priced with it unless declined.
  const base = price(null)
  const best = useBestPromotion({ subtotalSatang: base.subtotalSatang, hasMember: memberId !== null })
  const priced = best && !declined ? price(best) : base
```

- ใน `return {` ต่อจาก `orderId, order: order.data, ...` ท้ายออบเจ็กต์ เพิ่ม:

```ts
    availablePromotion: best,
    promotionDeclined: declined,
    // Without a typed discount the server prices the cart and pins the total, which a QR is then made for.
    usesQuote: !declined,
```

(`priced.promotion` ถูกกระจายผ่าน `...priced` อยู่แล้ว)

- [ ] **Step 6: แผงตะกร้า**

ใน `apps/web/src/features/pos/components/CartPanel.tsx` เพิ่ม `const setPromotionDeclined = useCartStore((state) => state.setPromotionDeclined)` ต่อจาก `const setDiscount = ...` และแทนบล็อก `<label className="flex items-center justify-between gap-4 text-sm text-muted-foreground">...</label>` พร้อม `{!cart.isDiscountValid && <p ...>}` ด้วย:

```tsx
        {cart.promotion ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-3 py-1 text-sm text-accent-foreground">
            <span className="min-w-0 truncate font-medium">{t('cart.promotion', { name: cart.promotion.name })}</span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="tabular-nums">-{money.format(cart.promotion.discountSatang)}</span>
              <Button variant="ghost" className="h-11 px-2" onClick={() => setPromotionDeclined(true)}>
                {t('cart.promotionRemove')}
              </Button>
            </span>
          </div>
        ) : (
          <>
            <label className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
              <span>{t('cart.discount', { currency })}</span>
              <Input
                className="h-11 w-32 text-right tabular-nums"
                inputMode="decimal"
                aria-invalid={!cart.isDiscountValid}
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                placeholder={money.plain(0)}
              />
            </label>
            {!cart.isDiscountValid && <p className="text-right text-xs text-destructive">{t('cart.discountTooLarge')}</p>}
            {cart.promotionDeclined && cart.availablePromotion && (
              <Button variant="outline" className="h-11 w-full" onClick={() => setPromotionDeclined(false)}>
                {t('cart.promotionUse', { name: cart.availablePromotion.name })}
              </Button>
            )}
          </>
        )}
```

- [ ] **Step 7: API ของการขาย ออเดอร์ และ QR**

`apps/web/src/features/pos/api.ts`:
- เพิ่ม `import { withHeldQuote } from '@/features/promotions'`
- ใน `interface CheckoutInput` ต่อจาก `memberId?: number | null` เพิ่ม `/** A price pinned by the server; the sale is made at it. */ quoteId?: number`
- แทน `mutationFn` ของ `useCheckout` ด้วย:

```ts
    mutationFn: async ({ items, discountSatang, payment, shiftId, idempotencyKey, memberId, quoteId }: CheckoutInput): Promise<Sale> =>
      // A QR the till no longer knows the quote of is sold with the quote the server names.
      withHeldQuote(quoteId, async (pinned) => {
        // A pinned price already holds the discount; a typed one is never sent with it.
        const discount = pinned === undefined ? discountSatang : 0
        if (shiftId !== undefined) {
          const sale = await unwrap(
            apiV2.sales.post(
              { items, discountSatang: discount, payments: [payment], shiftId, memberId, quoteId: pinned },
              { headers: { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() } },
            ),
          )
          return sale as unknown as Sale
        }
        return unwrap(api.sales.post({ items, discountSatang: discount, payments: [payment], memberId, quoteId: pinned }))
      }),
```

- ใน `interface CreateQrInput` ต่อจาก `amountSatang: number` เพิ่ม `/** The pinned price this QR is for; it is held until the QR is paid or cancelled. */ quoteId?: number`
- ใน `useCreateQrPayment` แทน `mutationFn` ด้วย:

```ts
    mutationFn: async ({ amountSatang, quoteId, shiftId, idempotencyKey }: CreateQrInput): Promise<{ id: number; qrImage: string; expiresAt: Date }> => {
      if (shiftId === undefined) return unwrap(api.payments.qr.post({ amountSatang, quoteId }))
      return unwrap(
        apiV2.payments.qr.post(
          { amountSatang, shiftId, quoteId },
          { headers: { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() } },
        ),
      )
    },
```

`apps/web/src/features/orders/api.ts`:
- เพิ่ม `import { withHeldQuote } from '@/features/promotions'`
- ใน `interface PayOrderInput` ต่อจาก `discountSatang: number` เพิ่ม `quoteId?: number`
- แทน `mutationFn` ของ `usePayOrder` ด้วย:

```ts
    mutationFn: async ({ orderId, discountSatang, quoteId, payment, shiftId, idempotencyKey }: PayOrderInput) =>
      withHeldQuote(quoteId, async (pinned) => {
        const discount = pinned === undefined ? discountSatang : 0
        if (shiftId !== undefined)
          return unwrap(
            apiV2.orders({ id: orderId }).pay.post(
              { discountSatang: discount, payments: [payment], shiftId, quoteId: pinned },
              { headers: { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() } },
            ),
          )
        return unwrap(api.orders({ id: orderId }).pay.post({ discountSatang: discount, payments: [payment], quoteId: pinned }))
      }),
```

`apps/web/src/features/pos/hooks/use-qr-payment.ts`:
- เปลี่ยนลายเซ็นเป็น `useQrPayment({ amountSatang, quoteId, active, shiftId }: { amountSatang: number; quoteId?: number; active: boolean; shiftId?: number })`
- ใน `create.mutate({ amountSatang, shiftId, idempotencyKey: crypto.randomUUID() }, ...)` เปลี่ยนเป็น `create.mutate({ amountSatang, quoteId, shiftId, idempotencyKey: crypto.randomUUID() }, ...)`
- เปลี่ยน dependency ของ `useCallback` จาก `[amountSatang, shiftId]` เป็น `[amountSatang, quoteId, shiftId]`

- [ ] **Step 8: กล่องรอคิดราคา และกล่องชำระ**

สร้าง `apps/web/src/features/pos/components/QuotePendingDialog.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  isPending: boolean
  error?: string
  onRetry: () => void
  onCancel: () => void
}

/** Shown while the server prices the cart and pins the promotion and total, before payment opens. */
export function QuotePendingDialog({ isPending, error, onRetry, onCancel }: Props) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <DialogTitle>{t('payment.pricing.title')}</DialogTitle>
          <DialogDescription>{isPending ? t('payment.pricing.pending') : t('payment.pricing.failed')}</DialogDescription>
        </DialogHeader>
        {isPending && <Skeleton className="h-14 w-full" />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-12 text-base" onClick={onCancel}>{tc('cancel')}</Button>
          <Button type="button" className="h-12 text-base" disabled={isPending} onClick={onRetry}>
            {t('payment.pricing.retry')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

`apps/web/src/features/pos/components/PaymentDialog.tsx`:
- เพิ่ม `import type { Quote } from '@/features/promotions'`
- ใน `interface Props` ต่อจาก `totalSatang: number` เพิ่ม `/** The pinned price this payment is made at: its promotion is shown and a QR is made from it. */ quote?: Quote | null`, และเปลี่ยน `onConfirm: (payment: PaymentInput) => void` เป็น `onConfirm: (payment: PaymentInput, options?: { arrived?: boolean }) => void`
- ในพารามิเตอร์ของฟังก์ชันเพิ่ม `quote` ต่อจาก `totalSatang`
- เปลี่ยน `const qr = useQrPayment({ amountSatang: totalSatang, active: usesQr, shiftId })` เป็น `const qr = useQrPayment({ amountSatang: totalSatang, quoteId: quote?.id, active: usesQr, shiftId })`
- ใน `payWithArrivedMoney` เปลี่ยน `onConfirm({ method: 'promptpay', amountSatang: totalSatang, qrPaymentId })` เป็น `onConfirm({ method: 'promptpay', amountSatang: totalSatang, qrPaymentId }, { arrived: true })` (เงินที่มาถึงแล้วอาจมาจาก QR ที่ผูกกับ quote อื่น จึงไม่ส่ง quote ของกล่องนี้ไปด้วย ให้เซิร์ฟเวอร์บอก quote ที่ถูกต้อง)
- ต่อจาก `<DialogTitle ...>{money.format(totalSatang)}</DialogTitle>` เพิ่ม:

```tsx
          {quote?.promotion && (
            <p className="text-sm text-muted-foreground">
              {t('payment.promotion', { name: quote.promotion.name, amount: money.format(quote.promotion.discountSatang) })}
            </p>
          )}
```

- [ ] **Step 9: หน้าขาย**

ใน `apps/web/src/features/pos/components/PosPage.tsx`:

(ก) เพิ่ม import:

```ts
import { useCreateQuote } from '@/features/promotions'
import { QuotePendingDialog } from './QuotePendingDialog'
```

(ข) ต่อจาก `const paymentCommandKey = useRef<string | null>(null)` เพิ่ม:

```ts
  // A cart without a typed discount is priced by the server first: the promotion it gets and the total it
  // pays are pinned in a quote, and the payment (and a QR) is made from that.
  const createQuote = useCreateQuote()
  const usesQuote = cart.usesQuote
  const quote = usesQuote ? (createQuote.data ?? null) : null
  const quoteInput = () =>
    cart.orderId !== null
      ? { orderId: cart.orderId }
      : {
          lines: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, options: line.optionIds })),
          memberId: cart.memberId,
        }
  const startPayment = () => {
    setIsPaying(true)
    if (usesQuote) createQuote.mutate(quoteInput())
  }
  // The keyboard handler is set up once per `canPay`, so it reads the latest function through a ref.
  const startPaymentRef = useRef(startPayment)
  useEffect(() => {
    startPaymentRef.current = startPayment
  })
```

(ค) ใน effect ของ F9 เปลี่ยน `if (canPay) setIsPaying(true)` เป็น `if (canPay) startPaymentRef.current()`

(ง) ใน `paid.onSuccess` ต่อจาก `paymentCommandKey.current = null` เพิ่ม `createQuote.reset()` และในฟังก์ชัน `cancelPayment` ต่อจาก `paymentCommandKey.current = null` เพิ่ม `createQuote.reset()`

(จ) แทนฟังก์ชัน `pay` ทั้งฟังก์ชันด้วย:

```ts
  const pay = (payment: PaymentInput, options: { arrived?: boolean } = {}) => {
    // Money that arrived earlier belongs to whatever quote made its QR; the server names it if there is one.
    const quoteId = options.arrived ? undefined : quote?.id
    // A pinned price already holds the discount; the till never adds a typed one on top.
    const discountSatang = quote ? 0 : cart.discountSatang
    paymentCommandKey.current ??= crypto.randomUUID()
    // An open order is paid through the order, which sells it at the prices it quoted.
    if (cart.orderId !== null) {
      payOrder.mutate(
        {
          orderId: cart.orderId, discountSatang, quoteId, payment,
          ...(needsShift && currentShift.data ? { shiftId: currentShift.data.id, idempotencyKey: paymentCommandKey.current } : {}),
        },
        paid,
      )
    } else {
      checkout.mutate(
        {
          items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, options: line.optionIds })),
          discountSatang, quoteId, memberId: cart.memberId, payment,
          ...(needsShift && currentShift.data ? { shiftId: currentShift.data.id } : {}),
          ...(needsShift ? { idempotencyKey: paymentCommandKey.current } : {}),
        },
        paid,
      )
    }
  }
```

(ฉ) เปลี่ยน `onPay={() => setIsPaying(true)}` ทั้งสองที่ (ใน `CartPanel` และ `CartBar`) เป็น `onPay={startPayment}`

(ช) แทนบล็อก `{isPaying && ( <PaymentDialog ... /> )}` ด้วย:

```tsx
      {isPaying && usesQuote && !quote && (
        <QuotePendingDialog
          isPending={createQuote.isPending}
          error={createQuote.error?.message}
          onRetry={() => createQuote.mutate(quoteInput())}
          onCancel={cancelPayment}
        />
      )}

      {isPaying && (!usesQuote || quote) && (
        <PaymentDialog
          totalSatang={quote ? quote.totalSatang : cart.totalSatang}
          quote={quote}
          shiftId={needsShift ? currentShift.data?.id : undefined}
          isSubmitting={payment.isPending}
          error={payment.error?.message}
          onConfirm={pay}
          onCancel={cancelPayment}
        />
      )}
```

- [ ] **Step 10: ข้อความ และใบเสร็จ**

`apps/web/src/features/pos/locales.ts`:
- ในบล็อก `cart` ของ `th` ต่อจากบรรทัด `    productUnavailable: 'สินค้าบางรายการปิดการขายแล้ว ล้างตะกร้าแล้วเลือกสินค้าใหม่',` เพิ่ม:

```ts
    promotion: 'โปรโมชัน: {{name}}',
    promotionRemove: 'ยกเลิกโปรโมชัน',
    promotionUse: 'ใช้โปรโมชัน "{{name}}"',
```

- ในบล็อก `cart` ของ `en` ต่อจากบรรทัด `    productUnavailable: 'Some products are no longer for sale. Clear the cart and choose again.',` เพิ่ม:

```ts
    promotion: 'Promotion: {{name}}',
    promotionRemove: 'Remove promotion',
    promotionUse: 'Use promotion "{{name}}"',
```

- ในบล็อก `payment` ของ `th` ต่อจากบรรทัด `    due: 'ยอดที่ต้องชำระ',` เพิ่ม:

```ts
    promotion: 'โปรโมชัน {{name}} ลด {{amount}}',
    pricing: {
      title: 'กำลังคิดราคา',
      pending: 'ระบบกำลังคิดราคาและโปรโมชันของตะกร้านี้',
      failed: 'คิดราคาไม่สำเร็จ',
      retry: 'ลองอีกครั้ง',
    },
```

- ในบล็อก `payment` ของ `en` ต่อจากบรรทัด `    due: 'Amount due',` เพิ่ม:

```ts
    promotion: 'Promotion {{name}}: {{amount}} off',
    pricing: {
      title: 'Pricing the cart',
      pending: 'The system is working out the price and promotion of this cart.',
      failed: 'The price could not be worked out.',
      retry: 'Try again',
    },
```

`apps/web/src/features/sales/locales.ts`: ในบล็อก `receipt` ของ `th` ต่อจาก `    discount: 'ส่วนลด',` เพิ่ม `    promotion: 'โปรโมชัน: {{name}}',` และของ `en` ต่อจาก `    discount: 'Discount',` (บรรทัดที่อยู่ถัดจาก `subtotalBeforeVat: 'Subtotal (before VAT)',`) เพิ่ม `    promotion: 'Promotion: {{name}}',`

`apps/web/src/features/sales/components/Receipt.tsx`: ต่อจากบล็อก `{sale.discountSatang > 0 && ( ... )}` เพิ่ม:

```tsx
      {sale.promotion && <p className="pl-3 text-xs">{t('receipt.promotion', { name: sale.promotion.name })}</p>}
```

- [ ] **Step 11: ตรวจ**

Run: `cd apps/web && bun test && bun run typecheck && bun run lint`
Expected: PASS (ถ้า typecheck บอกว่าชนิดของ `quoteInput()` ไม่ตรงกับ body ของ `useCreateQuote` ให้ตรวจชื่อช่อง `options` ในรายการกับ `quoteSchemas.create` ใน Task 6)

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/features/pos apps/web/src/features/orders apps/web/src/features/sales
gitcz --non-interactive --type=feat --scope=pos --subject="sell at a promotion with the price pinned before payment"
```

---

### Task 15: เบราว์เซอร์ เอกสาร และตรวจปิดงาน

**Files:**
- Modify: `apps/web/e2e/run.ts`, `apps/web/e2e/shots.ts`
- Modify: `AGENTS.md`, `docs/superpowers/roadmap.md`

- [ ] **Step 1: เพิ่มหน้าใหม่ในการตรวจทุกขนาดจอและภาพหน้าจอ**

ใน `apps/web/e2e/run.ts` ในอาร์เรย์ของเส้นทางที่ตรวจว่าไม่ล้นแนวนอน (บรรทัดที่มี `'/settings']`) เพิ่ม `'/promotions'` ก่อน `'/settings'`:

```ts
          for (const path of ['/', '/today', '/shifts', '/products', '/categories', '/modifiers', '/tables', '/branches', '/users', '/promotions', '/settings']) {
```

ใน `apps/web/e2e/shots.ts` ในอาร์เรย์ที่มี `['22-reports', '/reports'],` เพิ่มต่อท้าย `['23-promotions', '/promotions'],`

- [ ] **Step 2: เพิ่มสถานการณ์ในเบราว์เซอร์**

ใน `apps/web/e2e/run.ts` ก่อนบรรทัด `console.log('\nModifiers:')` เพิ่ม:

```ts
    console.log('\nPromotions:')

    await check('the owner sets up a 10% promotion, the till shows it, and the receipt names it', async () => {
      await owner.goto(`${WEB}/promotions`)
      await owner.getByRole('button', { name: 'เพิ่มโปรโมชัน' }).click()
      const form = owner.getByRole('dialog')
      await form.getByLabel('ชื่อโปรโมชัน').fill('ลดเปิดร้าน')
      await form.getByLabel('ส่วนลด (%)').fill('10')
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('dialog').waitFor({ state: 'detached' })
      await owner.getByText('ลดเปิดร้าน').first().waitFor()

      await owner.goto(WEB)
      await owner.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      await owner.getByText('โปรโมชัน: ลดเปิดร้าน').waitFor()
      await owner.getByRole('button', { name: /^ชำระเงิน/ }).click()
      await owner.getByRole('button', { name: 'พอดี' }).click()
      await owner.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
      const receipt = owner.getByRole('dialog')
      await receipt.getByText('โปรโมชัน: ลดเปิดร้าน').waitFor()
      await receipt.getByRole('button', { name: 'ขายรายการต่อไป' }).waitFor()
    })

    await check('a cashier sees the promotion but cannot add one', async () => {
      await cashier.goto(`${WEB}/promotions`)
      await cashier.getByText('ลดเปิดร้าน').first().waitFor()
      if ((await cashier.getByRole('button', { name: 'เพิ่มโปรโมชัน' }).count()) > 0)
        throw new Error('A cashier can add promotions')
    })

    await check('the promotion is switched off so the checks after it price as before', async () => {
      const listed = await owner.request.get(`${WEB}/api/v1/promotions`)
      const { items } = (await listed.json()) as { items: { id: number }[] }
      for (const { id } of items) {
        const off = await owner.request.patch(`${WEB}/api/v1/promotions/${id}`, { data: { isActive: false } })
        if (!off.ok()) throw new Error(`Could not switch the promotion off: ${off.status()}`)
      }
    })
```

- [ ] **Step 3: อัปเดตกฎใน `AGENTS.md`**

ใน `AGENTS.md` ต่อจากหัวข้อ "### ตัวเลือกเสริม (modifiers)" ทั้งหัวข้อ (ก่อนหัวข้อ "### โต๊ะ (tables)") เพิ่ม:

```md
### โปรโมชันและราคาที่ตรึงไว้ (promotions, quotes)

- โปรโมชันใช้ร่วมทุกสาขา ปิดใช้ได้แต่ลบไม่ได้ เจ้าของจัดการ แคชเชียร์อ่านได้ สูตรการประเมิน (`evaluatePromotion`, `pickBestPromotion`) อยู่ใน `domains/promotion.domain.ts` ที่เดียว และเว็บใช้ฟังก์ชันเดียวกันผ่าน `@pos/api/promotions` เวลาของโปรโมชันคิดตาม `timeZone` ของร้าน ช่วงเวลาที่ข้ามเที่ยงคืนนับเป็นของวันที่เริ่ม
- ส่วนลดจากโปรโมชันกับส่วนลดกรอกเองไม่บวกซ้อนกัน ระบบเลือกโปรโมชันที่ลดมากสุดให้เอง (เท่ากันเลือก id ต่ำสุด) และห้ามแก้ `calculateTotals`
- quote (`price_quotes`) คือตะกร้าที่เซิร์ฟเวอร์คิดราคาแล้วและตรึงไว้: รายการ ราคาต่อหน่วย สมาชิก โปรโมชัน ส่วนลด `vatMode` `vatRateBp` และยอดสุทธิ บิลที่ขายด้วย `quoteId` ใช้ค่าเหล่านั้นทั้งหมด แม้โปรโมชันถูกปิด ราคาสินค้าเปลี่ยน หรือแก้ภาษีไปแล้ว คำขอที่ไม่ส่ง `quoteId` ต้องทำงานเหมือนเดิมทุกอย่าง
- quote ที่ `open` หมดอายุตามเวลา (15 นาที) แต่ quote ที่ QR จองไว้ (`reserved`) ไม่หมดอายุจนกว่า QR จะถูกใช้ ยกเลิก หรือปิดรายการ เพื่อให้เงินที่มาถึงช้ายังได้บิลยอดเดิม ห้ามเพิ่มทางที่ปล่อย quote ที่ถูกจองโดยไม่ผ่านการยกเลิก/ปิดรายการ QR
- การขายที่มี quote ตรวจสมาชิกว่าเปิดใช้ตอนสร้าง quote ไม่ตรวจซ้ำตอนชำระ เพราะเงินอาจจ่ายไปแล้ว QR ที่ quote จองไว้ใช้กับคำขอที่ไม่ส่ง `quoteId` ไม่ได้ (`QUOTE_REQUIRED` พร้อม `params.quoteId`)
- ลำดับล็อกตอนขาย: ออเดอร์ → รายการชำระด้วย QR → quote → สมาชิก → สินค้า คำสั่งที่ยกเลิก/ปิดรายการ QR ล็อก QR ก่อนแล้วค่อยแตะ quote
- ออเดอร์ที่มี quote ถูก QR จองอยู่แก้ไม่ได้ (`ORDER_LOCKED_BY_QR_PAYMENT`) ตรวจที่ `save` ของ `GuardedOrderRepository` จุดเดียว
- `GET /api/v1/quotes/{id}` เป็น query ล้วน ห้ามต่ออายุหรือเขียนข้อมูล
```

- [ ] **Step 4: อัปเดต roadmap**

ใน `docs/superpowers/roadmap.md` ต่อจากบรรทัดที่ขึ้นต้นด้วย `การชำระด้วย QR ของ SCB (Thai QR Tag 30` ในหัวข้อ "หลังรุ่นแรก" เพิ่มย่อหน้า:

```md
โปรโมชัน (ลดท้ายบิลเป็นบาทหรือเปอร์เซ็นต์ พร้อมเพดาน ยอดขั้นต่ำ วันที่ วันในสัปดาห์ ช่วงเวลา และสิทธิ์สมาชิก) ทำแล้วบน branch `ohmattpon/promotions` ตามแบบออกแบบ `specs/2026-10-15-promotions-design.md` ราคาถูกตรึงด้วย quote ก่อนชำระและก่อนสร้าง QR ยังไม่ทำ: จำกัดจำนวนครั้งที่ใช้ คูปอง ซื้อแถม แต้ม โปรโมชันต่อสาขา และรายงานแยกตามโปรโมชัน
```

- [ ] **Step 5: ตรวจปิดงานทั้งหมด**

Run (ที่ root; ต้องมี PostgreSQL ทดสอบ):

```bash
bun run typecheck && bun run test && bun run lint && (cd apps/api && bun run openapi:check) && (cd apps/web && bun run build)
```

Expected: ทุกคำสั่งผ่าน

Run (ต้องมีฐานข้อมูลที่พอร์ต 5433 ตามที่ `e2e/run.ts` ใช้ ถ้าไม่มี ให้หยุดและถามเจ้าของโครงการ ห้ามเปิด Docker เอง):

```bash
bun run e2e && bun run screenshots
```

Expected: e2e ผ่านทุกข้อ (รวมหัวข้อ "Promotions") แล้วเปิดดูภาพใน `screenshots/` ด้วยตา โดยเฉพาะ `23-promotions` และหน้าขายที่มีแถวโปรโมชัน ที่ 390, 768 และ 1366px ว่าไม่ล้น ปุ่มกดได้ และข้อความไม่ตัดผิดที่

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e AGENTS.md docs/superpowers/roadmap.md
gitcz --non-interactive --type=docs --scope=promotions --subject="document promotions and check them in the browser"
```

- [ ] **Step 7: รายงาน**

รายงานเจ้าของโครงการว่า commit อยู่ในเครื่องบน `ohmattpon/promotions` แล้ว รายการสิ่งที่ตรวจ (typecheck, test, lint, openapi:check, build, e2e, screenshots) พร้อมผลจริง และสิ่งที่ยังไม่ได้ทำตาม spec ห้าม merge หรือเปิด PR เอง และ push ได้เฉพาะเมื่อเจ้าของโครงการสั่งตามกฎ `ohmattpon/*`

---

## Self-Review (ตรวจเทียบกับ spec)

| ข้อของ spec | ที่ทำใน task |
|---|---|
| 1 ข้อมูลโปรโมชัน (ช่อง กติกา ปิดใช้ ห้ามลบ) | Task 2, 4, 5 |
| 2 สูตร (ปัดเศษ เพดาน ช่วงเวลา ข้ามเที่ยงคืน tie-break) | Task 2 |
| 3 quote (สิ่งที่ตรึง สถานะ การเลือกโปรโมชัน) | Task 3, 4, 6 |
| 4 checkout (`quoteId`, ตรงกับ quote, สมาชิกไม่ตรวจซ้ำ, ลำดับล็อก, `QUOTE_REQUIRED`) | Task 7, 8 |
| 5 QR (ยอดไม่เกิน quote, จอง ปล่อย ปิด) | Task 9, 11 |
| 6 ออเดอร์ (quote จากออเดอร์ ล็อกขณะรอ QR) | Task 6, 10, 11 |
| 7 บิล (snapshot โปรโมชัน ใบเสร็จ) | Task 1, 8, 14 |
| 8 API และรหัสข้อผิดพลาด | Task 5, 6, 8, 9, 12, 13 (แปลใน `errors.ts`) |
| 9 สถาปัตยกรรม (domains/ports/modules) | Task 1–10 |
| 10 หน้าเว็บ (หน้าจัดการ ตะกร้า ปุ่มยกเลิกโปรโมชัน ขอ quote ตอนชำระ QR ใบเสร็จ i18n ขนาดจอ) | Task 13, 14, 15 |
| 11 เกณฑ์ยอมรับและการทดสอบ | Task 1–3 (domain), 5, 6, 8, 9, 10 (use case), 11 (HTTP/PostgreSQL), 8 (regression ไม่ส่ง quote), 15 (browser, ปิดงาน) |

ข้อที่ spec กำหนดไว้แต่แผนเลือกวิธีทำต่างจากถ้อยคำ (ทั้งหมดอยู่ใน spec ที่แก้แล้ว): การกันแก้ออเดอร์อยู่ที่ `GuardedOrderRepository` แทนการถามในทุก use case, quote เก็บ `sale_id` แทน `sales.quote_id`, ช่องส่วนลดกรอกเองถูกปิดจนกว่าจะกด "ยกเลิกโปรโมชัน" แทนการถามยืนยัน
