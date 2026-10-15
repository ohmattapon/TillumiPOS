import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { QrAttemptEntity } from '../../../../domains/qr-attempt.domain'
import type { QrPaymentEntity } from '../../../../domains/qr-payment.domain'
import { idempotencyHeaders, idParams, page, satang } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CancelQrPaymentUseCase } from '../../applications/usecases/cancel-qr-payment.usecase'
import { CreateQrPaymentV2UseCase } from '../../applications/usecases/create-qr-payment-v2.usecase'
import { DismissQrPaymentUseCase } from '../../applications/usecases/dismiss-qr-payment.usecase'
import { FindOrderQrHoldUseCase } from '../../applications/usecases/find-order-qr-hold.usecase'
import { GetQrPaymentUseCase } from '../../applications/usecases/get-qr-payment.usecase'
import { ListUnclaimedQrPaymentsUseCase } from '../../applications/usecases/list-unclaimed-qr-payments.usecase'
import { ListUnresolvedQrAttemptsUseCase } from '../../applications/usecases/list-unresolved-qr-attempts.usecase'
import { ReadQrPaymentUseCase } from '../../applications/usecases/read-qr-payment.usecase'
import { ResolveQrAttemptUseCase } from '../../applications/usecases/resolve-qr-attempt.usecase'

const payment = t.Object({
  id: t.Integer(),
  branchId: t.Integer(),
  reference: t.String(),
  amountSatang: t.Integer(),
  status: t.Union([t.Literal('pending'), t.Literal('paid'), t.Literal('cancelled')]),
  expiresAt: t.Date(),
  bankTransactionId: t.Nullable(t.String()),
  payerName: t.Nullable(t.String()),
  paidAt: t.Nullable(t.Date()),
  saleId: t.Nullable(t.Integer()),
  // The shift that asked for the QR, which is not necessarily the shift of the sale it ends up paying.
  originShiftId: t.Nullable(t.Integer()),
  dismissedAt: t.Nullable(t.Date()),
  dismissReason: t.Nullable(t.String()),
  createdAt: t.Date(),
})

const attempt = t.Object({
  id: t.Integer(),
  originShiftId: t.Integer(),
  reference: t.String(),
  amountSatang: t.Integer(),
  state: t.Union([t.Literal('creating'), t.Literal('ready'), t.Literal('failed'), t.Literal('unknown')]),
  qrPaymentId: t.Nullable(t.Integer()),
  actorName: t.String(),
  createdAt: t.Date(),
})

const pageQuery = t.Object({
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
  offset: t.Optional(t.Numeric({ minimum: 0 })),
})

function toResponse(entity: QrPaymentEntity): typeof payment.static {
  const { qrRawData: _payload, createdById: _creator, lastCheckedAt: _checked, dismissedById: _by, ...view } =
    entity.toSnapshot()
  return view
}

function toAttemptResponse(entity: QrAttemptEntity): typeof attempt.static {
  const { branchId: _branch, actorId: _actor, idempotencyKey: _key, qrImage: _image, ...view } = entity.toSnapshot()
  return view
}

@injectable()
export class QrPaymentV2ElysiaController {
  constructor(
    @inject(CreateQrPaymentV2UseCase) private readonly create: CreateQrPaymentV2UseCase,
    @inject(ReadQrPaymentUseCase) private readonly read: ReadQrPaymentUseCase,
    @inject(GetQrPaymentUseCase) private readonly refresh: GetQrPaymentUseCase,
    @inject(FindOrderQrHoldUseCase) private readonly findHold: FindOrderQrHoldUseCase,
    @inject(CancelQrPaymentUseCase) private readonly cancel: CancelQrPaymentUseCase,
    @inject(ListUnclaimedQrPaymentsUseCase) private readonly listUnclaimed: ListUnclaimedQrPaymentsUseCase,
    @inject(ListUnresolvedQrAttemptsUseCase) private readonly listAttempts: ListUnresolvedQrAttemptsUseCase,
    @inject(ResolveQrAttemptUseCase) private readonly resolve: ResolveQrAttemptUseCase,
    @inject(DismissQrPaymentUseCase) private readonly dismiss: DismissQrPaymentUseCase,
  ) {}

