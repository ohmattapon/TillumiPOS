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
