import { mockMemberRepository } from '../../../../__tests__/mocks'
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeOrder, makeProduct, makeSale, makeTable } from '../../../../__tests__/factories'
import {
  mockLineOptionsResolver,
  mockOrderRepository,
  mockProductRepository,
  mockSaleCheckout,
  mockTableRepository,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { OrderEntity } from '../../../../domains/order.domain'
import { AddOrderItemUseCase } from './add-order-item.usecase'
import { CancelOrderUseCase } from './cancel-order.usecase'
import { GetOrderUseCase } from './get-order.usecase'
import { ListOrdersUseCase } from './list-orders.usecase'
import { OpenOrderUseCase } from './open-order.usecase'
import { PayOrderUseCase } from './pay-order.usecase'
import { MergeOrdersUseCase } from './merge-orders.usecase'
import { MoveOrderToTableUseCase } from './move-order-to-table.usecase'
import { RemoveOrderItemUseCase } from './remove-order-item.usecase'
import { RemoveOrderLineUseCase } from './remove-order-line.usecase'
import { RenameOrderUseCase } from './rename-order.usecase'
import { SetOrderItemQuantityUseCase } from './set-order-item-quantity.usecase'
import { SplitOrderUseCase } from './split-order.usecase'
import { SetOrderLineQuantityUseCase } from './set-order-line-quantity.usecase'

let orders: ReturnType<typeof mockOrderRepository>
let products: ReturnType<typeof mockProductRepository>
let checkout: ReturnType<typeof mockSaleCheckout>
let unitOfWork: ReturnType<typeof mockUnitOfWork>
let lineOptions: ReturnType<typeof mockLineOptionsResolver>
let tables: ReturnType<typeof mockTableRepository>

const actor = { user: { id: 7, displayName: 'สมชาย' }, branch: { id: 1, code: 'MAIN' } }
const tea = makeProduct({ id: 1, name: 'ชา', sku: 'TEA', priceSatang: 2500 })
const cake = makeProduct({ id: 2, name: 'เค้ก', sku: 'CAKE', priceSatang: 5700 })

beforeEach(() => {
  orders = mockOrderRepository()
  products = mockProductRepository()
  checkout = mockSaleCheckout()
  unitOfWork = mockUnitOfWork()
  lineOptions = mockLineOptionsResolver()
  tables = mockTableRepository()
  tables.findById.mockResolvedValue(makeTable({ id: 3, branchId: 1 }))
  products.findById.mockImplementation(async (id) => [tea, cake].find((product) => product.id === id) ?? null)
  orders.save.mockImplementation(async (order) => order)
})

describe('ListOrdersUseCase', () => {
  test('lists the open orders of the branch unless another status is asked for', async () => {
    orders.findAll.mockResolvedValue({ items: [], total: 0 })
    const useCase = new ListOrdersUseCase(orders)

    await useCase.execute({}, 1)
    await useCase.execute({ status: 'paid', limit: 10, extra: true }, 2)

    expect(orders.findAll.mock.calls.map(([query]) => query)).toEqual([
      { status: 'open', branchId: 1 },
      { status: 'paid', limit: 10, branchId: 2 },
    ])
  })

  test('rejects an unknown status', async () => {
    await expect(new ListOrdersUseCase(orders).execute({ status: 'lost' }, 1)).rejects.toBeInstanceOf(ZodError)
  })
})

describe('GetOrderUseCase', () => {
  test('returns an order of the branch', async () => {
    const stored = makeOrder({ branchId: 1 })
    orders.findById.mockResolvedValue(stored)

    expect(await new GetOrderUseCase(orders).execute(1, 1)).toBe(stored)
  })

  test("an unknown order and another branch's order are both not found", async () => {
    const useCase = new GetOrderUseCase(orders)
    orders.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(makeOrder({ branchId: 2 }))

    await expect(useCase.execute(9, 1)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    await expect(useCase.execute(1, 1)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })
})

describe('OpenOrderUseCase', () => {
  let useCase: OpenOrderUseCase

  beforeEach(() => {
    orders.create.mockImplementation(async (order) => new OrderEntity({ ...order, id: 5, status: 'open', saleId: null, cancelReason: null, cancelledById: null, mergedIntoId: null, createdAt: new Date(), updatedAt: new Date() }))
    useCase = new OpenOrderUseCase(orders, products, unitOfWork, lineOptions, tables, mockMemberRepository())
  })

  test('opens an empty order for the branch and the person who opened it', async () => {
    const opened = await useCase.execute({ label: ' โต๊ะ 4 ' }, actor)

    expect(opened).toMatchObject({ id: 5, branchId: 1, label: 'โต๊ะ 4', openedById: 7, openedByName: 'สมชาย', items: [] })
  })

  test('quotes the current name and price of each product it starts with', async () => {
    await useCase.execute({ items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }] }, actor)

    expect(orders.create.mock.calls[0]![0].items).toEqual([
      { lineId: 0, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [] },
      { lineId: 0, productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700, quantity: 1, options: [] },
    ])
  })

  test('an unknown or inactive product stops the order from being opened', async () => {
    await expect(useCase.execute({ items: [{ productId: 99, quantity: 1 }] }, actor)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    })

    products.findById.mockResolvedValue(makeProduct({ id: 3, isActive: false }))
    await expect(useCase.execute({ items: [{ productId: 3, quantity: 1 }] }, actor)).rejects.toMatchObject({
      code: 'PRODUCT_INACTIVE',
    })
    expect(orders.create).not.toHaveBeenCalled()
  })

  test('an order may be opened for a product with no stock: stock is taken only at payment', async () => {
    products.findById.mockResolvedValue(makeProduct({ id: 4, stockQty: 0 }))

    await useCase.execute({ items: [{ productId: 4, quantity: 3 }] }, actor)

    expect(orders.create).toHaveBeenCalled()
  })

  test.each([
    ['a quantity of 0', { items: [{ productId: 1, quantity: 0 }] }],
    ['a label over 100 characters', { label: 'x'.repeat(101) }],
    ['more than 100 lines', { items: Array.from({ length: 101 }, (_, index) => ({ productId: index + 1, quantity: 1 })) }],
  ])('rejects %s', async (_label, bad) => {
    await expect(useCase.execute(bad, actor)).rejects.toBeInstanceOf(ZodError)
    expect(orders.create).not.toHaveBeenCalled()
  })
})

