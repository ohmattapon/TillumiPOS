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
    const draft = { branchId: 1, label: null, tableId: null, openedById: 1, openedByName: 'สมชาย', items: [] }
    inner.create.mockResolvedValue(order)
    inner.findById.mockResolvedValue(order)
    inner.findByIdForUpdate.mockResolvedValue(order)
    inner.findAll.mockResolvedValue({ items: [order], total: 1 })

    expect(await guarded.create(draft)).toBe(order)
    expect(inner.create).toHaveBeenCalledWith(draft)
    expect(await guarded.findById(1)).toBe(order)
    expect(await guarded.findByIdForUpdate(1)).toBe(order)
    expect((await guarded.findAll({ branchId: 1 })).total).toBe(1)
    expect(lock.assertEditable).not.toHaveBeenCalled()
  })
})
