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
