import { mockAuditLog as auditMock, mockUnitOfWork as auditUnitOfWork } from '../../../../__tests__/mocks'
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
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { CreateUserUseCase } from './create-user.usecase'
import { ListUsersUseCase } from './list-users.usecase'
import { SetUserPinUseCase } from './set-user-pin.usecase'
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
    useCase = new CreateUserUseCase(repo, branches, hasher, auditUnitOfWork(), roles, auditMock())
  })

  test('stores an active user with a lower-cased username and a hashed password', async () => {
    const created = await useCase.execute(input, 1, { id: null, displayName: 'Test fixture' })

    expect(created.toSnapshot()).toEqual({
      id: 5,
      username: 'somchai',
      displayName: 'สมชาย',
      role: 'cashier',
      branchId: 1,
      isActive: true,
      hasPin: false,
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
    await expect(useCase.execute(bad, 1, { id: null, displayName: 'Test fixture' })).rejects.toBeInstanceOf(ZodError)
    expect(hasher.hash).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('uses the branch named in the request, else the one the owner works in', async () => {
    await useCase.execute({ ...input, branchId: 3 }, 1, { id: null, displayName: 'Test fixture' })
    await useCase.execute(input, 2, { id: null, displayName: 'Test fixture' })

    expect(repo.create.mock.calls.map(([entity]) => entity.branchId)).toEqual([3, 2])
    expect(branches.findById.mock.calls.map(([id]) => id)).toEqual([3, 2])
  })

  test('refuses an unknown or closed branch without storing anything', async () => {
    branches.findById.mockResolvedValueOnce(null)
    await expect(useCase.execute(input, 9, { id: null, displayName: 'Test fixture' })).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })

    branches.findById.mockResolvedValueOnce(makeBranch({ isActive: false }))
    await expect(useCase.execute(input, 1, { id: null, displayName: 'Test fixture' })).rejects.toMatchObject({ code: 'BRANCH_INACTIVE' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('ignores fields a caller must not set, such as isActive and id', async () => {
    await useCase.execute({ ...input, isActive: false, id: 99 }, 1, { id: null, displayName: 'Test fixture' })

    expect(repo.create.mock.calls[0]![0].toSnapshot()).toMatchObject({ id: 0, isActive: true })
  })

  test('lets a duplicate-username conflict from the repository through', async () => {
    const conflict = new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')
    repo.create.mockRejectedValue(conflict)

    await expect(useCase.execute(input, 1, { id: null, displayName: 'Test fixture' })).rejects.toBe(conflict)
  })
})

describe('UpdateUserUseCase', () => {
  test('acquires the common owner invariant lock before reading a target user', async () => {
    Object.assign(repo, { lockOwnerChangesForUpdate: async () => { throw new DomainConflictError('ล็อกไม่สำเร็จ', 'OWNER_LOCK_UNAVAILABLE') } })
    const command = new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles, auditMock())
    await expect(command.execute(4, { isActive: false }, { id: 1, displayName: 'ผู้ทดสอบ' })).rejects.toMatchObject({ code: 'OWNER_LOCK_UNAVAILABLE' })
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
    useCase = new UpdateUserUseCase(repo, branches, hasher, unitOfWork, roles, auditMock())
  })

  test('changes only the given fields, inside one unit of work, reading with a row lock', async () => {
    const updated = await useCase.execute(4, { displayName: 'สมชาย ใจดี' }, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(updated.toSnapshot()).toMatchObject({ id: 4, displayName: 'สมชาย ใจดี', role: 'cashier', isActive: true })
    expect(unitOfWork.run).toHaveBeenCalledTimes(1)
    expect(repo.findByIdForUpdate).toHaveBeenCalledWith(4)
    expect(repo.update.mock.calls[0]![1]).toBeUndefined()
  })

  test('hashes a new password and passes only the hash to the repository', async () => {
    await useCase.execute(4, { password: 'a-new-password' }, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(repo.update.mock.calls[0]![1]).toBe('hashed:a-new-password')
  })

  test('an empty change set stores the user unchanged', async () => {
    const updated = await useCase.execute(4, {}, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(updated.toSnapshot()).toEqual(makeUser({ id: 4 }).toSnapshot())
  })

  test('an unknown id is not found, and nothing is written', async () => {
    repo.findByIdForUpdate.mockResolvedValue(null)

    const attempt = useCase.execute(9999, { displayName: 'ผี' }, { id: 1, displayName: 'ผู้ทดสอบ' })

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test.each([[{ isActive: false }], [{ role: 'cashier' }]])(
    'refuses %p for the last active owner',
    async (changes) => {
      repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4, role: 'owner' }))
      repo.countActiveOwners.mockResolvedValue(1)

      const attempt = useCase.execute(4, changes, { id: 1, displayName: 'ผู้ทดสอบ' })

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

    expect((await useCase.execute(4, { role: 'cashier' }, { id: 1, displayName: 'ผู้ทดสอบ' })).role).toBe('cashier')
  })

  test('does not count owners when the change cannot remove one', async () => {
    await useCase.execute(4, { isActive: false }, { id: 1, displayName: 'ผู้ทดสอบ' })

    expect(repo.countActiveOwners).not.toHaveBeenCalled()
  })

  test.each([
    ['a short password', { password: '1234567' }],
    ['an unknown role', { role: 'admin' }],
    ['a non-boolean isActive', { isActive: 'no' }],
  ])('rejects %s before opening a unit of work', async (_label, bad) => {
    await expect(useCase.execute(4, bad, { id: 1, displayName: 'ผู้ทดสอบ' })).rejects.toBeInstanceOf(ZodError)
    expect(unitOfWork.run).not.toHaveBeenCalled()
  })

  test('cannot change the username or id', async () => {
    const updated = await useCase.execute(4, { username: 'hacker', id: 99 }, { id: 1, displayName: 'ผู้ทดสอบ' })

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
    const created = await new CreateUserUseCase(repo, branches, hasher, auditUnitOfWork(), roles, auditMock()).execute({ ...input, roleId: id, role: 'owner' }, 1, { id: null, displayName: 'Test fixture' })
    expect(created.roleId).toBe(id)
    expect(created.role).toBe(legacy)
  })
  test('maps legacy role input to the system role id', async () => {
    const created = await new CreateUserUseCase(repo, branches, hasher, auditUnitOfWork(), roles, auditMock()).execute({ ...input, role: 'cashier' }, 1, { id: null, displayName: 'Test fixture' })
    expect(created.roleId).toBe(2)
  })
  test('rejects an unknown role on create without hashing or writing', async () => {
    await expect(new CreateUserUseCase(repo, branches, hasher, auditUnitOfWork(), roles, auditMock()).execute({ ...input, roleId: 99 }, 1, { id: null, displayName: 'Test fixture' })).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(repo.create).not.toHaveBeenCalled()
    expect(hasher.hash).not.toHaveBeenCalled()
  })
  test('refuses moving the last owner to a custom role', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 1, role: 'owner', roleId: 1 }))
    repo.countActiveOwners.mockResolvedValue(1)
    roles.findById.mockResolvedValue({ id: 7, name: 'Manager', systemKey: null })
    await expect(new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles, auditMock()).execute(1, { roleId: 7 }, { id: 1, displayName: 'ผู้ทดสอบ' })).rejects.toMatchObject({ code: 'LAST_OWNER' })
    expect(repo.update).not.toHaveBeenCalled()
  })
  test('updates both role fields and keeps them on unrelated edits', async () => {
    roles.findById.mockResolvedValue({ id: 7, name: 'Manager', systemKey: null })
    const uc = new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles, auditMock())
    const updated = await uc.execute(4, { roleId: 7, role: 'owner' }, { id: 1, displayName: 'ผู้ทดสอบ' })
    expect(updated.roleId).toBe(7)
    expect(updated.role).toBe('cashier')
    repo.findByIdForUpdate.mockResolvedValue(updated)
    expect((await uc.execute(4, { displayName: 'New' }, { id: 1, displayName: 'ผู้ทดสอบ' })).roleId).toBe(7)
  })
  test('rejects an unknown role on update without writing', async () => {
    await expect(new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles, auditMock()).execute(4, { roleId: 99 }, { id: 1, displayName: 'ผู้ทดสอบ' })).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' })
    expect(repo.update).not.toHaveBeenCalled()
  })
  test.each([0, -1, 1.5])('rejects invalid roleId %p', async (roleId) => {
    await expect(new CreateUserUseCase(repo, branches, hasher, auditUnitOfWork(), roles, auditMock()).execute({ ...input, roleId }, 1, { id: null, displayName: 'Test fixture' })).rejects.toBeInstanceOf(ZodError)
  })
})

