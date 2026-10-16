import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeBranch, makeUser } from '../../../../__tests__/factories'
import {
  mockBranchRepository,
  mockPasswordHasher,
  mockRoleDirectory,
  mockUnitOfWork,
  mockUserRepository,
} from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { CreateUserUseCase } from './create-user.usecase'
import { ListUsersUseCase } from './list-users.usecase'
import { UpdateUserUseCase } from './update-user.usecase'

let repo: ReturnType<typeof mockUserRepository>
let hasher: ReturnType<typeof mockPasswordHasher>
let roles: ReturnType<typeof mockRoleDirectory>
let branches: ReturnType<typeof mockBranchRepository>

beforeEach(() => {
  roles = mockRoleDirectory()
  repo = mockUserRepository()
  hasher = mockPasswordHasher()
  branches = mockBranchRepository()
  branches.findById.mockResolvedValue(makeBranch())
})

describe('ListUsersUseCase', () => {
  test('returns the repository result unchanged', async () => {
    const stored = [makeUser({ id: 1 }), makeUser({ id: 2, username: 'malee' })]
    repo.findAll.mockResolvedValue(stored)

    expect(await new ListUsersUseCase(repo).execute()).toBe(stored)
  })
})

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase
  const input = { username: 'SomChai', password: 'secret-password', displayName: 'สมชาย', role: 'cashier' }

  beforeEach(() => {
    repo.create.mockImplementation(async (entity) => makeUser({ ...entity.toSnapshot(), id: 5 }))
    useCase = new CreateUserUseCase(repo, branches, hasher, roles)
  })

  test('stores an active user with a lower-cased username and a hashed password', async () => {
    const created = await useCase.execute(input, 1)

    expect(created.toSnapshot()).toEqual({
      id: 5,
      username: 'somchai',
      displayName: 'สมชาย',
      role: 'cashier',
      branchId: 1,
      isActive: true,
    })
    const [entity, passwordHash] = repo.create.mock.calls[0]!
    expect(entity.toSnapshot()).toMatchObject({ id: 0, username: 'somchai', isActive: true })
    expect(passwordHash).toBe('hashed:secret-password')
  })

  test.each([
    ['a password under 8 characters', { ...input, password: '1234567' }],
    ['a password over 72 characters', { ...input, password: 'x'.repeat(73) }],
    ['a username with a space', { ...input, username: 'som chai' }],
    ['a username under 3 characters', { ...input, username: 'ab' }],
    ['an unknown role', { ...input, role: 'admin' }],
    ['an empty display name', { ...input, displayName: '' }],
    ['a missing field', { username: 'somchai' }],
  ])('rejects %s without hashing or storing anything', async (_label, bad) => {
    await expect(useCase.execute(bad, 1)).rejects.toBeInstanceOf(ZodError)
    expect(hasher.hash).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('uses the branch named in the request, else the one the owner works in', async () => {
    await useCase.execute({ ...input, branchId: 3 }, 1)
    await useCase.execute(input, 2)

    expect(repo.create.mock.calls.map(([entity]) => entity.branchId)).toEqual([3, 2])
    expect(branches.findById.mock.calls.map(([id]) => id)).toEqual([3, 2])
  })

  test('refuses an unknown or closed branch without storing anything', async () => {
    branches.findById.mockResolvedValueOnce(null)
    await expect(useCase.execute(input, 9)).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })

    branches.findById.mockResolvedValueOnce(makeBranch({ isActive: false }))
    await expect(useCase.execute(input, 1)).rejects.toMatchObject({ code: 'BRANCH_INACTIVE' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('ignores fields a caller must not set, such as isActive and id', async () => {
    await useCase.execute({ ...input, isActive: false, id: 99 }, 1)

    expect(repo.create.mock.calls[0]![0].toSnapshot()).toMatchObject({ id: 0, isActive: true })
  })

  test('lets a duplicate-username conflict from the repository through', async () => {
    const conflict = new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')
    repo.create.mockRejectedValue(conflict)

    await expect(useCase.execute(input, 1)).rejects.toBe(conflict)
  })
})

describe('UpdateUserUseCase', () => {
  test('acquires the common owner invariant lock before reading a target user', async () => {
    Object.assign(repo, { lockOwnerChangesForUpdate: async () => { throw new DomainConflictError('ล็อกไม่สำเร็จ', 'OWNER_LOCK_UNAVAILABLE') } })
    const command = new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles)
    await expect(command.execute(4, { isActive: false })).rejects.toMatchObject({ code: 'OWNER_LOCK_UNAVAILABLE' })
    expect(repo.findByIdForUpdate).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })
  let unitOfWork: ReturnType<typeof mockUnitOfWork>
  let useCase: UpdateUserUseCase

  beforeEach(() => {
    unitOfWork = mockUnitOfWork()
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4 }))
    repo.update.mockImplementation(async (entity) => entity)
    repo.countActiveOwners.mockResolvedValue(1)
    useCase = new UpdateUserUseCase(repo, branches, hasher, unitOfWork, roles)
  })

  test('changes only the given fields, inside one unit of work, reading with a row lock', async () => {
    const updated = await useCase.execute(4, { displayName: 'สมชาย ใจดี' })

    expect(updated.toSnapshot()).toMatchObject({ id: 4, displayName: 'สมชาย ใจดี', role: 'cashier', isActive: true })
    expect(unitOfWork.run).toHaveBeenCalledTimes(1)
    expect(repo.findByIdForUpdate).toHaveBeenCalledWith(4)
    expect(repo.update.mock.calls[0]![1]).toBeUndefined()
  })

  test('hashes a new password and passes only the hash to the repository', async () => {
    await useCase.execute(4, { password: 'a-new-password' })

    expect(repo.update.mock.calls[0]![1]).toBe('hashed:a-new-password')
  })

  test('an empty change set stores the user unchanged', async () => {
    const updated = await useCase.execute(4, {})

    expect(updated.toSnapshot()).toEqual(makeUser({ id: 4 }).toSnapshot())
  })

  test('an unknown id is not found, and nothing is written', async () => {
    repo.findByIdForUpdate.mockResolvedValue(null)

    const attempt = useCase.execute(9999, { displayName: 'ผี' })

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test.each([[{ isActive: false }], [{ role: 'cashier' }]])(
    'refuses %p for the last active owner',
    async (changes) => {
      repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4, role: 'owner' }))
      repo.countActiveOwners.mockResolvedValue(1)

      const attempt = useCase.execute(4, changes)

      await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
      await expect(attempt).rejects.toMatchObject({
        code: 'LAST_OWNER',
        message: 'ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน',
      })
      expect(repo.update).not.toHaveBeenCalled()
    },
  )

  test('allows demoting an owner while another active owner remains', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4, role: 'owner' }))
    repo.countActiveOwners.mockResolvedValue(2)

    expect((await useCase.execute(4, { role: 'cashier' })).role).toBe('cashier')
  })

  test('does not count owners when the change cannot remove one', async () => {
    await useCase.execute(4, { isActive: false })

    expect(repo.countActiveOwners).not.toHaveBeenCalled()
  })

  test.each([
    ['a short password', { password: '1234567' }],
    ['an unknown role', { role: 'admin' }],
    ['a non-boolean isActive', { isActive: 'no' }],
  ])('rejects %s before opening a unit of work', async (_label, bad) => {
    await expect(useCase.execute(4, bad)).rejects.toBeInstanceOf(ZodError)
    expect(unitOfWork.run).not.toHaveBeenCalled()
  })

  test('cannot change the username or id', async () => {
    const updated = await useCase.execute(4, { username: 'hacker', id: 99 })

    expect(updated.toSnapshot()).toMatchObject({ id: 4, username: 'somchai' })
  })
})

