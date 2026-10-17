import { beforeEach, describe, expect, test } from 'bun:test'
import { makeBranch, makeUser } from '../../../../__tests__/factories'
import { mockBranchRepository, mockUnitOfWork, mockUserRepository } from '../../../../__tests__/mocks'
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

  beforeEach(() => {
    useCase = new CreateBranchUseCase()
  })

  test('refuses every new branch, because the shop has one branch', async () => {
    await expect(useCase.execute({ code: 'BKK', name: 'สาขากรุงเทพ' })).rejects.toMatchObject({ code: 'SINGLE_BRANCH_ONLY' })
  })

  test('refuses before it reads the input, so a malformed request gets the same answer', async () => {
    await expect(useCase.execute(null)).rejects.toMatchObject({ code: 'SINGLE_BRANCH_ONLY' })
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

  test('MAIN can never be closed, even while other branches are open', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeBranch({ id: 1, code: 'MAIN' }))
    repo.countActive.mockResolvedValue(2)

    await expect(useCase.execute(1, { isActive: false })).rejects.toMatchObject({ code: 'MAIN_BRANCH_REQUIRED' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('MAIN can still be renamed', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeBranch({ id: 1, code: 'MAIN' }))

    expect((await useCase.execute(1, { name: 'ร้านใหม่' })).toSnapshot()).toMatchObject({ code: 'MAIN', name: 'ร้านใหม่' })
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