describe('SetUserPinUseCase', () => {
  let useCase: SetUserPinUseCase
  let audit: ReturnType<typeof auditMock>
  const manager = { id: 9, displayName: 'ผู้จัดการ', role: 'cashier' as const, permissions: ['users.manage' as const] }
  const owner = { id: 1, displayName: 'เจ้าของ', role: 'owner' as const, permissions: [] }

  beforeEach(() => {
    audit = auditMock()
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 5 }))
    repo.setPinHash.mockResolvedValue(undefined)
    useCase = new SetUserPinUseCase(repo, hasher, auditUnitOfWork(), audit)
  })

  test('a manager sets a PIN: hashed, stored, audited without the PIN or the hash', async () => {
    await useCase.execute(5, { pin: '4321' }, manager)

    expect(hasher.hash).toHaveBeenCalledWith('4321')
    expect(repo.setPinHash).toHaveBeenCalledWith(5, 'hashed:4321')
    const [, , entry] = audit.record.mock.calls[0]!
    expect(entry.action).toBe('user.pin_set')
    expect(entry.entityId).toBe('5')
    expect(JSON.stringify(entry)).not.toContain('4321')
    expect(JSON.stringify(entry)).not.toContain('hashed')
  })

  test('null clears the PIN and is audited as cleared', async () => {
    await useCase.execute(5, { pin: null }, manager)

    expect(hasher.hash).not.toHaveBeenCalled()
    expect(repo.setPinHash).toHaveBeenCalledWith(5, null)
    expect(audit.record.mock.calls[0]![2].action).toBe('user.pin_cleared')
  })

  test('returns the updated user', async () => {
    repo.findById.mockResolvedValue(makeUser({ id: 5, hasPin: true }))

    expect((await useCase.execute(5, { pin: '4321' }, manager)).hasPin).toBe(true)
  })

  test('a manager cannot set the PIN of an owner', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 1, role: 'owner' }))

    await expect(useCase.execute(1, { pin: '4321' }, manager)).rejects.toMatchObject({ code: 'OWNER_PIN_SELF_ONLY' })
    expect(repo.setPinHash).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  test('an owner sets their own PIN only through the account menu, which asks for their password', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 1, role: 'owner' }))

    await expect(useCase.execute(1, { pin: '4321' }, owner)).rejects.toMatchObject({ code: 'OWN_PIN_USE_ACCOUNT' })
    await expect(useCase.execute(1, { pin: null }, owner)).rejects.toBeInstanceOf(DomainForbiddenError)
    expect(repo.setPinHash).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  test('a manager cannot set their own PIN through the users route either', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 9 }))

    await expect(useCase.execute(9, { pin: '4321' }, manager)).rejects.toMatchObject({ code: 'OWN_PIN_USE_ACCOUNT' })
    expect(repo.setPinHash).not.toHaveBeenCalled()
  })

  test.each(['12', '1234567', 'abcd', ''])('rejects the PIN %p without writing', async (pin) => {
    await expect(useCase.execute(5, { pin }, manager)).rejects.toMatchObject({ code: 'INVALID_PIN' })
    expect(repo.setPinHash).not.toHaveBeenCalled()
  })

  test('rejects a non-string, non-null PIN', async () => {
    await expect(useCase.execute(5, { pin: 1234 }, manager)).rejects.toBeInstanceOf(ZodError)
  })

  test('an actor without users.manage is refused', async () => {
    const cashier = { id: 3, displayName: 'แคชเชียร์', role: 'cashier' as const, permissions: [] }

    await expect(useCase.execute(5, { pin: '4321' }, cashier)).rejects.toBeInstanceOf(DomainForbiddenError)
    expect(repo.setPinHash).not.toHaveBeenCalled()
  })

  test('a missing user is not found', async () => {
    repo.findByIdForUpdate.mockResolvedValue(null)

    await expect(useCase.execute(5, { pin: '4321' }, manager)).rejects.toBeInstanceOf(DomainNotFoundError)
    expect(repo.setPinHash).not.toHaveBeenCalled()
  })
})

