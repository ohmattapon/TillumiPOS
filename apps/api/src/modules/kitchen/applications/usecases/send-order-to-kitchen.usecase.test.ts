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
