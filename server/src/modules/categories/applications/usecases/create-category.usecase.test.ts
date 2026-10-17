import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository } from '../../../../__tests__/mocks'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { CreateCategoryUseCase } from './create-category.usecase'

describe('CreateCategoryUseCase', () => {
  let repo: ReturnType<typeof mockCategoryRepository>
  let useCase: CreateCategoryUseCase

  beforeEach(() => {
    repo = mockCategoryRepository()
    repo.create.mockImplementation(async (entity) => makeCategory({ ...entity.toSnapshot(), id: 7 }))
    useCase = new CreateCategoryUseCase(repo)
  })

  test('stores a new active category and returns it with its id', async () => {
    const created = await useCase.execute({ name: 'เครื่องดื่ม', sortOrder: 3 })

    expect(created.toSnapshot()).toEqual({ id: 7, name: 'เครื่องดื่ม', sortOrder: 3, isActive: true })
    expect(repo.create.mock.calls[0]![0].toSnapshot()).toEqual({ id: 0, name: 'เครื่องดื่ม', sortOrder: 3, isActive: true })
  })

  test('sort order defaults to 0', async () => {
    expect((await useCase.execute({ name: 'ขนม' })).sortOrder).toBe(0)
  })

  test.each([
    ['a missing name', {}],
    ['an empty name', { name: '' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['a non-string name', { name: 42 }],
    ['a fractional sort order', { name: 'ขนม', sortOrder: 1.5 }],
    ['input that is not an object', 'ขนม'],
  ])('rejects %s without touching the repository', async (_label, input) => {
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.create).not.toHaveBeenCalled()
  })

  test('ignores fields a caller must not set, such as isActive and id', async () => {
    const created = await useCase.execute({ name: 'ขนม', isActive: false, id: 99 })

    expect(created.isActive).toBe(true)
    expect(repo.create.mock.calls[0]![0].id).toBe(0)
  })

  test('lets a duplicate-name conflict from the repository through', async () => {
    const conflict = new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')
    repo.create.mockRejectedValue(conflict)

    await expect(useCase.execute({ name: 'ขนม' })).rejects.toBe(conflict)
  })
})
