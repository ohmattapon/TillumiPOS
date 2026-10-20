import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeRegister } from '../../../../__tests__/factories'
import { mockRegisterRepository, mockUnitOfWork } from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { CreateRegisterUseCase } from './create-register.usecase'
import { ListRegistersUseCase } from './list-registers.usecase'
import { UpdateRegisterUseCase } from './update-register.usecase'

describe('ListRegistersUseCase', () => {
  test('lists the registers of the branch it is given', async () => {
    const repo = mockRegisterRepository()
    repo.findAll.mockResolvedValue([makeRegister()])

    const registers = await new ListRegistersUseCase(repo).execute(2)

    expect(registers).toHaveLength(1)
    expect(repo.findAll).toHaveBeenCalledWith(2)
  })
})

describe('CreateRegisterUseCase', () => {
  let repo: ReturnType<typeof mockRegisterRepository>
  let useCase: CreateRegisterUseCase

  beforeEach(() => {
    repo = mockRegisterRepository()
    repo.create.mockImplementation(async (entity) => entity)
    useCase = new CreateRegisterUseCase(repo)
  })

  test('creates an active register in the branch of the caller', async () => {
    const created = await useCase.execute({ code: 'BAR-2', name: 'บาร์' }, 4)

    expect(created.toSnapshot()).toEqual({ id: 0, branchId: 4, code: 'BAR-2', name: 'บาร์', isActive: true })
  })

  test('refuses a lower-case code, and nothing is written', async () => {
    const attempt = useCase.execute({ code: 'bar', name: 'บาร์' }, 4)

    await expect(attempt).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('UpdateRegisterUseCase', () => {
  let repo: ReturnType<typeof mockRegisterRepository>
  let useCase: UpdateRegisterUseCase

  beforeEach(() => {
    repo = mockRegisterRepository()
    repo.findByIdForUpdate.mockResolvedValue(makeRegister({ id: 3, name: 'หน้าร้าน' }))
    repo.hasOpenShift.mockResolvedValue(false)
    repo.update.mockImplementation(async (entity) => entity)
    useCase = new UpdateRegisterUseCase(repo, mockUnitOfWork())
  })

  test('renames a register and keeps it active', async () => {
    const updated = await useCase.execute(3, { name: 'ริมถนน' }, 1)

    expect(updated.name).toBe('ริมถนน')
    expect(updated.isActive).toBe(true)
    expect(repo.findByIdForUpdate).toHaveBeenCalledWith(3, 1)
  })

  test('deactivates a register that has no open shift', async () => {
    const updated = await useCase.execute(3, { isActive: false }, 1)

    expect(updated.isActive).toBe(false)
  })

  test('refuses to deactivate a register whose shift is still open', async () => {
    repo.hasOpenShift.mockResolvedValue(true)

    const attempt = useCase.execute(3, { isActive: false }, 1)

    await expect(attempt).rejects.toBeInstanceOf(DomainConflictError)
    await expect(attempt).rejects.toMatchObject({ code: 'REGISTER_IN_USE' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('reactivates a register that was deactivated', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeRegister({ isActive: false }))

    const updated = await useCase.execute(3, { isActive: true }, 1)

    expect(updated.isActive).toBe(true)
    expect(repo.hasOpenShift).not.toHaveBeenCalled()
  })

  test('deactivating a register that is already inactive does not ask about shifts', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeRegister({ isActive: false }))

    const updated = await useCase.execute(3, { isActive: false }, 1)

    expect(updated.isActive).toBe(false)
    expect(repo.hasOpenShift).not.toHaveBeenCalled()
  })

  test('an unknown or foreign-branch register is not found', async () => {
    repo.findByIdForUpdate.mockResolvedValue(null)

    const attempt = useCase.execute(99, { name: 'ผี' }, 1)

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'REGISTER_NOT_FOUND' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('an empty change is refused before the register is read', async () => {
    const attempt = useCase.execute(3, {}, 1)

    await expect(attempt).rejects.toBeInstanceOf(ZodError)
    expect(repo.findByIdForUpdate).not.toHaveBeenCalled()
  })

  test('a name that is only spaces is refused by the entity', async () => {
    const attempt = useCase.execute(3, { name: '   ' }, 1)

    await expect(attempt).rejects.toBeInstanceOf(DomainError)
    expect(repo.update).not.toHaveBeenCalled()
  })
})
