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
    expect(result.permissions).toHaveLength(20)
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

  test('a wrong current password is a 400-class DomainError, not unauthorized, and writes nothing', async () => {
    const attempt = useCase.execute({ currentPassword: 'nope', pin: '4321' }, actor)

    await expect(attempt).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
    await expect(attempt).rejects.not.toBeInstanceOf(DomainUnauthorizedError)
    expect(repo.setPinHash).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
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