describe('editing an open order', () => {
  beforeEach(() => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3, branchId: 1 }))
  })

  test('adding a product quotes its current price and locks the order first', async () => {
    const order = await new AddOrderItemUseCase(orders, products, unitOfWork, lineOptions).execute(3, { productId: 2, quantity: 1 }, 1)

    expect(orders.findByIdForUpdate).toHaveBeenCalledWith(3)
    expect(order.items.map((item) => [item.productId, item.quantity, item.unitPriceSatang])).toEqual([
      [1, 2, 2500],
      [2, 1, 5700],
    ])
  })

  test('adding a product already on the order keeps its quoted price, even if the menu price changed', async () => {
    products.findById.mockResolvedValue(makeProduct({ id: 1, priceSatang: 9900 }))

    const order = await new AddOrderItemUseCase(orders, products, unitOfWork, lineOptions).execute(3, { productId: 1, quantity: 1 }, 1)

    expect(order.items).toEqual([{ lineId: 1, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 3, options: [] }])
    expect(products.findById).not.toHaveBeenCalled()
  })

  test('sets and removes quantities', async () => {
    const set = await new SetOrderItemQuantityUseCase(orders, unitOfWork).execute(3, 1, { quantity: 6 }, 1)
    expect(set.items[0]!.quantity).toBe(6)

    const removed = await new RemoveOrderItemUseCase(orders, unitOfWork).execute(3, 1, 1)
    expect(removed.items).toEqual([])
  })

  test('renames', async () => {
    const renamed = await new RenameOrderUseCase(orders, unitOfWork).execute(3, { label: 'โต๊ะ 9' }, 1)

    expect(renamed.label).toBe('โต๊ะ 9')
  })

  test("another branch's order is not found and nothing is saved", async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3, branchId: 2 }))

    await expect(
      new AddOrderItemUseCase(orders, products, unitOfWork, lineOptions).execute(3, { productId: 1, quantity: 1 }, 1),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    await expect(new RemoveOrderItemUseCase(orders, unitOfWork).execute(3, 1, 1)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    })
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('a closed order cannot be edited', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3, status: 'cancelled', cancelReason: 'x' }))

    await expect(
      new SetOrderItemQuantityUseCase(orders, unitOfWork).execute(3, 1, { quantity: 1 }, 1),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_OPEN' })
    expect(orders.save).not.toHaveBeenCalled()
  })

  test.each([
    ['a quantity of zero', { quantity: 0 }],
    ['a missing quantity', {}],
  ])('rejects %s without touching the order', async (_label, bad) => {
    await expect(new SetOrderItemQuantityUseCase(orders, unitOfWork).execute(3, 1, bad, 1)).rejects.toBeInstanceOf(
      ZodError,
    )
    expect(orders.findByIdForUpdate).not.toHaveBeenCalled()
  })
})

