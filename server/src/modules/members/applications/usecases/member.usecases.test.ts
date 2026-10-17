import 'reflect-metadata'
import { describe, expect, test } from 'bun:test'
import { MemberEntity } from '../../../../domains/member.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { mockClock, mockMemberRepository, mockShopSettingsRepository } from '../../../../__tests__/mocks'
import type { IMemberSalesHistory, MemberHistoryQuery } from '../ports/member-sales-history.port'
import { CreateMemberUseCase } from './create-member.usecase'
import { UpdateMemberUseCase } from './update-member.usecase'
import { GetMemberUseCase } from './get-member.usecase'
import { ListMembersUseCase } from './list-members.usecase'
import { GetMemberSalesHistoryUseCase } from './get-member-sales-history.usecase'

const now = new Date('2026-10-15T12:00:00Z')
const member = new MemberEntity({ id: 1, name: 'เดิม', phone: '0812345678', isActive: true, createdAt: now, updatedAt: now })
function setup() {
  const calls: string[] = []
  const repo = mockMemberRepository()
  repo.find.mockImplementation(async () => ({ items: [member], total: 1 }))
  repo.findById.mockImplementation(async (id) => id === 1 ? member : null)
  repo.findByIdForUpdate.mockImplementation(async (id) => { calls.push('lock'); return id === 1 ? member : null })
  repo.create.mockImplementation(async (entity) => new MemberEntity({ ...entity.toSnapshot(), id: 2 }))
  repo.update.mockImplementation(async (entity) => { calls.push('write'); return entity })
  return { repo, calls, clock: mockClock(now), uow: { run: async <T>(fn: () => Promise<T>) => { calls.push('uow'); return fn() } } }
}

