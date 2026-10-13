import { eq } from 'drizzle-orm'
import { db } from '../../../libs/db'
import { notFound } from '../../../shared/errors'
import type { Category, CreateCategory, UpdateCategory } from './model'
import { categories } from '../../../infrastructure/database/schema/categories'

const columns = {
  id: categories.id,
  name: categories.name,
  sortOrder: categories.sortOrder,
  isActive: categories.isActive,
}

export abstract class CategoriesService {
  static list(): Promise<Category[]> {
    return db.select(columns).from(categories).orderBy(categories.sortOrder, categories.name)
  }

  static async create(input: CreateCategory): Promise<Category> {
    const [category] = await db.insert(categories).values(input).returning(columns)
    return category!
  }

  static async update(id: number, input: UpdateCategory): Promise<Category> {
    const [category] = await db.update(categories).set(input).where(eq(categories.id, id)).returning(columns)
    if (!category) throw notFound('ไม่พบหมวดหมู่')
    return category
  }
}
