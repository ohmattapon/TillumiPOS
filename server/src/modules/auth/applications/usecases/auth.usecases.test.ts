import { mockAuditLog as auditMock, mockUnitOfWork as auditUnitOfWork } from '../../../../__tests__/mocks'
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeUser } from '../../../../__tests__/factories'
import { mockPasswordHasher, mockUserRepository } from '../../../../__tests__/mocks'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainUnauthorizedError } from '../../../../domains/errors/domain-unauthorized.error'
import { AuthorizeSessionUseCase } from './authorize-session.usecase'
import { LoginUseCase } from './login.usecase'
import { SetOwnPinUseCase } from './set-own-pin.usecase'
import { ListSwitchableUsersUseCase } from './list-switchable-users.usecase'
import { SwitchUserUseCase } from './switch-user.usecase'
import { mockPinGuard } from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'

let repo: ReturnType<typeof mockUserRepository>

beforeEach(() => {
  repo = mockUserRepository()
})

describe('LoginUseCase', () => {
  let useCase: LoginUseCase
  const rejection = { code: 'UNAUTHORIZED', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }

  beforeEach(() => {
    repo.findCredentialsByUsername.mockResolvedValue({ user: makeUser({ id: 3 }), passwordHash: 'hashed:secret' })
    useCase = new LoginUseCase(repo, mockPasswordHasher(), auditMock())
  })

  test('returns the user for the right password, looking the name up in lower case', async () => {
    const user = await useCase.execute({ username: 'SomChai', password: 'secret' })

    expect(user.id).toBe(3)
    expect(repo.findCredentialsByUsername).toHaveBeenCalledWith('somchai')
  })

  test('a wrong password, an unknown user and a deactivated user are rejected identically', async () => {
    const wrongPassword = useCase.execute({ username: 'somchai', password: 'wrong' })
    await expect(wrongPassword).rejects.toBeInstanceOf(DomainUnauthorizedError)
    await expect(wrongPassword).rejects.toMatchObject(rejection)

    repo.findCredentialsByUsername.mockResolvedValue(null)
    await expect(useCase.execute({ username: 'nobody', password: 'secret' })).rejects.toMatchObject(rejection)

    repo.findCredentialsByUsername.mockResolvedValue({
      user: makeUser({ isActive: false }),
      passwordHash: 'hashed:secret',
    })
    await expect(useCase.execute({ username: 'somchai', password: 'secret' })).rejects.toMatchObject(rejection)
  })

  test('a failed attempt is recorded without a user id, never with the password, and with a bounded name', async () => {
    const audit = auditMock()
    const loginWith = new LoginUseCase(repo, mockPasswordHasher(), audit)
    await expect(loginWith.execute({ username: 'x'.repeat(5_000), password: 'topsecret-password' })).rejects.toBeInstanceOf(
      DomainUnauthorizedError,
    )

    const [actor, branchId, entry] = audit.record.mock.calls[0]!
    expect(actor).toEqual({ id: null, name: 'x'.repeat(64) })
    expect(branchId).toBeNull()
    expect(entry).toMatchObject({ action: 'auth.login_failed', entityId: 'x'.repeat(64) })
    expect(JSON.stringify(entry)).not.toContain('topsecret-password')
  })

  test('a failure to write the audit entry does not change the answer to the caller', async () => {
    const audit = auditMock()
    audit.record.mockRejectedValue(new Error('database down'))
    const loginWith = new LoginUseCase(repo, mockPasswordHasher(), audit)
    await expect(loginWith.execute({ username: 'somchai', password: 'wrong' })).rejects.toMatchObject(rejection)
  })

  test('a successful login writes nothing to the audit log', async () => {
    const audit = auditMock()
    await new LoginUseCase(repo, mockPasswordHasher(), audit).execute({ username: 'somchai', password: 'secret' })
    expect(audit.record).not.toHaveBeenCalled()
  })

  test.each([[{ username: '', password: 'x' }], [{ username: 'x', password: '' }], [{ username: 'x' }], [null]])(
    'rejects malformed input %p without a lookup',
    async (input) => {
      await expect(useCase.execute(input)).rejects.toBeInstanceOf(ZodError)
      expect(repo.findCredentialsByUsername).not.toHaveBeenCalled()
    },
  )
})

