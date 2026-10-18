import { beforeEach, describe, expect, test } from 'bun:test'
import { makeOrder } from '../../../../__tests__/factories'
import { mockOrderRepository, mockUnitOfWork } from '../../../../__tests__/mocks'
import { SetOrderLineNoteUseCase } from './set-order-line-note.usecase'

let orders: ReturnType<typeof mockOrderRepository>

const item = { lineId: 5, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [], note: null }

beforeEach(() => {
  orders = mockOrderRepository()
  orders.save.mockImplementation(async (order) => order)
  orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, branchId: 1, items: [item] }))
})

const useCase = () => new SetOrderLineNoteUseCase(orders, mockUnitOfWork())

describe('SetOrderLineNoteUseCase', () => {
  test('เขียนหมายเหตุของบรรทัด', async () => {
    const saved = await useCase().execute(1, 5, { note: '  ไม่ใส่น้ำแข็ง ' }, 1)

    expect(saved.items[0]!.note).toBe('ไม่ใส่น้ำแข็ง')
  })

  test('แก้หมายเหตุซ้ำได้', async () => {
    await useCase().execute(1, 5, { note: 'หวานน้อย' }, 1)

    const saved = await useCase().execute(1, 5, { note: 'หวานมาก' }, 1)

    expect(saved.items[0]!.note).toBe('หวานมาก')
  })

  test('ล้างหมายเหตุด้วยค่าว่าง', async () => {
    await useCase().execute(1, 5, { note: 'หวานน้อย' }, 1)

    const saved = await useCase().execute(1, 5, { note: '   ' }, 1)

    expect(saved.items[0]!.note).toBeNull()
  })

  test('ออเดอร์ของสาขาอื่นตอบว่าไม่พบ', async () => {
    await expect(useCase().execute(1, 5, { note: 'หวาน' }, 2)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })
})
