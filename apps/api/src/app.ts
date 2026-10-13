import 'reflect-metadata'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { auth } from './modules/auth'
import { catalog } from './modules/catalog'
import { inventory } from './modules/inventory'
import { sales } from './modules/sales'
import { users } from './modules/users'
import { errorHandler } from './shared/plugins/error-handler'

const api = new Elysia({ name: 'api', prefix: '/api' })
  .get('/health', () => ({ status: 'ok' }), { detail: { tags: ['System'], summary: 'ตรวจสอบสถานะระบบ' } })
  .use(auth)
  .use(users)
  .use(catalog)
  .use(inventory)
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
