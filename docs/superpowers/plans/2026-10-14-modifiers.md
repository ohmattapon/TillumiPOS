# ตัวเลือกเสริมของสินค้า (Modifiers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เจ้าของตั้งกลุ่มตัวเลือกของสินค้า (ราคาเพิ่มและต้นทุนต่อตัวเลือก) แคชเชียร์เลือกตอนขายและตอนเพิ่มลงออเดอร์ ยอดบิล กำไร และใบเสร็จรวมตัวเลือกถูกต้อง

**Architecture:** โมดูล API ใหม่ `modifiers` (ต้นแบบ `categories`) เก็บกลุ่ม ตัวเลือก และการผูกกับสินค้า ฟังก์ชันล้วน `resolveLineOptions` ในโดเมนตรวจกฎและคิดราคา/ต้นทุน ถูกเรียกผ่าน port `ILineOptionsResolver` จากทั้งออเดอร์และ `SaleCheckout` ตัวเลือกที่เลือกถูก snapshot เป็น JSON บนบรรทัดออเดอร์และบรรทัดบิล ตัวระบุบรรทัดคือ `productId` + ชุด option id ฝั่งเว็บเพิ่มหน้า `/modifiers` ส่วนเลือกกลุ่มในฟอร์มสินค้า และ dialog เลือกตัวเลือกในหน้า POS

**Tech Stack:** Bun, Elysia, Drizzle (PostgreSQL), tsyringe, zod · React 19, TanStack Query, zustand, i18next · Playwright (`bun run e2e`)

**Spec:** `docs/superpowers/specs/2026-10-14-modifiers-design.md`

## ข้อปรับจาก spec (ตกลงตอนวางแผน เพราะเห็นโค้ดจริงแล้ว)

| ใน spec | ในแผนนี้ | เหตุผล |
|---|---|---|
| คำตอบสินค้าเพิ่ม `modifierGroupIds` | **ไม่แก้คำตอบของสินค้า** คำตอบของกลุ่มมี `productIds` แทน | ไม่ต้องให้โมดูล `products` รู้จัก `modifiers` เว็บรู้ว่าสินค้าไหนมีกลุ่มอะไรจากรายการกลุ่ม |
| `lineId` คือ id แถวของ `order_items` | เหมือนเดิม แต่ `OrderRepository.save` เปลี่ยนจาก "ลบแล้วใส่ใหม่ทั้งหมด" เป็น "เทียบทีละบรรทัด" | ถ้าลบแล้วใส่ใหม่ id จะเปลี่ยนทุกครั้งที่บันทึก |
| เส้นทางอยู่ใต้ `/api/v1` | อยู่ใต้ `/api/v1/catalog/...` (`/catalog/modifier-groups`, `/catalog/modifier-options/:id`, `PUT /catalog/products/:id/modifier-groups`) | ตรงกับ `categories` และ `products` ที่อยู่ใต้ `/catalog` อยู่แล้ว |
| ไม่ได้ระบุชื่อซ้ำ | ชื่อกลุ่มห้ามซ้ำ และชื่อตัวเลือกห้ามซ้ำในกลุ่มเดียวกัน (`DUPLICATE` 409) | เหมือนหมวดหมู่ กันเจ้าของสร้างซ้ำโดยไม่ตั้งใจ |

## Global Constraints

- **ห้าม push เด็ดขาด** (`git push` ทุกรูปแบบ, `gh pr create`, `gh repo sync`) commit อยู่ในเครื่องแล้วรอเจ้าของโครงการ push เอง
- commit ด้วย `gitcz --non-interactive --type=<feat|fix|refactor|test|docs|style|perf|ci|chore> --scope=<scope> --subject="…" --body="…"` เท่านั้น ห้าม `git commit`/`--amend` ห้ามใช้ type `build` และ stage เฉพาะไฟล์ของ commit นั้น (ห้าม `git add -A`)
- ท้าย `--body` ของทุก commit ใส่บรรทัด `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- ทำงานบน branch `ohmattpon/modifiers` ห้าม merge เข้า `main` ห้ามลบ branch
- **ห้ามบันทึก `test/openapi-baseline.json` และ `test/openapi-v2-baseline.json` ใหม่จนกว่าเจ้าของโครงการอนุมัติ** (Task 12)
- จำนวนเงินเป็นจำนวนเต็มสตางค์ ไม่เกิน `MAX_AMOUNT_SATANG` (`domains/sale.domain.ts`)
- API: Hexagonal + CQRS หนึ่ง use case หนึ่งไฟล์ `execute()` รับ `unknown` แล้ว parse ด้วย zod, ติดต่อข้ามโมดูลผ่าน port + token, repository ใช้ `currentExecutor()`, ข้อผิดพลาดเป็น domain error พร้อมข้อความไทยและ `code` คงที่
- `domains/` import ได้เฉพาะ `domains/` ด้วยกัน ห้ามมี Elysia/Drizzle/tsyringe/zod
- v1 เพิ่มได้อย่างเดียว ห้ามลบหรือเปลี่ยนชนิดช่องเดิม
- เว็บ: ข้อความทุกตัวผ่าน `t()` และ `features/<f>/locales.ts` (`en` ใช้ `satisfies typeof th`), เงินผ่าน `useFormat()`, ห้ามเขียน `฿` หรือ `/ 100` เอง, query key ผ่าน key factory, คอมโพเนนต์ห้ามเรียก `api`/`unwrap` ตรง, import ข้าม feature ผ่าน `index.ts`, ห้ามคัดลอกข้อมูลเซิร์ฟเวอร์เข้า zustand
- คำสั่งตรวจ: `bun run typecheck`, `bun run test` (ต้องเปิด Docker DB: `bun run db:up`), `bun run lint`, `bun run e2e` รันจาก root ของ repo ก่อนบอกว่าเสร็จต้องผ่าน `typecheck` และ `test`

## Review Focus

กรณีที่ spec ไม่ได้พูดถึงตรง ๆ แต่ผู้ใช้จริงจะเจอ (แต่ละข้อมีการทดสอบกำกับใน task ที่ระบุ)

1. **client v1 เดิมเพิ่มสินค้าที่มีกลุ่มบังคับเลือกโดยไม่ส่ง `options`** ต้องได้ `MODIFIER_REQUIRED` ที่อ่านเข้าใจได้ ไม่ใช่ error ทั่วไป และห้ามได้บรรทัดที่ไม่มีตัวเลือกเงียบ ๆ (Task 5, 6)
2. **แยกสินค้าเดียวกันเป็นหลายบรรทัดเพื่อเลี่ยงการตรวจสต็อก** สต็อก 3 ขอรวม 2 + 2 ต้องถูกปฏิเสธ `INSUFFICIENT_STOCK` (Task 6)
3. **ปิดตัวเลือกหลังบรรทัดอยู่ในออเดอร์แล้ว** ออเดอร์ที่เปิดอยู่ยังชำระได้ด้วยตัวเลือกและราคาที่ quote ไว้ แต่เพิ่มตัวเลือกนั้นใหม่ไม่ได้ (`MODIFIER_NOT_AVAILABLE`) (Task 5, 6)
4. **แก้หรือลบบรรทัดด้วย `lineId` ของออเดอร์อื่นหรือสาขาอื่น** ต้องได้ `ORDER_ITEM_NOT_FOUND`/`ORDER_NOT_FOUND` ไม่แตะบรรทัดของคนอื่น (Task 5)
5. **เล่นซ้ำคำสั่งขาย v2 ที่เก็บ snapshot ไว้ก่อนมีฟีเจอร์นี้** (บรรทัดไม่มี `options`) ต้องคืนบิลที่ `options` เป็น `[]` ไม่ทำให้การตอบล้มเหลว (Task 6)

---

## โครงสร้างไฟล์

**API (`apps/api/src`)**

| ไฟล์ | หน้าที่ |
|---|---|
| `domains/modifier.domain.ts` (+ `.test.ts`) | entity กลุ่มและตัวเลือก, `resolveLineOptions`, `lineKey`, ชนิด `LineOption` |
| `infrastructure/database/schema/modifiers.ts` | ตาราง `modifier_groups`, `modifier_options`, `product_modifier_groups` |
| `infrastructure/database/schema/orders.ts`, `sales.ts` | เพิ่ม `options`, `options_key` |
| `modules/modifiers/**` | ports, repository, use cases, controller, module |
| `modules/modifiers/applications/ports/line-options-resolver.port.ts` | port ที่ orders และ sales ใช้ |
| `domains/order.domain.ts` | `OrderItem` มี `lineId`, `options`; รวมบรรทัดด้วย `productId` + ชุดตัวเลือก |
| `modules/orders/**` | แก้ use case เพิ่ม/เปิดออเดอร์, use case ใหม่แก้/ลบด้วย `lineId`, repository เทียบบรรทัด |
| `domains/sale.domain.ts`, `modules/sales/**` | `SaleItem.options`, ราคา/ต้นทุนรวมตัวเลือก, `SaleCheckout` แยกบรรทัดตามตัวเลือก |

**เว็บ (`apps/web/src`)**

| ไฟล์ | หน้าที่ |
|---|---|
| `features/modifiers/**` | หน้า `/modifiers`, query/mutation, locales |
| `features/pos/lib/cart.ts` | คิดราคาบรรทัดรวมตัวเลือก (ฟังก์ชันล้วน) |
| `features/pos/store/cart.store.ts` | บรรทัดตะกร้าเก็บ `productId`, `optionIds`, `quantity` |
| `features/pos/components/OptionsDialog.tsx` | dialog เลือกตัวเลือก |
| `features/products/components/ProductFormDialog.tsx` | เลือกกลุ่มที่ผูก |
| `features/sales/components/Receipt.tsx`, `features/pos/components/CartPanel.tsx` | แสดงตัวเลือกเป็นบรรทัดย่อย |

---

### Task 1: โดเมนตัวเลือกและ `resolveLineOptions`

**Files:**
- Create: `apps/api/src/domains/modifier.domain.ts`
- Test: `apps/api/src/domains/modifier.domain.test.ts`
- Modify: `apps/api/package.json` (exports), `apps/api/src/types.ts`

**Interfaces:**
- Produces:
  - `ModifierGroupEntity`, `ModifierGroupProps`, `ModifierOptionEntity`, `ModifierOptionProps`
  - `LineOption = { groupId; groupName; optionId; name; priceSatang; costSatang }`
  - `ModifierGroupWithOptions = { group: GroupRules; options: readonly OptionData[] }`
  - `ResolvedLineOptions = { options: LineOption[]; priceSatang: number; costSatang: number; key: string }`
  - `resolveLineOptions(groups, selectedOptionIds): ResolvedLineOptions`
  - `lineKey(options: readonly { optionId: number }[]): string` (id เรียงน้อยไปมาก คั่น `-` ไม่มีตัวเลือก = `''`)
  - `MAX_GROUP_SELECTIONS = 20`

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว** `apps/api/src/domains/modifier.domain.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import {
  lineKey,
  MAX_GROUP_SELECTIONS,
  ModifierGroupEntity,
  ModifierOptionEntity,
  resolveLineOptions,
  type ModifierGroupProps,
  type ModifierOptionProps,
} from './modifier.domain'

const group = (overrides: Partial<ModifierGroupProps> = {}) =>
  new ModifierGroupEntity({ id: 1, name: 'ระดับความหวาน', required: true, maxSelections: 1, sortOrder: 0, isActive: true, ...overrides })
const option = (overrides: Partial<ModifierOptionProps> = {}) =>
  new ModifierOptionEntity({ id: 10, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true, ...overrides })

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
  return undefined
}

describe('ModifierGroupEntity', () => {
  test('keeps a valid group and copies it with changes', () => {
    const changed = group().with({ name: 'ท็อปปิง', required: false, maxSelections: 3 })

    expect(changed.toSnapshot()).toEqual({ id: 1, name: 'ท็อปปิง', required: false, maxSelections: 3, sortOrder: 0, isActive: true })
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['no selections allowed', { maxSelections: 0 }],
    ['more selections than the limit', { maxSelections: MAX_GROUP_SELECTIONS + 1 }],
    ['a fractional limit', { maxSelections: 1.5 }],
    ['a fractional sort order', { sortOrder: 0.5 }],
  ])('rejects %s', (_label, overrides) => {
    expect(codeOf(() => group(overrides as Partial<ModifierGroupProps>))).toBe('INVALID_MODIFIER')
  })
})

describe('ModifierOptionEntity', () => {
  test('keeps a free option and an option with a price and cost', () => {
    expect(option().priceSatang).toBe(0)
    expect(option({ priceSatang: 1000, costSatang: 400 }).with({ priceSatang: 1200 }).toSnapshot()).toMatchObject({
      priceSatang: 1200,
      costSatang: 400,
    })
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a negative price', { priceSatang: -1 }],
    ['a fractional price', { priceSatang: 0.5 }],
    ['a negative cost', { costSatang: -1 }],
  ])('rejects %s', (_label, overrides) => {
    expect(codeOf(() => option(overrides as Partial<ModifierOptionProps>))).toBe('INVALID_MODIFIER')
  })
})

describe('lineKey', () => {
  test('is the sorted ids, and empty without options', () => {
    expect(lineKey([])).toBe('')
    expect(lineKey([{ optionId: 21 }, { optionId: 10 }, { optionId: 20 }])).toBe('10-20-21')
  })
})

describe('resolveLineOptions', () => {
  const sweetness = { group: group(), options: [option({ id: 10 }), option({ id: 11, name: 'หวานมาก' })] }
  const toppings = {
    group: group({ id: 2, name: 'ท็อปปิง', required: false, maxSelections: 2 }),
    options: [
      option({ id: 20, groupId: 2, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }),
      option({ id: 21, groupId: 2, name: 'วุ้น', priceSatang: 500, costSatang: 200 }),
      option({ id: 22, groupId: 2, name: 'ครีมชีส', priceSatang: 1500, costSatang: 700 }),
    ],
  }
  const groups = [sweetness, toppings]

  test('snapshots the chosen options in group order, with the price, cost and key', () => {
    const resolved = resolveLineOptions(groups, [21, 10, 20])

    expect(resolved.options.map((item) => item.name)).toEqual(['หวานน้อย', 'ไข่มุก', 'วุ้น'])
    expect(resolved.options[1]).toEqual({
      groupId: 2,
      groupName: 'ท็อปปิง',
      optionId: 20,
      name: 'ไข่มุก',
      priceSatang: 1000,
      costSatang: 400,
    })
    expect(resolved).toMatchObject({ priceSatang: 1500, costSatang: 600, key: '10-20-21' })
  })

  test('the order the ids are sent in does not change the result', () => {
    expect(resolveLineOptions(groups, [20, 10])).toEqual(resolveLineOptions(groups, [10, 20]))
  })

  test('an optional group may be left empty', () => {
    expect(resolveLineOptions(groups, [10])).toMatchObject({ priceSatang: 0, key: '10' })
  })

  test('a product without groups resolves to nothing', () => {
    expect(resolveLineOptions([], [])).toEqual({ options: [], priceSatang: 0, costSatang: 0, key: '' })
  })

  test('a required group needs a choice', () => {
    expect(codeOf(() => resolveLineOptions(groups, []))).toBe('MODIFIER_REQUIRED')
    expect(codeOf(() => resolveLineOptions(groups, [20]))).toBe('MODIFIER_REQUIRED')
  })

  test('cannot choose more than the group allows', () => {
    expect(codeOf(() => resolveLineOptions(groups, [10, 11]))).toBe('MODIFIER_TOO_MANY')
    expect(codeOf(() => resolveLineOptions(groups, [10, 20, 21, 22]))).toBe('MODIFIER_TOO_MANY')
  })

  test('cannot choose the same option twice', () => {
    expect(codeOf(() => resolveLineOptions(groups, [10, 10]))).toBe('MODIFIER_DUPLICATE')
  })

  test('an option that is not on this product is not available', () => {
    expect(codeOf(() => resolveLineOptions(groups, [10, 99]))).toBe('MODIFIER_NOT_AVAILABLE')
  })

  test('a deactivated option or an option of a deactivated group is not available', () => {
    const closedOption = { group: group({ required: false }), options: [option({ id: 10, isActive: false })] }
    const closedGroup = { group: group({ id: 2, isActive: false }), options: [option({ id: 30, groupId: 2 })] }

    expect(codeOf(() => resolveLineOptions([closedOption], [10]))).toBe('MODIFIER_NOT_AVAILABLE')
    expect(codeOf(() => resolveLineOptions([closedGroup], [30]))).toBe('MODIFIER_NOT_AVAILABLE')
  })

  test('a deactivated required group asks for nothing', () => {
    const closed = { group: group({ isActive: false }), options: [option({ id: 10 })] }

    expect(resolveLineOptions([closed], [])).toMatchObject({ options: [], key: '' })
  })

  test('carries the group name and limit in the error so the screen can say which group', () => {
    try {
      resolveLineOptions(groups, [])
    } catch (error) {
      expect(error).toMatchObject({ code: 'MODIFIER_REQUIRED', params: { group: 'ระดับความหวาน' } })
      return
    }
    throw new Error('expected a throw')
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/modifier.domain.test.ts`
Expected: FAIL (`Cannot find module './modifier.domain'`)

- [ ] **Step 3: เขียนโค้ด** `apps/api/src/domains/modifier.domain.ts`

ก่อนเขียน เปิด `apps/api/src/domains/errors/domain-error.ts` ดูว่า `DomainError` เก็บพารามิเตอร์ชื่อ `params` (การทดสอบข้างบนอ่าน `error.params`) ถ้าชื่อฟิลด์ต่างจากนี้ ให้แก้การทดสอบให้ตรงกับชื่อจริง

```ts
import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

export const MAX_GROUP_SELECTIONS = 20
const MAX_NAME_LENGTH = 100

const invalid = (message: string) => new DomainError(message, 'INVALID_MODIFIER')
const isName = (value: string) => value.length >= 1 && value.length <= MAX_NAME_LENGTH
const isMoney = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT_SATANG
const definedOnly = <T extends object>(changes: T) =>
  Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as T

export interface ModifierGroupProps {
  /** 0 until the group has been stored. */
  id: number
  name: string
  /** At least one option must be chosen. */
  required: boolean
  /** 1 = pick one; more = pick up to this many. */
  maxSelections: number
  sortOrder: number
  isActive: boolean
}

export class ModifierGroupEntity {
  public readonly id: number
  public readonly name: string
  public readonly required: boolean
  public readonly maxSelections: number
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: ModifierGroupProps) {
    if (!isName(props.name)) throw invalid(`ชื่อกลุ่มตัวเลือกต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`)
    if (!Number.isInteger(props.maxSelections) || props.maxSelections < 1 || props.maxSelections > MAX_GROUP_SELECTIONS)
      throw invalid(`จำนวนที่เลือกได้สูงสุดต้องเป็นจำนวนเต็ม 1 ถึง ${MAX_GROUP_SELECTIONS}`)
    if (!Number.isInteger(props.sortOrder)) throw invalid('ลำดับการแสดงผลต้องเป็นจำนวนเต็ม')

    this.id = props.id
    this.name = props.name
    this.required = props.required
    this.maxSelections = props.maxSelections
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; undefined fields keep their current value. */
  with(changes: Partial<Omit<ModifierGroupProps, 'id'>>): ModifierGroupEntity {
    return new ModifierGroupEntity({ ...this.toSnapshot(), ...definedOnly(changes) })
  }

  toSnapshot(): ModifierGroupProps {
    return {
      id: this.id,
      name: this.name,
      required: this.required,
      maxSelections: this.maxSelections,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
    }
  }
}

export interface ModifierOptionProps {
  /** 0 until the option has been stored. */
  id: number
  groupId: number
  name: string
  /** Added to the unit price of the line, satang. */
  priceSatang: number
  /** Added to the unit cost of the line, satang. */
  costSatang: number
  sortOrder: number
  isActive: boolean
}

export class ModifierOptionEntity {
  public readonly id: number
  public readonly groupId: number
  public readonly name: string
  public readonly priceSatang: number
  public readonly costSatang: number
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: ModifierOptionProps) {
    if (!isName(props.name)) throw invalid(`ชื่อตัวเลือกต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`)
    if (!isMoney(props.priceSatang) || !isMoney(props.costSatang))
      throw invalid('ราคาเพิ่มและต้นทุนต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ')
    if (!Number.isInteger(props.sortOrder)) throw invalid('ลำดับการแสดงผลต้องเป็นจำนวนเต็ม')

    this.id = props.id
    this.groupId = props.groupId
    this.name = props.name
    this.priceSatang = props.priceSatang
    this.costSatang = props.costSatang
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  with(changes: Partial<Omit<ModifierOptionProps, 'id' | 'groupId'>>): ModifierOptionEntity {
    return new ModifierOptionEntity({ ...this.toSnapshot(), ...definedOnly(changes) })
  }

  toSnapshot(): ModifierOptionProps {
    return {
      id: this.id,
      groupId: this.groupId,
      name: this.name,
      priceSatang: this.priceSatang,
      costSatang: this.costSatang,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
    }
  }
}

/** One chosen option, kept on an order or sale line exactly as it was when it was chosen. */
export interface LineOption {
  groupId: number
  groupName: string
  optionId: number
  name: string
  priceSatang: number
  costSatang: number
}

/** The part of a group the rules read; entities and the web's plain objects both satisfy it. */
export type GroupRules = Pick<ModifierGroupProps, 'id' | 'name' | 'required' | 'maxSelections' | 'isActive'>
export type OptionData = Pick<ModifierOptionProps, 'id' | 'name' | 'priceSatang' | 'costSatang' | 'isActive'>
export interface ModifierGroupWithOptions {
  group: GroupRules
  options: readonly OptionData[]
}

export interface ResolvedLineOptions {
  /** In group order, then option order. */
  options: LineOption[]
  priceSatang: number
  costSatang: number
  key: string
}

/** Identifies the choice on a line: the same product with the same options is the same line. */
export function lineKey(options: readonly { optionId: number }[]): string {
  return options
    .map((option) => option.optionId)
    .sort((a, b) => a - b)
    .join('-')
}

/**
 * The one rule for what may be chosen on a product, shared by the server and the till. `groups` are
 * the groups offered on the product; `selectedOptionIds` what was chosen. Throws a DomainError that
 * names the group when the choice breaks a rule.
 */
export function resolveLineOptions(
  groups: readonly ModifierGroupWithOptions[],
  selectedOptionIds: readonly number[],
): ResolvedLineOptions {
  const chosen = new Set<number>()
  for (const id of selectedOptionIds) {
    if (chosen.has(id)) throw new DomainError('เลือกตัวเลือกเดียวกันซ้ำไม่ได้', 'MODIFIER_DUPLICATE')
    chosen.add(id)
  }

  const offered = new Map<number, { group: GroupRules; option: OptionData }>()
  for (const { group, options } of groups) for (const option of options) offered.set(option.id, { group, option })
  for (const id of chosen) {
    const found = offered.get(id)
    if (!found || !found.group.isActive || !found.option.isActive)
      throw new DomainError('ตัวเลือกนี้ใช้กับสินค้านี้ไม่ได้', 'MODIFIER_NOT_AVAILABLE', { optionId: id })
  }

  const resolved: LineOption[] = []
  for (const { group, options } of groups) {
    if (!group.isActive) continue
    const picked = options.filter((option) => chosen.has(option.id))
    if (group.required && picked.length === 0)
      throw new DomainError(`กรุณาเลือก "${group.name}"`, 'MODIFIER_REQUIRED', { group: group.name })
    if (picked.length > group.maxSelections)
      throw new DomainError(
        `"${group.name}" เลือกได้ไม่เกิน ${group.maxSelections} อย่าง`,
        'MODIFIER_TOO_MANY',
        { group: group.name, max: group.maxSelections },
      )
    for (const option of picked)
      resolved.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        name: option.name,
        priceSatang: option.priceSatang,
        costSatang: option.costSatang,
      })
  }

  return {
    options: resolved,
    priceSatang: resolved.reduce((total, option) => total + option.priceSatang, 0),
    costSatang: resolved.reduce((total, option) => total + option.costSatang, 0),
    key: lineKey(resolved),
  }
}
```

- [ ] **Step 4: ส่งออกให้เว็บใช้ฟังก์ชันเดียวกัน** แก้ `apps/api/package.json` เพิ่มบรรทัดใน `exports` ต่อจาก `./shop-settings`

```json
    "./shop-settings": "./src/domains/shop-settings.domain.ts",
    "./modifiers": "./src/domains/modifier.domain.ts"
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/modifier.domain.test.ts`
Expected: PASS ทุกกรณี

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/modifier.domain.ts apps/api/src/domains/modifier.domain.test.ts apps/api/package.json
gitcz --non-interactive --type=feat --scope=modifiers --subject="add modifier groups, options and the rule for choosing them" --body="resolveLineOptions is the one rule shared by the server and the till: required groups, the maximum, duplicates, and options that are not offered or are deactivated.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ตารางและ migration `0012_modifiers`

**Files:**
- Create: `apps/api/src/infrastructure/database/schema/modifiers.ts`
- Modify: `apps/api/src/infrastructure/database/schema/index.ts`, `orders.ts`, `sales.ts`
- Create (generated): `apps/api/drizzle/0012_modifiers.sql` + ไฟล์ใน `apps/api/drizzle/meta/`

**Interfaces:**
- Produces: ตาราง `modifierGroups`, `modifierOptions`, `productModifierGroups`; คอลัมน์ `orderItems.options`, `orderItems.optionsKey`, `saleItems.options`; ชนิด `StoredLineOption`

- [ ] **Step 1: เขียน schema ใหม่** `apps/api/src/infrastructure/database/schema/modifiers.ts`

```ts
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { products } from './products'