  getRoutes() {
    // Static paths (unclaimed, attempts) are declared before /:id so they are never read as an id.
    return new Elysia({ name: 'v2.payments.qr', prefix: '/payments/qr', detail: { tags: ['Payments'] } })
      .use(auth)
      .get(
        '/unclaimed',
        async ({ query, branch }) => {
          const { items, total } = await this.listUnclaimed.execute(query, (await branch()).id)
          return { items: items.map(toResponse), total }
        },
        {
          auth: true,
          query: t.Object({ ...pageQuery.properties, amountSatang: t.Optional(t.Numeric({ minimum: 1 })) }),
          response: page(payment),
          detail: { summary: 'v2: เงินที่ธนาคารยืนยันแล้วแต่ยังไม่มีบิลในสาขา' },
        },
      )
      .get(
        '/hold',
        async ({ query, branch }) => {
          const hold = await this.findHold.execute(query.orderId, (await branch()).id)
          return hold && { id: hold.id, status: hold.status, amountSatang: hold.amountSatang, expiresAt: hold.expiresAt }
        },
        {
          auth: true,
          query: t.Object({ orderId: t.Integer({ minimum: 1 }) }),
          response: t.Nullable(
            t.Object({
              id: t.Integer(),
              status: t.Union([t.Literal('pending'), t.Literal('paid'), t.Literal('cancelled')]),
              amountSatang: t.Integer(),
              expiresAt: t.Date(),
            }),
          ),
          detail: { summary: 'v2: QR ที่ถือราคาของออเดอร์นี้อยู่ (null เมื่อไม่มี) ใช้แสดงว่าออเดอร์ถูกล็อกเพราะ QR' },
        },
      )
      .get(
        '/attempts',
        async ({ query, branch }) => {
          const { items, total } = await this.listAttempts.execute(query, (await branch()).id)
          return { items: items.map(toAttemptResponse), total }
        },
        {
          auth: true,
          query: pageQuery,
          response: page(attempt),
          detail: { summary: 'v2: การขอ QR ที่ยังไม่ทราบผลจากธนาคาร' },
        },
      )
      .post(
        '/attempts/:id/resolve',
        async ({ params, user, branch }) =>
          toAttemptResponse(await this.resolve.execute(params.id, { id: user.id }, (await branch()).id)),
        {
          auth: true,
          params: idParams,
          response: attempt,
          detail: { summary: 'v2: ถามธนาคารเพื่อสรุปผลการขอ QR ที่ค้าง' },
        },
      )
      .post(
        '/',
        async ({ body, headers, user, branch }) => {
          const { payment: created, qrImage } = await this.create.execute(
            body,
            { id: user.id, displayName: user.displayName },
            await branch(),
            headers['idempotency-key'],
          )
          return { ...toResponse(created), qrRawData: created.qrRawData, qrImage }
        },
        {
          auth: true,
          headers: idempotencyHeaders,
          body: t.Object({ amountSatang: satang({ minimum: 1 }), shiftId: t.Integer({ minimum: 1 }), quoteId: t.Optional(t.Integer({ minimum: 1 })) }),
          response: t.Composite([payment, t.Object({ qrRawData: t.String(), qrImage: t.String() })]),
          detail: { summary: 'v2: ขอ QR ในกะที่เปิดอยู่ (บันทึกคำขอก่อนเรียกธนาคาร)' },
        },
      )
      .get('/:id', async ({ params, branch }) => toResponse(await this.read.execute(params.id, (await branch()).id)), {
        auth: true,
        params: idParams,
        response: payment,
        detail: { summary: 'v2: สถานะที่บันทึกไว้ของ QR (ไม่ถามธนาคาร)' },
      })
      .post(
        '/:id/refresh',
        async ({ params, branch }) => toResponse(await this.refresh.execute(params.id, (await branch()).id)),
        {
          auth: true,
          params: idParams,
          response: payment,
          detail: { summary: 'v2: ถามธนาคารและบันทึกผล (ไม่ถี่กว่าทุก 3 วินาที)' },
        },
      )
      .post(
        '/:id/cancel',
        async ({ params, branch }) => toResponse(await this.cancel.execute(params.id, (await branch()).id)),
        {
          auth: true,
          params: idParams,
          response: payment,
          detail: { summary: 'v2: เลิกรอการชำระ (ตรวจกับธนาคารก่อน)' },
        },
      )
      .post(
        '/:id/dismiss',
        async ({ params, body, user, branch }) =>
          toResponse(await this.dismiss.execute(params.id, body, { id: user.id }, (await branch()).id)),
        {
          auth: ['owner'],
          params: idParams,
          body: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
          response: payment,
          detail: { summary: 'v2: เจ้าของปิดรายการเงินที่จะไม่มีบิลรองรับ พร้อมเหตุผล' },
        },
      )
  }
}
