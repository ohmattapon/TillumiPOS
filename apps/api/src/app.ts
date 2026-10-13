import 'reflect-metadata'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { container } from 'tsyringe'
import { AuthElysiaController } from './modules/auth/adapters/controllers/auth.controller'
import { catalog } from './modules/catalog'
import { InventoryElysiaController } from './modules/inventory/adapters/controllers/inventory.controller'
import './modules/di-registrations'
import { sales } from './modules/sales'
import { UserElysiaController } from './modules/users/adapters/controllers/user.controller'
import { errorHandler } from './shared/plugins/error-handler'

const api = new Elysia({ name: 'api', prefix: '/api' })
  .get('/health', () => ({ status: 'ok' }), { detail: { tags: ['System'], summary: 'ตรวจสอบสถานะระบบ' } })
  .use(container.resolve(AuthElysiaController).getRoutes())
  .use(container.resolve(UserElysiaController).getRoutes())
  .use(catalog)
  .use(container.resolve(InventoryElysiaController).getRoutes())
  .use(sales)

export const app = new Elysia()
  .use(errorHandler)
  .use(
    openapi({
      documentation: {
        info: { title: 'POS API', version: '0.1.0', description: 'จำนวนเงินทุกช่องเป็นจำนวนเต็มหน่วยสตางค์' },
      },
    }),
  )
  .use(api)

export type App = typeof app