describe('roles on users', () => {
  const input = { username: 'manager', password: 'secret-password', displayName: 'Manager' }
  beforeEach(() => {
    repo.create.mockImplementation(async (entity) => makeUser({ ...entity.toSnapshot(), id: 5, roleId: entity.roleId }))
    repo.update.mockImplementation(async (entity) => entity)
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4, roleId: 2 }))
  })
  test.each([[7, null, 'cashier'], [1, 'owner', 'owner']] as const)('stores roleId %p and derives legacy role', async (id, systemKey, legacy) => {
    roles.findById.mockResolvedValue({ id, name: 'Role', systemKey })
    const created = await new CreateUserUseCase(repo, branches, hasher, roles).execute({ ...input, roleId: id, role: 'owner' }, 1)
    expect(created.roleId).toBe(id)
    expect(created.role).toBe(legacy)
  })
  test('maps legacy role input to the system role id', async () => {
    const created = await new CreateUserUseCase(repo, branches, hasher, roles).execute({ ...input, role: 'cashier' }, 1)
    expect(created.roleId).toBe(2)
  })
  test('rejects an unknown role on create without hashing or writing', async () => {
    await expect(new CreateUserUseCase(repo, branches, hasher, roles).execute({ ...input, roleId: 99 }, 1)).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(repo.create).not.toHaveBeenCalled()
    expect(hasher.hash).not.toHaveBeenCalled()
  })
  test('refuses moving the last owner to a custom role', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 1, role: 'owner', roleId: 1 }))
    repo.countActiveOwners.mockResolvedValue(1)
    roles.findById.mockResolvedValue({ id: 7, name: 'Manager', systemKey: null })
    await expect(new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles).execute(1, { roleId: 7 })).rejects.toMatchObject({ code: 'LAST_OWNER' })
    expect(repo.update).not.toHaveBeenCalled()
  })
  test('updates both role fields and keeps them on unrelated edits', async () => {
    roles.findById.mockResolvedValue({ id: 7, name: 'Manager', systemKey: null })
    const uc = new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles)
    const updated = await uc.execute(4, { roleId: 7, role: 'owner' })
    expect(updated.roleId).toBe(7)
    expect(updated.role).toBe('cashier')
    repo.findByIdForUpdate.mockResolvedValue(updated)
    expect((await uc.execute(4, { displayName: 'New' })).roleId).toBe(7)
  })
  test('rejects an unknown role on update without writing', async () => {
    await expect(new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles).execute(4, { roleId: 99 })).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(repo.update).not.toHaveBeenCalled()
  })
  test.each([0, -1, 1.5])('rejects invalid roleId %p', async (roleId) => {
    await expect(new CreateUserUseCase(repo, branches, hasher, roles).execute({ ...input, roleId }, 1)).rejects.toBeInstanceOf(ZodError)
  })
})
