import 'reflect-metadata'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { appModule } from './modules/app.module'
import { v2Module } from './modules/v2.module'
import { errorHandler } from './modules/error-handler.plugin'
import { legacyMoneyPolicy } from './modules/legacy-money-policy.plugin'

export const app = new Elysia()
  .use(errorHandler)
  .use(legacyMoneyPolicy)
  .use(
    openapi({
      documentation: {
        info: { title: 'POS API', version: '0.1.0', description: 'จำนวนเงินทุกช่องเป็นจำนวนเต็มหน่วยสตางค์' },
      },
    }),
  )
  .use(appModule)
  .use(v2Module)

export type App = typeof app
