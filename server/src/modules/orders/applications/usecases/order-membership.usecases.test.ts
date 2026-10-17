import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeOrder } from '../../../../__tests__/factories'
import { mockMemberRepository, mockOrderRepository, mockUnitOfWork } from '../../../../__tests__/mocks'
import { MemberEntity } from '../../../../domains/member.domain'
import { SetOrderMemberUseCase } from './set-order-member.usecase'

const activeMember = (isActive = true) => new MemberEntity({
  id: 8, name: 'ลูกค้าประจำ', phone: '0812345678', isActive, createdAt: new Date(), updatedAt: new Date(),
})

describe('SetOrderMemberUseCase', () => {
  let orders: ReturnType<typeof mockOrderRepository>
  let members: ReturnType<typeof mockMemberRepository>
  let uow: ReturnType<typeof mockUnitOfWork>
  let useCase: SetOrderMemberUseCase

  beforeEach(() => {
    orders = mockOrderRepository()
    members = mockMemberRepository()
    uow = mockUnitOfWork()
    orders.findByIdForUpdate.mockResolvedValue(makeOrder())
    orders.save.mockImplementation(async (order) => order)
    members.findByIdForUpdate.mockResolvedValue(activeMember())
    useCase = new SetOrderMemberUseCase(orders, members, uow)
  })

  test('locks order then member inside the unit of work before saving', async () => {
    const steps: string[] = []
    let inside = false
    uow.run.mockImplementation(async (work) => {
      inside = true
      try { return await work() } finally { inside = false }
    })
    orders.findByIdForUpdate.mockImplementation(async () => {
      expect(inside).toBe(true)
      steps.push('order')
      return makeOrder()
    })
    members.findByIdForUpdate.mockImplementation(async () => {
      expect(inside).toBe(true)
      steps.push('member')
      return activeMember()
    })
    orders.save.mockImplementation(async (order) => { steps.push('save'); return order })
    const result = await useCase.execute(1, { memberId: 8 }, 1)
    expect(result.memberId).toBe(8)
    expect(steps).toEqual(['order', 'member', 'save'])
    expect(members.findById).not.toHaveBeenCalled()
  })

  test('clears an inactive selection without consulting the member repository', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ memberId: 8 }))
    expect((await useCase.execute(1, { memberId: null }, 1)).memberId).toBeNull()
    expect(members.findByIdForUpdate).not.toHaveBeenCalled()
  })

  test('rejects missing and inactive members before saving', async () => {
    members.findByIdForUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(activeMember(false))
    await expect(useCase.execute(1, { memberId: 8 }, 1)).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
    await expect(useCase.execute(1, { memberId: 8 }, 1)).rejects.toMatchObject({ code: 'MEMBER_INACTIVE' })
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('conceals missing or foreign orders before looking up the member', async () => {
    orders.findByIdForUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(makeOrder({ branchId: 2 }))
    for (let i = 0; i < 2; i++)
      await expect(useCase.execute(1, { memberId: 8 }, 1)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
    expect(members.findByIdForUpdate).not.toHaveBeenCalled()
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('rejects a closed order before member resolution', async () => {
    orders.findByIdForUpdate.mockResolvedValue(makeOrder({ status: 'paid', saleId: 2 }))
    await expect(useCase.execute(1, { memberId: 8 }, 1)).rejects.toMatchObject({ code: 'ORDER_NOT_OPEN' })
    expect(members.findByIdForUpdate).not.toHaveBeenCalled()
    expect(orders.save).not.toHaveBeenCalled()
  })

  test('validates input before entering a transaction', async () => {
    for (const input of [{}, { memberId: 0 }, { memberId: -1 }, { memberId: 1.5 }])
      await expect(useCase.execute(1, input, 1)).rejects.toBeInstanceOf(ZodError)
    expect(uow.run).not.toHaveBeenCalled()
    expect(orders.findByIdForUpdate).not.toHaveBeenCalled()
  })
})