describe('member usecases', () => {
  test('cashier creates an active normalized member with server dates and code', async () => {
    const { repo, clock } = setup()
    const created = await new CreateMemberUseCase(repo, clock).execute({ name: ' ใหม่ ', phone: '+66812345678', isActive: false, code: 'custom' }, { role: 'cashier' })
    expect(created.toSnapshot()).toMatchObject({ id: 2, code: 'M000002', name: 'ใหม่', phone: '0812345678', isActive: true, createdAt: now })
  })
  test('rejects unsupported actor and invalid create input', async () => {
    const { repo, clock } = setup()
    const usecase = new CreateMemberUseCase(repo, clock)
    await expect(usecase.execute({ name: 'ใหม่', phone: '0812345678' }, { role: 'guest' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(usecase.execute({ name: ' ', phone: '0812345678' }, { role: 'owner' })).rejects.toThrow()
    await expect(usecase.execute({ name: 'ใหม่', phone: 'bad' }, { role: 'owner' })).rejects.toMatchObject({ code: 'INVALID_MEMBER_PHONE' })
  })
  test('owner updates under lock without changing code or creation date', async () => {
    const { repo, clock, uow, calls } = setup()
    const result = await new UpdateMemberUseCase(repo, uow, clock).execute(1, { name: 'ใหม่', isActive: false, id: 999, code: 'oops' }, { role: 'owner' })
    expect(calls).toEqual(['uow', 'lock', 'write'])
    expect(result.toSnapshot()).toMatchObject({ id: 1, code: 'M000001', name: 'ใหม่', isActive: false, createdAt: now })
  })
  test('cashier cannot edit and absent member is explicit', async () => {
    const { repo, clock, uow, calls } = setup()
    const usecase = new UpdateMemberUseCase(repo, uow, clock)
    await expect(usecase.execute(1, { name: 'ใหม่' }, { role: 'cashier' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'members.write' } })
    expect(calls).toEqual([])
    await expect(usecase.execute(99, { name: 'ใหม่' }, { role: 'owner' })).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
    await expect(new GetMemberUseCase(repo).execute({ id: 99 })).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
  })
  test('rejects invalid edits and identifiers before writing', async () => {
    const { repo, clock, uow, calls } = setup()
    const usecase = new UpdateMemberUseCase(repo, uow, clock)
    for (const input of [{ name: ' ' }, { name: 'a'.repeat(121) }, { isActive: 'false' }])
      await expect(usecase.execute(1, input, { role: 'owner' })).rejects.toThrow()
    await expect(usecase.execute(0, { name: 'ใหม่' }, { role: 'owner' })).rejects.toThrow()
    expect(calls).toEqual([])
    await expect(usecase.execute(1, { phone: 'bad' }, { role: 'owner' })).rejects.toMatchObject({ code: 'INVALID_MEMBER_PHONE' })
    expect(calls).toEqual(['uow', 'lock'])
    for (const id of [0, -1, 1.5, '1']) await expect(new GetMemberUseCase(repo).execute({ id })).rejects.toThrow()
  })
  test('duplicate phone conflicts propagate without replacing member identity', async () => {
    const { repo, clock, uow } = setup()
    const duplicate = new DomainConflictError('เบอร์โทรซ้ำ', 'DUPLICATE_MEMBER_PHONE')
    repo.create.mockRejectedValue(duplicate)
    repo.update.mockRejectedValue(duplicate)
    await expect(new CreateMemberUseCase(repo, clock).execute({ name: 'ใหม่', phone: '0812345678' }, { role: 'owner' })).rejects.toBe(duplicate)
    await expect(new UpdateMemberUseCase(repo, uow, clock).execute(1, { phone: '0899999999' }, { role: 'owner' })).rejects.toBe(duplicate)
    expect(member.phone).toBe('0812345678')
  })
  test('list validates pagination and forwards normalized search', async () => {
    const { repo } = setup()
    let query: unknown
    repo.find.mockImplementation(async (input) => { query = input; return { items: [], total: 0 } })
    const list = new ListMembersUseCase(repo)
    await list.execute({ search: '  สม  ', isActive: true })
    expect(query).toEqual({ search: 'สม', isActive: true, limit: 20, offset: 0 })
    await list.execute({ search: '+66 (81) 234-5678' })
    expect(query).toEqual({ search: '0812345678', limit: 20, offset: 0 })
    for (const input of [{ limit: 0 }, { limit: 501 }, { offset: -1 }, { offset: 1.5 }, { search: 'a'.repeat(121) }, { isActive: 'true' }]) await expect(list.execute(input)).rejects.toThrow()
  })
  test('history passes selected branch and shop timezone without altering state', async () => {
    const { repo } = setup()
    let query: MemberHistoryQuery | undefined
    const history: IMemberSalesHistory = { find: async (input) => { query = input; return { items: [], total: 0, summary: { saleCount: 0, totalSatang: 0 } } } }
    const settings = mockShopSettingsRepository()
    settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
    const usecase = new GetMemberSalesHistoryUseCase(repo, history, settings)
    await usecase.execute(1, { from: '2026-10-01', to: '2026-10-15', status: 'voided', limit: 10, offset: 20 }, 3)
    expect(query).toEqual({ memberId: 1, branchId: 3, from: '2026-10-01', to: '2026-10-15', status: 'voided', limit: 10, offset: 20, timeZone: 'Asia/Bangkok' })
    for (const input of [{ from: '2026-02-30' }, { to: '2026-13-01' }, { from: '2026-10-15', to: '2026-10-01' }, { status: 'pending' }, { limit: 501 }, { offset: -1 }]) await expect(usecase.execute(1, input, 3)).rejects.toThrow()
    await expect(usecase.execute(0, {}, 3)).rejects.toThrow()
    await expect(usecase.execute(99, {}, 3)).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
    repo.findById.mockResolvedValue(member.with({ isActive: false }, now))
    await expect(usecase.execute(1, {}, 3)).resolves.toEqual({ items: [], total: 0, summary: { saleCount: 0, totalSatang: 0 } })
  })
})
