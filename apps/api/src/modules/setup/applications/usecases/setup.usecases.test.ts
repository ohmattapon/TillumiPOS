import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeBranch, makeUser } from '../../../../__tests__/factories'
import {
  mockBranchRepository,
  mockFirstRunGuard,
  mockPasswordHasher,
  mockSetupCode,
  mockShopSettingsRepository,
  mockUnitOfWork,
  mockUserRepository,
} from '../../../../__tests__/mocks'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { CompleteSetupUseCase } from './complete-setup.usecase'
import { GetSetupStatusUseCase } from './get-setup-status.usecase'

const input = {
  setupCode: 'ABCDEFGHJKMN',
  shopName: 'ร้านกาแฟบ้านสวน',
  branchName: 'สาขาหลัก',
  username: 'owner',
  displayName: 'สมชาย ใจดี',
  password: 'correct-horse-battery',
}

let guard: ReturnType<typeof mockFirstRunGuard>
let code: ReturnType<typeof mockSetupCode>
let users: ReturnType<typeof mockUserRepository>
let branches: ReturnType<typeof mockBranchRepository>
let settings: ReturnType<typeof mockShopSettingsRepository>
let useCase: CompleteSetupUseCase

beforeEach(() => {
  guard = mockFirstRunGuard()
  code = mockSetupCode()
  users = mockUserRepository()
  branches = mockBranchRepository()
  settings = mockShopSettingsRepository()
  users.create.mockImplementation(async (user) => makeUser({ ...user.toSnapshot(), id: 1 }))
  branches.findAll.mockResolvedValue([makeBranch({ id: 1, name: 'สาขาหลัก' })])
  branches.update.mockImplementation(async (branch) => branch)
  settings.getForUpdate.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
  settings.save.mockImplementation(async (value) => value)
  useCase = new CompleteSetupUseCase(guard, code, users, branches, settings, mockPasswordHasher(), mockUnitOfWork())
})

describe('GetSetupStatusUseCase', () => {
  test('a shop with nobody in it needs setup, and one with a user does not', async () => {
    const status = new GetSetupStatusUseCase(guard)

    expect(await status.execute()).toEqual({ needsSetup: true })
    guard.countUsers.mockResolvedValue(1)
    expect(await status.execute()).toEqual({ needsSetup: false })
  })
})

describe('CompleteSetupUseCase', () => {
  test('makes the owner, names the shop and the first branch, and retires the code', async () => {
    const owner = await useCase.execute(input)

    expect(owner).toMatchObject({ username: 'owner', role: 'owner', displayName: 'สมชาย ใจดี', branchId: 1 })
    expect(users.create.mock.calls[0]![1]).toBe('hashed:correct-horse-battery')
    expect(settings.save.mock.calls[0]![0].shopName).toBe('ร้านกาแฟบ้านสวน')
    expect(branches.update.mock.calls[0]![0].name).toBe('สาขาหลัก')
    expect(code.retire).toHaveBeenCalledTimes(1)
  })

  test('takes the lock before it looks, and refuses when there already is a user, writing nothing', async () => {
    guard.lockAndCountUsers.mockResolvedValue(1)

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'SETUP_DONE' })

    expect(code.verify).not.toHaveBeenCalled()
    expect(users.create).not.toHaveBeenCalled()
    expect(code.retire).not.toHaveBeenCalled()
  })

  test.each([
    ['wrong', 'SETUP_CODE_INVALID'],
    ['not-issued', 'SETUP_CODE_INVALID'],
    ['locked', 'SETUP_LOCKED'],
  ] as const)('a code that is %s is refused as %s and nothing is written', async (check, errorCode) => {
    code.verify.mockReturnValue(check)

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: errorCode })

    expect(users.create).not.toHaveBeenCalled()
    expect(settings.save).not.toHaveBeenCalled()
  })

  test.each([
    ['a short password', { password: 'short-pw' }],
    ['an empty shop name', { shopName: '   ' }],
    ['no code', { setupCode: '' }],
  ])('rejects %s before anything else', async (_label, overrides) => {
    await expect(useCase.execute({ ...input, ...overrides })).rejects.toBeInstanceOf(ZodError)
    expect(guard.lockAndCountUsers).not.toHaveBeenCalled()
  })
})
