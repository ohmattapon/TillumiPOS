import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository } from '../../../../__tests__/mocks'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { UpdateCategoryUseCase } from './update-category.usecase'

describe('UpdateCategoryUseCase', () => {
  let repo: ReturnType<typeof mockCategoryRepository>
  let useCase: UpdateCategoryUseCase

  beforeEach(() => {
    repo = mockCategoryRepository()
    repo.findById.mockResolvedValue(makeCategory({ id: 4, name: 'เครื่องดื่ม', sortOrder: 2 }))
    repo.update.mockImplementation(async (entity) => entity)
    useCase = new UpdateCategoryUseCase(repo)
  })

  test('changes only the given fields', async () => {
    const updated = await useCase.execute(4, { name: 'น้ำ' })

    expect(updated.toSnapshot()).toEqual({ id: 4, name: 'น้ำ', sortOrder: 2, isActive: true })
    expect(repo.findById).toHaveBeenCalledWith(4)
  })

  test('can deactivate a category', async () => {
    expect((await useCase.execute(4, { isActive: false })).isActive).toBe(false)
  })

  test('an empty change set stores the category unchanged', async () => {
    const updated = await useCase.execute(4, {})

    expect(updated.toSnapshot()).toEqual({ id: 4, name: 'เครื่องดื่ม', sortOrder: 2, isActive: true })
  })

  test('an unknown id is not found, and nothing is written', async () => {
    repo.findById.mockResolvedValue(null)

    const attempt = useCase.execute(9999, { name: 'ผี' })

    await expect(attempt).rejects.toBeInstanceOf(DomainNotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'ไม่พบหมวดหมู่' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['a fractional sort order', { sortOrder: 0.5 }],
    ['a non-boolean isActive', { isActive: 'yes' }],
  ])('rejects %s before reading or writing', async (_label, input) => {
    await expect(useCase.execute(4, input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.findById).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  test('cannot change the id', async () => {
    const updated = await useCase.execute(4, { id: 99, name: 'น้ำ' })

    expect(updated.id).toBe(4)
  })
})