/** An option chosen on an order or sale line, as it was when chosen (see LineOption in the domain). */
export interface StoredLineOption {
  groupId: number
  groupName: string
  optionId: number
  name: string
  priceSatang: number
  costSatang: number
}

// Groups of options such as "sweetness" or "toppings", shared by every product they are offered on.
export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: id(),
    name: text().notNull().unique(),
    required: boolean().notNull().default(false),
    maxSelections: integer().notNull().default(1),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [check('modifier_groups_max_selections', sql`${table.maxSelections} between 1 and 20`)],
)

export const modifierOptions = pgTable(
  'modifier_options',
  {
    id: id(),
    groupId: integer()
      .notNull()
      .references(() => modifierGroups.id),
    name: text().notNull(),
    priceSatang: integer().notNull().default(0),
    costSatang: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index().on(table.groupId),
    unique().on(table.groupId, table.name),
    check('modifier_options_non_negative', sql`${table.priceSatang} >= 0 and ${table.costSatang} >= 0`),
  ],
)

// Which groups a product offers, in the order they are asked.
export const productModifierGroups = pgTable(
  'product_modifier_groups',
  {
    productId: integer()
      .notNull()
      .references(() => products.id),
    groupId: integer()
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.productId, table.groupId] }), index().on(table.groupId)],
)
```

- [ ] **Step 2: ส่งออกจาก index** แก้ `schema/index.ts` เพิ่ม `export * from './modifiers'` ต่อจาก `export * from './categories'`

- [ ] **Step 3: เพิ่มคอลัมน์ในออเดอร์** แก้ `schema/orders.ts`

เพิ่ม import `jsonb`:

```ts
import { index, integer, jsonb, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core'
```

และ `import type { StoredLineOption } from './modifiers'` แล้วแก้ตาราง `orderItems`:

```ts
    unitPriceSatang: integer().notNull(),
    quantity: integer().notNull(),
    // The options chosen, as they were when the item was ordered. Existing rows have none.
    options: jsonb().$type<StoredLineOption[]>().notNull().default([]),
    // The chosen option ids, sorted and joined: the same product with different options is a different line.
    optionsKey: text().notNull().default(''),
  },
  (table) => [unique().on(table.orderId, table.productId, table.optionsKey)],
)
```

- [ ] **Step 4: เพิ่มคอลัมน์ในรายการบิล** แก้ `schema/sales.ts` เพิ่ม `jsonb` ใน import จาก `drizzle-orm/pg-core`, `import type { StoredLineOption } from './modifiers'` และใน `saleItems` ต่อจาก `lineTotalSatang`:

```ts
    lineTotalSatang: integer().notNull(),
    // The options chosen, as they were when sold. Their price and cost are already in the unit price and cost.
    options: jsonb().$type<StoredLineOption[]>().notNull().default([]),
```

- [ ] **Step 5: สร้าง migration**

Run: `cd apps/api && bun run db:generate --name modifiers`
Expected: สร้าง `drizzle/0012_modifiers.sql` ตรวจว่ามี `CREATE TABLE "modifier_groups"`, `"modifier_options"`, `"product_modifier_groups"`, `ALTER TABLE "order_items" ADD COLUMN "options"` และ `"options_key"`, `ALTER TABLE "sale_items" ADD COLUMN "options"`, ลบ unique เดิม `order_items_order_id_product_id_unique` แล้วเพิ่ม unique ใหม่ที่มี `options_key` ถ้า drizzle-kit ถามคำถามแบบโต้ตอบ ให้หยุดแล้วรายงาน

- [ ] **Step 6: ใช้กับฐานข้อมูล dev และตรวจ**

Run (จาก root): `bun run db:migrate` แล้ว `bun run typecheck`
Expected: migrate สำเร็จ, typecheck ผ่าน (ยังไม่มีโค้ดอื่นอ้างคอลัมน์ใหม่)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/infrastructure/database/schema apps/api/drizzle
gitcz --non-interactive --type=feat --scope=modifiers --subject="add the tables for modifier groups and options, and the options kept on order and sale lines" --body="Existing order and sale lines get empty options. The order line is now unique by product and options, so the same product with different options can sit on one order.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: โมดูล `modifiers` ฝั่ง API

**Files:**
- Create: `apps/api/src/modules/modifiers/modifiers.module.ts`
- Create: `apps/api/src/modules/modifiers/applications/ports/modifier.repository.ts`
- Create: `apps/api/src/modules/modifiers/applications/ports/line-options-resolver.port.ts`
- Create: `apps/api/src/modules/modifiers/applications/schemas/modifier-schemas.ts`
- Create: `apps/api/src/modules/modifiers/applications/services/line-options-resolver.ts`
- Create: `apps/api/src/modules/modifiers/applications/usecases/{list-modifier-groups,create-modifier-group,update-modifier-group,create-modifier-option,update-modifier-option,set-product-modifier-groups}.usecase.ts`
- Create: `apps/api/src/modules/modifiers/adapters/repository/modifier.drizzle.repository.ts`
- Create: `apps/api/src/modules/modifiers/adapters/controllers/modifier.controller.ts`
- Create: `apps/api/src/modules/modifiers/adapters/controllers/schemas/modifier.schema.ts`
- Test: `apps/api/src/modules/modifiers/applications/usecases/modifiers.usecases.test.ts`
- Test: `apps/api/src/__tests__/integration/modifiers.integration.test.ts`
- Modify: `apps/api/src/modules/di-registrations.ts`, `apps/api/src/modules/app.module.ts`, `apps/api/src/__tests__/mocks.ts`, `apps/api/src/__tests__/factories.ts`, `apps/api/src/types.ts`

**Interfaces:**
- Consumes: `ModifierGroupEntity`, `ModifierOptionEntity`, `ModifierGroupWithOptions`, `resolveLineOptions` (Task 1); `productRepositoryToken`/`IProductRepository.findById(id, branchId)`; `TOKENS.UnitOfWork`
- Produces:
  - `ModifierGroupView = { group: ModifierGroupEntity; options: ModifierOptionEntity[]; productIds: number[] }`
  - `IModifierRepository`, `modifierRepositoryToken`
  - `ILineOptionsResolver { resolve(productId: number, optionIds: readonly number[]): Promise<ResolvedLineOptions> }`, `lineOptionsResolverToken`
  - HTTP: `GET/POST /catalog/modifier-groups`, `PATCH /catalog/modifier-groups/:id`, `POST /catalog/modifier-groups/:id/options`, `PATCH /catalog/modifier-options/:id`, `PUT /catalog/products/:id/modifier-groups` (body `{ groupIds }`)

- [ ] **Step 1: port ของ repository** `modifier.repository.ts`

```ts
import type {
  ModifierGroupEntity,
  ModifierGroupWithOptions,
  ModifierOptionEntity,
} from '../../../../domains/modifier.domain'

/** A group as the owner manages it: with its options and the products it is offered on. */
export interface ModifierGroupView {
  group: ModifierGroupEntity
  options: ModifierOptionEntity[]
  productIds: number[]
}

export interface IModifierRepository {
  /** Every group, active or not, ordered by sort order then name. */
  findAllGroups(): Promise<ModifierGroupView[]>
  findGroupView(id: number): Promise<ModifierGroupView | null>
  findGroupById(id: number): Promise<ModifierGroupEntity | null>
  findGroupsByIds(ids: number[]): Promise<ModifierGroupEntity[]>
  findOptionById(id: number): Promise<ModifierOptionEntity | null>
  /** The groups offered on a product with their options, in the order the product asks them. Inactive ones included. */
  findGroupsForProduct(productId: number): Promise<ModifierGroupWithOptions[]>
  /** Throws DomainConflictError DUPLICATE for a taken name. */
  createGroup(entity: ModifierGroupEntity): Promise<ModifierGroupEntity>
  updateGroup(entity: ModifierGroupEntity): Promise<ModifierGroupEntity>
  /** Throws DomainConflictError DUPLICATE for a name already in the group. */
  createOption(entity: ModifierOptionEntity): Promise<ModifierOptionEntity>
  updateOption(entity: ModifierOptionEntity): Promise<ModifierOptionEntity>
  /** Replaces the groups offered on a product; the order of the ids is the order they are asked in. */
  setProductGroups(productId: number, groupIds: number[]): Promise<void>
}

const modifierRepositoryTokenSymbol: unique symbol = Symbol('IModifierRepository')
export const modifierRepositoryToken = modifierRepositoryTokenSymbol.toString()
```

- [ ] **Step 2: port ที่โมดูลอื่นใช้** `line-options-resolver.port.ts`

```ts
import type { ResolvedLineOptions } from '../../../../domains/modifier.domain'

/**
 * Checks what was chosen on a product against the groups it offers, and prices it. The one way an
 * order or a sale learns what a choice of options costs, so the rules live in one place.
 */
export interface ILineOptionsResolver {
  /** Throws DomainError (MODIFIER_REQUIRED, MODIFIER_TOO_MANY, MODIFIER_DUPLICATE, MODIFIER_NOT_AVAILABLE). */
  resolve(productId: number, optionIds: readonly number[]): Promise<ResolvedLineOptions>
}

const lineOptionsResolverTokenSymbol: unique symbol = Symbol('ILineOptionsResolver')
export const lineOptionsResolverToken = lineOptionsResolverTokenSymbol.toString()
```

- [ ] **Step 3: zod schema** `modifier-schemas.ts`

```ts
import { z } from 'zod'
import { MAX_GROUP_SELECTIONS } from '../../../../domains/modifier.domain'

const name = z.string().min(1).max(100)
const sortOrder = z.number().int()
const maxSelections = z.number().int().min(1).max(MAX_GROUP_SELECTIONS)
const satang = z.number().int().min(0)

export const createModifierGroupSchema = z.object({
  name,
  required: z.boolean().optional(),
  maxSelections: maxSelections.optional(),
  sortOrder: sortOrder.optional(),
})

export const updateModifierGroupSchema = z
  .object({ name, required: z.boolean(), maxSelections, sortOrder, isActive: z.boolean() })
  .partial()

export const createModifierOptionSchema = z.object({
  name,
  priceSatang: satang.optional(),
  costSatang: satang.optional(),
  sortOrder: sortOrder.optional(),
})

export const updateModifierOptionSchema = z
  .object({ name, priceSatang: satang, costSatang: satang, sortOrder, isActive: z.boolean() })
  .partial()

export const setProductModifierGroupsSchema = z.object({
  groupIds: z.array(z.number().int().positive()).max(50),
})
```

- [ ] **Step 4: เขียนการทดสอบ use case ที่ล้มเหลว** แก้ `__tests__/mocks.ts` ก่อน (เพิ่ม import และ mock) แล้วเพิ่ม factory

`mocks.ts` เพิ่ม import:

```ts
import type { ILineOptionsResolver } from '../modules/modifiers/applications/ports/line-options-resolver.port'
import type { IModifierRepository } from '../modules/modifiers/applications/ports/modifier.repository'
```

และต่อท้ายไฟล์:

```ts
export const mockModifierRepository = (): Mocked<IModifierRepository> => ({
  findAllGroups: mock<IModifierRepository['findAllGroups']>(),
  findGroupView: mock<IModifierRepository['findGroupView']>(),
  findGroupById: mock<IModifierRepository['findGroupById']>(),
  findGroupsByIds: mock<IModifierRepository['findGroupsByIds']>(),
  findOptionById: mock<IModifierRepository['findOptionById']>(),
  findGroupsForProduct: mock<IModifierRepository['findGroupsForProduct']>(),
  createGroup: mock<IModifierRepository['createGroup']>(),
  updateGroup: mock<IModifierRepository['updateGroup']>(),
  createOption: mock<IModifierRepository['createOption']>(),
  updateOption: mock<IModifierRepository['updateOption']>(),
  setProductGroups: mock<IModifierRepository['setProductGroups']>(),
})

/** Resolves every choice to nothing by default: a product without option groups. */
export const mockLineOptionsResolver = (): Mocked<ILineOptionsResolver> => ({
  resolve: mock<ILineOptionsResolver['resolve']>(async () => ({ options: [], priceSatang: 0, costSatang: 0, key: '' })),
})
```

`factories.ts` เพิ่ม import และ factory:

```ts
import {
  ModifierGroupEntity,
  ModifierOptionEntity,
  type ModifierGroupProps,
  type ModifierOptionProps,
} from '../domains/modifier.domain'

export const makeModifierGroup = (overrides: Partial<ModifierGroupProps> = {}) =>
  new ModifierGroupEntity({ id: 1, name: 'ระดับความหวาน', required: true, maxSelections: 1, sortOrder: 0, isActive: true, ...overrides })

export const makeModifierOption = (overrides: Partial<ModifierOptionProps> = {}) =>
  new ModifierOptionEntity({ id: 10, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true, ...overrides })
```

สร้าง `modifiers.usecases.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeModifierGroup, makeModifierOption, makeProduct } from '../../../../__tests__/factories'
import { mockModifierRepository, mockProductRepository, mockUnitOfWork } from '../../../../__tests__/mocks'
import { CreateModifierGroupUseCase } from './create-modifier-group.usecase'
import { CreateModifierOptionUseCase } from './create-modifier-option.usecase'
import { ListModifierGroupsUseCase } from './list-modifier-groups.usecase'
import { SetProductModifierGroupsUseCase } from './set-product-modifier-groups.usecase'
import { UpdateModifierGroupUseCase } from './update-modifier-group.usecase'
import { UpdateModifierOptionUseCase } from './update-modifier-option.usecase'
import { LineOptionsResolver } from '../services/line-options-resolver'

let repo: ReturnType<typeof mockModifierRepository>

beforeEach(() => {
  repo = mockModifierRepository()
  repo.createGroup.mockImplementation(async (entity) => entity)
  repo.updateGroup.mockImplementation(async (entity) => entity)
  repo.createOption.mockImplementation(async (entity) => entity)
  repo.updateOption.mockImplementation(async (entity) => entity)
})

describe('ListModifierGroupsUseCase', () => {
  test('lists every group with its options and products', async () => {
    const view = { group: makeModifierGroup(), options: [makeModifierOption()], productIds: [4] }
    repo.findAllGroups.mockResolvedValue([view])

    expect(await new ListModifierGroupsUseCase(repo).execute()).toEqual([view])
  })
})