describe('AuthorizeSessionUseCase', () => {
  let useCase: AuthorizeSessionUseCase

  beforeEach(() => {
    repo.findActiveById.mockResolvedValue(makeUser({ id: 3, role: 'cashier' }))
    useCase = new AuthorizeSessionUseCase({ findActiveById: async (id) => {
      const user = await repo.findActiveById(id)
      return user ? { user, permissions: [], roleName: 'Cashier' } : null
    } })
  })

  test('returns the user when any signed-in user is allowed', async () => {
    expect((await useCase.execute(3, true)).user.id).toBe(3)
    expect(repo.findActiveById).toHaveBeenCalledWith(3)
  })

  test('returns the user when their role is among those allowed', async () => {
    expect((await useCase.execute(3, true)).user.role).toBe('cashier')
  })

  test('a user without an allowed role is forbidden', async () => {
    const attempt = useCase.execute(3, { can: 'sales.void' })

    await expect(attempt).rejects.toBeInstanceOf(DomainForbiddenError)
    await expect(attempt).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'sales.void' }, message: 'ไม่มีสิทธิ์ใช้งานส่วนนี้' })
  })

  test('a missing or deactivated user is unauthorized, even when the role would match', async () => {
    repo.findActiveById.mockResolvedValue(null)

    const attempt = useCase.execute(3, true)

    await expect(attempt).rejects.toBeInstanceOf(DomainUnauthorizedError)
    await expect(attempt).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' })
  })

  test('a session id that is not a number is unauthorized without a lookup', async () => {
    await expect(useCase.execute(Number.NaN, true)).rejects.toBeInstanceOf(DomainUnauthorizedError)
    expect(repo.findActiveById).not.toHaveBeenCalled()
  })
})

describe('granular session permissions', () => {
  test('uses the current role permissions for authorization and returns them', async () => {
    repo.findActiveById.mockResolvedValue(makeUser({ roleId: 7 }))
    const reader = { permissionsOf: async () => ['sales.void'] as const }
    const result = await new AuthorizeSessionUseCase({
      findActiveById: async (id) => {
        const user = await repo.findActiveById(id)
        return user ? { user, permissions: await reader.permissionsOf(), roleName: 'Custom' } : null
      },
    }).execute(1, { can: 'sales.void' })
    expect(result.permissions).toEqual(['sales.void'])
    expect(result.user.roleId).toBe(7)
  })
  test('denies a missing permission with its name', async () => {
    repo.findActiveById.mockResolvedValue(makeUser({ roleId: 7 }))
    const reader = { permissionsOf: async () => ['reports.read'] as const }
    await expect(new AuthorizeSessionUseCase({
      findActiveById: async (id) => {
        const user = await repo.findActiveById(id)
        return user ? { user, permissions: await reader.permissionsOf(), roleName: 'Custom' } : null
      },
    }).execute(1, { can: 'sales.void' }))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'sales.void' } })
  })
  test('owners return all permissions and pass any requirement', async () => {
    repo.findActiveById.mockResolvedValue(makeUser({ role: 'owner', roleId: 1 }))
    const reader = { permissionsOf: async () => [] }
    const result = await new AuthorizeSessionUseCase({
      findActiveById: async (id) => {
        const user = await repo.findActiveById(id)
        return user ? { user, permissions: await reader.permissionsOf(), roleName: 'Custom' } : null
      },
    }).execute(1, { can: 'audit.read' })
    expect(result.permissions).toHaveLength(19)
  })
})

