import { Elysia } from 'elysia'
import { categories } from './categories'
import { products } from './products'

// Parent module: owns the /catalog namespace and delegates to its child modules.
export const catalog = new Elysia({ name: 'catalog', prefix: '/catalog', detail: { tags: ['Catalog'] } })
  .use(categories)
  .use(products)