describe('CreateModifierGroupUseCase', () => {
  test('creates an optional single-choice group by default, with no options or products', async () => {
    const created = await new CreateModifierGroupUseCase(repo).execute({ name: 'ท็อปปิง' })

    expect(created.group.toSnapshot()).toEqual({
      id: 0,
      name: 'ท็อปปิง',
      required: false,
      maxSelections: 1,
      sortOrder: 0,
      isActive: true,
    })
    expect(created).toMatchObject({ options: [], productIds: [] })
  })

  test.each([
    ['an empty name', { name: '' }],
    ['no limit above zero', { name: 'x', maxSelections: 0 }],
    ['a limit above 20', { name: 'x', maxSelections: 21 }],
    ['a non-boolean required', { name: 'x', required: 'yes' }],
  ])('rejects %s before writing', async (_label, input) => {
    await expect(new CreateModifierGroupUseCase(repo).execute(input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.createGroup).not.toHaveBeenCalled()
  })
})

describe('UpdateModifierGroupUseCase', () => {
  test('changes only the given fields and answers with the group as the owner sees it', async () => {
    repo.findGroupById.mockResolvedValue(makeModifierGroup({ id: 3 }))
    const view = { group: makeModifierGroup({ id: 3, required: false }), options: [], productIds: [] }
    repo.findGroupView.mockResolvedValue(view)

    const updated = await new UpdateModifierGroupUseCase(repo).execute(3, { required: false })

    expect(repo.updateGroup.mock.calls[0]![0].toSnapshot()).toMatchObject({ id: 3, name: 'ระดับความหวาน', required: false })
    expect(updated).toBe(view)
  })

  test('an unknown group is not found and nothing is written', async () => {
    repo.findGroupById.mockResolvedValue(null)

    await expect(new UpdateModifierGroupUseCase(repo).execute(9, { name: 'x' })).rejects.toMatchObject({
      code: 'MODIFIER_GROUP_NOT_FOUND',
    })
    expect(repo.updateGroup).not.toHaveBeenCalled()
  })
})

describe('CreateModifierOptionUseCase', () => {
  test('adds a free option to a group when no price is given', async () => {
    repo.findGroupById.mockResolvedValue(makeModifierGroup({ id: 3 }))

    const created = await new CreateModifierOptionUseCase(repo).execute(3, { name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 })

    expect(created.toSnapshot()).toEqual({
      id: 0,
      groupId: 3,
      name: 'ไข่มุก',
      priceSatang: 1000,
      costSatang: 400,
      sortOrder: 0,
      isActive: true,
    })
  })

  test('a negative price is rejected before any read or write', async () => {
    await expect(new CreateModifierOptionUseCase(repo).execute(3, { name: 'x', priceSatang: -1 })).rejects.toBeInstanceOf(ZodError)
    expect(repo.findGroupById).not.toHaveBeenCalled()
  })

  test('an unknown group is not found', async () => {
    repo.findGroupById.mockResolvedValue(null)

    await expect(new CreateModifierOptionUseCase(repo).execute(9, { name: 'x' })).rejects.toMatchObject({
      code: 'MODIFIER_GROUP_NOT_FOUND',
    })
  })
})

describe('UpdateModifierOptionUseCase', () => {
  test('changes the price and deactivates, leaving the rest', async () => {
    repo.findOptionById.mockResolvedValue(makeModifierOption({ id: 10, groupId: 3, priceSatang: 500 }))

    const updated = await new UpdateModifierOptionUseCase(repo).execute(10, { priceSatang: 700, isActive: false })

    expect(updated.toSnapshot()).toMatchObject({ id: 10, groupId: 3, name: 'หวานน้อย', priceSatang: 700, isActive: false })
  })

  test('an unknown option is not found', async () => {
    repo.findOptionById.mockResolvedValue(null)

    await expect(new UpdateModifierOptionUseCase(repo).execute(9, { name: 'x' })).rejects.toMatchObject({
      code: 'MODIFIER_OPTION_NOT_FOUND',
    })
  })
})

describe('SetProductModifierGroupsUseCase', () => {
  let products: ReturnType<typeof mockProductRepository>
  let useCase: SetProductModifierGroupsUseCase

  beforeEach(() => {
    products = mockProductRepository()
    products.findById.mockResolvedValue(makeProduct({ id: 5 }))
    useCase = new SetProductModifierGroupsUseCase(repo, products, mockUnitOfWork())
  })

  test('replaces the groups of a product, keeping the order and dropping repeats', async () => {
    repo.findGroupsByIds.mockResolvedValue([makeModifierGroup({ id: 2 }), makeModifierGroup({ id: 1 })])

    const groupIds = await useCase.execute(5, { groupIds: [2, 1, 2] }, 1)

    expect(repo.setProductGroups).toHaveBeenCalledWith(5, [2, 1])
    expect(groupIds).toEqual([2, 1])
  })

  test('an empty list takes every group off the product', async () => {
    repo.findGroupsByIds.mockResolvedValue([])

    expect(await useCase.execute(5, { groupIds: [] }, 1)).toEqual([])
    expect(repo.setProductGroups).toHaveBeenCalledWith(5, [])
  })

  test('an unknown product or group is not found and nothing is written', async () => {
    products.findById.mockResolvedValueOnce(null)
    await expect(useCase.execute(9, { groupIds: [1] }, 1)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' })

    repo.findGroupsByIds.mockResolvedValue([makeModifierGroup({ id: 1 })])
    await expect(useCase.execute(5, { groupIds: [1, 8] }, 1)).rejects.toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
    expect(repo.setProductGroups).not.toHaveBeenCalled()
  })
})

describe('LineOptionsResolver', () => {
  test('asks the repository for the groups of the product and applies the rules', async () => {
    repo.findGroupsByIds.mockResolvedValue([])
    repo.findGroupsForProduct.mockResolvedValue([
      { group: makeModifierGroup({ id: 1, required: false }), options: [makeModifierOption({ id: 10, priceSatang: 300, costSatang: 100 })] },
    ])

    const resolved = await new LineOptionsResolver(repo).resolve(5, [10])

    expect(repo.findGroupsForProduct).toHaveBeenCalledWith(5)
    expect(resolved).toMatchObject({ priceSatang: 300, costSatang: 100, key: '10' })
  })

  test('a required group with no choice is refused', async () => {
    repo.findGroupsForProduct.mockResolvedValue([{ group: makeModifierGroup(), options: [makeModifierOption()] }])

    await expect(new LineOptionsResolver(repo).resolve(5, [])).rejects.toMatchObject({ code: 'MODIFIER_REQUIRED' })
  })
})
```

- [ ] **Step 5: รันให้เห็นว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/modifiers`
Expected: FAIL (module ไม่พบ)

- [ ] **Step 6: เขียน use case และ resolver**

`list-modifier-groups.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'

/** Query. */
@injectable()
export class ListModifierGroupsUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  execute() {
    return this.modifiers.findAllGroups()
  }
}
```

`create-modifier-group.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { ModifierGroupEntity } from '../../../../domains/modifier.domain'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository, ModifierGroupView } from '../ports/modifier.repository'
import { createModifierGroupSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class CreateModifierGroupUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(input: unknown): Promise<ModifierGroupView> {
    const dto = createModifierGroupSchema.parse(input)

    const group = await this.modifiers.createGroup(
      new ModifierGroupEntity({
        id: 0,
        name: dto.name,
        required: dto.required ?? false,
        maxSelections: dto.maxSelections ?? 1,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      }),
    )
    return { group, options: [], productIds: [] }
  }
}
```

`update-modifier-group.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository, ModifierGroupView } from '../ports/modifier.repository'
import { updateModifierGroupSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class UpdateModifierGroupUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(id: number, input: unknown): Promise<ModifierGroupView> {
    const changes = updateModifierGroupSchema.parse(input)

    const existing = await this.modifiers.findGroupById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')

    await this.modifiers.updateGroup(existing.with(changes))
    return (await this.modifiers.findGroupView(id))!
  }
}
```

`create-modifier-option.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { ModifierOptionEntity } from '../../../../domains/modifier.domain'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { createModifierOptionSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class CreateModifierOptionUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(groupId: number, input: unknown) {
    const dto = createModifierOptionSchema.parse(input)

    if (!(await this.modifiers.findGroupById(groupId)))
      throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')

    return this.modifiers.createOption(
      new ModifierOptionEntity({
        id: 0,
        groupId,
        name: dto.name,
        priceSatang: dto.priceSatang ?? 0,
        costSatang: dto.costSatang ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      }),
    )
  }
}
```

`update-modifier-option.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { updateModifierOptionSchema } from '../schemas/modifier-schemas'

/** Command. */
@injectable()
export class UpdateModifierOptionUseCase {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async execute(id: number, input: unknown) {
    const changes = updateModifierOptionSchema.parse(input)

    const existing = await this.modifiers.findOptionById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบตัวเลือก', 'MODIFIER_OPTION_NOT_FOUND')

    return this.modifiers.updateOption(existing.with(changes))
  }
}
```

`set-product-modifier-groups.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'
import { setProductModifierGroupsSchema } from '../schemas/modifier-schemas'

/** Command: replaces the option groups offered on a product. The order given is the order they are asked in. */
@injectable()
export class SetProductModifierGroupsUseCase {
  constructor(
    @inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(productId: number, input: unknown, branchId: number): Promise<number[]> {
    const dto = setProductModifierGroupsSchema.parse(input)
    const groupIds = [...new Set(dto.groupIds)]

    return this.unitOfWork.run(async () => {
      if (!(await this.products.findById(productId, branchId)))
        throw new DomainNotFoundError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
      const found = await this.modifiers.findGroupsByIds(groupIds)
      if (found.length !== groupIds.length)
        throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือกบางกลุ่ม', 'MODIFIER_GROUP_NOT_FOUND')

      await this.modifiers.setProductGroups(productId, groupIds)
      return groupIds
    })
  }
}
```

`services/line-options-resolver.ts`

```ts
import { inject, injectable } from 'tsyringe'
import { resolveLineOptions } from '../../../../domains/modifier.domain'
import type { ILineOptionsResolver } from '../ports/line-options-resolver.port'
import { modifierRepositoryToken } from '../ports/modifier.repository'
import type { IModifierRepository } from '../ports/modifier.repository'

@injectable()
export class LineOptionsResolver implements ILineOptionsResolver {
  constructor(@inject(modifierRepositoryToken) private readonly modifiers: IModifierRepository) {}

  async resolve(productId: number, optionIds: readonly number[]) {
    return resolveLineOptions(await this.modifiers.findGroupsForProduct(productId), optionIds)
  }
}
```

- [ ] **Step 7: repository ของ Drizzle** `adapters/repository/modifier.drizzle.repository.ts`

```ts
import { eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import {
  ModifierGroupEntity,
  ModifierOptionEntity,
  type ModifierGroupWithOptions,
} from '../../../../domains/modifier.domain'
import {
  modifierGroups,
  modifierOptions,
  productModifierGroups,
} from '../../../../infrastructure/database/schema/modifiers'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IModifierRepository, ModifierGroupView } from '../../applications/ports/modifier.repository'

const groupColumns = {
  id: modifierGroups.id,
  name: modifierGroups.name,
  required: modifierGroups.required,
  maxSelections: modifierGroups.maxSelections,
  sortOrder: modifierGroups.sortOrder,
  isActive: modifierGroups.isActive,
}

const optionColumns = {
  id: modifierOptions.id,
  groupId: modifierOptions.groupId,
  name: modifierOptions.name,
  priceSatang: modifierOptions.priceSatang,
  costSatang: modifierOptions.costSatang,
  sortOrder: modifierOptions.sortOrder,
  isActive: modifierOptions.isActive,
}

// Same code and message the API answers for a duplicate value elsewhere.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

@injectable()
export class DrizzleModifierRepository implements IModifierRepository {
  async findAllGroups() {
    const rows = await currentExecutor()
      .select(groupColumns)
      .from(modifierGroups)
      .orderBy(modifierGroups.sortOrder, modifierGroups.name)
    return this.withMembers(rows)
  }

  async findGroupView(id: number) {
    const rows = await currentExecutor().select(groupColumns).from(modifierGroups).where(eq(modifierGroups.id, id))
    return (await this.withMembers(rows))[0] ?? null
  }

  async findGroupById(id: number) {
    const [row] = await currentExecutor().select(groupColumns).from(modifierGroups).where(eq(modifierGroups.id, id))
    return row ? new ModifierGroupEntity(row) : null
  }

  async findGroupsByIds(ids: number[]) {
    if (ids.length === 0) return []
    const rows = await currentExecutor().select(groupColumns).from(modifierGroups).where(inArray(modifierGroups.id, ids))
    return rows.map((row) => new ModifierGroupEntity(row))
  }

  async findOptionById(id: number) {
    const [row] = await currentExecutor().select(optionColumns).from(modifierOptions).where(eq(modifierOptions.id, id))
    return row ? new ModifierOptionEntity(row) : null
  }

  async findGroupsForProduct(productId: number): Promise<ModifierGroupWithOptions[]> {
    const executor = currentExecutor()
    const rows = await executor
      .select(groupColumns)
      .from(productModifierGroups)
      .innerJoin(modifierGroups, eq(productModifierGroups.groupId, modifierGroups.id))
      .where(eq(productModifierGroups.productId, productId))
      .orderBy(productModifierGroups.sortOrder, modifierGroups.sortOrder, modifierGroups.name)
    if (rows.length === 0) return []

    const options = await executor
      .select(optionColumns)
      .from(modifierOptions)
      .where(
        inArray(
          modifierOptions.groupId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(modifierOptions.sortOrder, modifierOptions.name)

    return rows.map((row) => ({
      group: new ModifierGroupEntity(row),
      options: options.filter((option) => option.groupId === row.id).map((option) => new ModifierOptionEntity(option)),
    }))
  }

  async createGroup(entity: ModifierGroupEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(modifierGroups).values(values).returning(groupColumns)
      return new ModifierGroupEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async updateGroup(entity: ModifierGroupEntity) {
    const { id, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor()
        .update(modifierGroups)
        .set(values)
        .where(eq(modifierGroups.id, id))
        .returning(groupColumns)
      if (!row) throw new DomainNotFoundError('ไม่พบกลุ่มตัวเลือก', 'MODIFIER_GROUP_NOT_FOUND')
      return new ModifierGroupEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async createOption(entity: ModifierOptionEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(modifierOptions).values(values).returning(optionColumns)
      return new ModifierOptionEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async updateOption(entity: ModifierOptionEntity) {
    const { id, groupId: _fixed, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor()
        .update(modifierOptions)
        .set(values)
        .where(eq(modifierOptions.id, id))
        .returning(optionColumns)
      if (!row) throw new DomainNotFoundError('ไม่พบตัวเลือก', 'MODIFIER_OPTION_NOT_FOUND')
      return new ModifierOptionEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async setProductGroups(productId: number, groupIds: number[]) {
    const executor = currentExecutor()
    await executor.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId))
    if (groupIds.length > 0)
      await executor
        .insert(productModifierGroups)
        .values(groupIds.map((groupId, index) => ({ productId, groupId, sortOrder: index })))
  }

  /** Attaches each group's options and the products it is offered on. */
  private async withMembers(rows: (typeof groupColumns extends infer _ ? { id: number; name: string; required: boolean; maxSelections: number; sortOrder: number; isActive: boolean } : never)[]): Promise<ModifierGroupView[]> {
    if (rows.length === 0) return []
    const executor = currentExecutor()
    const ids = rows.map((row) => row.id)

    const options = await executor
      .select(optionColumns)
      .from(modifierOptions)
      .where(inArray(modifierOptions.groupId, ids))
      .orderBy(modifierOptions.sortOrder, modifierOptions.name)
    const bound = await executor
      .select({ groupId: productModifierGroups.groupId, productId: productModifierGroups.productId })
      .from(productModifierGroups)
      .where(inArray(productModifierGroups.groupId, ids))
      .orderBy(productModifierGroups.productId)

    return rows.map((row) => ({
      group: new ModifierGroupEntity(row),
      options: options.filter((option) => option.groupId === row.id).map((option) => new ModifierOptionEntity(option)),
      productIds: bound.filter((link) => link.groupId === row.id).map((link) => link.productId),
    }))
  }
}
```

ที่ลายเซ็น `withMembers` ให้ใช้ชนิดตรง ๆ แทน conditional type ข้างบน (เพื่อความอ่านง่าย): `rows: import('../../../../domains/modifier.domain').ModifierGroupProps[]`

- [ ] **Step 8: schema และ controller ของ HTTP** `adapters/controllers/schemas/modifier.schema.ts`

```ts
import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const option = t.Object({
  id: t.Integer(),
  groupId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
  costSatang: t.Integer(),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
})

const group = t.Object({
  id: t.Integer(),
  name: t.String(),
  required: t.Boolean(),
  maxSelections: t.Integer(),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
  options: t.Array(option),
  // The products this group is offered on.
  productIds: t.Array(t.Integer()),
})

export const modifierSchemas = {
  option,
  group,
  createGroup: t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    required: t.Optional(t.Boolean()),
    maxSelections: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
    sortOrder: t.Optional(t.Integer()),
  }),
  updateGroup: t.Partial(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      required: t.Boolean(),
      maxSelections: t.Integer({ minimum: 1, maximum: 20 }),
      sortOrder: t.Integer(),
      isActive: t.Boolean(),
    }),
  ),
  createOption: t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    priceSatang: t.Optional(satang()),
    costSatang: t.Optional(satang()),
    sortOrder: t.Optional(t.Integer()),
  }),
  updateOption: t.Partial(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      priceSatang: satang(),
      costSatang: satang(),
      sortOrder: t.Integer(),
      isActive: t.Boolean(),
    }),
  ),
  productGroups: t.Object({ groupIds: t.Array(t.Integer({ minimum: 1 }), { maxItems: 50 }) }),
}

export type ModifierGroupResponse = typeof modifierSchemas.group.static
export type ModifierOptionResponse = typeof modifierSchemas.option.static
```

`modifier.controller.ts`

```ts
import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import type { ModifierGroupView } from '../../applications/ports/modifier.repository'
import { CreateModifierGroupUseCase } from '../../applications/usecases/create-modifier-group.usecase'
import { CreateModifierOptionUseCase } from '../../applications/usecases/create-modifier-option.usecase'
import { ListModifierGroupsUseCase } from '../../applications/usecases/list-modifier-groups.usecase'
import { SetProductModifierGroupsUseCase } from '../../applications/usecases/set-product-modifier-groups.usecase'
import { UpdateModifierGroupUseCase } from '../../applications/usecases/update-modifier-group.usecase'
import { UpdateModifierOptionUseCase } from '../../applications/usecases/update-modifier-option.usecase'
import { modifierSchemas, type ModifierGroupResponse } from './schemas/modifier.schema'

// Entities never leave the API as-is: the response shape is a contract of its own.
const toGroupResponse = ({ group, options, productIds }: ModifierGroupView): ModifierGroupResponse => ({
  ...group.toSnapshot(),
  options: options.map((option) => option.toSnapshot()),
  productIds,
})

@injectable()
export class ModifierElysiaController {
  constructor(
    @inject(ListModifierGroupsUseCase) private readonly listGroups: ListModifierGroupsUseCase,
    @inject(CreateModifierGroupUseCase) private readonly createGroup: CreateModifierGroupUseCase,
    @inject(UpdateModifierGroupUseCase) private readonly updateGroup: UpdateModifierGroupUseCase,
    @inject(CreateModifierOptionUseCase) private readonly createOption: CreateModifierOptionUseCase,
    @inject(UpdateModifierOptionUseCase) private readonly updateOption: UpdateModifierOptionUseCase,
    @inject(SetProductModifierGroupsUseCase) private readonly setProductGroups: SetProductModifierGroupsUseCase,
  ) {}

  /** Mounted under /catalog, beside categories and products. */
  getRoutes() {
    return new Elysia({ name: 'catalog.modifiers' })
      .use(auth)
      .get(
        '/modifier-groups',
        async () => {
          const items = (await this.listGroups.execute()).map(toGroupResponse)
          return { items, total: items.length }
        },
        { auth: true, response: page(modifierSchemas.group), detail: { summary: 'กลุ่มตัวเลือกพร้อมตัวเลือกและสินค้าที่ใช้' } },
      )
      .post('/modifier-groups', async ({ body }) => toGroupResponse(await this.createGroup.execute(body)), {
        auth: ['owner'],
        body: modifierSchemas.createGroup,
        response: modifierSchemas.group,
        detail: { summary: 'เพิ่มกลุ่มตัวเลือก' },
      })
      .patch(
        '/modifier-groups/:id',
        async ({ params, body }) => toGroupResponse(await this.updateGroup.execute(params.id, body)),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.updateGroup,
          response: modifierSchemas.group,
          detail: { summary: 'แก้ไขหรือปิดใช้กลุ่มตัวเลือก' },
        },
      )
      .post(
        '/modifier-groups/:id/options',
        async ({ params, body }) => (await this.createOption.execute(params.id, body)).toSnapshot(),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.createOption,
          response: modifierSchemas.option,
          detail: { summary: 'เพิ่มตัวเลือกในกลุ่ม' },
        },
      )
      .patch(
        '/modifier-options/:id',
        async ({ params, body }) => (await this.updateOption.execute(params.id, body)).toSnapshot(),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.updateOption,
          response: modifierSchemas.option,
          detail: { summary: 'แก้ราคา ต้นทุน หรือปิดใช้ตัวเลือก' },
        },
      )
      .put(
        '/products/:id/modifier-groups',
        async ({ params, body, branch }) => ({
          groupIds: await this.setProductGroups.execute(params.id, body, (await branch()).id),
        }),
        {
          auth: ['owner'],
          params: idParams,
          body: modifierSchemas.productGroups,
          response: modifierSchemas.productGroups,
          detail: { summary: 'ตั้งกลุ่มตัวเลือกที่สินค้านี้ใช้ (แทนที่ทั้งชุด ตามลำดับที่ส่ง)' },
        },
      )
  }
}
```

- [ ] **Step 9: module และการต่อสาย**

`modifiers.module.ts`

```ts
import { container } from 'tsyringe'
import { ModifierElysiaController } from './adapters/controllers/modifier.controller'
import { DrizzleModifierRepository } from './adapters/repository/modifier.drizzle.repository'
import { lineOptionsResolverToken } from './applications/ports/line-options-resolver.port'
import { modifierRepositoryToken } from './applications/ports/modifier.repository'
import { LineOptionsResolver } from './applications/services/line-options-resolver'
import { CreateModifierGroupUseCase } from './applications/usecases/create-modifier-group.usecase'
import { CreateModifierOptionUseCase } from './applications/usecases/create-modifier-option.usecase'
import { ListModifierGroupsUseCase } from './applications/usecases/list-modifier-groups.usecase'
import { SetProductModifierGroupsUseCase } from './applications/usecases/set-product-modifier-groups.usecase'
import { UpdateModifierGroupUseCase } from './applications/usecases/update-modifier-group.usecase'
import { UpdateModifierOptionUseCase } from './applications/usecases/update-modifier-option.usecase'

container.register(modifierRepositoryToken, { useClass: DrizzleModifierRepository })
container.register(lineOptionsResolverToken, { useClass: LineOptionsResolver })
container.registerSingleton(ListModifierGroupsUseCase)
container.registerSingleton(CreateModifierGroupUseCase)
container.registerSingleton(UpdateModifierGroupUseCase)
container.registerSingleton(CreateModifierOptionUseCase)
container.registerSingleton(UpdateModifierOptionUseCase)
container.registerSingleton(SetProductModifierGroupsUseCase)
container.registerSingleton(ModifierElysiaController)
```

`di-registrations.ts` เพิ่มบรรทัด `import './modifiers/modifiers.module'` ต่อจาก `import './products/products.module'`

`app.module.ts`:
- เพิ่ม `import { ModifierElysiaController } from './modifiers/adapters/controllers/modifier.controller'`
- เพิ่ม `const modifierController = container.resolve(ModifierElysiaController)` ต่อจาก `productController`
- แก้ `catalog` เป็น

```ts
const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(categoryController.getRoutes())
  .use(productController.getRoutes())
  .use(modifierController.getRoutes())
```

`types.ts` เพิ่ม:

```ts
export type {
  ModifierGroupResponse as ModifierGroup,
  ModifierOptionResponse as ModifierOption,
} from './modules/modifiers/adapters/controllers/schemas/modifier.schema'
```

- [ ] **Step 10: รัน unit test ให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/modifiers`
Expected: PASS

- [ ] **Step 11: เขียน integration test** `apps/api/src/__tests__/integration/modifiers.integration.test.ts`

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { client, ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const groups = () => owner.api.catalog['modifier-groups']

describe('modifier groups and options', () => {
  test('a new group is optional, single choice and has no options or products', async () => {
    const created = ok(await groups().post({ name: 'ระดับความหวาน' }))

    expect(created).toEqual({
      id: expect.any(Number),
      name: 'ระดับความหวาน',
      required: false,
      maxSelections: 1,
      sortOrder: 0,
      isActive: true,
      options: [],
      productIds: [],
    })
  })

  test('options carry a price and cost, and are listed with their group in order', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง', maxSelections: 3 }))
    ok(await groups()({ id: group.id }).options.post({ name: 'วุ้น', priceSatang: 500, costSatang: 200, sortOrder: 2 }))
    ok(await groups()({ id: group.id }).options.post({ name: 'ไข่มุก', priceSatang: 1000, costSatang: 400, sortOrder: 1 }))

    const listed = ok(await groups().get()).items

    expect(listed).toHaveLength(1)
    expect(listed[0]!.options.map((option) => [option.name, option.priceSatang, option.costSatang])).toEqual([
      ['ไข่มุก', 1000, 400],
      ['วุ้น', 500, 200],
    ])
  })

  test('an option is deactivated, not deleted, and a price can change', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง' }))
    const option = ok(await groups()({ id: group.id }).options.post({ name: 'วุ้น', priceSatang: 500 }))

    const changed = ok(await owner.api.catalog['modifier-options']({ id: option.id }).patch({ priceSatang: 700, isActive: false }))

    expect(changed).toMatchObject({ id: option.id, name: 'วุ้น', priceSatang: 700, isActive: false })
    expect(ok(await groups().get()).items[0]!.options).toHaveLength(1)
  })

  test('duplicate names conflict, in a group and between groups', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง' }))
    ok(await groups()({ id: group.id }).options.post({ name: 'วุ้น' }))

    const sameGroup = await groups().post({ name: 'ท็อปปิง' })
    const sameOption = await groups()({ id: group.id }).options.post({ name: 'วุ้น' })

    expect(sameGroup.status).toBe(409)
    expect(sameOption.status).toBe(409)
    expect(sameOption.error?.value).toMatchObject({ code: 'DUPLICATE' })
  })

  test('a negative price and a limit above 20 are refused', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง' }))

    expect((await groups()({ id: group.id }).options.post({ name: 'x', priceSatang: -1 })).status).toBe(422)
    expect((await groups().post({ name: 'y', maxSelections: 21 })).status).toBe(422)
  })

  test('only the owner changes them; any signed-in user may read, anonymous may not', async () => {
    const cashier = await signIn('cashier')

    expect((await cashier.api.catalog['modifier-groups'].post({ name: 'x' })).status).toBe(403)
    expect((await cashier.api.catalog['modifier-groups'].get()).status).toBe(200)
    expect((await client().catalog['modifier-groups'].get()).status).toBe(401)
  })

  test('updating or adding to an unknown group is not found', async () => {
    const patched = await groups()({ id: 9999 }).patch({ name: 'ผี' })
    const added = await groups()({ id: 9999 }).options.post({ name: 'ผี' })

    expect(patched.error?.value).toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
    expect(added.error?.value).toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
  })
})

describe('offering groups on a product', () => {
  test('the groups of a product are replaced as a whole and show on the group as productIds', async () => {
    const tea = await seedProduct(owner, { name: 'ชา' })
    const sweetness = ok(await groups().post({ name: 'ความหวาน' }))
    const toppings = ok(await groups().post({ name: 'ท็อปปิง' }))

    const first = ok(await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [toppings.id, sweetness.id] }))
    expect(first.groupIds).toEqual([toppings.id, sweetness.id])
    expect(ok(await groups().get()).items.map((group) => group.productIds)).toEqual([[tea.id], [tea.id]])

    ok(await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [sweetness.id] }))
    const byName = Object.fromEntries(ok(await groups().get()).items.map((group) => [group.name, group.productIds]))
    expect(byName).toEqual({ ความหวาน: [tea.id], ท็อปปิง: [] })
  })

  test('an unknown product or group is not found', async () => {
    const tea = await seedProduct(owner)

    const noProduct = await owner.api.catalog.products({ id: 9999 })['modifier-groups'].put({ groupIds: [] })
    const noGroup = await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [9999] })

    expect(noProduct.error?.value).toMatchObject({ code: 'PRODUCT_NOT_FOUND' })
    expect(noGroup.error?.value).toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
  })
})
```

- [ ] **Step 12: รันทั้งหมดของ API**

Run (จาก root, ต้อง `bun run db:up` แล้ว): `bun run typecheck` และ `cd apps/api && bun --env-file=.env.test test src/__tests__/integration/modifiers.integration.test.ts`
Expected: typecheck ผ่าน, integration test ผ่านทุกกรณี (ถ้า `error?.value` ของ 422 หรือ 403 ต่างจากที่คาด ให้ดูรูปแบบจริงจาก `categories.integration.test.ts` แล้วปรับให้ตรง ห้ามผ่อนเงื่อนไขของสิ่งที่ทดสอบ)

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/modifiers apps/api/src/modules/di-registrations.ts apps/api/src/modules/app.module.ts apps/api/src/__tests__ apps/api/src/types.ts
gitcz --non-interactive --type=feat --scope=modifiers --subject="add the modifiers module: groups, options, and which products offer them" --body="Owners create groups and options and set the groups of a product. The line options resolver is the port orders and sales will use to check and price a choice.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ออเดอร์เก็บตัวเลือกบนบรรทัด (โดเมนและ repository)

**Files:**
- Modify: `apps/api/src/domains/order.domain.ts`, `apps/api/src/domains/order.domain.test.ts`
- Modify: `apps/api/src/modules/orders/adapters/repository/order.drizzle.repository.ts`
- Modify: `apps/api/src/__tests__/factories.ts` (ตัวอย่างบรรทัดใน `makeOrder`)

**Interfaces:**
- Consumes: `LineOption`, `lineKey` (Task 1); คอลัมน์ `order_items.options`, `options_key` (Task 2)
- Produces:
  - `OrderItem = { lineId; productId; productName; sku; unitPriceSatang; quantity; options: readonly LineOption[] }` (`lineId` เป็น 0 จนกว่าจะบันทึก; `unitPriceSatang` รวมราคาตัวเลือกแล้ว)
  - `OrderEntity.addItem(product: OrderedProduct, quantity: number, options?: readonly LineOption[])`
  - `OrderEntity.setLineQuantity(lineId, quantity)`, `OrderEntity.removeLine(lineId)` (ไม่พบ = `ORDER_ITEM_NOT_FOUND`)
  - `OrderEntity.setQuantity(productId, …)`, `removeItem(productId)` ยังอยู่และทำงานกับบรรทัดที่ไม่มีตัวเลือกเท่านั้น
  - บรรทัดรวมกันเมื่อ `productId` และชุดตัวเลือกเหมือนกัน

- [ ] **Step 1: เพิ่มการทดสอบที่ล้มเหลว** ต่อท้าย `order.domain.test.ts` และแก้ helper `item` ให้มีค่าเริ่มต้นของฟิลด์ใหม่

แก้บรรทัดที่นิยาม `item`:

```ts
const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({ ...tea, lineId: 0, options: [], quantity: 1, ...overrides })
```

เพิ่มตัวเลือกตัวอย่างและการทดสอบ:

```ts
const pearls = { groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }
const jelly = { groupId: 2, groupName: 'ท็อปปิง', optionId: 21, name: 'วุ้น', priceSatang: 500, costSatang: 200 }

describe('OrderEntity lines with options', () => {
  test('the same product with different options is a different line, the same options one line', () => {
    const order = makeOrder({ items: [] })
      .addItem({ ...tea, unitPriceSatang: 3500 }, 1, [pearls])
      .addItem(tea, 1)
      .addItem({ ...tea, unitPriceSatang: 3500 }, 2, [pearls])

    expect(order.items.map((line) => [line.options.map((option) => option.name), line.quantity])).toEqual([
      [['ไข่มุก'], 3],
      [[], 1],
    ])
  })

  test('a line keeps the price quoted with its options', () => {
    const order = makeOrder({ items: [item({ lineId: 5, unitPriceSatang: 3500, options: [pearls], quantity: 1 })] }).addItem(
      { ...tea, unitPriceSatang: 9999 },
      1,
      [pearls],
    )

    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({ lineId: 5, unitPriceSatang: 3500, quantity: 2 })
  })

  test('sums the lines as quoted, options included', () => {
    const order = makeOrder({
      items: [item({ lineId: 1, unitPriceSatang: 3500, options: [pearls], quantity: 2 }), item({ lineId: 2, quantity: 1 })],
    })

    expect(order.subtotalSatang).toBe(2 * 3500 + 2500)
    expect(order.itemCount).toBe(3)
  })

  test('a line is changed and removed by its id, leaving the other lines of the product', () => {
    const order = makeOrder({
      items: [item({ lineId: 1, options: [pearls], unitPriceSatang: 3500 }), item({ lineId: 2, options: [jelly], unitPriceSatang: 3000 })],
    })

    const changed = order.setLineQuantity(2, 4)
    const removed = order.removeLine(1)

    expect(changed.items.map((line) => [line.lineId, line.quantity])).toEqual([[1, 1], [2, 4]])
    expect(removed.items.map((line) => line.lineId)).toEqual([2])
  })

  test('an unknown line id is not found', () => {
    const order = makeOrder({ items: [item({ lineId: 1 })] })

    expect(codeOf(() => order.setLineQuantity(9, 2))).toBe('ORDER_ITEM_NOT_FOUND')
    expect(codeOf(() => order.removeLine(9))).toBe('ORDER_ITEM_NOT_FOUND')
  })

  test('the product-id methods work on the line without options only', () => {
    const order = makeOrder({ items: [item({ lineId: 1, options: [pearls], unitPriceSatang: 3500 })] })

    expect(codeOf(() => order.setQuantity(1, 2))).toBe('ORDER_ITEM_NOT_FOUND')
    expect(codeOf(() => order.removeItem(1))).toBe('ORDER_ITEM_NOT_FOUND')

    const withPlain = order.addItem(tea, 1)
    expect(withPlain.setQuantity(1, 5).items.map((line) => [line.options.length, line.quantity])).toEqual([[1, 1], [0, 5]])
    expect(withPlain.removeItem(1).items.map((line) => line.options.length)).toEqual([1])
  })

  test('opening an order merges lines by product and options', () => {
    const opened = OrderEntity.open({
      branchId: 1,
      label: null,
      openedById: 3,
      openedByName: 'สมชาย',
      items: [item({ options: [pearls] }), item({ options: [jelly] }), item({ options: [pearls], quantity: 2 })],
    })

    expect(opened.items.map((line) => [line.options[0]!.name, line.quantity])).toEqual([['ไข่มุก', 3], ['วุ้น', 1]])
  })
})
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/order.domain.test.ts`
Expected: FAIL (`setLineQuantity is not a function` และชนิดไม่ตรง)

- [ ] **Step 3: แก้โดเมน** `apps/api/src/domains/order.domain.ts`

เพิ่ม import ด้านบน:

```ts
import { lineKey, type LineOption } from './modifier.domain'
```

แก้ `OrderItem` และ `OrderedProduct`:

```ts
/** One line of an order. Name, SKU and price are what was quoted when it was ordered. */
export interface OrderItem {
  /** Id of the stored line; 0 until the order has been stored. */
  lineId: number
  productId: number
  productName: string
  sku: string
  /** The product's price plus the options chosen: what is charged for one unit of this line. */
  unitPriceSatang: number
  quantity: number
  options: readonly LineOption[]
}

/** What is needed to put a product on an order: the product as it is now. */
export type OrderedProduct = Pick<OrderItem, 'productId' | 'productName' | 'sku' | 'unitPriceSatang'>
```

แทนที่ `mergeLines`:

```ts
/** The same product with the same options is the same line. */
const identity = (item: OrderItem) => `${item.productId}:${lineKey(item.options)}`

/** The lines of an order, with repeated products and options merged into the first line of each. */
function mergeLines(items: readonly OrderItem[]): OrderItem[] {
  const merged = new Map<string, OrderItem>()
  for (const item of items) {
    assertQuantity(item.quantity)
    const key = identity(item)
    const existing = merged.get(key)
    merged.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : { ...item })
  }
  const lines = [...merged.values()]
  lines.forEach((line) => assertQuantity(line.quantity))
  if (lines.length > MAX_ORDER_LINES) throw invalid(`ออเดอร์มีรายการได้ไม่เกิน ${MAX_ORDER_LINES} บรรทัด`)
  return lines
}

const plainLineOf = (productId: number) => (item: OrderItem) => item.productId === productId && item.options.length === 0
const lineWithId = (lineId: number) => (item: OrderItem) => item.lineId === lineId
```

แทนที่เมธอด `addItem`, `setQuantity`, `removeItem` และ `requireItem`:

```ts
  /**
   * Puts a product on the order. The same product with the same options gains the quantity and keeps
   * the price it was quoted. `product.unitPriceSatang` is the unit price including the options.
   */
  addItem(product: OrderedProduct, quantity: number, options: readonly LineOption[] = []): OrderEntity {
    this.assertOpen()
    assertQuantity(quantity)
    return this.change({ items: mergeLines([...this.items, { ...product, lineId: 0, options, quantity }]) })
  }

  /** Sets how many of a product, without options, are ordered. */
  setQuantity(productId: number, quantity: number): OrderEntity {
    return this.setQuantityOf(plainLineOf(productId), quantity)
  }

  /** Sets how many of one line are ordered, whatever options it has. */
  setLineQuantity(lineId: number, quantity: number): OrderEntity {
    return this.setQuantityOf(lineWithId(lineId), quantity)
  }

  /** Takes the line of a product without options off the order. */
  removeItem(productId: number): OrderEntity {
    return this.removeWhere(plainLineOf(productId))
  }

  removeLine(lineId: number): OrderEntity {
    return this.removeWhere(lineWithId(lineId))
  }
```

และเมธอด private (แทน `requireItem`):

```ts
  private setQuantityOf(match: (item: OrderItem) => boolean, quantity: number): OrderEntity {
    this.assertOpen()
    assertQuantity(quantity)
    this.requireItem(match)
    return this.change({ items: this.items.map((item) => (match(item) ? { ...item, quantity } : item)) })
  }

  private removeWhere(match: (item: OrderItem) => boolean): OrderEntity {
    this.assertOpen()
    this.requireItem(match)
    return this.change({ items: this.items.filter((item) => !match(item)) })
  }

  private requireItem(match: (item: OrderItem) => boolean): void {
    if (!this.items.some(match)) throw new DomainNotFoundError('ไม่พบสินค้านี้ในออเดอร์', 'ORDER_ITEM_NOT_FOUND')
  }
```

- [ ] **Step 4: แก้ factory** ใน `factories.ts` บรรทัดของ `makeOrder`:

```ts
    items: [{ lineId: 1, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [] }],
```

- [ ] **Step 5: รันให้ผ่าน** แล้วแก้ที่ typecheck ชี้

Run: `cd apps/api && bun --env-file=.env.test test src/domains/order.domain.test.ts` Expected: PASS
Run: `bun run typecheck` Expected: จะมี error ที่ `order.drizzle.repository.ts`, `open-order.usecase.ts`, `add-order-item.usecase.ts`, `orders.usecases.test.ts` (ชนิดบรรทัดขาด `lineId`/`options`) ให้แก้ใน Step 6 และ Task 5 ตามลำดับ

- [ ] **Step 6: แก้ repository ให้เก็บตัวเลือกและเทียบทีละบรรทัด** `order.drizzle.repository.ts`

เพิ่ม import:

```ts
import { and, count, eq, inArray, notInArray } from 'drizzle-orm'
import { lineKey } from '../../../../domains/modifier.domain'
```

แก้ `itemColumns`:

```ts
const itemColumns = {
  lineId: orderItems.id,
  orderId: orderItems.orderId,
  productId: orderItems.productId,
  productName: orderItems.productName,
  sku: orderItems.sku,
  unitPriceSatang: orderItems.unitPriceSatang,
  quantity: orderItems.quantity,
  options: orderItems.options,
}
```

ใน `findAll` และ `load` แถวที่ได้มีรูปร่างตรงกับ `OrderItem` อยู่แล้ว (มี `lineId`, `options`) ส่วนที่ตัด `orderId` ออกใช้ต่อได้ตามเดิม

แทนที่ `save` และ `writeItems`:

```ts
  async save(order: OrderEntity) {
    const { id, items, branchId: _fixed, openedById: _opener, openedByName: _name, createdAt: _created, ...values } =
      order.toSnapshot()
    const executor = currentExecutor()

    await executor
      .update(orders)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(orders.id, id))

    // Lines are compared, not replaced, so a line keeps its id (the till and the kitchen refer to it).
    const kept = items.filter((item) => item.lineId > 0).map((item) => item.lineId)
    await executor
      .delete(orderItems)
      .where(
        kept.length > 0
          ? and(eq(orderItems.orderId, id), notInArray(orderItems.id, kept))
          : eq(orderItems.orderId, id),
      )
    for (const item of items.filter((line) => line.lineId > 0))
      await executor
        .update(orderItems)
        .set({ quantity: item.quantity })
        .where(and(eq(orderItems.orderId, id), eq(orderItems.id, item.lineId)))
    await this.writeItems(
      id,
      items.filter((item) => item.lineId === 0),
    )
    return (await this.findById(id))!
  }

  private async writeItems(orderId: number, items: readonly OrderItem[]) {
    if (items.length > 0)
      await currentExecutor()
        .insert(orderItems)
        .values(
          items.map(({ lineId: _line, options, ...item }) => ({
            ...item,
            orderId,
            options: [...options],
            optionsKey: lineKey(options),
          })),
        )
  }
```

ในการอ่าน (`load` และ `findAll`) แถว `options` ที่ Drizzle คืนเป็น `StoredLineOption[]` ซึ่งตรงกับ `LineOption` โดยโครงสร้าง ไม่ต้องแปลง

- [ ] **Step 7: Commit** (ฝั่งโดเมนและ repository ผ่าน unit test ของโดเมนแล้ว ส่วน typecheck ทั้งหมดจะเขียวหลัง Task 5)

```bash
git add apps/api/src/domains/order.domain.ts apps/api/src/domains/order.domain.test.ts apps/api/src/modules/orders/adapters/repository apps/api/src/__tests__/factories.ts
gitcz --non-interactive --type=feat --scope=orders --subject="keep chosen options on order lines and address a line by its id" --body="A line is the product with its options. The repository compares lines instead of replacing them so a line keeps its id between saves.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ออเดอร์: use case, HTTP และการทดสอบ

**Files:**
- Modify: `apps/api/src/modules/orders/applications/schemas/order-schemas.ts`
- Modify: `apps/api/src/modules/orders/applications/usecases/{add-order-item,open-order,pay-order,pay-order-v2}.usecase.ts`
- Create: `apps/api/src/modules/orders/applications/usecases/{set-order-line-quantity,remove-order-line}.usecase.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`
- Modify: `apps/api/src/modules/orders/adapters/controllers/order.controller.ts`, `schemas/order.schema.ts`
- Modify: `apps/api/src/modules/sales/applications/ports/sale-checkout.port.ts` (ชนิดอย่างเดียวในขั้นนี้)
- Modify: `apps/api/src/modules/orders/applications/usecases/orders.usecases.test.ts`
- Modify: `apps/api/src/__tests__/integration/orders.integration.test.ts`
- Modify: `apps/api/src/__tests__/integration/modifiers.integration.test.ts` (เพิ่ม describe ของออเดอร์)

**Interfaces:**
- Consumes: `ILineOptionsResolver`, `lineOptionsResolverToken` (Task 3); `OrderEntity.addItem/setLineQuantity/removeLine` (Task 4)
- Produces:
  - `CheckoutLine` เพิ่ม `options?: readonly LineOption[]` และ `optionIds?: readonly number[]` (Task 6 ใช้)
  - HTTP: body ของ `POST /orders` (แต่ละ item) และ `POST /orders/:id/items` รับ `options?: number[]`; ผลของบรรทัดมี `lineId`, `options`; `PATCH`/`DELETE /orders/:id/lines/:lineId`
  - รหัสผิดพลาดที่ตอบ: `MODIFIER_REQUIRED|TOO_MANY|DUPLICATE|NOT_AVAILABLE` (400), `ORDER_ITEM_NOT_FOUND` (404)

- [ ] **Step 1: ขยายชนิดของ port ของ checkout** `sale-checkout.port.ts` แก้ `CheckoutLine`:

```ts
import type { LineOption } from '../../../../domains/modifier.domain'

export interface CheckoutLine {
  productId: number
  quantity: number
  /**
   * What the line costs per unit, options included, as agreed earlier (an order quoted it when the item
   * was added). Without it the product's current price plus the options is charged.
   */
  unitPriceSatang?: number
  /** The options already resolved and kept by an order. Used together with `unitPriceSatang`. */
  options?: readonly LineOption[]
  /** The ids chosen in a one-step sale; checked and priced by the checkout. */
  optionIds?: readonly number[]
}
```

(เพิ่ม `import type { SaleEntity, SalePayment }` เดิมไว้ตามเดิม)

- [ ] **Step 2: ขยาย zod schema ของออเดอร์** `order-schemas.ts`

```ts
const options = z.array(z.number().int().positive()).max(40)

export const openOrderSchema = z.object({
  label: label.optional(),
  items: z.array(z.object({ productId, quantity, options: options.optional() })).max(100).optional(),
})

export const addOrderItemSchema = z.object({ productId, quantity, options: options.optional() })
```

(`updateOrderSchema`, `setOrderItemQuantitySchema` ฯลฯ ไม่เปลี่ยน)

- [ ] **Step 3: เขียนการทดสอบ use case ที่ล้มเหลว** แก้ `orders.usecases.test.ts`

เพิ่ม import และตัวแปร:

```ts
import { mockLineOptionsResolver } from '../../../../__tests__/mocks'
let lineOptions: ReturnType<typeof mockLineOptionsResolver>
```

ใน `beforeEach` ระดับบนเพิ่ม `lineOptions = mockLineOptionsResolver()` และแก้ทุกที่ที่สร้าง `OpenOrderUseCase`/`AddOrderItemUseCase` ให้ส่ง `lineOptions` เป็นอาร์กิวเมนต์สุดท้าย (typecheck จะชี้) เช่น `new OpenOrderUseCase(orders, products, unitOfWork, lineOptions)` และ `new AddOrderItemUseCase(orders, products, unitOfWork, lineOptions)` บรรทัดที่ระบุในวรรณกรรมของไฟล์ที่มีค่าบรรทัดแบบ literal (`{ productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2 }`) ให้เติม `lineId: 0, options: []` หรือ `lineId: 1, options: []` ให้ตรงกับ `makeOrder`

เพิ่ม describe ใหม่:

```ts
describe('options on order lines', () => {
  const pearls = { groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }

  beforeEach(() => {
    lineOptions.resolve.mockResolvedValue({ options: [pearls], priceSatang: 1000, costSatang: 400, key: '20' })
  })

  test('adding with options quotes the product price plus the options, and keeps the options', async () => {
    const order = makeOrder({ items: [] })
    orders.findByIdForUpdate.mockResolvedValue(order)

    const saved = await new AddOrderItemUseCase(orders, products, unitOfWork, lineOptions).execute(
      1,
      { productId: 1, quantity: 2, options: [20] },
      1,
    )

    expect(lineOptions.resolve).toHaveBeenCalledWith(1, [20])
    expect(saved.items).toEqual([
      { lineId: 0, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 3500, quantity: 2, options: [pearls] },
    ])
  })

  test('adding the same choice again joins the line and keeps its quoted price', async () => {
    orders.findByIdForUpdate.mockResolvedValue(
      makeOrder({ items: [{ lineId: 7, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 3000, quantity: 1, options: [pearls] }] }),
    )

    const saved = await new AddOrderItemUseCase(orders, products, unitOfWork, lineOptions).execute(
      1,
      { productId: 1, quantity: 1, options: [20] },
      1,
    )

    expect(saved.items).toHaveLength(1)
    expect(saved.items[0]).toMatchObject({ lineId: 7, unitPriceSatang: 3000, quantity: 2 })
  })

  test('a choice that breaks a rule is refused and nothing is saved', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder())
    const refusal = Object.assign(new Error('x'), { code: 'MODIFIER_REQUIRED' })
    lineOptions.resolve.mockRejectedValue(refusal)

    await expect(
      new AddOrderItemUseCase(orders, products, unitOfWork, lineOptions).execute(1, { productId: 1, quantity: 1 }, 1),
    ).rejects.toBe(refusal)
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('opening an order with options prices each line with its own options', async () => {
    orders.create.mockImplementation(async (order) =>
      new OrderEntity({ ...order, id: 5, status: 'open', saleId: null, cancelReason: null, cancelledById: null, createdAt: new Date(), updatedAt: new Date() }),
    )

    const opened = await new OpenOrderUseCase(orders, products, unitOfWork, lineOptions).execute(
      { items: [{ productId: 1, quantity: 1, options: [20] }] },
      actor,
    )

    expect(opened.items[0]).toMatchObject({ unitPriceSatang: 3500, options: [pearls] })
  })

  test('a line is changed and removed by its id', async () => {
    orders.findByIdForUpdate.mockResolvedValue(
      makeOrder({ items: [{ lineId: 7, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 3500, quantity: 1, options: [pearls] }] }),
    )

    const changed = await new SetOrderLineQuantityUseCase(orders, unitOfWork).execute(1, 7, { quantity: 3 }, 1)
    expect(changed.items[0]!.quantity).toBe(3)

    const removed = await new RemoveOrderLineUseCase(orders, unitOfWork).execute(1, 7, 1)
    expect(removed.items).toEqual([])
  })

  test('paying passes each line with its options and the price it was quoted', async () => {
    orders.findByIdForUpdate.mockResolvedValue(
      makeOrder({ items: [{ lineId: 7, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 3500, quantity: 2, options: [pearls] }] }),
    )
    checkout.checkout.mockResolvedValue(makeSale({ id: 9 }))

    await new PayOrderUseCase(orders, checkout, unitOfWork).execute(1, { payments: [{ method: 'cash', amountSatang: 7000 }] }, actor)

    expect(checkout.checkout.mock.calls[0]![0].lines).toEqual([
      { productId: 1, quantity: 2, unitPriceSatang: 3500, options: [pearls] },
    ])
  })
})
```

เพิ่ม import `SetOrderLineQuantityUseCase`, `RemoveOrderLineUseCase` ที่หัวไฟล์

- [ ] **Step 4: รันให้เห็นว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/orders`
Expected: FAIL (ไม่พบ use case ใหม่ และ constructor ไม่ตรง)

- [ ] **Step 5: แก้ use case**

`add-order-item.usecase.ts` (แทนทั้งไฟล์)

```ts
import { inject, injectable } from 'tsyringe'
import { lineKey } from '../../../../domains/modifier.domain'
import { lineOptionsResolverToken } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { addOrderItemSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'
import { findOrderedProduct } from '../services/ordered-product'

/**
 * Command: puts a product, with the options chosen, on an open order. The same product with the same
 * options adds to its line, which keeps the price it was quoted.
 */
@injectable()
export class AddOrderItemUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const dto = addOrderItemSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      const chosen = await this.lineOptions.resolve(dto.productId, dto.options ?? [])
      // A line that is already there keeps the price it was quoted; only a new one is looked up.
      const existing = order.items.find(
        (item) => item.productId === dto.productId && lineKey(item.options) === chosen.key,
      )
      const product =
        existing ??
        (await findOrderedProduct(this.products, dto.productId, branchId).then((found) => ({
          ...found,
          unitPriceSatang: found.unitPriceSatang + chosen.priceSatang,
        })))
      return this.orders.save(order.addItem(product, dto.quantity, chosen.options))
    })
  }
}
```

`open-order.usecase.ts` เพิ่ม dependency และแก้ลูป:

```ts
import { lineOptionsResolverToken } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
```

constructor เพิ่มท้าย `@inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,` และแทนลูป:

```ts
      const items = []
      for (const line of dto.items ?? []) {
        const product = await findOrderedProduct(this.products, line.productId, actor.branch.id)
        const chosen = await this.lineOptions.resolve(line.productId, line.options ?? [])
        items.push({
          ...product,
          unitPriceSatang: product.unitPriceSatang + chosen.priceSatang,
          quantity: line.quantity,
          lineId: 0,
          options: chosen.options,
        })
      }
```

`pay-order.usecase.ts` และ `pay-order-v2.usecase.ts` แก้การ map บรรทัด:

```ts
        lines: order.items.map(({ productId, quantity, unitPriceSatang, options }) => ({
          productId,
          quantity,
          unitPriceSatang,
          options,
        })),
```

`set-order-line-quantity.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { setOrderItemQuantitySchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'

/** Command: sets how many of one line, by its id, an open order has. */
@injectable()
export class SetOrderLineQuantityUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, lineId: number, input: unknown, branchId: number) {
    const { quantity } = setOrderItemQuantitySchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      return this.orders.save(order.setLineQuantity(lineId, quantity))
    })
  }
}
```

`remove-order-line.usecase.ts`

```ts
import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { inBranch } from '../services/order-access'

/** Command: takes one line, by its id, off an open order. */
@injectable()
export class RemoveOrderLineUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, lineId: number, branchId: number) {
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      return this.orders.save(order.removeLine(lineId))
    })
  }
}
```

`orders.module.ts` เพิ่ม import และ `container.registerSingleton(SetOrderLineQuantityUseCase)` / `container.registerSingleton(RemoveOrderLineUseCase)` ก่อน `registerSingleton(OrderElysiaController)`

- [ ] **Step 6: HTTP schema และ controller**

`order.schema.ts` แก้ `item` และเพิ่มตัวเลือกใน body:

```ts
const lineOption = t.Object({
  groupId: t.Integer(),
  groupName: t.String(),
  optionId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
})

const item = t.Object({
  // Identifies the line: the same product with other options is another line.
  lineId: t.Integer(),
  productId: t.Integer(),
  productName: t.String(),
  sku: t.String(),
  // The price quoted when the item was put on the order, options included; it is what is charged.
  unitPriceSatang: t.Integer(),
  quantity: t.Integer(),
  lineTotalSatang: t.Integer(),
  options: t.Array(lineOption),
})

const optionIds = t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 40 }))
```

และใน `orderSchemas`:

```ts
  open: t.Object({
    label: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
    items: t.Optional(
      t.Array(
        t.Object({ productId: t.Integer({ minimum: 1 }), quantity: t.Integer({ minimum: 1 }), options: optionIds }),
        { maxItems: 100 },
      ),
    ),
  }),
  addItem: t.Object({ productId: t.Integer({ minimum: 1 }), quantity: t.Integer({ minimum: 1 }), options: optionIds }),
  lineParams: t.Object({ id: t.Numeric({ minimum: 1 }), lineId: t.Numeric({ minimum: 1 }) }),
```

`order.controller.ts`: เพิ่ม import/inject ของ `SetOrderLineQuantityUseCase`, `RemoveOrderLineUseCase` (constructor ท้ายสุด) และต่อเส้นทางหลัง `.delete('/:id/items/:productId', …)`:

```ts
      .patch(
        '/:id/lines/:lineId',
        async ({ params, body, branch }) =>
          toResponse(await this.setLineQuantity.execute(params.id, params.lineId, body, (await branch()).id)),
        {
          params: orderSchemas.lineParams,
          body: orderSchemas.setQuantity,
          response: orderSchemas.order,
          detail: { summary: 'ตั้งจำนวนของบรรทัดในออเดอร์ (ระบุด้วยรหัสบรรทัด)' },
        },
      )
      .delete(
        '/:id/lines/:lineId',
        async ({ params, branch }) =>
          toResponse(await this.removeLine.execute(params.id, params.lineId, (await branch()).id)),
        { params: orderSchemas.lineParams, response: orderSchemas.order, detail: { summary: 'เอาบรรทัดออกจากออเดอร์ (ระบุด้วยรหัสบรรทัด)' } },
      )
```

แก้ `toResponse` ใน `order.controller.ts` ให้ส่ง `lineId` และ `options` แต่ไม่ส่งต้นทุนของตัวเลือก (ต้นทุนเป็นข้อมูลภายใน เหมือน `unitCostSatang` ของบิล):

```ts
    items: items.map((item) => ({
      ...item,
      options: item.options.map(({ costSatang: _cost, ...option }) => option),
      lineTotalSatang: item.unitPriceSatang * item.quantity,
    })),
```

- [ ] **Step 7: เพิ่มการทดสอบ integration ของออเดอร์** ต่อท้าย `modifiers.integration.test.ts`

```ts
describe('orders with options', () => {
  const setup = async () => {
    const tea = await seedProduct(owner, { name: 'ชานม', priceSatang: 5000, costSatang: 2000, stock: 10 })
    const sweetness = ok(await owner.api.catalog['modifier-groups'].post({ name: 'ความหวาน', required: true }))
    const less = ok(await owner.api.catalog['modifier-groups']({ id: sweetness.id }).options.post({ name: 'หวานน้อย' }))
    const more = ok(await owner.api.catalog['modifier-groups']({ id: sweetness.id }).options.post({ name: 'หวานมาก' }))
    const toppings = ok(await owner.api.catalog['modifier-groups'].post({ name: 'ท็อปปิง', maxSelections: 2 }))
    const pearls = ok(
      await owner.api.catalog['modifier-groups']({ id: toppings.id }).options.post({ name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }),
    )
    ok(await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [sweetness.id, toppings.id] }))
    const order = ok(await owner.api.orders.post({}))
    return { tea, sweetness, less, more, toppings, pearls, order }
  }

  test('the same product with other options is another line, priced with its options', async () => {
    const { tea, less, more, pearls, order } = await setup()

    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, pearls.id] }))
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 2, options: [more.id] }))
    // Same choice as the first line, ids in another order: joins it.
    const after = ok(
      await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [pearls.id, less.id] }),
    )

    expect(after.items.map((line) => [line.options.map((option) => option.name), line.quantity, line.unitPriceSatang])).toEqual([
      [['หวานน้อย', 'ไข่มุก'], 2, 6000],
      [['หวานมาก'], 2, 5000],
    ])
    expect(after.subtotalSatang).toBe(2 * 6000 + 2 * 5000)
  })

  test('a line keeps its id when other lines change, and is edited by that id', async () => {
    const { tea, less, more, order } = await setup()
    const first = ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id] }))
    const second = ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [more.id] }))
    const [firstLine, secondLine] = second.items
    expect(firstLine!.lineId).toBe(first.items[0]!.lineId)

    const changed = ok(await owner.api.orders({ id: order.id }).lines({ lineId: secondLine!.lineId }).patch({ quantity: 4 }))
    expect(changed.items.map((line) => [line.lineId, line.quantity])).toEqual([[firstLine!.lineId, 1], [secondLine!.lineId, 4]])

    const removed = ok(await owner.api.orders({ id: order.id }).lines({ lineId: firstLine!.lineId }).delete())
    expect(removed.items.map((line) => line.lineId)).toEqual([secondLine!.lineId])
  })

  test('the product-id routes of v1 still work on a line without options', async () => {
    const plain = await seedProduct(owner, { name: 'น้ำเปล่า', priceSatang: 1000, stock: 5 })
    const order = ok(await owner.api.orders.post({}))
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: plain.id, quantity: 1 }))

    const changed = ok(await owner.api.orders({ id: order.id }).items({ productId: plain.id }).patch({ quantity: 3 }))

    expect(changed.items.map((line) => line.quantity)).toEqual([3])
  })

  test('a v1 client that sends no options for a product with a required group is told which group', async () => {
    const { tea, order } = await setup()

    const refused = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 })

    expect(refused.status).toBe(400)
    expect(refused.error?.value).toMatchObject({ code: 'MODIFIER_REQUIRED', detail: 'กรุณาเลือก "ความหวาน"' })
  })

  test('refuses too many, repeated and foreign options', async () => {
    const { tea, less, more, order } = await setup()
    const other = await seedProduct(owner, { name: 'อื่น', stock: 1 })

    const tooMany = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, more.id] })
    const repeated = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, less.id] })
    const foreign = await owner.api.orders({ id: order.id }).items.post({ productId: other.id, quantity: 1, options: [less.id] })

    expect(tooMany.error?.value).toMatchObject({ code: 'MODIFIER_TOO_MANY' })
    expect(repeated.error?.value).toMatchObject({ code: 'MODIFIER_DUPLICATE' })
    expect(foreign.error?.value).toMatchObject({ code: 'MODIFIER_NOT_AVAILABLE' })
  })

  test('an option deactivated later cannot be added again, but a line already ordered still pays as quoted', async () => {
    const { tea, less, pearls, order } = await setup()
    const line = ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, pearls.id] }))
    ok(await owner.api.catalog['modifier-options']({ id: pearls.id }).patch({ isActive: false, priceSatang: 5000 }))

    const again = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, pearls.id] })
    expect(again.error?.value).toMatchObject({ code: 'MODIFIER_NOT_AVAILABLE' })
    expect(ok(await owner.api.orders({ id: order.id }).get()).items[0]).toMatchObject({
      lineId: line.items[0]!.lineId,
      unitPriceSatang: 6000,
    })
  })

  test("another order's line id is not found and changes nothing", async () => {
    const { tea, less, order } = await setup()
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id] }))
    const mine = ok(await owner.api.orders.post({}))
    const theirs = ok(await owner.api.orders({ id: order.id }).get()).items[0]!

    const result = await owner.api.orders({ id: mine.id }).lines({ lineId: theirs.lineId }).patch({ quantity: 9 })

    expect(result.error?.value).toMatchObject({ code: 'ORDER_ITEM_NOT_FOUND' })
    expect(ok(await owner.api.orders({ id: order.id }).get()).items[0]!.quantity).toBe(1)
  })
})
```

- [ ] **Step 8: แก้ `orders.integration.test.ts` และการทดสอบเดิมที่ชนิดไม่ตรง** รัน `bun run typecheck` แล้วแก้ทุกที่ที่ชี้ว่าบรรทัดออเดอร์ขาด `lineId`/`options` (ถ้ามี `toEqual` กับบรรทัดทั้งก้อน ให้เติม `lineId: expect.any(Number), options: []`)

- [ ] **Step 9: รันให้ผ่าน**

Run: `cd apps/api && bun --env-file=.env.test test src/modules/orders src/domains src/__tests__/integration/orders.integration.test.ts src/__tests__/integration/modifiers.integration.test.ts`
Expected: PASS (ขาย `SaleCheckout` ยังไม่รับ `options` ในขั้นนี้ การทดสอบ "ชำระออเดอร์ที่มีตัวเลือก" อยู่ใน Task 6)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src
gitcz --non-interactive --type=feat --scope=orders --subject="choose options when ordering, and edit a line by its id" --body="Adding or opening an order resolves the choice with the line options resolver and quotes the price with the options. New routes change or remove a line by its id; the product-id routes work on the line without options.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: บิลขายคิดตัวเลือกใน `SaleCheckout`

**Files:**
- Modify: `apps/api/src/domains/sale.domain.ts`, `apps/api/src/domains/sale.domain.test.ts`
- Modify: `apps/api/src/modules/sales/applications/services/sale-checkout.ts`
- Modify: `apps/api/src/modules/sales/applications/schemas/sale-schemas.ts`
- Modify: `apps/api/src/modules/sales/applications/usecases/{complete-sale,complete-sale-v2}.usecase.ts`
- Modify: `apps/api/src/modules/sales/adapters/repository/sale.drizzle.repository.ts`
- Modify: `apps/api/src/modules/sales/adapters/controllers/schemas/sale.schema.ts`
- Modify: `apps/api/src/modules/sales/applications/usecases/sales.usecases.test.ts`
- Modify: `apps/api/src/__tests__/integration/modifiers.integration.test.ts`, `sales.integration.test.ts` (ชนิดที่ typecheck ชี้)

**Interfaces:**
- Consumes: `CheckoutLine.options/optionIds` (Task 5), `ILineOptionsResolver` (Task 3), `lineKey`
- Produces:
  - `SaleItem.options: LineOption[]`; `CompleteSaleInput.lines[].options?: readonly LineOption[]`
  - `unitPriceSatang` ของบรรทัดบิล = ราคาสินค้า + ราคาตัวเลือก, `unitCostSatang` = ต้นทุนสินค้า + ต้นทุนตัวเลือก
  - HTTP: `items[].options?: number[]` ใน `POST /sales` (v1, v2); คำตอบบิลมี `items[].options`

- [ ] **Step 1: เขียนการทดสอบโดเมนที่ล้มเหลว** ต่อท้าย `sale.domain.test.ts` (ใช้ helper ที่ไฟล์มีอยู่สำหรับสร้างสินค้าและเรียก `SaleEntity.complete` ถ้าชื่อ helper ต่างจากนี้ให้ใช้ชื่อจริงของไฟล์)

```ts
describe('SaleEntity.complete with options', () => {
  const pearls = { groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }

  test('a line costs and sells for the product plus its options, and keeps them', () => {
    const tea = makeProduct({ id: 1, priceSatang: 5000, costSatang: 2000 })

    const sale = SaleEntity.complete({
      lines: [
        { product: tea, quantity: 2, options: [pearls] },
        { product: tea, quantity: 1 },
      ],
      discountSatang: 0,
      payments: [{ method: 'cash', amountSatang: 17000 }],
      vatMode: 'none',
      vatRateBp: 0,
      branchId: 1,
      cashier: { id: 1, displayName: 'สมชาย' },
    })

    expect(sale.items).toEqual([
      expect.objectContaining({ unitPriceSatang: 6000, unitCostSatang: 2400, quantity: 2, lineTotalSatang: 12000, options: [pearls] }),
      expect.objectContaining({ unitPriceSatang: 5000, unitCostSatang: 2000, quantity: 1, lineTotalSatang: 5000, options: [] }),
    ])
    expect(sale.subtotalSatang).toBe(17000)
  })
})
```

(ถ้าไฟล์ทดสอบยังไม่ import `makeProduct`/`SaleEntity` ให้เพิ่ม import ให้ตรงกับที่ไฟล์ใช้)

- [ ] **Step 2: แก้โดเมน** `sale.domain.ts`

เพิ่ม `import type { LineOption } from './modifier.domain'` และ:

```ts
export interface SaleItem {
  productId: number
  productName: string
  sku: string
  /** What one unit was sold for: the product's price plus the options chosen. */
  unitPriceSatang: number
  /** What one unit cost: the product's cost plus the cost of the options chosen. */
  unitCostSatang: number
  quantity: number
  lineTotalSatang: number
  /** The options chosen, as they were. Their price and cost are already in the unit price and cost. */
  options: LineOption[]
}
```

ใน `CompleteSaleInput`:

```ts
  lines: { product: ProductEntity; quantity: number; options?: readonly LineOption[] }[]
```

แทนที่การสร้าง `items` ใน `complete`:

```ts
    const items: SaleItem[] = lines.map(({ product, quantity, options = [] }) => {
      const unitPriceSatang = product.priceSatang + sum(options.map((option) => option.priceSatang))
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceSatang,
        unitCostSatang: product.costSatang + sum(options.map((option) => option.costSatang)),
        quantity,
        lineTotalSatang: unitPriceSatang * quantity,
        options: [...options],
      }
    })
```

ใน constructor ของ `SaleEntity` แก้ `this.items = props.items` เป็น:

```ts
    // `?? []`: a sale restored from a snapshot stored before options were kept has none on its lines.
    this.items = props.items.map((item) => ({ ...item, options: item.options ?? [] }))
```

และใน `toSnapshot` `items: this.items.map((item) => ({ ...item }))` คงเดิม

- [ ] **Step 3: เขียนการทดสอบ use case ของ checkout ที่ล้มเหลว** ใน `sales.usecases.test.ts` เพิ่ม `mockLineOptionsResolver` ลงในที่สร้าง `SaleCheckout` (arg สุดท้าย) แล้วเพิ่ม (ปรับชื่อ helper ของไฟล์ให้ตรง ไฟล์นี้สร้าง `SaleCheckout` ด้วย mock ports อยู่แล้ว)

```ts
describe('SaleCheckout with options', () => {
  const pearls = { groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }

  test('a one-step line with option ids is resolved and sold at product plus options', async () => {
    lineOptions.resolve.mockResolvedValue({ options: [pearls], priceSatang: 1000, costSatang: 400, key: '20' })

    const sale = await checkout.checkout({
      lines: [{ productId: 1, quantity: 2, optionIds: [20] }],
      discountSatang: 0,
      payments: [{ method: 'cash', amountSatang: 12000 }],
      cashier,
      branch,
    })

    expect(lineOptions.resolve).toHaveBeenCalledWith(1, [20])
    expect(sale.items[0]).toMatchObject({ unitPriceSatang: 6000, unitCostSatang: 1000, options: [pearls] })
  })

  test('an order line is sold at the quoted unit price whatever the options cost now', async () => {
    const sale = await checkout.checkout({
      lines: [{ productId: 1, quantity: 1, unitPriceSatang: 5500, options: [pearls] }],
      discountSatang: 0,
      payments: [{ method: 'cash', amountSatang: 5500 }],
      cashier,
      branch,
    })

    expect(lineOptions.resolve).not.toHaveBeenCalled()
    expect(sale.items[0]).toMatchObject({ unitPriceSatang: 5500, options: [pearls] })
  })

  test('the same product with different options is two lines, but its stock is checked for the total', async () => {
    products.findManyForUpdate.mockResolvedValue([makeProduct({ id: 1, stockQty: 3, trackStock: true })])
    lineOptions.resolve
      .mockResolvedValueOnce({ options: [pearls], priceSatang: 1000, costSatang: 400, key: '20' })
      .mockResolvedValueOnce({ options: [], priceSatang: 0, costSatang: 0, key: '' })

    await expect(
      checkout.checkout({
        lines: [
          { productId: 1, quantity: 2, optionIds: [20] },
          { productId: 1, quantity: 2 },
        ],
        discountSatang: 0,
        payments: [{ method: 'cash', amountSatang: 30000 }],
        cashier,
        branch,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })
})
```

ถ้า `checkout`, `products`, `lineOptions`, `cashier`, `branch` ในไฟล์ใช้ชื่ออื่น ให้ใช้ชื่อที่ไฟล์ประกาศไว้ (ดู `beforeEach` ของไฟล์)

- [ ] **Step 4: รันให้เห็นว่าล้มเหลว**

Run: `cd apps/api && bun --env-file=.env.test test src/domains/sale.domain.test.ts src/modules/sales`
Expected: FAIL

- [ ] **Step 5: แก้ `SaleCheckout`**

เพิ่ม import:

```ts
import { lineKey, type LineOption } from '../../../../domains/modifier.domain'
import { lineOptionsResolverToken } from '../../../modifiers/applications/ports/line-options-resolver.port'
import type { ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
```

constructor เพิ่ม dependency ท้ายสุด:

```ts
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
```

แทนที่บล็อกตั้งแต่คอมเมนต์ `// Merge repeated products;` ถึงก่อน `const priced = SaleEntity.complete({` ด้วย:

```ts
    // Lines are the product with its options: the same choice repeated is merged, a Map keeps the order
    // they were added, and the first quoted price of a line wins.
    interface WantedLine {
      productId: number
      options: LineOption[]
      quantity: number
      quotedUnitPriceSatang: number | undefined
    }
    const wanted = new Map<string, WantedLine>()
    for (const line of requested) {
      // An order has already resolved its options and quoted a price; a one-step sale is resolved here.
      const options = line.options
        ? [...line.options]
        : (await this.lineOptions.resolve(line.productId, line.optionIds ?? [])).options
      const key = `${line.productId}:${lineKey(options)}`
      const existing = wanted.get(key)
      if (existing) existing.quantity += line.quantity
      else wanted.set(key, { productId: line.productId, options, quantity: line.quantity, quotedUnitPriceSatang: line.unitPriceSatang })
    }

    // Read inside the caller's unit of work, so the sale is priced with the settings in force when it is recorded.
    const shop = await this.settings.get()
    const sellingBranch = await this.branches.findById(branch.id)

    // Stock is for the product, whichever options the lines have, so it is checked for the total.
    const quantities = new Map<number, number>()
    for (const line of wanted.values()) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity)

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
      // The quote includes the options; the entity adds them back, so the product carries the base price.
      const optionsPrice = line.options.reduce((total, option) => total + option.priceSatang, 0)
      return {
        product: product.with({ priceSatang: line.quotedUnitPriceSatang - optionsPrice }),
        quantity: line.quantity,
        options: line.options,
      }
    })
```

(เหลือโค้ดหลังจากนั้นเดิม: `SaleEntity.complete({ lines, … })`)

- [ ] **Step 6: zod และ use case ของขายขั้นตอนเดียว** `sale-schemas.ts`:

```ts
export const completeSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        quantity: z.number().int().min(1),
        options: z.array(z.number().int().positive()).max(40).optional(),
      }),
    )
    .min(1),
  discountSatang: z.number().int().min(0).optional(),
  payments: z.array(payment).min(1),
})
```

ใน `complete-sale.usecase.ts` และ `complete-sale-v2.usecase.ts` แก้ `lines: dto.items,` เป็น:

```ts
        lines: dto.items.map(({ productId, quantity, options }) => ({ productId, quantity, optionIds: options })),
```

- [ ] **Step 7: repository ของบิล** `sale.drizzle.repository.ts`

`itemColumns` เพิ่ม `options: saleItems.options,` และใน `create` แก้เป็น:

```ts
    await executor.insert(saleItems).values(items.map((item) => ({ ...item, options: [...item.options], saleId })))
```

- [ ] **Step 8: HTTP schema ของบิล** `sale.schema.ts`

เพิ่มด้านบน:

```ts
const lineOption = t.Object({
  groupId: t.Integer(),
  groupName: t.String(),
  optionId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
})

const saleItem = t.Object({
  productId: t.Integer(),
  productName: t.String(),
  sku: t.String(),
  // One unit: the product's price plus the options chosen.
  unitPriceSatang: t.Integer(),
  quantity: t.Integer(),
  lineTotalSatang: t.Integer(),
  options: t.Array(lineOption),
})

const itemRequest = t.Object({
  productId: t.Integer(),
  quantity: t.Integer({ minimum: 1 }),
  options: t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 40 })),
})
```

และในตัวอ็อบเจ็กต์ `saleSchemas`: `sale.items: t.Array(saleItem)`, `saleV2` ส่วน `items: t.Array(saleItem)`, `create.items: t.Array(itemRequest, { minItems: 1 })`, `createV2` ส่วน `items: t.Array(itemRequest, { minItems: 1 })`

ต้นทุนของตัวเลือกเป็นข้อมูลภายใน เหมือน `unitCostSatang` ของบรรทัด จึงไม่ออกใน API ของบิล (`lineOption` ด้านบนไม่มี `costSatang`) แก้ presenter ทั้งสองให้ตัดออกจากตัวเลือกของบรรทัด:

```ts
// sale.presenter.ts และ sale-v2.presenter.ts
items: items.map(({ unitCostSatang: _cost, options, ...item }) => ({
  ...item,
  options: options.map(({ costSatang: _optionCost, ...option }) => option),
})),
```

- [ ] **Step 9: เพิ่มการทดสอบ integration** ต่อท้าย `modifiers.integration.test.ts` (ใช้ `setup` ที่นิยามไว้ใน Task 5 ซึ่งอยู่ใน describe อื่น ให้ยกออกมาเป็นฟังก์ชันระดับไฟล์ก่อน)

```ts
describe('selling with options', () => {
  const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]

  test('a one-step sale is priced with the options and its profit counts their cost', async () => {
    const { tea, less, pearls } = await setup()

    const sale = ok(
      await owner.api.sales.post({
        items: [{ productId: tea.id, quantity: 2, options: [less.id, pearls.id] }],
        payments: cash(12000),
      }),
    )

    expect(sale).toMatchObject({ subtotalSatang: 12000, totalSatang: 12000 })
    expect(sale.items[0]).toMatchObject({ unitPriceSatang: 6000, quantity: 2, lineTotalSatang: 12000 })
    expect(sale.items[0]!.options.map((option) => option.name)).toEqual(['หวานน้อย', 'ไข่มุก'])
    const HOUR = 60 * 60 * 1000
    const summary = ok(
      await owner.api.sales.summary.get({ query: { from: new Date(Date.now() - HOUR), to: new Date(Date.now() + HOUR) } }),
    )
    // 2 x (60.00 - (20.00 + 4.00)) = 72.00
    expect(summary.profitSatang).toBe(12000 - 2 * 2400)
  })

  test('paying an order sells each line with its options, at the price quoted', async () => {
    const { tea, less, more, pearls, order } = await setup()
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, pearls.id] }))
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 2, options: [more.id] }))
    // The price of the topping changes after it was ordered: the order is charged what it was quoted.
    ok(await owner.api.catalog['modifier-options']({ id: pearls.id }).patch({ priceSatang: 9000 }))

    const sale = ok(await owner.api.orders({ id: order.id }).pay.post({ payments: cash(16000) }))

    expect(sale.items.map((item) => [item.options.map((option) => option.name), item.unitPriceSatang, item.quantity])).toEqual([
      [['หวานน้อย', 'ไข่มุก'], 6000, 1],
      [['หวานมาก'], 5000, 2],
    ])
    expect(sale.totalSatang).toBe(16000)
  })

  test('selling the same product in two lines cannot get past the stock', async () => {
    const { less, more, sweetness } = await setup()
    const scarce = await seedProduct(owner, { name: 'หายาก', priceSatang: 1000, stock: 3 })
    ok(await owner.api.catalog.products({ id: scarce.id })['modifier-groups'].put({ groupIds: [sweetness.id] }))

    const refused = await owner.api.sales.post({
      items: [
        { productId: scarce.id, quantity: 2, options: [less.id] },
        { productId: scarce.id, quantity: 2, options: [more.id] },
      ],
      payments: cash(4000),
    })

    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  test('a v1 sale without options for a product with a required group is refused, naming the group', async () => {
    const { tea } = await setup()

    const refused = await owner.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(5000) })

    expect(refused.error?.value).toMatchObject({ code: 'MODIFIER_REQUIRED', detail: 'กรุณาเลือก "ความหวาน"' })
  })

  test('a sale already made does not change when the option is renamed or its price changes', async () => {
    const { tea, less, pearls } = await setup()
    const sale = ok(
      await owner.api.sales.post({ items: [{ productId: tea.id, quantity: 1, options: [less.id, pearls.id] }], payments: cash(6000) }),
    )
    ok(await owner.api.catalog['modifier-options']({ id: pearls.id }).patch({ name: 'ไข่มุกใหม่', priceSatang: 9999, isActive: false }))

    const again = ok(await owner.api.sales({ id: sale.id }).get())

    expect(again.items[0]!.options.map((option) => [option.name, option.priceSatang])).toEqual([['หวานน้อย', 0], ['ไข่มุก', 1000]])
    expect(again.items[0]!.unitPriceSatang).toBe(6000)
  })

  test('voiding a sale with two lines of one product puts back all of its stock', async () => {
    const { tea, less, more, sweetness } = await setup()
    const stockBefore = ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty
    const sale = ok(
      await owner.api.sales.post({
        items: [
          { productId: tea.id, quantity: 1, options: [less.id] },
          { productId: tea.id, quantity: 2, options: [more.id] },
        ],
        payments: cash(15000),
      }),
    )
    expect(ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty).toBe(stockBefore - 3)

    ok(await owner.api.sales({ id: sale.id }).void.post({ reason: 'ทดสอบ' }))

    expect(ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty).toBe(stockBefore)
    expect(sweetness.id).toBeGreaterThan(0)
  })

  test('replaying a v2 sale stored before options existed restores its lines without options', async () => {
    // A snapshot made before this feature has lines with no `options` key.
    const { restoreSaleSnapshot } = await import('../../modules/sales/applications/sale-snapshot')
    const legacy = {
      id: 1,
      receiptNo: 'MAIN-20260101-00001',
      status: 'completed',
      subtotalSatang: 1000,
      discountSatang: 0,
      totalSatang: 1000,
      vatSatang: 65,
      paidSatang: 1000,
      changeSatang: 0,
      vatMode: 'inclusive',
      vatRateBp: 700,
      branchId: 1,
      shiftId: 1,
      cashierId: 1,
      cashierName: 'สมชาย',
      voidedById: null,
      voidedAt: null,
      voidReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      items: [{ productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 1000, unitCostSatang: 600, quantity: 1, lineTotalSatang: 1000 }],
      payments: [{ method: 'cash', amountSatang: 1000 }],
    }

    expect(restoreSaleSnapshot(legacy).items[0]!.options).toEqual([])
  })
})
```

หมายเหตุ: ขั้นตอนนี้ต้องยก `setup` จาก describe ของ Task 5 ไปเป็นฟังก์ชันระดับไฟล์ (ไม่ซ้อนใน describe) เพื่อให้ใช้ร่วมกัน และถ้า `owner.api.sales.summary` ต้องการรูปแบบ query ต่างจากนี้ ให้ดู `summary.integration.test.ts` (ใช้ `{ query: { from, to } }` ตามที่ไฟล์นั้นใช้)

- [ ] **Step 10: แก้ชนิดที่ typecheck ชี้ในการทดสอบเดิม**

Run: `bun run typecheck`
แก้ทุกที่ที่ `SaleItem` literal ขาด `options` ด้วยการเติม `options: []` (ใน `sale.domain.test.ts`, `sales.usecases.test.ts`, `factories.ts` ของ `makeSale`, `sales.integration.test.ts` ถ้ามี `toEqual` กับ item ให้เติม `options: []`)

- [ ] **Step 11: รันชุดทดสอบทั้งหมดของ API**

Run (จาก root): `bun run typecheck` และ `cd apps/api && bun --env-file=.env.test test`
Expected: ทุกอย่างผ่าน ยกเว้น `openapi:check` ซึ่งยังไม่ได้บันทึก baseline (Task 12)

- [ ] **Step 12: Commit**

```bash
git add apps/api/src
gitcz --non-interactive --type=feat --scope=sales --subject="sell options with their price and cost, and keep them on the receipt line" --body="A sale line is the product with its options. The checkout resolves option ids for a one-step sale, takes the quoted price for an order line, and checks stock for the product as a whole so splitting a product into lines cannot oversell.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: เว็บ: ราคาบรรทัดรวมตัวเลือกและตะกร้า (ฟังก์ชันล้วนและ store)

**Files:**
- Modify: `apps/web/src/features/pos/lib/cart.ts`, `apps/web/src/features/pos/lib/cart.test.ts`
- Create: `apps/web/src/features/pos/lib/options.ts`, `apps/web/src/features/pos/lib/options.test.ts`
- Modify: `apps/web/src/features/pos/store/cart.store.ts`, `apps/web/src/features/pos/store/cart.store.test.ts`

**Interfaces:**
- Consumes: `resolveLineOptions`, `lineKey`, `ModifierGroupWithOptions` จาก `@pos/api/modifiers` (Task 1); ชนิด `ModifierGroup` จาก `@pos/api/types` (Task 3); `Order['items']` ที่มี `lineId`, `options` (Task 5)
- Produces:
  - `CartLine = { key: string; productId: number; optionIds: number[]; quantity: number }`, `cartLineKey(productId, optionIds): string`
  - store: `add(productId, optionIds?)`, `setQuantity(key, quantity)`
  - `PricedLine` เพิ่ม `lineKey: string`, `lineId: number | null`, `options: { name: string; priceSatang: number }[]`, `unavailable: boolean`
  - `priceCart(lines, products, discountInput, options, optionsById?)` (พารามิเตอร์ที่ห้าเป็นทางเลือก)
  - `offeredGroups(groups, productId): ModifierGroup[]` (กลุ่มที่เปิดใช้และมีตัวเลือกที่เปิดใช้ ของสินค้า)
  - `chooseOptions(groups, ids): ResolvedLineOptions | null` (null เมื่อกฎไม่ผ่าน)

- [ ] **Step 1: เขียนการทดสอบที่ล้มเหลว** `options.test.ts`

```ts
import type { ModifierGroup } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { chooseOptions, offeredGroups } from './options'

const group = (overrides: Partial<ModifierGroup>): ModifierGroup => ({
  id: 1,
  name: 'ความหวาน',
  required: true,
  maxSelections: 1,
  sortOrder: 0,
  isActive: true,
  productIds: [7],
  options: [
    { id: 10, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true },
    { id: 11, groupId: 1, name: 'หวานมาก', priceSatang: 0, costSatang: 0, sortOrder: 1, isActive: false },
  ],
  ...overrides,
})

describe('offeredGroups', () => {
  test('keeps the active groups of the product that have an active option, leaving closed options out', () => {
    const groups = [
      group({ id: 1 }),
      group({ id: 2, productIds: [8] }),
      group({ id: 3, isActive: false }),
      group({ id: 4, options: [] }),
    ]

    const offered = offeredGroups(groups, 7)

    expect(offered.map((item) => item.id)).toEqual([1])
    expect(offered[0]!.options.map((option) => option.id)).toEqual([10])
  })
})

describe('chooseOptions', () => {
  const offered = offeredGroups([group({})], 7)

  test('a valid choice is resolved with its price', () => {
    expect(chooseOptions(offered, [10])).toMatchObject({ key: '10', priceSatang: 0 })
  })

  test('a choice that breaks a rule is null, so the dialog can keep its button disabled', () => {
    expect(chooseOptions(offered, [])).toBeNull()
    expect(chooseOptions(offered, [99])).toBeNull()
  })
})
```

- [ ] **Step 2: เขียน `options.ts`**

```ts
import { resolveLineOptions, type ModifierGroupWithOptions, type ResolvedLineOptions } from '@pos/api/modifiers'
import type { ModifierGroup } from '@pos/api/types'

/**
 * The groups the till asks about when this product is sold: active groups with at least one active
 * option, and only the options that can be chosen. A product with none is added without asking.
 */
export function offeredGroups(groups: readonly ModifierGroup[], productId: number): ModifierGroup[] {
  return groups
    .filter((group) => group.isActive && group.productIds.includes(productId))
    .map((group) => ({ ...group, options: group.options.filter((option) => option.isActive) }))
    .filter((group) => group.options.length > 0)
}

/** The server's rule, applied here so the dialog and the server never disagree. Null when it is not allowed. */
export function chooseOptions(groups: readonly ModifierGroup[], optionIds: readonly number[]): ResolvedLineOptions | null {
  const withOptions: ModifierGroupWithOptions[] = groups.map((group) => ({ group, options: group.options }))
  try {
    return resolveLineOptions(withOptions, optionIds)
  } catch {
    return null
  }
}
```

- [ ] **Step 3: เขียนการทดสอบ store ที่ล้มเหลว** แก้ `cart.store.test.ts`

แก้ทุกที่ที่เทียบ `lines` กับ `{ productId, quantity }` ให้มี `key` และ `optionIds` เช่น `{ key: '7:', productId: 7, optionIds: [], quantity: 2 }` และเพิ่ม:

```ts
test('the same product with other options is another line; the same options join, whatever the order', () => {
  const { add } = useCartStore.getState()

  add(7, [20])
  add(7, [10, 20])
  add(7, [20, 10])
  add(7)

  expect(useCartStore.getState().lines.map((line) => [line.key, line.quantity])).toEqual([
    ['7:20', 1],
    ['7:10-20', 2],
    ['7:', 1],
  ])
})

test('quantity is set by the line key, and 0 removes only that line', () => {
  const { add, setQuantity } = useCartStore.getState()
  add(7, [20])
  add(7)

  setQuantity('7:20', 3)
  expect(useCartStore.getState().lines.map((line) => line.quantity)).toEqual([3, 1])

  setQuantity('7:', 0)
  expect(useCartStore.getState().lines.map((line) => line.key)).toEqual(['7:20'])
})
```

(ถ้าไฟล์ทดสอบเดิมรีเซ็ต store ด้วยวิธีใด ให้ทำเหมือนเดิมก่อนแต่ละกรณี)

- [ ] **Step 4: แก้ store** `cart.store.ts`

```ts
import { create } from 'zustand'

/**
 * A cart line holds only the product id, the option ids chosen and the quantity. Names, prices and
 * stock are read from the products and modifier queries when the cart is priced, so the cart can
 * never show a stale price.
 */
export interface CartLine {
  /** `productId:optionIds`: the same product with the same options is one line. */
  key: string
  productId: number
  optionIds: number[]
  quantity: number
}

export const cartLineKey = (productId: number, optionIds: readonly number[]) =>
  `${productId}:${[...optionIds].sort((a, b) => a - b).join('-')}`

interface CartState {
  lines: CartLine[]
  /** What the cashier typed in the discount field, in baht. Parsed when the cart is priced. */
  discount: string
  /**
   * The open order the till is working on, or null for the one-step cart. Its lines live on the
   * server (they are read through TanStack Query); only which order is chosen is kept here.
   */
  orderId: number | null
  add: (productId: number, optionIds?: readonly number[]) => void
  /** A quantity of 0 or less removes the line. */
  setQuantity: (key: string, quantity: number) => void
  setDiscount: (discount: string) => void
  /** Works on an open order instead of the local cart. */
  workOnOrder: (orderId: number) => void
  /** Empties the cart and stops working on any order (the order itself stays open). */
  clear: () => void
}

/** The cart lives outside React so it survives navigating to another page and back. */
export const useCartStore = create<CartState>()((set) => ({
  lines: [],
  discount: '',
  orderId: null,
  add: (productId, optionIds = []) =>
    set((state) => {
      const key = cartLineKey(productId, optionIds)
      return {
        lines: state.lines.some((line) => line.key === key)
          ? state.lines.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line))
          : [...state.lines, { key, productId, optionIds: [...optionIds].sort((a, b) => a - b), quantity: 1 }],
      }
    }),
  setQuantity: (key, quantity) =>
    set((state) => ({
      lines: state.lines
        .map((line) => (line.key === key ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
    })),
  setDiscount: (discount) => set({ discount }),
  workOnOrder: (orderId) => set({ orderId, lines: [], discount: '' }),
  clear: () => set({ lines: [], discount: '', orderId: null }),
}))

/** For code outside React, such as the logout handler. */
export const clearCart = () => useCartStore.getState().clear()
```

- [ ] **Step 5: เขียนการทดสอบราคาที่ล้มเหลว** ต่อท้าย `cart.test.ts` (และแก้บรรทัดเดิมที่เรียก `priceCart` ด้วย `{ productId, quantity }` ให้เพิ่ม `key: '1:', optionIds: []` ตามชนิด `CartLine`; ดู `order` ที่ใช้ `Order['items']` ให้เติม `lineId`, `options: []`)

```ts
describe('options on a line', () => {
  const tea = product({ id: 1, priceSatang: 5000, stockQty: 4 })
  const optionsById = new Map([
    [20, { id: 20, name: 'ไข่มุก', priceSatang: 1000 }],
    [21, { id: 21, name: 'วุ้น', priceSatang: 500 }],
  ])

  test('a line is priced at the product plus its options, and lists them', () => {
    const cart = priceCart(
      [{ key: '1:20-21', productId: 1, optionIds: [20, 21], quantity: 2 }],
      catalogue(tea),
      '',
      inclusive,
      optionsById,
    )

    expect(cart.lines[0]).toMatchObject({
      unitPriceSatang: 6500,
      lineTotalSatang: 13000,
      lineKey: '1:20-21',
      lineId: null,
      options: [
        { name: 'ไข่มุก', priceSatang: 1000 },
        { name: 'วุ้น', priceSatang: 500 },
      ],
      optionIds: [20, 21],
      unavailable: false,
    })
    expect(cart.totalSatang).toBe(13000)
  })

  test('two lines of one product share its stock', () => {
    const cart = priceCart(
      [
        { key: '1:20', productId: 1, optionIds: [20], quantity: 3 },
        { key: '1:', productId: 1, optionIds: [], quantity: 2 },
      ],
      catalogue(tea),
      '',
      inclusive,
      optionsById,
    )

    expect(cart.lines.map((line) => line.exceedsStock)).toEqual([true, true])
    expect(cart.canPay).toBe(false)
  })

  test('an option that is no longer offered blocks payment instead of silently charging less', () => {
    const cart = priceCart([{ key: '1:99', productId: 1, optionIds: [99], quantity: 1 }], catalogue(tea), '', inclusive, optionsById)

    expect(cart.lines[0]).toMatchObject({ unavailable: true })
    expect(cart.canPay).toBe(false)
  })

  test('an order line is priced as quoted, with the options it kept', () => {
    const cart = priceOrder(
      [
        {
          lineId: 9,
          productId: 1,
          productName: 'ชา',
          sku: 'TEA',
          unitPriceSatang: 6000,
          quantity: 1,
          lineTotalSatang: 6000,
          options: [{ groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000 }],
        },
      ],
      catalogue(tea),
      '',
      inclusive,
    )

    expect(cart.lines[0]).toMatchObject({ lineId: 9, lineKey: '9', unitPriceSatang: 6000, options: [{ name: 'ไข่มุก', priceSatang: 1000 }] })
  })
})
```

- [ ] **Step 6: แก้ `cart.ts`**

แทนที่ส่วนบนถึง `priceOrder`:

```ts
import type { Order, Product } from '@pos/api/types'
import { calculateTotals, type VatMode } from '@pos/api/pricing'
import type { CartLine } from '../store/cart.store'

export interface PricedLine {
  /** Names the line to the cart actions: the cart's own key, or the order line's id. */
  lineKey: string
  /** The id of the order line; null for a line in the local cart. */
  lineId: number | null
  productId: number
  name: string
  /** One unit, the options included. */
  unitPriceSatang: number
  quantity: number
  lineTotalSatang: number
  options: { name: string; priceSatang: number }[]
  /** The ids of the options chosen, in the cart's order; what a sale or an order is sent. */
  optionIds: number[]
  /** More than the shop has: the sale would be refused. The stock is the product's, shared by its lines. */
  exceedsStock: boolean
  /** What is on the shelf, for the message shown when the line asks for more. */
  stockQty: number
  /** An option on the line cannot be chosen any more, so the line cannot be sold as it is. */
  unavailable: boolean
}

export interface PricedCart {
  lines: PricedLine[]
  itemCount: number
  subtotalSatang: number
  /** The discount that applies: 0 while the field is empty or invalid. */
  discountSatang: number
  isDiscountValid: boolean
  /** VAT charged on this cart, whether included in the total or added on top. */
  vatSatang: number
  /** What the customer owes: exactly what the server will charge. */
  totalSatang: number
  canPay: boolean
}

export interface PricingOptions {
  vatMode: VatMode
  vatRateBp: number
  /** Reads the discount the cashier typed into minor units; null when it is not a valid amount. */
  parseAmount: (input: string) => number | null
}

/** What the till needs to know about an option to price it. */
export interface CartOption {
  id: number
  name: string
  priceSatang: number
}

const exceeds = (product: Product | undefined, quantity: number) =>
  product !== undefined && product.trackStock && quantity > product.stockQty

/** How many of each product the lines ask for in all: stock is shared by a product's lines. */
function demandByProduct(lines: readonly { productId: number; quantity: number }[]) {
  const demand = new Map<number, number>()
  for (const { productId, quantity } of lines) demand.set(productId, (demand.get(productId) ?? 0) + quantity)
  return demand
}

/**
 * Prices a cart from the current product data. All amounts are integers in the minor unit, and the
 * totals come from the same function the server uses, so the screen never disagrees with the receipt.
 * Lines whose product is no longer sellable are left out rather than charged at a stale price; a line
 * whose option is no longer offered is kept but blocks payment.
 */
export function priceCart(
  lines: readonly CartLine[],
  products: ReadonlyMap<number, Product>,
  discountInput: string,
  options: PricingOptions,
  optionsById: ReadonlyMap<number, CartOption> = new Map(),
): PricedCart {
  const demand = demandByProduct(lines)
  const priced: PricedLine[] = []
  for (const { key, productId, optionIds, quantity } of lines) {
    const product = products.get(productId)
    if (!product) continue
    const chosen = optionIds.flatMap((id) => optionsById.get(id) ?? [])
    const unitPriceSatang = product.priceSatang + chosen.reduce((total, option) => total + option.priceSatang, 0)
    priced.push({
      lineKey: key,
      lineId: null,
      productId,
      name: product.name,
      unitPriceSatang,
      quantity,
      lineTotalSatang: unitPriceSatang * quantity,
      options: chosen.map(({ name, priceSatang }) => ({ name, priceSatang })),
      optionIds: [...optionIds],
      exceedsStock: exceeds(product, demand.get(productId) ?? quantity),
      stockQty: product.stockQty,
      unavailable: chosen.length !== optionIds.length,
    })
  }
  return summarize(priced, discountInput, options)
}

/**
 * Prices an open order. Its lines carry the price quoted when each was added, and that is what is
 * charged, whatever the menu says now. The catalogue is only consulted to warn about stock.
 */
export function priceOrder(
  items: Order['items'],
  products: ReadonlyMap<number, Product>,
  discountInput: string,
  options: PricingOptions,
): PricedCart {
  const demand = demandByProduct(items)
  const priced: PricedLine[] = items.map((item) => {
    const product = products.get(item.productId)
    return {
      lineKey: String(item.lineId),
      lineId: item.lineId,
      productId: item.productId,
      name: item.productName,
      unitPriceSatang: item.unitPriceSatang,
      quantity: item.quantity,
      lineTotalSatang: item.unitPriceSatang * item.quantity,
      options: item.options.map(({ name, priceSatang }) => ({ name, priceSatang })),
      optionIds: item.options.map((option) => option.optionId),
      exceedsStock: exceeds(product, demand.get(item.productId) ?? item.quantity),
      stockQty: product?.stockQty ?? 0,
      unavailable: false,
    }
  })
  return summarize(priced, discountInput, options)
}
```

และใน `summarize` แก้ `canPay`:

```ts
    canPay:
      priced.length > 0 &&
      isDiscountValid &&
      totalSatang > 0 &&
      !priced.some((line) => line.exceedsStock || line.unavailable),
```

- [ ] **Step 7: รัน**

Run: `cd apps/web && bun test src/features/pos`
Expected: PASS (ถ้ามีกรณีเดิมที่ใช้ `toEqual` กับ `PricedLine` ทั้งก้อน ให้เติมฟิลด์ใหม่ตามค่าที่ถูกต้อง ห้ามลบการยืนยันเดิม)

- [ ] **Step 8: Commit** (typecheck ของเว็บทั้งหมดจะเขียวหลัง Task 10 เพราะ component ยังเรียก `setQuantity(productId, …)` อยู่)

```bash
git add apps/web/src/features/pos/lib apps/web/src/features/pos/store
gitcz --non-interactive --type=feat --scope=web --subject="price cart lines with their options and key them by product and options" --body="Pure functions and the cart store only; the screens follow. Stock is checked for the product across its lines, and a line whose option is no longer offered blocks payment.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: เว็บ: feature `modifiers` (api, หน้าจัดการ, ข้อความ, เส้นทาง)

**Files:**
- Create: `apps/web/src/features/modifiers/{api.ts,index.ts,locales.ts}`
- Create: `apps/web/src/features/modifiers/components/ModifiersPage.tsx`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/AppSidebar.tsx`, `apps/web/src/app/i18n.ts`, `apps/web/src/app/locales.ts`
- Modify: `apps/web/src/locales/errors.ts`

**Interfaces:**
- Consumes: HTTP routes (Task 3), `ModifierGroup`/`ModifierOption` ชนิด
- Produces: `modifierGroupsQuery`, `modifierKeys`, `useCreateModifierGroup`, `useUpdateModifierGroup`, `useCreateModifierOption`, `useUpdateModifierOption`, `ModifiersPage`, `modifiersLocales`; เส้นทาง `/modifiers` (เจ้าของเท่านั้น)

- [ ] **Step 1: `api.ts`**

```ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const modifierKeys = {
  /** Prefix of every modifier query: invalidate this after anything that changes groups, options or what a product offers. */
  all: ['modifiers'] as const,
}

/** Every group with its options and the products it is offered on. A shop has few, so one request. */
export const modifierGroupsQuery = queryOptions({
  queryKey: modifierKeys.all,
  queryFn: async () => (await unwrap(api.catalog['modifier-groups'].get())).items,
})

export interface ModifierGroupInput {
  name: string
  required: boolean
  maxSelections: number
  sortOrder: number
}

export interface ModifierOptionInput {
  name: string
  priceSatang: number
  costSatang: number
  sortOrder: number
}

export function useCreateModifierGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ModifierGroupInput) => unwrap(api.catalog['modifier-groups'].post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}

export function useUpdateModifierGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<ModifierGroupInput> & { isActive?: boolean } }) =>
      unwrap(api.catalog['modifier-groups']({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}

export function useCreateModifierOption() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: number; input: ModifierOptionInput }) =>
      unwrap(api.catalog['modifier-groups']({ id: groupId }).options.post(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}

export function useUpdateModifierOption() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<ModifierOptionInput> & { isActive?: boolean } }) =>
      unwrap(api.catalog['modifier-options']({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
  })
}
```

- [ ] **Step 2: `index.ts`**

```ts
export type { ModifierGroup, ModifierOption } from '@pos/api/types'
export { modifierGroupsQuery, modifierKeys } from './api'
export { ModifiersPage } from './components/ModifiersPage'
export { locales as modifiersLocales } from './locales'
```

- [ ] **Step 3: `locales.ts`**

```ts
const th = {
  title: 'ตัวเลือกเสริม',
  description: '{{items}} · เช่น ระดับความหวาน ท็อปปิง ที่เลือกได้ตอนขาย',
  addGroup: 'เพิ่มกลุ่มตัวเลือก',
  addOption: 'เพิ่มตัวเลือก',
  empty: 'ยังไม่มีกลุ่มตัวเลือก',
  noOptions: 'ยังไม่มีตัวเลือกในกลุ่มนี้',
  group: {
    summaryRequired: 'บังคับเลือก',
    summaryOptional: 'ไม่บังคับ',
    one: 'เลือกได้ 1 อย่าง',
    many: 'เลือกได้ไม่เกิน {{count}} อย่าง',
    products: 'ใช้กับ {{count}} สินค้า',
    inactive: 'ปิดใช้งาน',
    actions: 'การทำงานอื่นของกลุ่ม {{name}}',
    edit: 'แก้ไขกลุ่ม',
    deactivate: 'ปิดใช้งานกลุ่ม',
    activate: 'เปิดใช้งานกลุ่ม',
  },
  option: {
    price: 'ราคาเพิ่ม',
    cost: 'ต้นทุน',
    free: 'ไม่คิดเพิ่ม',
    inactive: 'ปิดใช้งาน',
    actions: 'การทำงานอื่นของ {{name}}',
    edit: 'แก้ไข',
    deactivate: 'ปิดใช้งาน',
    activate: 'เปิดใช้งาน',
  },
  groupForm: {
    titleNew: 'เพิ่มกลุ่มตัวเลือก',
    titleEdit: 'แก้ไขกลุ่มตัวเลือก',
    description: 'กลุ่มหนึ่งใช้กับหลายสินค้าได้ เลือกสินค้าที่ใช้ในหน้าแก้ไขสินค้า',
    name: 'ชื่อกลุ่ม',
    required: 'บังคับเลือก',
    requiredHint: 'ต้องเลือกอย่างน้อย 1 อย่างก่อนเพิ่มลงตะกร้า',
    maxSelections: 'เลือกได้สูงสุด',
    maxSelectionsHint: '1 = เลือกได้อย่างเดียว',
    sortOrder: 'ลำดับการแสดง',
    sortOrderHint: 'เลขน้อยแสดงก่อน',
  },
  optionForm: {
    titleNew: 'เพิ่มตัวเลือก',
    titleEdit: 'แก้ไขตัวเลือก',
    description: 'ราคาเพิ่มบวกเข้ากับราคาสินค้า ต้นทุนบวกเข้ากับต้นทุนสินค้าในรายงานกำไร',
    name: 'ชื่อตัวเลือก',
    price: 'ราคาเพิ่ม ({{currency}})',
    cost: 'ต้นทุน ({{currency}})',
    sortOrder: 'ลำดับการแสดง',
  },
  toast: {
    groupCreated: 'เพิ่มกลุ่ม "{{name}}" แล้ว',
    groupUpdated: 'บันทึกกลุ่ม "{{name}}" แล้ว',
    optionCreated: 'เพิ่มตัวเลือก "{{name}}" แล้ว',
    optionUpdated: 'บันทึกตัวเลือก "{{name}}" แล้ว',
  },
  save: 'บันทึก',
  saving: 'กำลังบันทึก…',
}

