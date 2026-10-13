import { describe, expect, test } from 'bun:test'
import { makeCategory } from '../../../../__tests__/factories'
import { mockCategoryRepository } from '../../../../__tests__/mocks'
import { ListCategoriesUseCase } from './list-categories.usecase'

describe('ListCategoriesUseCase', () => {
  test('returns the repository result unchanged', async () => {
    const repo = mockCategoryRepository()
    const stored = [makeCategory({ id: 1 }), makeCategory({ id: 2, name: 'ขนม' })]
    repo.findAll.mockResolvedValue(stored)

    expect(await new ListCategoriesUseCase(repo).execute()).toBe(stored)
  })
})
