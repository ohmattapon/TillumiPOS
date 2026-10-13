import { Elysia } from 'elysia'
import { container } from 'tsyringe'
import { CategoryElysiaController } from '../categories/adapters/controllers/category.controller'
import '../di-registrations'
import { ProductElysiaController } from '../products/adapters/controllers/product.controller'

// Owns the /catalog namespace and delegates to the categories and products modules.
export const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(container.resolve(CategoryElysiaController).getRoutes())
  .use(container.resolve(ProductElysiaController).getRoutes())
