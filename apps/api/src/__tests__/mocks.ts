import { mock, type Mock } from 'bun:test'
import type { ICategoryRepository } from '../modules/categories/applications/ports/category.repository'

/** A port whose every method is a bun mock with that method's signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches any method signature
type Mocked<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : T[K] }

export const mockCategoryRepository = (): Mocked<ICategoryRepository> => ({
  findAll: mock<ICategoryRepository['findAll']>(),
  findById: mock<ICategoryRepository['findById']>(),
  create: mock<ICategoryRepository['create']>(),
  update: mock<ICategoryRepository['update']>(),
})