describe('SetOwnPinUseCase', () => {
  let useCase: SetOwnPinUseCase
  let audit: ReturnType<typeof auditMock>
  let hasher: ReturnType<typeof mockPasswordHasher>
  const actor = { id: 3, displayName: 'สมชาย' }

  beforeEach(() => {
    audit = auditMock()
    hasher = mockPasswordHasher()
    repo.findPasswordHashById.mockResolvedValue('hashed:my-password')
    repo.setPinHash.mockResolvedValue(undefined)
    repo.findById.mockResolvedValue(makeUser({ id: 3, hasPin: true }))
    useCase = new SetOwnPinUseCase(repo, hasher, auditUnitOfWork(), audit)
  })

  test('the right password sets the PIN and audits it without secrets', async () => {
    const user = await useCase.execute({ currentPassword: 'my-password', pin: '4321' }, actor)

    expect(repo.setPinHash).toHaveBeenCalledWith(3, 'hashed:4321')
    expect(user.hasPin).toBe(true)
    const entry = audit.record.mock.calls[0]![2]
    expect(entry.action).toBe('user.pin_set')
    expect(JSON.stringify(entry)).not.toContain('4321')
    expect(JSON.stringify(entry)).not.toContain('my-password')
  })

  test('null clears the PIN', async () => {
    await useCase.execute({ currentPassword: 'my-password', pin: null }, actor)

    expect(repo.setPinHash).toHaveBeenCalledWith(3, null)
    expect(audit.record.mock.calls[0]![2].action).toBe('user.pin_cleared')
  })

  test('a wrong current password is a 400-class DomainError, not unauthorized, and changes no PIN', async () => {
    const attempt = useCase.execute({ currentPassword: 'nope', pin: '4321' }, actor)

    await expect(attempt).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
    await expect(attempt).rejects.not.toBeInstanceOf(DomainUnauthorizedError)
    expect(repo.setPinHash).not.toHaveBeenCalled()
    expect(audit.record.mock.calls.map(([, , entry]) => entry.action)).not.toContain('user.pin_set')
  })

  test('a wrong current password is audited outside any unit of work, without the password or the PIN', async () => {
    let insideUnitOfWork = false
    const unitOfWork = auditUnitOfWork()
    unitOfWork.run.mockImplementation(async (work) => {
      insideUnitOfWork = true
      try { return await work() } finally { insideUnitOfWork = false }
    })
    const recordedInside: boolean[] = []
    audit.record.mockImplementation(async () => { recordedInside.push(insideUnitOfWork) })

    await expect(new SetOwnPinUseCase(repo, hasher, unitOfWork, audit).execute({ currentPassword: 'nope', pin: '4321' }, actor))
      .rejects.toMatchObject({ code: 'INVALID_PASSWORD' })

    expect(audit.record).toHaveBeenCalledTimes(1)
    expect(recordedInside).toEqual([false])
    const [who, , entry] = audit.record.mock.calls[0]!
    expect(who).toEqual({ id: 3, name: 'สมชาย' })
    expect(entry).toMatchObject({ action: 'auth.pin_password_failed', entityType: 'user', entityId: '3' })
    expect(JSON.stringify(entry)).not.toContain('nope')
    expect(JSON.stringify(entry)).not.toContain('4321')
  })

  test('a failing audit write never changes the answer to a wrong password', async () => {
    audit.record.mockRejectedValue(new Error('audit down'))
    const original = console.error
    console.error = () => {}
    try {
      await expect(useCase.execute({ currentPassword: 'nope', pin: '4321' }, actor)).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
    } finally { console.error = original }
  })

  test('an invalid PIN is rejected without writing', async () => {
    await expect(useCase.execute({ currentPassword: 'my-password', pin: '12' }, actor)).rejects.toMatchObject({ code: 'INVALID_PIN' })
    expect(repo.setPinHash).not.toHaveBeenCalled()
  })

  test('a missing password hash is treated as a wrong password', async () => {
    repo.findPasswordHashById.mockResolvedValue(null)

    await expect(useCase.execute({ currentPassword: 'my-password', pin: '4321' }, actor)).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
  })

  test('requires a current password', async () => {
    await expect(useCase.execute({ pin: '4321' }, actor)).rejects.toBeInstanceOf(ZodError)
  })
})