describe('CancelOrderUseCase', () => {
  test('closes an open order with the reason and who did it', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3 }))

    const cancelled = await new CancelOrderUseCase(orders, unitOfWork).execute(3, { reason: 'ลูกค้าไม่รอ' }, actor)

    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'ลูกค้าไม่รอ', cancelledById: 7 })
  })

  test('needs a reason', async () => {
    await expect(new CancelOrderUseCase(orders, unitOfWork).execute(3, {}, actor)).rejects.toBeInstanceOf(ZodError)
  })

  test('cannot cancel an order that is already paid', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3 }).markPaid(10))

    await expect(new CancelOrderUseCase(orders, unitOfWork).execute(3, { reason: 'x' }, actor)).rejects.toMatchObject({
      code: 'ORDER_NOT_OPEN',
    })
  })
})

describe('PayOrderUseCase', () => {
  let useCase: PayOrderUseCase
  const payment = { payments: [{ method: 'cash', amountSatang: 10000 }], discountSatang: 500 }

  beforeEach(() => {
    orders.findByIdForUpdate.mockResolvedValue(
      makeOrder({
        id: 3,
        items: [
          { lineId: 1, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 2, options: [] },
          { lineId: 2, productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700, quantity: 1, options: [] },
        ],
      }),
    )
    checkout.checkout.mockResolvedValue(makeSale({ id: 41 }))
    useCase = new PayOrderUseCase(orders, checkout, unitOfWork)
  })

  test('sells the order at the prices it quoted, inside one unit of work, and closes it with the sale', async () => {
    const sale = await useCase.execute(3, payment, actor)

    expect(unitOfWork.run).toHaveBeenCalledTimes(1)
    expect(checkout.checkout).toHaveBeenCalledWith({
      memberId: null,
      lines: [
        { productId: 1, quantity: 2, unitPriceSatang: 2500, options: [] },
        { productId: 2, quantity: 1, unitPriceSatang: 5700, options: [] },
      ],
      discountSatang: 500,
      payments: [{ method: 'cash', amountSatang: 10000 }],
      cashier: actor.user,
      branch: actor.branch,
    })
    expect(orders.save.mock.calls[0]![0]).toMatchObject({ id: 3, status: 'paid', saleId: 41 })
    expect(sale.id).toBe(41)
  })

  test('a failed sale leaves the order open and unsaved', async () => {
    const failure = new Error('stock')
    checkout.checkout.mockRejectedValue(failure)

    await expect(useCase.execute(3, payment, actor)).rejects.toBe(failure)
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('an empty order is refused before any sale is made', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3, items: [] }))

    await expect(useCase.execute(3, payment, actor)).rejects.toMatchObject({ code: 'ORDER_EMPTY' })
    expect(checkout.checkout).not.toHaveBeenCalled()
  })

  test('a closed order is refused before any sale is made', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3 }).markPaid(9))

    await expect(useCase.execute(3, payment, actor)).rejects.toMatchObject({ code: 'ORDER_NOT_OPEN' })
    expect(checkout.checkout).not.toHaveBeenCalled()
  })

  test("another branch's order is not found", async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 3, branchId: 2 }))

    await expect(useCase.execute(3, payment, actor)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    expect(checkout.checkout).not.toHaveBeenCalled()
  })

  test.each([
    ['no payments', { payments: [] }],
    ['a zero payment', { payments: [{ method: 'cash', amountSatang: 0 }] }],
    ['an unknown method', { payments: [{ method: 'barter', amountSatang: 1 }] }],
    ['a negative discount', { ...payment, discountSatang: -1 }],
  ])('rejects %s without opening a unit of work', async (_label, bad) => {
    await expect(useCase.execute(3, bad, actor)).rejects.toBeInstanceOf(ZodError)
    expect(unitOfWork.run).not.toHaveBeenCalled()
  })
})

