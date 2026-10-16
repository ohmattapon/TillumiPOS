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
  audience: 'everyone', isActive: true, imageKey: null, createdAt: now, updatedAt: now,
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
      audience: 'everyone', isActive: true, imageKey: null, createdAt: now, updatedAt: now,
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
