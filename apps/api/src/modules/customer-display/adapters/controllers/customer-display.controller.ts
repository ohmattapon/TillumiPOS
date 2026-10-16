import { Elysia, sse, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from '../../../auth.plugin'
import { GetDisplayPairingUseCase } from '../../applications/usecases/get-display-pairing.usecase'
import { OpenDisplayStreamUseCase } from '../../applications/usecases/open-display-stream.usecase'
import { PairDisplayUseCase } from '../../applications/usecases/pair-display.usecase'
import { PublishDisplayStateUseCase } from '../../applications/usecases/publish-display-state.usecase'
import { StartDisplaySessionUseCase } from '../../applications/usecases/start-display-session.usecase'
import { UnpairDisplayUseCase } from '../../applications/usecases/unpair-display.usecase'

const registerId = t.Optional(t.Nullable(t.Integer({ minimum: 1 })))
const displays = t.Object({ displays: t.Integer() })

@injectable()
export class CustomerDisplayElysiaController {
  constructor(
    @inject(StartDisplaySessionUseCase) private readonly start: StartDisplaySessionUseCase,
    @inject(PairDisplayUseCase) private readonly pair: PairDisplayUseCase,
    @inject(PublishDisplayStateUseCase) private readonly publish: PublishDisplayStateUseCase,
    @inject(UnpairDisplayUseCase) private readonly unpair: UnpairDisplayUseCase,
    @inject(GetDisplayPairingUseCase) private readonly pairing: GetDisplayPairingUseCase,
    @inject(OpenDisplayStreamUseCase) private readonly open: OpenDisplayStreamUseCase,
  ) {}

  /**
   * `/sessions` and `/stream` are open on purpose: the customer's screen has no account. What it can do is
   * bounded: ask for a code, then read the stream of the one session whose token it holds.
   */
  getRoutes() {
    const open = this.open
    return new Elysia({ name: 'customer-display', prefix: '/customer-display', detail: { tags: ['Customer display'] } })
      .use(auth)
      .post(
        '/sessions',
        async () => {
          const session = await this.start.execute()
          return { token: session.token, code: session.code, expiresAt: session.expiresAt }
        },
        {
          response: t.Object({ token: t.String(), code: t.String(), expiresAt: t.Date() }),
          detail: { summary: 'จอลูกค้าขอรหัสจับคู่ (ไม่ต้องล็อกอิน)' },
        },
      )
      .get(
        '/stream',
        async function* ({ query, request }) {
          for await (const event of open.execute(query.token, request.signal)) {
            const data =
              event.type === 'state'
                ? event.envelope
                : event.type === 'waiting'
                  ? { code: event.code, expiresAt: event.expiresAt }
                  : {}
            yield sse({ event: event.type, data })
          }
        },
        {
          query: t.Object({ token: t.String() }),
          detail: {
            summary:
              'สตรีม SSE ของจอลูกค้า: เหตุการณ์ waiting, paired, state, unpaired, expired และ ping (ถือ token ของ session)',
          },
        },
      )
      .post(
        '/pair',
        async ({ body, user, branch }) =>
          this.pair.execute(body, { userId: user.id, branchId: (await branch()).id }),
        {
          auth: true,
          body: t.Object({ code: t.String(), registerId }),
          response: displays,
          detail: { summary: 'กรอกรหัสจับคู่ที่หน้าขาย: ผูกจอกับเครื่องขาย' },
        },
      )
      .get(
        '/pair',
        async ({ query, user, branch }) =>
          this.pairing.execute(query, { userId: user.id, branchId: (await branch()).id }),
        {
          auth: true,
          query: t.Object({ registerId: t.Optional(t.Numeric({ minimum: 1 })) }),
          response: displays,
          detail: { summary: 'จำนวนจอที่ผูกกับเครื่องขายนี้' },
        },
      )
      .delete(
        '/pair',
        async ({ query, user, branch }) =>
          this.unpair.execute(query, { userId: user.id, branchId: (await branch()).id }),
        {
          auth: true,
          query: t.Object({ registerId: t.Optional(t.Numeric({ minimum: 1 })) }),
          response: displays,
          detail: { summary: 'ถอดจอทั้งหมดที่ผูกกับเครื่องขายนี้' },
        },
      )
      .put(
        '/state',
        async ({ body, user, branch }) =>
          this.publish.execute(body, { userId: user.id, branchId: (await branch()).id }),
        {
          auth: true,
          body: t.Object({ registerId, envelope: t.Any() }),
          response: displays,
          detail: { summary: 'หน้าขายส่งสถานะการขายล่าสุดให้จอที่ผูกอยู่' },
        },
      )
  }
}
