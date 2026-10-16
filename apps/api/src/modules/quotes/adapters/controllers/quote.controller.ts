import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CancelQuoteUseCase } from '../../applications/usecases/cancel-quote.usecase'
import { CreateQuoteUseCase } from '../../applications/usecases/create-quote.usecase'
import { GetQuoteUseCase } from '../../applications/usecases/get-quote.usecase'
import { toQuoteResponse } from './quote.presenter'
import { quoteSchemas } from './schemas/quote.schema'

@injectable()
export class QuoteElysiaController {
  constructor(
    @inject(CreateQuoteUseCase) private readonly createQuote: CreateQuoteUseCase,
    @inject(GetQuoteUseCase) private readonly getQuote: GetQuoteUseCase,
    @inject(CancelQuoteUseCase) private readonly cancelQuote: CancelQuoteUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'quotes', prefix: '/quotes', detail: { tags: ['Quotes'] } })
      .use(auth)
      .post(
        '/',
        async ({ body, user, branch }) => toQuoteResponse(await this.createQuote.execute(body, user, await branch())),
        {
          auth: ['owner', 'cashier'],
          body: quoteSchemas.create,
          response: quoteSchemas.quote,
          detail: { summary: 'คิดราคาตะกร้าหรือออเดอร์ เลือกโปรโมชัน และตรึงราคาไว้' },
        },
      )
      .get('/:id', async ({ params, branch }) => toQuoteResponse(await this.getQuote.execute(params.id, (await branch()).id)), {
        auth: ['owner', 'cashier'],
        params: idParams,
        response: quoteSchemas.quote,
        detail: { summary: 'อ่านราคาที่ตรึงไว้ (อ่านอย่างเดียว)' },
      })
      .post(
        '/:id/cancel',
        async ({ params, branch }) => toQuoteResponse(await this.cancelQuote.execute(params.id, (await branch()).id)),
        {
          auth: ['owner', 'cashier'],
          params: idParams,
          response: quoteSchemas.quote,
          detail: { summary: 'เลิกใช้ราคาที่ตรึงไว้ (ใช้ไม่ได้ถ้ามี QR จองอยู่)' },
        },
      )
  }
}
