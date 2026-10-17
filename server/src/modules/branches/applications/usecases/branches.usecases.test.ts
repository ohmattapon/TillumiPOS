import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeBranch, makeUser } from '../../../../__tests__/factories'
import { mockBranchRepository, mockRegisterRepository, mockUnitOfWork, mockUserRepository } from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { CreateBranchUseCase } from './create-branch.usecase'
import { ListBranchesUseCase } from './list-branches.usecase'
import { ResolveBranchUseCase } from './resolve-branch.usecase'
import { UpdateBranchUseCase } from './update-branch.usecase'

let repo: ReturnType<typeof mockBranchRepository>

beforeEach(() => {
  repo = mockBranchRepository()
})

describe('ListBranchesUseCase', () => {
  const main = makeBranch({ id: 1, code: 'MAIN' })
  const bkk = makeBranch({ id: 2, code: 'BKK', name: 'สาขากรุงเทพ' })

  beforeEach(() => repo.findAll.mockResolvedValue([bkk, main]))

  test('an owner sees every branch', async () => {
    expect(await new ListBranchesUseCase(repo).execute({ role: 'owner', branchId: 1 })).toEqual([bkk, main])
  })

  test('a cashier sees only the branch they work in', async () => {
    expect(await new ListBranchesUseCase(repo).execute({ role: 'cashier', branchId: 2 })).toEqual([bkk])
  })
})

describe('CreateBranchUseCase', () => {
  let useCase: CreateBranchUseCase
  let registers: ReturnType<typeof mockRegisterRepository>

  beforeEach(() => {
    repo.create.mockImplementation(async (entity) => makeBranch({ ...entity.toSnapshot(), id: 7 }))
    registers = mockRegisterRepository()
    useCase = new CreateBranchUseCase(repo, registers, mockUnitOfWork())
  })

  test('stores an active branch with an upper-case code', async () => {
    const created = await useCase.execute({ code: ' bkk01 ', name: 'สาขากรุงเทพ', phone: '02-000-0000' })

    expect(created.toSnapshot()).toEqual({
      id: 7,
      code: 'BKK01',
      name: 'สาขากรุงเทพ',
      address: null,
      phone: '02-000-0000',
      isActive: true,
    })
    expect(registers.createMainForBranch).toHaveBeenCalledWith(7)
  })

  test('blank address and phone are stored as none', async () => {
    await useCase.execute({ code: 'BKK', name: 'สาขา', address: '  ', phone: '' })

    expect(repo.create.mock.calls[0]![0].toSnapshot()).toMatchObject({ address: null, phone: null })
  })

  test.each([
    ['a missing name', { code: 'BKK' }],
    ['a code of one character', { code: 'B', name: 'สาขา' }],
    ['an empty name', { code: 'BKK', name: ' ' }],
  ])('rejects %s without storing anything', async (_label, bad) => {
    await expect(useCase.execute(bad)).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('rejects a code with characters outside A-Z and 0-9', async () => {
    await expect(useCase.execute({ code: 'BK-1', name: 'สาขา' })).rejects.toMatchObject({ code: 'INVALID_BRANCH' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('passes a taken code on as the repository reports it', async () => {
    const taken = new DomainConflictError('รหัสสาขานี้มีอยู่แล้ว', 'BRANCH_CODE_TAKEN')
    repo.create.mockRejectedValue(taken)

    await expect(useCase.execute({ code: 'MAIN', name: 'ซ้ำ' })).rejects.toBe(taken)
  })
})

describe('UpdateBranchUseCase', () => {
  let users: ReturnType<typeof mockUserRepository>
  let useCase: UpdateBranchUseCase

  beforeEach(() => {
    users = mockUserRepository()
    users.countActiveInBranch.mockResolvedValue(0)
    repo.findByIdForUpdate.mockResolvedValue(makeBranch({ id: 2, code: 'BKK', address: 'เดิม' }))
    repo.countActive.mockResolvedValue(2)
    repo.update.mockImplementation(async (entity) => entity)
    useCase = new UpdateBranchUseCase(repo, users, mockUnitOfWork())
  })

  test('changes the given fields and keeps the rest', async () => {
    const updated = await useCase.execute(2, { name: 'ชื่อใหม่' })

    expect(updated.toSnapshot()).toMatchObject({ code: 'BKK', name: 'ชื่อใหม่', address: 'เดิม', isActive: true })
  })

  test('an unknown branch is not found', async () => {
    repo.findByIdForUpdate.mockResolvedValue(null)

    await expect(useCase.execute(99, { name: 'ผี' })).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('closes a branch that nobody works in', async () => {
    const updated = await useCase.execute(2, { isActive: false })

    expect(updated.isActive).toBe(false)
  })

  test('the last open branch cannot be closed', async () => {
    repo.countActive.mockResolvedValue(1)

    await expect(useCase.execute(2, { isActive: false })).rejects.toMatchObject({ code: 'BRANCH_IN_USE' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('a branch that still has active users cannot be closed', async () => {
    users.countActiveInBranch.mockResolvedValue(3)

    await expect(useCase.execute(2, { isActive: false })).rejects.toMatchObject({ code: 'BRANCH_IN_USE' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('reopening a closed branch needs none of those checks', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeBranch({ id: 2, code: 'BKK', isActive: false }))
    repo.countActive.mockResolvedValue(0)

    expect((await useCase.execute(2, { isActive: true })).isActive).toBe(true)
  })
})

describe('ResolveBranchUseCase', () => {
  let useCase: ResolveBranchUseCase
  const owner = makeUser({ role: 'owner', branchId: 2 })
  const cashier = makeUser({ role: 'cashier', branchId: 2 })

  beforeEach(() => {
    repo.findMain.mockResolvedValue(makeBranch({ id: 1, code: 'MAIN' }))
    useCase = new ResolveBranchUseCase(repo)
  })

  test('every request works in MAIN, without a header', async () => {
    expect((await useCase.execute(cashier)).id).toBe(1)
    expect((await useCase.execute(owner, null)).id).toBe(1)
  })

  test('a header naming another branch is ignored, for an owner and for a cashier', async () => {
    expect((await useCase.execute(owner, 3)).id).toBe(1)
    expect((await useCase.execute(cashier, 3)).id).toBe(1)
  })

  test('a user assigned to another branch still works in MAIN', async () => {
    const elsewhere = makeUser({ role: 'cashier', branchId: 9 })

    expect((await useCase.execute(elsewhere)).id).toBe(1)
  })

  test('without MAIN the request is not found, which only a broken install can reach', async () => {
    repo.findMain.mockResolvedValue(null)

    await expect(useCase.execute(owner)).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })
})