describe('SwitchUserUseCase', () => {
  let useCase: SwitchUserUseCase
  let audit: ReturnType<typeof auditMock>
  let hasher: ReturnType<typeof mockPasswordHasher>
  let guard: ReturnType<typeof mockPinGuard>
  const actor = { id: 1, displayName: 'เจ้าของ' }
  const target = makeUser({ id: 3, displayName: 'สมชาย', hasPin: true })
  const other = makeUser({ id: 4, displayName: 'สมหญิง', hasPin: true })

  beforeEach(() => {
    audit = auditMock()
    hasher = mockPasswordHasher()
    guard = mockPinGuard()
    repo.findActiveById.mockImplementation(async (id) => [target, other].find((user) => user.id === id) ?? null)
    repo.findPinHash.mockImplementation(async (id) => (id === 3 ? 'hashed:4321' : id === 4 ? 'hashed:9999' : null))
    useCase = new SwitchUserUseCase(repo, hasher, guard, audit)
  })

  test('the right PIN returns the target and audits who handed over to whom', async () => {
    const user = await useCase.execute({ userId: 3, pin: '4321' }, actor)

    expect(user.id).toBe(3)
    expect(guard.recordSuccess).toHaveBeenCalledWith(3)
    const [auditActor, , entry] = audit.record.mock.calls[0]!
    expect(auditActor).toEqual({ id: 1, name: 'เจ้าของ' })
    expect(entry).toMatchObject({
      action: 'auth.switch',
      entityType: 'user',
      entityId: '3',
      before: { id: 1, displayName: 'เจ้าของ' },
      after: { id: 3, displayName: 'สมชาย' },
    })
    expect(JSON.stringify(entry)).not.toContain('4321')
  })

  test('the attempt is cleared only after the switch is audited', async () => {
    audit.record.mockRejectedValue(new Error('database down'))

    await expect(useCase.execute({ userId: 3, pin: '4321' }, actor)).rejects.toThrow('database down')
    expect(guard.recordSuccess).not.toHaveBeenCalled()
  })

  test('a wrong PIN is a 400-class PIN_INVALID, counts a failure and audits it without the PIN', async () => {
    const attempt = useCase.execute({ userId: 3, pin: '1111' }, actor)

    await expect(attempt).rejects.toBeInstanceOf(DomainError)
    await expect(attempt).rejects.not.toBeInstanceOf(DomainUnauthorizedError)
    await expect(attempt).rejects.toMatchObject({ code: 'PIN_INVALID', message: 'PIN ไม่ถูกต้อง' })
    expect(guard.begin).toHaveBeenCalledWith(3)
    expect(guard.recordSuccess).not.toHaveBeenCalled()
    const entry = audit.record.mock.calls[0]![2]
    expect(entry).toMatchObject({ action: 'auth.switch_failed', entityId: '3' })
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('1111')
  })

  test('a failure to write the failed-switch audit does not change the answer', async () => {
    audit.record.mockRejectedValue(new Error('database down'))

    await expect(useCase.execute({ userId: 3, pin: '1111' }, actor)).rejects.toMatchObject({ code: 'PIN_INVALID' })
  })

  test('after five wrong PINs the sixth try is PIN_LOCKED without checking the hash; another user still switches', async () => {
    for (let i = 0; i < 5; i++)
      await expect(useCase.execute({ userId: 3, pin: '1111' }, actor)).rejects.toMatchObject({ code: 'PIN_INVALID' })
    hasher.verify.mockClear()

    const attempt = useCase.execute({ userId: 3, pin: '4321' }, actor)

    await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
    await expect(attempt).rejects.toMatchObject({ code: 'PIN_LOCKED' })
    expect(hasher.verify).not.toHaveBeenCalled()
    expect((await useCase.execute({ userId: 4, pin: '9999' }, actor)).id).toBe(4)
  })

  test('parallel wrong PINs cannot get past the lock: at most five reach the hash check', async () => {
    const pending: (() => void)[] = []
    hasher.verify.mockImplementation(() => new Promise<boolean>((resolve) => pending.push(() => resolve(false))))

    const attempts = Array.from({ length: 6 }, () => useCase.execute({ userId: 3, pin: '1111' }, actor).catch((error) => error))
    // Let every request reach the hash check (or be refused) before any check finishes.
    for (let i = 0; i < 20; i++) await Promise.resolve()
    pending.forEach((release) => release())
    const results = await Promise.all(attempts)

    expect(results.filter((error) => error.code === 'PIN_LOCKED').length).toBeGreaterThanOrEqual(1)
    expect(hasher.verify.mock.calls.length).toBeLessThanOrEqual(5)
  })

  test('a deactivated or missing target is PIN_NOT_SET and counts no failure', async () => {
    repo.findActiveById.mockResolvedValue(null)
    repo.findPinHash.mockResolvedValue(null)

    await expect(useCase.execute({ userId: 3, pin: '4321' }, actor)).rejects.toMatchObject({ code: 'PIN_NOT_SET' })
    await expect(useCase.execute({ userId: 999, pin: '4321' }, actor)).rejects.toMatchObject({ code: 'PIN_NOT_SET' })
    expect(hasher.verify).not.toHaveBeenCalled()
    expect(guard.begin).not.toHaveBeenCalled()
  })

  test('a target without a PIN is PIN_NOT_SET', async () => {
    repo.findPinHash.mockResolvedValue(null)

    await expect(useCase.execute({ userId: 3, pin: '4321' }, actor)).rejects.toMatchObject({ code: 'PIN_NOT_SET' })
    expect(hasher.verify).not.toHaveBeenCalled()
  })

  test.each([[{ userId: 3 }], [{ userId: 0, pin: '4321' }], [{ userId: 3, pin: '' }], [{ userId: 3, pin: '1'.repeat(21) }], [null]])(
    'rejects malformed input %p without a lookup',
    async (input) => {
      await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(ZodError)
      expect(repo.findPinHash).not.toHaveBeenCalled()
    },
  )
})

describe('ListSwitchableUsersUseCase', () => {
  test('lists only what the repository says is switchable (active, with a PIN)', async () => {
    repo.findSwitchable.mockResolvedValue([{ id: 4, displayName: 'สมหญิง' }])

    expect(await new ListSwitchableUsersUseCase(repo).execute()).toEqual([{ id: 4, displayName: 'สมหญิง' }])
    expect(repo.findSwitchable).toHaveBeenCalled()
  })
})
