import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeUser } from '../../../../__tests__/factories'
import { mockPasswordHasher, mockUserRepository } from '../../../../__tests__/mocks'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { DomainUnauthorizedError } from '../../../../domains/errors/domain-unauthorized.error'
import { AuthorizeSessionUseCase } from './authorize-session.usecase'
import { LoginUseCase } from './login.usecase'

let repo: ReturnType<typeof mockUserRepository>

beforeEach(() => {
  repo = mockUserRepository()
})

describe('LoginUseCase', () => {
  let useCase: LoginUseCase
  const rejection = { code: 'UNAUTHORIZED', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }

  beforeEach(() => {
    repo.findCredentialsByUsername.mockResolvedValue({ user: makeUser({ id: 3 }), passwordHash: 'hashed:secret' })
    useCase = new LoginUseCase(repo, mockPasswordHasher())
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
    useCase = new AuthorizeSessionUseCase(repo)
  })

  test('returns the user when any signed-in user is allowed', async () => {
    expect((await useCase.execute(3, true)).id).toBe(3)
    expect(repo.findActiveById).toHaveBeenCalledWith(3)
  })

  test('returns the user when their role is among those allowed', async () => {
    expect((await useCase.execute(3, ['owner', 'cashier'])).role).toBe('cashier')
  })

  test('a user without an allowed role is forbidden', async () => {
    const attempt = useCase.execute(3, ['owner'])

    await expect(attempt).rejects.toBeInstanceOf(DomainForbiddenError)
    await expect(attempt).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ใช้งานส่วนนี้' })
  })

  test('a missing or deactivated user is unauthorized, even when the role would match', async () => {
    repo.findActiveById.mockResolvedValue(null)

    const attempt = useCase.execute(3, ['owner', 'cashier'])

    await expect(attempt).rejects.toBeInstanceOf(DomainUnauthorizedError)
    await expect(attempt).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' })
  })

  test('a session id that is not a number is unauthorized without a lookup', async () => {
    await expect(useCase.execute(Number.NaN, true)).rejects.toBeInstanceOf(DomainUnauthorizedError)
    expect(repo.findActiveById).not.toHaveBeenCalled()
  })
})
