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