describe('options on order lines', () => {
  const pearls = { groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }

  beforeEach(() => {
    lineOptions.resolve.mockResolvedValue({ options: [pearls], priceSatang: 1000, costSatang: 400, key: '20' })
  })

  test('adding with options quotes the product price plus the options, and keeps the options', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ items: [] }))

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
      makeOrder({
        items: [{ lineId: 7, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 3000, quantity: 1, options: [pearls] }],
      }),
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
    orders.create.mockImplementation(
      async (order) =>
        new OrderEntity({
          ...order,
          id: 5,
          status: 'open',
          saleId: null,
          cancelReason: null,
          cancelledById: null, mergedIntoId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    )

    const opened = await new OpenOrderUseCase(orders, products, unitOfWork, lineOptions, tables, mockMemberRepository()).execute(
      { items: [{ productId: 1, quantity: 1, options: [20] }] },
      actor,
    )

    expect(opened.items[0]).toMatchObject({ unitPriceSatang: 3500, options: [pearls] })
  })

  test('a line is changed and removed by its id', async () => {
    orders.findByIdForUpdate.mockResolvedValue(
      makeOrder({
        items: [{ lineId: 7, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 3500, quantity: 1, options: [pearls] }],
      }),
    )

    const changed = await new SetOrderLineQuantityUseCase(orders, unitOfWork).execute(1, 7, { quantity: 3 }, 1)
    expect(changed.items[0]!.quantity).toBe(3)

    const removed = await new RemoveOrderLineUseCase(orders, unitOfWork).execute(1, 7, 1)
    expect(removed.items).toEqual([])
  })

  test('paying passes each line with its options and the price it was quoted', async () => {
    orders.findByIdForUpdate.mockResolvedValue(
      makeOrder({
        items: [{ lineId: 7, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 3500, quantity: 2, options: [pearls] }],
      }),
    )
    checkout.checkout.mockResolvedValue(makeSale({ id: 9 }))

    await new PayOrderUseCase(orders, checkout, unitOfWork).execute(1, { payments: [{ method: 'cash', amountSatang: 7000 }] }, actor)

    expect(checkout.checkout.mock.calls[0]![0].lines).toEqual([
      { productId: 1, quantity: 2, unitPriceSatang: 3500, options: [pearls] },
    ])
  })
})