const en = {
  title: 'Modifiers',
  description: '{{items}} · such as sweetness or toppings, chosen when selling',
  addGroup: 'Add group',
  addOption: 'Add option',
  empty: 'No modifier groups yet',
  noOptions: 'No options in this group yet',
  group: {
    summaryRequired: 'Required',
    summaryOptional: 'Optional',
    one: 'Choose 1',
    many: 'Choose up to {{count}}',
    products: 'Used on {{count}} products',
    inactive: 'Deactivated',
    actions: 'More actions for group {{name}}',
    edit: 'Edit group',
    deactivate: 'Deactivate group',
    activate: 'Activate group',
  },
  option: {
    price: 'Extra price',
    cost: 'Cost',
    free: 'No extra charge',
    inactive: 'Deactivated',
    actions: 'More actions for {{name}}',
    edit: 'Edit',
    deactivate: 'Deactivate',
    activate: 'Activate',
  },
  groupForm: {
    titleNew: 'Add modifier group',
    titleEdit: 'Edit modifier group',
    description: 'A group can be used by many products. Choose the products on the product form.',
    name: 'Group name',
    required: 'Required',
    requiredHint: 'At least 1 must be chosen before it can be added to the cart',
    maxSelections: 'Most that can be chosen',
    maxSelectionsHint: '1 = choose one only',
    sortOrder: 'Display order',
    sortOrderHint: 'Lower numbers come first',
  },
  optionForm: {
    titleNew: 'Add option',
    titleEdit: 'Edit option',
    description: 'The extra price is added to the product price, the cost to its cost in the profit report',
    name: 'Option name',
    price: 'Extra price ({{currency}})',
    cost: 'Cost ({{currency}})',
    sortOrder: 'Display order',
  },
  toast: {
    groupCreated: 'Added group "{{name}}"',
    groupUpdated: 'Saved group "{{name}}"',
    optionCreated: 'Added option "{{name}}"',
    optionUpdated: 'Saved option "{{name}}"',
  },
  save: 'Save',
  saving: 'Saving…',
} satisfies typeof th

