import { Elysia } from 'elysia'
import { container } from 'tsyringe'
import { CategoryElysiaController } from '../categories/adapters/controllers/category.controller'
import '../di-registrations'
import { products } from './products'

// Owns the /catalog namespace. Categories already come from the hexagonal module;
// products still use the legacy service until their own migration step.
export const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(container.resolve(CategoryElysiaController).getRoutes())
  .use(products)