describe('tables on orders', () => {
  const spoken = { user: { id: 7, displayName: 'สมชาย' }, branch: { id: 1, code: 'MAIN' } }
  const stored = (order: Parameters<typeof orders.create>[0]) =>
    new OrderEntity({
      ...order,
      id: 5,
      status: 'open',
      saleId: null,
      cancelReason: null,
      cancelledById: null,
      mergedIntoId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

  test('an order is opened on a usable table of the branch', async () => {
    orders.create.mockImplementation(async (order) => stored(order))

    const opened = await new OpenOrderUseCase(orders, products, unitOfWork, lineOptions, tables, mockMemberRepository()).execute(
      { tableId: 3 },
      spoken,
    )

    expect(opened.tableId).toBe(3)
  })

  test("another branch's table, a closed table and an unknown table all stop the order", async () => {
    const useCase = new OpenOrderUseCase(orders, products, unitOfWork, lineOptions, tables, mockMemberRepository())
    tables.findById
      .mockResolvedValueOnce(makeTable({ id: 3, branchId: 2 }))
      .mockResolvedValueOnce(makeTable({ id: 3, branchId: 1, isActive: false }))
      .mockResolvedValueOnce(null)

    await expect(useCase.execute({ tableId: 3 }, spoken)).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' })
    await expect(useCase.execute({ tableId: 3 }, spoken)).rejects.toMatchObject({ code: 'TABLE_INACTIVE' })
    await expect(useCase.execute({ tableId: 9 }, spoken)).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' })
    expect(orders.create).not.toHaveBeenCalled()
  })

  test('moving an order checks the table and saves; moving to none needs no table', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, tableId: 3 }))
    const useCase = new MoveOrderToTableUseCase(orders, tables, unitOfWork)

    expect((await useCase.execute(1, { tableId: 3 }, 1)).tableId).toBe(3)
    tables.findById.mockClear()
    expect((await useCase.execute(1, { tableId: null }, 1)).tableId).toBeNull()
    expect(tables.findById).not.toHaveBeenCalled()
  })

  test('merging locks the lower id first, closes the source as merged and saves both', async () => {
    const low = makeOrder({ id: 1 })
    const high = makeOrder({
      id: 2,
      items: [{ lineId: 9, productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700, quantity: 1, options: [] }],
    })
    orders.findByIdForUpdate.mockImplementation(async (id) => (id === 1 ? low : high))
    const useCase = new MergeOrdersUseCase(orders, unitOfWork)

    // Into the higher id: the lock order must still be 1 then 2.
    const merged = await useCase.execute(2, { sourceOrderId: 1 }, 1)

    expect(orders.findByIdForUpdate.mock.calls.map(([id]) => id)).toEqual([1, 2])
    expect(merged.id).toBe(2)
    expect(merged.items.map((line) => line.productId)).toEqual([2, 1])
    expect(orders.save.mock.calls.map(([order]) => [order.id, order.status])).toEqual([
      [1, 'merged'],
      [2, 'open'],
    ])
  })

  test("merging an order into itself, or another branch's order, is refused", async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ id: 1, branchId: 2 }))
    const useCase = new MergeOrdersUseCase(orders, unitOfWork)

    await expect(useCase.execute(1, { sourceOrderId: 1 }, 1)).rejects.toMatchObject({ code: 'ORDER_MERGE_SAME' })
    await expect(useCase.execute(1, { sourceOrderId: 2 }, 1)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('splitting saves what remains and creates the new order', async () => {
    orders.findByIdForUpdate.mockResolvedValue(
      makeOrder({
        id: 1,
        tableId: 3,
        items: [{ lineId: 4, productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500, quantity: 3, options: [] }],
      }),
    )
    orders.create.mockImplementation(async (order) => stored(order))

    const created = await new SplitOrderUseCase(orders, unitOfWork).execute(
      1,
      { lines: [{ lineId: 4, quantity: 1 }] },
      spoken,
    )

    expect(orders.save.mock.calls[0]![0].items.map((line) => line.quantity)).toEqual([2])
    expect(created).toMatchObject({ tableId: 3, openedById: 7 })
    expect(created.items.map((line) => line.quantity)).toEqual([1])
  })
})