export const locales = { th, en }
```

- [ ] **Step 4: `ModifiersPage.tsx`** (ใช้โครงสร้างเดียวกับ `CategoriesPage.tsx`: `PageHeader`, `Panel`, ตาราง, `DropdownMenu`, dialog)

```tsx
import type { ModifierGroup, ModifierOption } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useFormat } from '@/features/settings'
import {
  modifierGroupsQuery,
  useCreateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierGroup,
  useUpdateModifierOption,
} from '../api'

type GroupDialog = { group?: ModifierGroup } | null
type OptionDialog = { group: ModifierGroup; option?: ModifierOption } | null

const isWhole = (value: string) => /^-?\d+$/.test(value.trim())

function GroupFormDialog({ group, onClose }: { group?: ModifierGroup; onClose: () => void }) {
  const { t } = useTranslation('modifiers')
  const { t: tc } = useTranslation()
  const [name, setName] = useState(group?.name ?? '')
  const [required, setRequired] = useState(group?.required ?? false)
  const [maxSelections, setMaxSelections] = useState(String(group?.maxSelections ?? 1))
  const [sortOrder, setSortOrder] = useState(String(group?.sortOrder ?? 0))
  const create = useCreateModifierGroup()
  const update = useUpdateModifierGroup()
  const mutation = group ? update : create

  const max = isWhole(maxSelections) ? Number(maxSelections) : null
  const order = isWhole(sortOrder) ? Number(sortOrder) : null
  const canSave = name.trim() !== '' && max !== null && max >= 1 && max <= 20 && order !== null && !mutation.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || max === null || order === null) return
    const input = { name: name.trim(), required, maxSelections: max, sortOrder: order }
    const done = (saved: ModifierGroup) => {
      toast.success(t(group ? 'toast.groupUpdated' : 'toast.groupCreated', { name: saved.name }))
      onClose()
    }
    if (group) update.mutate({ id: group.id, changes: input }, { onSuccess: done })
    else create.mutate(input, { onSuccess: done })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{group ? t('groupForm.titleEdit') : t('groupForm.titleNew')}</DialogTitle>
          <DialogDescription>{t('groupForm.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">{t('groupForm.name')}</Label>
            <Input id="group-name" className="h-10" value={name} maxLength={100} required autoFocus onChange={(event) => setName(event.target.value)} />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">{t('groupForm.required')}</span>
              <span className="block text-xs text-muted-foreground">{t('groupForm.requiredHint')}</span>
            </span>
            <Switch checked={required} onCheckedChange={setRequired} />
          </label>
          <div className="space-y-2">
            <Label htmlFor="group-max">{t('groupForm.maxSelections')}</Label>
            <Input
              id="group-max"
              className="h-10 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={maxSelections}
              aria-invalid={max === null || max < 1 || max > 20}
              onChange={(event) => setMaxSelections(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('groupForm.maxSelectionsHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-order">{t('groupForm.sortOrder')}</Label>
            <Input
              id="group-order"
              className="h-10 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={sortOrder}
              aria-invalid={order === null}
              onChange={(event) => setSortOrder(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('groupForm.sortOrderHint')}</p>
          </div>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={!canSave}>
              {mutation.isPending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OptionFormDialog({ group, option, onClose }: { group: ModifierGroup; option?: ModifierOption; onClose: () => void }) {
  const { t } = useTranslation('modifiers')
  const { t: tc } = useTranslation()
  const { money, currency } = useFormat()
  const [name, setName] = useState(option?.name ?? '')
  const [price, setPrice] = useState(option ? money.toInput(option.priceSatang) : '')
  const [cost, setCost] = useState(option ? money.toInput(option.costSatang) : '')
  const [sortOrder, setSortOrder] = useState(String(option?.sortOrder ?? 0))
  const create = useCreateModifierOption()
  const update = useUpdateModifierOption()
  const mutation = option ? update : create

  const priceSatang = price.trim() === '' ? 0 : money.parse(price)
  const costSatang = cost.trim() === '' ? 0 : money.parse(cost)
  const order = isWhole(sortOrder) ? Number(sortOrder) : null
  const canSave = name.trim() !== '' && priceSatang !== null && costSatang !== null && order !== null && !mutation.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || priceSatang === null || costSatang === null || order === null) return
    const input = { name: name.trim(), priceSatang, costSatang, sortOrder: order }
    const done = (saved: ModifierOption) => {
      toast.success(t(option ? 'toast.optionUpdated' : 'toast.optionCreated', { name: saved.name }))
      onClose()
    }
    if (option) update.mutate({ id: option.id, changes: input }, { onSuccess: done })
    else create.mutate({ groupId: group.id, input }, { onSuccess: done })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{option ? t('optionForm.titleEdit') : t('optionForm.titleNew')}</DialogTitle>
          <DialogDescription>{t('optionForm.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="option-name">{t('optionForm.name')}</Label>
            <Input id="option-name" className="h-10" value={name} maxLength={100} required autoFocus onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="option-price">{t('optionForm.price', { currency })}</Label>
              <Input
                id="option-price"
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                value={price}
                placeholder={money.plain(0)}
                aria-invalid={priceSatang === null}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="option-cost">{t('optionForm.cost', { currency })}</Label>
              <Input
                id="option-cost"
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                value={cost}
                placeholder={money.plain(0)}
                aria-invalid={costSatang === null}
                onChange={(event) => setCost(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="option-order">{t('optionForm.sortOrder')}</Label>
            <Input
              id="option-order"
              className="h-10 w-32 text-right tabular-nums"
              inputMode="numeric"
              value={sortOrder}
              aria-invalid={order === null}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </div>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={!canSave}>
              {mutation.isPending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Owner-only: the groups of options offered when a product is sold. */
export function ModifiersPage() {
  const { t } = useTranslation('modifiers')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  const groups = useQuery(modifierGroupsQuery)
  const updateGroup = useUpdateModifierGroup()
  const updateOption = useUpdateModifierOption()
  const [groupDialog, setGroupDialog] = useState<GroupDialog>(null)
  const [optionDialog, setOptionDialog] = useState<OptionDialog>(null)

  const all = groups.data ?? []
  const onError = (error: Error) => toast.error(error.message)

  return (
    <>
      <PageHeader title={t('title')} description={t('description', { items: tc('items', { count: all.length }) })}>
        <Button className="h-9 px-3" onClick={() => setGroupDialog({})}>
          <Plus />
          {t('addGroup')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {groups.error && <p className="text-sm text-destructive">{groups.error.message}</p>}
        {!groups.isPending && all.length === 0 && <p className="py-12 text-center text-muted-foreground">{t('empty')}</p>}

        {all.map((group) => (
          <Panel
            key={group.id}
            title={group.name}
            description={[
              group.required ? t('group.summaryRequired') : t('group.summaryOptional'),
              group.maxSelections === 1 ? t('group.one') : t('group.many', { count: group.maxSelections }),
              t('group.products', { count: group.productIds.length }),
            ].join(' · ')}
          >
            <div className="flex items-center gap-2 border-b px-4 py-2">
              {!group.isActive && <StatusBadge tone="neutral">{t('group.inactive')}</StatusBadge>}
              <Button variant="outline" className="ml-auto h-9" onClick={() => setOptionDialog({ group })}>
                <Plus />
                {t('addOption')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="size-9" aria-label={t('group.actions', { name: group.name })}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setGroupDialog({ group })}>{t('group.edit')}</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => updateGroup.mutate({ id: group.id, changes: { isActive: !group.isActive } }, { onError })}
                  >
                    {group.isActive ? t('group.deactivate') : t('group.activate')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ul className="divide-y">
              {group.options.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('noOptions')}</li>
              )}
              {group.options.map((option) => (
                <li key={option.id} className={`flex items-center gap-3 px-4 py-2 ${option.isActive ? '' : 'text-muted-foreground'}`}>
                  <span className="min-w-0 flex-1 truncate font-medium">{option.name}</span>
                  {!option.isActive && <StatusBadge tone="neutral">{t('option.inactive')}</StatusBadge>}
                  <span className="text-sm tabular-nums">
                    {option.priceSatang > 0 ? `+${money.plain(option.priceSatang)}` : t('option.free')}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="size-9" aria-label={t('option.actions', { name: option.name })}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setOptionDialog({ group, option })}>{t('option.edit')}</DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => updateOption.mutate({ id: option.id, changes: { isActive: !option.isActive } }, { onError })}
                      >
                        {option.isActive ? t('option.deactivate') : t('option.activate')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      {groupDialog && <GroupFormDialog group={groupDialog.group} onClose={() => setGroupDialog(null)} />}
      {optionDialog && <OptionFormDialog group={optionDialog.group} option={optionDialog.option} onClose={() => setOptionDialog(null)} />}
    </>
  )
}
```

ถ้า `Panel` ไม่รับ `children` ที่เป็นรายการ หรือ `money.toInput`/`money.plain` มีลายเซ็นต่างจากที่ `CategoriesPage`/`ProductFormDialog` ใช้ ให้ดูการใช้งานจริงในสองไฟล์นั้นแล้วปรับให้ตรง (ทั้งสองถูกใช้ด้านบนตามแบบของ `ProductFormDialog`)

- [ ] **Step 5: ต่อเส้นทาง เมนู และภาษา**

`app/App.tsx`: เพิ่ม `import { ModifiersPage } from '@/features/modifiers'` และบรรทัดต่อจาก categories:

```tsx
          {isOwner && <Route path="modifiers" element={<ModifiersPage />} />}
```

`app/AppSidebar.tsx`: เพิ่ม icon `SlidersHorizontal` ใน import จาก `lucide-react` และรายการต่อจากหมวดหมู่:

```tsx
              { to: '/modifiers', label: t('nav.modifiers'), icon: SlidersHorizontal },
```

`app/locales.ts`: เพิ่ม `modifiers: 'ตัวเลือกเสริม',` ใน `th.nav` (ต่อจาก `categories`) และ `modifiers: 'Modifiers',` ใน `en.nav`

`app/i18n.ts`: `import { modifiersLocales } from '@/features/modifiers'` และเพิ่ม `modifiers: modifiersLocales.th,` / `modifiers: modifiersLocales.en,` ใน `th` และ `en`

`locales/errors.ts` เพิ่มใน `errors.en` (ต่อจาก `ORDER_EMPTY`):

```ts
    MODIFIER_GROUP_NOT_FOUND: 'Modifier group not found.',
    MODIFIER_OPTION_NOT_FOUND: 'Option not found.',
    MODIFIER_REQUIRED: 'Please choose "{{group}}".',
    MODIFIER_TOO_MANY: '"{{group}}" allows at most {{max}}.',
    MODIFIER_DUPLICATE: 'The same option cannot be chosen twice.',
    MODIFIER_NOT_AVAILABLE: 'This option cannot be used for this product.',
    INVALID_MODIFIER: 'These option details are not valid.',
```

- [ ] **Step 6: ตรวจ**

Run (จาก root): `bun run typecheck` (ยังมี error จาก `useCartActions`/`CartPanel` ที่ยังเรียกแบบเดิม ซึ่งจะแก้ใน Task 10) ให้ตรวจเฉพาะว่า error ของ feature `modifiers` ไม่มี: `cd apps/web && bunx tsc --noEmit 2>&1 | grep modifiers` ต้องไม่มีผลลัพธ์

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/modifiers apps/web/src/app apps/web/src/locales/errors.ts
gitcz --non-interactive --type=feat --scope=web --subject="add the owner page to manage modifier groups and options" --body="Groups with their options, a price and cost per option, deactivate instead of delete. Owner-only route and navigation item.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: เว็บ: เลือกกลุ่มตัวเลือกในฟอร์มสินค้า

**Files:**
- Modify: `apps/web/src/features/products/api.ts`
- Modify: `apps/web/src/features/products/components/ProductFormDialog.tsx`
- Modify: `apps/web/src/features/products/locales.ts`

**Interfaces:**
- Consumes: `modifierGroupsQuery`, `modifierKeys` จาก `@/features/modifiers` (Task 8), `PUT /catalog/products/:id/modifier-groups`
- Produces: `SaveProductVariables.modifierGroupIds?: number[]`

- [ ] **Step 1: `products/api.ts`**

เพิ่ม import `import { modifierKeys } from '@/features/modifiers'` แก้ `SaveProductVariables`:

```ts
export interface SaveProductVariables {
  /** Omit to create a new product. */
  id?: number
  input: ProductInput
  /** undefined keeps the current image, null removes it, a File replaces it. */
  image: File | null | undefined
  /** The option groups offered on the product; undefined leaves them as they are. */
  modifierGroupIds?: number[]
}
```

และใน `useSaveProduct`:

```ts
    mutationFn: async ({ id, input, image, modifierGroupIds }: SaveProductVariables): Promise<Product> => {
      const saved = await unwrap(
        id === undefined ? api.catalog.products.post(input) : api.catalog.products({ id }).patch(input),
      )
      if (modifierGroupIds !== undefined)
        await unwrap(api.catalog.products({ id: saved.id })['modifier-groups'].put({ groupIds: modifierGroupIds }))
      if (image) return unwrap(api.catalog.products({ id: saved.id }).image.put({ file: await prepareImage(image) }))
      if (image === null && saved.imageUrl) return unwrap(api.catalog.products({ id: saved.id }).image.delete())
      return saved
    },
    // Even when the image step fails the product itself was saved, so the list must refresh either way.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: modifierKeys.all }),
      ]),
```

- [ ] **Step 2: `locales.ts` ของ products** เพิ่มใน `th.form` (และ `en.form` ตามลำดับ):

```ts
    modifiers: 'ตัวเลือกเสริม',
    modifiersHint: 'เลือกกลุ่มที่แคชเชียร์ต้องถามตอนขายสินค้านี้ สร้างกลุ่มได้ที่หน้าตัวเลือกเสริม',
```

```ts
    modifiers: 'Modifiers',
    modifiersHint: 'Pick the groups the cashier is asked about when selling this product. Create groups on the Modifiers page.',
```

- [ ] **Step 3: `ProductFormDialog.tsx`**

เพิ่ม import:

```tsx
import { useQuery } from '@tanstack/react-query'
import { modifierGroupsQuery } from '@/features/modifiers'
```

ใน component ต่อจาก `const set = …`:

```tsx
  const groups = useQuery(modifierGroupsQuery).data ?? []
  // The groups already offered on this product, in the order the product asks them.
  const [groupIds, setGroupIds] = useState<number[] | null>(null)
  const chosenGroupIds =
    groupIds ?? (product ? groups.filter((group) => group.productIds.includes(product.id)).map((group) => group.id) : [])
  const toggleGroup = (id: number) =>
    setGroupIds(chosenGroupIds.includes(id) ? chosenGroupIds.filter((value) => value !== id) : [...chosenGroupIds, id])
```

ใน `save.mutate({ id, image, input })` เพิ่ม:

```tsx
        // Only sent once the owner has seen the groups, so a slow list never clears what a product offers.
        modifierGroupIds: groups.length > 0 ? chosenGroupIds : undefined,
```

และในฟอร์ม ต่อจาก `<label …>trackStock…</label>` ก่อน `{save.error && …}`:

```tsx
          {groups.length > 0 && (
            <fieldset className="col-span-2 space-y-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">{t('form.modifiers')}</legend>
              <p className="text-xs text-muted-foreground">{t('form.modifiersHint')}</p>
              <div className="flex flex-wrap gap-2">
                {groups
                  .filter((group) => group.isActive || chosenGroupIds.includes(group.id))
                  .map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      role="checkbox"
                      aria-checked={chosenGroupIds.includes(group.id)}
                      onClick={() => toggleGroup(group.id)}
                      className="rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-primary"
                    >
                      {group.name}
                    </button>
                  ))}
              </div>
            </fieldset>
          )}
```

- [ ] **Step 4: ตรวจ**

Run: `cd apps/web && bunx tsc --noEmit 2>&1 | grep -E "products|modifiers"`
Expected: ไม่มี error ในสองโฟลเดอร์นี้

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/products
gitcz --non-interactive --type=feat --scope=web --subject="choose the option groups of a product on the product form" --body="Saved with the product. Groups are only sent once the list has loaded so a slow request never clears what a product offers.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: เว็บ: เลือกตัวเลือกในหน้า POS, ตะกร้า, ออเดอร์ และใบเสร็จ

**Files:**
- Create: `apps/web/src/features/pos/components/OptionsDialog.tsx`
- Modify: `apps/web/src/features/pos/components/ProductPicker.tsx`, `CartPanel.tsx`, `SaveOrderDialog.tsx`, `PosPage.tsx`
- Modify: `apps/web/src/features/pos/hooks/use-cart.ts`, `use-cart-actions.ts`
- Modify: `apps/web/src/features/pos/api.ts` (ชนิด `CheckoutInput.items`)
- Modify: `apps/web/src/features/orders/api.ts`
- Modify: `apps/web/src/features/pos/locales.ts`
- Modify: `apps/web/src/features/sales/components/Receipt.tsx`

**Interfaces:**
- Consumes: Task 7 (`offeredGroups`, `chooseOptions`, store, `PricedLine`), Task 8 (`modifierGroupsQuery`), Task 5 (routes `lines/:lineId`)
- Produces: `useCartActions().add(productId, optionIds?)`, `.setQuantity(line: PricedLine, quantity)`

- [ ] **Step 1: `orders/api.ts`** แก้ชนิดและ mutation

```ts
export interface OpenOrderInput {
  label?: string | null
  items?: { productId: number; quantity: number; options?: number[] }[]
}
```

```ts
export function useAddOrderItem() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({
      orderId,
      productId,
      quantity,
      options,
    }: {
      orderId: number
      productId: number
      quantity: number
      options?: number[]
    }) => unwrap(api.orders({ id: orderId }).items.post({ productId, quantity, options })),
    onSuccess: remember,
  })
}

/** Sets how many of one line, by its id; the same product with other options is another line. */
export function useSetOrderLineQuantity() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, lineId, quantity }: { orderId: number; lineId: number; quantity: number }) =>
      unwrap(api.orders({ id: orderId }).lines({ lineId }).patch({ quantity })),
    onSuccess: remember,
  })
}

export function useRemoveOrderLine() {
  const remember = useOrderCache()

  return useMutation({
    mutationFn: ({ orderId, lineId }: { orderId: number; lineId: number }) =>
      unwrap(api.orders({ id: orderId }).lines({ lineId }).delete()),
    onSuccess: remember,
  })
}
```

ลบ `useSetOrderItemQuantity` และ `useRemoveOrderItem` ออก (ไม่มีที่ใช้แล้ว) และอัปเดต `features/orders/index.ts` ให้ส่งออกชื่อใหม่แทน (`useSetOrderLineQuantity`, `useRemoveOrderLine`)

- [ ] **Step 2: `use-cart-actions.ts`** (แทนทั้งไฟล์)

```ts
import { toast } from 'sonner'
import { useAddOrderItem, useRemoveOrderLine, useSetOrderLineQuantity } from '@/features/orders'
import type { PricedLine } from '../lib/cart'
import { useCartStore } from '../store/cart.store'

/**
 * The ways to change what is being sold. They work on the local cart, or on the open order the till
 * is working on: the screen does not need to know which.
 */
export function useCartActions() {
  const orderId = useCartStore((state) => state.orderId)
  const addToCart = useCartStore((state) => state.add)
  const setCartQuantity = useCartStore((state) => state.setQuantity)
  const addItem = useAddOrderItem()
  const setLine = useSetOrderLineQuantity()
  const removeLine = useRemoveOrderLine()

  const onError = (error: Error) => toast.error(error.message)

  return {
    add(productId: number, optionIds: number[] = []) {
      if (orderId === null) addToCart(productId, optionIds)
      else addItem.mutate({ orderId, productId, quantity: 1, options: optionIds }, { onError })
    },
    /** A quantity below 1 takes the line off. */
    setQuantity(line: PricedLine, quantity: number) {
      if (orderId === null) setCartQuantity(line.lineKey, quantity)
      else if (line.lineId === null) return
      else if (quantity < 1) removeLine.mutate({ orderId, lineId: line.lineId }, { onError })
      else setLine.mutate({ orderId, lineId: line.lineId, quantity }, { onError })
    },
  }
}
```

- [ ] **Step 3: `use-cart.ts`** ให้ส่งข้อมูลตัวเลือกให้ `priceCart`

เพิ่ม import `import { modifierGroupsQuery } from '@/features/modifiers'` และ

```ts
  const modifiers = useQuery(modifierGroupsQuery)
  const optionsById = useMemo(
    () =>
      new Map(
        (modifiers.data ?? [])
          .flatMap((group) => (group.isActive ? group.options : []))
          .filter((option) => option.isActive)
          .map((option) => [option.id, { id: option.id, name: option.name, priceSatang: option.priceSatang }]),
      ),
    [modifiers.data],
  )
```

และเรียก `priceCart(lines, productsById, discount, options, optionsById)` (แก้ dependency array ของ `useMemo` ให้มี `optionsById`)

- [ ] **Step 4: `OptionsDialog.tsx`**

```tsx
import type { ModifierGroup, Product } from '@pos/api/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFormat } from '@/features/settings'
import { cn } from '@/lib/utils'
import { chooseOptions } from '../lib/options'

interface Props {
  product: Product
  /** The groups to ask, already limited to what can be chosen (see offeredGroups). */
  groups: ModifierGroup[]
  onConfirm: (optionIds: number[]) => void
  onCancel: () => void
}

/** Asks for the options of a product before it goes in the cart; confirm is enabled only when the choice is allowed. */
export function OptionsDialog({ product, groups, onConfirm, onCancel }: Props) {
  const { t } = useTranslation('pos')
  const { t: tc } = useTranslation()
  const { money } = useFormat()
  const [chosen, setChosen] = useState<number[]>([])

  const resolved = chooseOptions(groups, chosen)
  const unitPriceSatang = product.priceSatang + (resolved?.priceSatang ?? 0)

  const toggle = (group: ModifierGroup, optionId: number) => {
    const inGroup = chosen.filter((id) => group.options.some((option) => option.id === id))
    if (chosen.includes(optionId)) {
      setChosen(chosen.filter((id) => id !== optionId))
    } else if (group.maxSelections === 1) {
      // Picking another of a pick-one group replaces the choice.
      setChosen([...chosen.filter((id) => !inGroup.includes(id)), optionId])
    } else if (inGroup.length < group.maxSelections) {
      setChosen([...chosen, optionId])
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>{t('options.description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {groups.map((group) => {
            const inGroup = chosen.filter((id) => group.options.some((option) => option.id === id))
            const single = group.maxSelections === 1
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium">
                  <span>{group.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {group.required ? t('options.required') : t('options.optional')}
                    {' · '}
                    {single ? t('options.pickOne') : t('options.pickUpTo', { count: group.maxSelections })}
                  </span>
                </legend>
                <div role={single ? 'radiogroup' : 'group'} aria-label={group.name} className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const selected = chosen.includes(option.id)
                    const full = !single && !selected && inGroup.length >= group.maxSelections
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role={single ? 'radio' : 'checkbox'}
                        aria-checked={selected}
                        disabled={full}
                        onClick={() => toggle(group, option.id)}
                        className={cn(
                          'min-h-11 rounded-lg border px-3 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45',
                          selected ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-accent/40',
                        )}
                      >
                        <span className="block font-medium">{option.name}</span>
                        {option.priceSatang > 0 && (
                          <span className="block text-xs tabular-nums">+{money.plain(option.priceSatang)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-lg font-semibold tabular-nums">{money.format(unitPriceSatang)}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
              {tc('cancel')}
            </Button>
            <Button type="button" className="h-11" disabled={resolved === null} onClick={() => onConfirm(chosen)}>
              {t('options.add')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: `ProductPicker.tsx`**

เพิ่ม import:

```tsx
import { modifierGroupsQuery } from '@/features/modifiers'
import { offeredGroups } from '../lib/options'
import { OptionsDialog } from './OptionsDialog'
```

ใน component:

```tsx
  const modifiers = useQuery(modifierGroupsQuery)
  const [choosing, setChoosing] = useState<Product | null>(null)
```

แทน `pick`:

```tsx
  const pick = (product: Product) => {
    // A product with option groups is asked about them first; one without goes straight into the cart.
    if (offeredGroups(modifiers.data ?? [], product.id).length > 0) {
      setChoosing(product)
      return
    }
    addToCart(product.id)
    if (hasKeyboard()) searchRef.current?.focus()
  }
```

และก่อน `</section>` ปิด:

```tsx
      {choosing && (
        <OptionsDialog
          product={choosing}
          groups={offeredGroups(modifiers.data ?? [], choosing.id)}
          onCancel={() => setChoosing(null)}
          onConfirm={(optionIds) => {
            addToCart(choosing.id, optionIds)
            setChoosing(null)
            if (hasKeyboard()) searchRef.current?.focus()
          }}
        />
      )}
```

- [ ] **Step 6: `CartPanel.tsx`**

แก้การ map บรรทัด: destructure `lineKey`, `options`, `unavailable` และเรียก `setQuantity(line, …)` แทน `setQuantity(productId, …)`:

```tsx
        {cart.lines.map((line) => {
          const { lineKey, name, unitPriceSatang, stockQty, quantity, lineTotalSatang, exceedsStock, options, unavailable } = line
          return (
            <li key={lineKey} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm leading-snug font-medium">{name}</p>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{money.plain(lineTotalSatang)}</p>
              </div>
              {options.length > 0 && (
                <ul className="-mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {options.map((option) => (
                    <li key={option.name} className="flex justify-between gap-3">
                      <span className="truncate">{option.name}</span>
                      {option.priceSatang > 0 && <span className="tabular-nums">+{money.plain(option.priceSatang)}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {unavailable && <p className="text-xs font-medium text-destructive">{t('cart.optionUnavailable')}</p>}
              {/* … the quantity row exactly as before, with these changes:
                    onClick={() => setQuantity(line, quantity - 1)}
                    if (next >= 1) setQuantity(line, next)
                    onClick={() => setQuantity(line, quantity + 1)}
                    aria-invalid={exceedsStock || unavailable} */}
            </li>
          )
        })}
```

เขียนแถวปุ่มจำนวน (`Minus` / `Input` / `Plus` / ข้อความสต็อก) กลับเข้าไปทั้งแถวเหมือนเดิมแทนคอมเมนต์ข้างบน โดยแก้เฉพาะสามจุดที่ระบุ (ห้ามทิ้งคอมเมนต์ไว้ในโค้ดจริง)

- [ ] **Step 7: `SaveOrderDialog.tsx`** แก้การส่งบรรทัด

```tsx
      { label: label.trim() || null, items: lines.map(({ productId, quantity, optionIds }) => ({ productId, quantity, options: optionIds })) },
```

- [ ] **Step 8: `PosPage.tsx`** แก้การส่งขายขั้นตอนเดียวในฟังก์ชัน `pay`

```tsx
          items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, options: line.optionIds })),
```

ใน `apps/web/src/features/pos/api.ts` แก้ `CheckoutInput.items` เป็น `{ productId: number; quantity: number; options?: number[] }[]`

- [ ] **Step 9: ข้อความ** `pos/locales.ts` เพิ่ม

th:

```ts
  options: {
    description: 'เลือกตัวเลือกของสินค้านี้',
    required: 'บังคับเลือก',
    optional: 'ไม่บังคับ',
    pickOne: 'เลือก 1 อย่าง',
    pickUpTo: 'เลือกได้ไม่เกิน {{count}} อย่าง',
    add: 'เพิ่มลงตะกร้า',
  },
```

และใน `cart`: `optionUnavailable: 'ตัวเลือกบางอย่างปิดใช้งานแล้ว ลบรายการนี้แล้วเลือกใหม่',`

en:

```ts
  options: {
    description: 'Choose the options for this product',
    required: 'Required',
    optional: 'Optional',
    pickOne: 'Pick 1',
    pickUpTo: 'Pick up to {{count}}',
    add: 'Add to cart',
  },
```

และใน `cart`: `optionUnavailable: 'Some options are no longer offered. Remove this line and choose again.',`

- [ ] **Step 10: ใบเสร็จ** `Receipt.tsx` ใน `sale.items.map` เพิ่มบรรทัดย่อยและใช้คีย์ที่ไม่ซ้ำ

```tsx
      {sale.items.map((item, index) => (
        <div key={`${item.productId}-${index}`}>
          <p>{item.productName}</p>
          {item.options.map((option) => (
            <p key={option.optionId} className="pl-3 text-xs">
              + {option.name}
              {option.priceSatang > 0 && ` ${money.plain(option.priceSatang)}`}
            </p>
          ))}
          <p className={row}>
            <span>{t('receipt.item', { quantity: item.quantity, price: money.plain(item.unitPriceSatang) })}</span>
            <span>{money.plain(item.lineTotalSatang)}</span>
          </p>
        </div>
      ))}
```

- [ ] **Step 11: ตรวจทั้งเว็บ**

Run (จาก root): `bun run typecheck` แล้ว `bun run lint` แล้ว `cd apps/web && bun test` แล้ว `cd apps/web && bunx vite build`
Expected: ผ่านทั้งหมด (lint มีเฉพาะคำเตือนเดิม) ถ้ามีการทดสอบเว็บเดิมที่สร้าง `Sale`/`Order` literal ให้เติม `options: []` / `lineId`

- [ ] **Step 12: Commit**

```bash
git add apps/web/src
gitcz --non-interactive --type=feat --scope=web --subject="ask for options when selling, and show them in the cart and on the receipt" --body="A product with option groups opens a dialog whose confirm button follows the same rule as the server. Order lines are changed by their id. The receipt lists the options under the product.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: ตรวจผ่านเบราว์เซอร์ (`bun run e2e`)

**Files:**
- Modify: `apps/web/e2e/run.ts`

**Interfaces:**
- Consumes: ทุกอย่างข้างบน, helpers `check`, `signIn`, `WEB`, ตัวแปร `owner`, `cashier`

- [ ] **Step 1: อ่านโครงของ `run.ts` ช่วงที่ยังมีกะเปิดอยู่**

เปิด `apps/web/e2e/run.ts` บรรทัด 135–195 (ส่วนที่ผมไม่ได้ลอกไว้ในแผนนี้) เพื่อหาจุดที่แคชเชียร์ขายได้ (มีกะเปิดอยู่ ก่อนขั้นที่ "เจ้าของเริ่มนับ") การทดสอบใหม่ต้องแทรกตรงนั้น เพราะโหมดกะต้องมีกะเปิดจึงจะขายได้ และการเพิ่มการขายจะเปลี่ยนยอดเงินสดที่ขั้นปิดกะคาดไว้ (คาดเดิม `฿130.00` ในขั้น "เจ้าของเริ่มนับ" และ `-฿5.00` ในขั้น "บันทึกกะที่ปิด") ให้ใช้วิธีที่ไม่แตะยอดเงินสด: ชำระด้วย **PromptPay** ไม่ได้ (ต้อง QR) ดังนั้นให้ขายด้วยเงินสดแล้วปรับยอดที่คาดทั้งสองจุดตามจำนวนที่เพิ่ม (ถ้าขาย ฿60.00 ให้ `฿190.00` และ difference คำนวณใหม่จากตัวเลข counted ที่กรอก)

- [ ] **Step 2: เพิ่มการตรวจ** ก่อนบล็อก "Owner pages" ให้แทรกส่วนเตรียมข้อมูลด้วย API ของเจ้าของ (เร็วกว่าคลิกทั้งหน้า) และการตรวจผ่านหน้าจอจริง

```ts
    console.log('\nModifiers:')

    await check('the owner sets up a group with a priced option on the modifiers page', async () => {
      await owner.goto(`${WEB}/modifiers`)
      await owner.getByRole('button', { name: 'เพิ่มกลุ่มตัวเลือก' }).click()
      const form = owner.getByRole('dialog')
      await form.getByLabel('ชื่อกลุ่ม').fill('ท็อปปิง')
      await form.getByLabel('เลือกได้สูงสุด').fill('2')
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('heading', { name: 'ท็อปปิง' }).waitFor()

      await owner.getByRole('button', { name: 'เพิ่มตัวเลือก' }).click()
      const option = owner.getByRole('dialog')
      await option.getByLabel('ชื่อตัวเลือก').fill('ไข่มุก')
      await option.getByLabel(/ราคาเพิ่ม/).fill('10')
      await option.getByLabel(/ต้นทุน/).fill('4')
      await option.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByText('ไข่มุก').waitFor()
      await owner.getByText('+10.00').waitFor()
    })

    await check('the owner offers the group on a product from the product form', async () => {
      await owner.goto(`${WEB}/products`)
      await owner.getByRole('row', { name: /น้ำดื่ม 600 มล\./ }).getByRole('button').last().click()
      await owner.getByRole('menuitem', { name: 'แก้ไข' }).click()
      const form = owner.getByRole('dialog')
      await form.getByRole('checkbox', { name: 'ท็อปปิง' }).click()
      await form.getByRole('button', { name: 'บันทึก' }).click()
      await owner.getByRole('dialog').waitFor({ state: 'detached' })
    })

    await check('selling a product with options asks for them, adds their price, and the receipt lists them', async () => {
      await cashier.goto(WEB)
      await cashier.getByRole('button', { name: /น้ำดื่ม 600 มล\./ }).first().click()
      const dialog = cashier.getByRole('dialog')
      await dialog.getByRole('checkbox', { name: /ไข่มุก/ }).click()
      await dialog.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
      // 10.00 + 10.00 for the topping.
      await cashier.getByText('+10.00').first().waitFor()
      await cashier.getByRole('button', { name: /^ชำระเงิน/ }).click()
      await cashier.getByRole('button', { name: 'พอดี' }).click()
      await cashier.getByRole('button', { name: 'ยืนยันการชำระ' }).click()
      await cashier.getByRole('button', { name: 'ขายรายการต่อไป' }).waitFor()
      await cashier.getByText('+ ไข่มุก').waitFor()
      await cashier.getByRole('button', { name: 'ขายรายการต่อไป' }).click()
    })
```

ถ้า label/ชื่อปุ่มจริงต่างจากที่ใช้ข้างบน (เช่น แถวเมนูของสินค้า หรือชื่อปุ่ม dialog) ให้ปรับตามที่ `ProductsPage.tsx` และ `PaymentDialog.tsx` ใช้ ห้ามผ่อนสิ่งที่ตรวจ (ต้องยืนยันว่ามี dialog ถามตัวเลือก ราคารวมตัวเลือก และใบเสร็จมีบรรทัดตัวเลือก)

- [ ] **Step 3: ปรับยอดเงินสดที่คาดของขั้นกะ** ตามขายที่เพิ่มเข้ามาในกะเดียวกัน (ดู Step 1) แล้วรัน

Run (จาก root): `bun run e2e`
Expected: ผ่านทุกกรณี (เดิม 16 + ใหม่ 3 = 19)

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/run.ts
gitcz --non-interactive --type=test --scope=web --subject="add browser checks of modifier groups, the product form and selling with options" --body="The owner sets up a group, offers it on a product, and the cashier is asked for it, is charged for it, and sees it on the receipt.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: สัญญา OpenAPI (ต้องได้รับอนุมัติจากเจ้าของโครงการก่อน)

**Files:**
- Modify (หลังอนุมัติเท่านั้น): `apps/api/test/openapi-baseline.json`, `apps/api/test/openapi-v2-baseline.json`

> **หยุดและถามเจ้าของโครงการก่อนทำ task นี้** บอกว่า baseline ของ v1 และ v2 จะต่างจากเดิมเพราะ (ก) งานใบเสร็จบน branch `ohmattpon/receipts-users-categories` ที่ยังรออนุมัติอยู่ และ (ข) งานนี้ ซึ่งเป็นการเพิ่มอย่างเดียว: เส้นทางใหม่ `/catalog/modifier-groups`, `/catalog/modifier-options/{id}`, `/catalog/products/{id}/modifier-groups`, `/orders/{id}/lines/{lineId}`; ช่องใหม่ `lineId` และ `options` ในบรรทัดออเดอร์; `options` ในบรรทัดบิล (v1 และ v2) และ `options` ที่ส่งเข้า `POST /orders`, `POST /orders/{id}/items`, `POST /sales` (v1, v2) ไม่มีช่องที่ถูกลบหรือเปลี่ยนชนิด

- [ ] **Step 1: ตรวจว่าความต่างเป็นการเพิ่มอย่างเดียว**

Run: `cd apps/api && bun run openapi:check` (จะล้มเหลวและเขียน `test/openapi-v1-current.json`, `test/openapi-v2-current.json`)
จากนั้นเทียบกับ baseline เดิมด้วยสคริปต์ที่นับรายการที่ถูกลบ (path หรือ property ที่มีใน baseline แต่ไม่มีใน current) ต้องได้ 0 ถ้ามีรายการที่ถูกลบหรือเปลี่ยนชนิด ให้หยุดแล้วรายงาน อย่าบันทึก

- [ ] **Step 2: หลังเจ้าของอนุมัติ** บันทึก baseline

```bash
cd apps/api
cp test/openapi-v1-current.json test/openapi-baseline.json
cp test/openapi-v2-current.json test/openapi-v2-baseline.json
rm test/openapi-v1-current.json test/openapi-v2-current.json
bun run openapi:check
```

Expected: `OpenAPI v1 and v2 documents match their baselines`

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/openapi-baseline.json apps/api/test/openapi-v2-baseline.json
gitcz --non-interactive --type=chore --scope=api --subject="record the OpenAPI baselines with the additive fields of modifiers" --body="Approved by the owner. Only additions: modifier routes, lineId and options on order lines, options on sale lines and in order and sale requests.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: เอกสารและการตรวจครั้งสุดท้าย

**Files:**
- Modify: `AGENTS.md`, `docs/superpowers/roadmap.md`, `docs/summary.md`

- [ ] **Step 1: `AGENTS.md`**

ในหัวข้อ "สถาปัตยกรรมของเว็บ" รายการ feature ให้เป็น `auth, branches, categories, modifiers, orders, products, sales, pos, settings, shifts, users` และเพิ่มหัวข้อย่อยก่อน "### การชำระด้วย QR (SCB)":

```markdown
### ตัวเลือกเสริม (modifiers)

- กลุ่มตัวเลือกสร้างครั้งเดียวและผูกกับหลายสินค้า ใช้ร่วมทุกสาขา ตัวเลือกปิดใช้ได้แต่ลบไม่ได้
- กฎการเลือก (บังคับ จำนวนสูงสุด ซ้ำ ไม่อยู่ในกลุ่มของสินค้า ปิดใช้) อยู่ที่ `resolveLineOptions` ใน `domains/modifier.domain.ts` ที่เดียว ทั้งออเดอร์และ `SaleCheckout` เรียกผ่าน port `ILineOptionsResolver` และเว็บใช้ฟังก์ชันเดียวกันผ่าน `@pos/api/modifiers`
- บรรทัดของออเดอร์และบิลคือสินค้า + ชุดตัวเลือก (`options` เป็น snapshot) `unitPriceSatang` รวมราคาตัวเลือกแล้ว และ `unitCostSatang` ของบิลรวมต้นทุนตัวเลือก ห้ามแก้สูตร `calculateTotals`
- สต็อกตรวจที่ยอดรวมของสินค้า ไม่ใช่ต่อบรรทัด บรรทัดของออเดอร์แก้ด้วย `lineId` (repository เทียบบรรทัด ไม่ลบแล้วใส่ใหม่) เส้นทางด้วย `productId` ใช้กับบรรทัดที่ไม่มีตัวเลือกเท่านั้น
```

- [ ] **Step 2: `docs/superpowers/roadmap.md`** แก้แถวข้อ 7 ให้ลงท้ายด้วย `(เสร็จฝั่งโค้ดบน branch `ohmattpon/modifiers` ต่อจาก `ohmattpon/receipts-users-categories` ตัวเลือกไม่ตัดสต็อก ไม่มีค่าเริ่มต้นที่ติ๊กไว้ และไม่มีหมายเหตุพิมพ์เองต่อบรรทัด)`

- [ ] **Step 3: `docs/summary.md`** แก้แถวข้อ 7–9 ให้ข้อ 7 เป็นเสร็จฝั่งโค้ดบน `ohmattpon/modifiers` (ข้อ 8–9 ยังไม่ทำ) เพิ่มแถว "ตัวเลือกเสริม | เจ้าของ | กลุ่มและตัวเลือก ราคาเพิ่ม ต้นทุน ผูกกับสินค้า" ในตารางหน้าจอ และอัปเดตผลการตรวจให้ตรงกับตัวเลขจริงที่รันได้ใน Step 4

- [ ] **Step 4: ตรวจทั้งโครงการ**

Run (จาก root, Docker DB เปิดอยู่): `bun run typecheck`, `bun run test`, `bun run lint`, `cd apps/web && bunx vite build`, `bun run e2e`
Expected: ทุกคำสั่งผ่าน บันทึกจำนวนการทดสอบจริงลง `docs/summary.md` (ห้ามเขียนตัวเลขที่ไม่ได้เห็นเอง)

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/superpowers/roadmap.md docs/summary.md
gitcz --non-interactive --type=docs --scope=modifiers --subject="record the modifiers rules, roadmap and summary" --body="Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

| ข้อกำหนดใน spec | Task |
|---|---|
| กลุ่มใช้ร่วมหลายสินค้า, ตัวเลือกปิดได้ลบไม่ได้, ใช้ร่วมทุกสาขา | 2, 3 |
| `required` + `maxSelections` (1–20) | 1, 3 |
| ราคาเพิ่ม + ต้นทุนต่อตัวเลือก ไม่ติดลบ | 1, 3, 6 |
| snapshot JSON บนบรรทัดออเดอร์/บิล | 2, 4, 6 |
| ตัวระบุบรรทัด = สินค้า + ชุดตัวเลือก (`options_key`) | 2, 4 |
| `unitPriceSatang`/ต้นทุนรวมตัวเลือก, ไม่แก้ `calculateTotals` | 4, 6 |
| ตรวจกฎที่เซิร์ฟเวอร์ตอนเพิ่มรายการและขายขั้นตอนเดียว ไม่ตรวจซ้ำตอนชำระออเดอร์ | 5, 6 |
| ตัวเลือกไม่ตัดสต็อก | ไม่มีโค้ดตัดสต็อก (Task 6 ตรวจสต็อกของสินค้าเท่านั้น) |
| v1 เพิ่มอย่างเดียว, route ใหม่แก้/ลบด้วย `lineId`, `/items/:productId` ใช้ได้กับบรรทัดไม่มีตัวเลือก | 5 |
| `POST /sales` (v1, v2) รับ `options`, คำตอบบิลมี `options` | 6 |
| baseline OpenAPI บันทึกใหม่หลังแจ้งเจ้าของ | 12 |
| หน้า `/modifiers`, ฟอร์มสินค้า, dialog POS, ตะกร้าเก็บ id, ใบเสร็จบรรทัดย่อย | 8, 9, 10 |
| ข้อความไทย/อังกฤษ และคำแปลรหัสข้อผิดพลาด | 8 (errors.ts), 8–10 (locales) |
| การทดสอบ domain / use case / integration / เว็บ / e2e | 1, 3, 5, 6, 7, 11 |

ข้อ "ราคาฐานของบรรทัดบนใบเสร็จ = ราคารวม − ราคาตัวเลือก" ใน spec: Task 10 แสดง `unitPriceSatang` (รวมตัวเลือก) ตามที่ API ส่ง พร้อมตัวเลือกเป็นบรรทัดย่อยพร้อมราคา ไม่ได้ลบราคาออกจากบรรทัดสินค้า เพราะใบเสร็จที่บอก `1 x 60.00` และ `+ ไข่มุก 10.00` ใต้ชื่อทำให้ลูกค้าเห็นว่า 60.00 รวมตัวเลือกแล้ว ถ้าเจ้าของต้องการให้บรรทัดสินค้าแสดงราคาฐาน บอกได้ (เปลี่ยนเฉพาะ Receipt)

**2. Placeholder scan:** ไม่มี "TBD/TODO" ที่ค้าง จุดที่แผนบอกให้ "ดูของจริงแล้วปรับ" มีอยู่เพียงสามจุดที่ผมไม่ได้เห็นโค้ดครบ (ชื่อ helper ใน `sales.usecases.test.ts`, ส่วนกลางของ `e2e/run.ts` บรรทัด 135–195, ลายเซ็น `Panel`/`money` ที่ใช้แบบเดียวกับไฟล์ข้างเคียง) และทุกจุดระบุไฟล์ที่ต้องเปิดดูและสิ่งที่ห้ามผ่อน

**3. Type consistency:** `LineOption`, `ResolvedLineOptions`, `lineKey`, `ILineOptionsResolver.resolve(productId, optionIds)`, `OrderItem.lineId/options`, `setLineQuantity/removeLine`, `CheckoutLine.options/optionIds`, `SaleItem.options`, `CartLine.key/optionIds`, `PricedLine.lineKey/lineId/options/optionIds/unavailable`, `useCartActions().setQuantity(line, quantity)` ใช้ชื่อเดียวกันทุก task

**4. Review Focus:** ครบห้าข้อ — ข้อ 1 (Task 5 `a v1 client that sends no options…`, Task 6 `a v1 sale without options…`), ข้อ 2 (Task 6 `selling the same product in two lines cannot get past the stock`, และ unit test ของ checkout), ข้อ 3 (Task 5 `an option deactivated later…`, Task 6 `a sale already made does not change…`), ข้อ 4 (Task 5 `another order's line id…`), ข้อ 5 (Task 6 `replaying a v2 sale stored before options existed…`)