describe('UpdateUserUseCase and the PIN of a new owner', () => {
  let audit: ReturnType<typeof auditMock>
  let useCase: UpdateUserUseCase
  const manager = { id: 9, displayName: 'ผู้จัดการ' }

  beforeEach(() => {
    audit = auditMock()
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4, hasPin: true }))
    repo.update.mockImplementation(async (entity) => entity)
    repo.setPinHash.mockResolvedValue(undefined)
    repo.findById.mockResolvedValue(makeUser({ id: 4, role: 'owner', hasPin: false }))
    useCase = new UpdateUserUseCase(repo, branches, hasher, mockUnitOfWork(), roles, audit)
  })

  // An owner's PIN is set only by that owner, so a PIN someone else chose must not survive the promotion.
  test('making someone else an owner clears the PIN they had, and audits it in the same unit of work', async () => {
    const updated = await useCase.execute(4, { role: 'owner' }, manager)

    expect(repo.setPinHash).toHaveBeenCalledWith(4, null)
    expect(updated.hasPin).toBe(false)
    const actions = audit.record.mock.calls.map(([, , entry]) => entry.action)
    expect(actions).toContain('user.pin_cleared')
    const cleared = audit.record.mock.calls.find(([, , entry]) => entry.action === 'user.pin_cleared')!
    expect(cleared[0]).toEqual({ id: 9, name: 'ผู้จัดการ' })
    expect(cleared[2]).toMatchObject({ entityType: 'user', entityId: '4', before: { hasPin: true }, after: { hasPin: false } })
  })

  test('a new owner without a PIN has nothing to clear', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4, hasPin: false }))

    await useCase.execute(4, { role: 'owner' }, manager)

    expect(repo.setPinHash).not.toHaveBeenCalled()
    expect(audit.record.mock.calls.map(([, , entry]) => entry.action)).not.toContain('user.pin_cleared')
  })

  test('an edit that does not make them an owner keeps the PIN', async () => {
    await useCase.execute(4, { displayName: 'สมชาย ใจดี' }, manager)

    expect(repo.setPinHash).not.toHaveBeenCalled()
  })

  test('making oneself an owner keeps the PIN one chose oneself', async () => {
    await useCase.execute(4, { role: 'owner' }, { id: 4, displayName: 'สมชาย' })

    expect(repo.setPinHash).not.toHaveBeenCalled()
  })

  test('someone who already is an owner keeps their own PIN on other edits', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeUser({ id: 4, role: 'owner', hasPin: true }))

    await useCase.execute(4, { role: 'owner', displayName: 'เจ้าของ' }, manager)

    expect(repo.setPinHash).not.toHaveBeenCalled()
  })
})
