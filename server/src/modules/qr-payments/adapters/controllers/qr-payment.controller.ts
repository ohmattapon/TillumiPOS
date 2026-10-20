import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { QrPaymentEntity } from '../../../../domains/qr-payment.domain'
import { idParams } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { GetQrConfigUseCase } from '../../applications/usecases/get-qr-config.usecase'
import { CancelQrPaymentUseCase } from '../../applications/usecases/cancel-qr-payment.usecase'
import { ConfirmScbCallbackUseCase } from '../../applications/usecases/confirm-scb-callback.usecase'
import { CreateQrPaymentUseCase } from '../../applications/usecases/create-qr-payment.usecase'
import { RefreshQrPaymentUseCase } from '../../applications/usecases/refresh-qr-payment.usecase'
import { qrPaymentSchemas, type QrPaymentResponse } from './schemas/qr-payment.schema'

// The QR payload is shown once, in the answer that created it, and is not part of the stored view.
function toResponse(payment: QrPaymentEntity): QrPaymentResponse {
  const {
    qrRawData: _payload,
    createdById: _creator,
    lastCheckedAt: _checked,
    // Shift and dismissal belong to the v2 contract; v1 answers exactly what it always has.
    originShiftId: _shift,
    dismissedAt: _dismissedAt,
    dismissedById: _dismissedBy,
    dismissReason: _dismissReason,
    ...view
  } = payment.toSnapshot()
  return view
}

@injectable()
export class QrPaymentElysiaController {
  constructor(
    @inject(CreateQrPaymentUseCase) private readonly createQrPayment: CreateQrPaymentUseCase,
    @inject(RefreshQrPaymentUseCase) private readonly refreshQrPayment: RefreshQrPaymentUseCase,
    @inject(CancelQrPaymentUseCase) private readonly cancelQrPayment: CancelQrPaymentUseCase,
    @inject(ConfirmScbCallbackUseCase) private readonly confirmScbCallback: ConfirmScbCallbackUseCase,
    @inject(GetQrConfigUseCase) private readonly getQrConfig: GetQrConfigUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'payments.qr', prefix: '/payments/qr', detail: { tags: ['Payments'] } })
      .use(auth)
      .get('/config', () => this.getQrConfig.execute(), {
        auth: true,
        response: qrPaymentSchemas.config,
        detail: { summary: 'ร้านนี้ตั้งค่ารับชำระด้วย QR แล้วหรือยัง' },
      })
      .post(
        '/',
        async ({ body, user, branch }) => {
          const { payment, qrImage } = await this.createQrPayment.execute(body, {
            userId: user.id,
            branch: await branch(),
          })
          return { ...toResponse(payment), qrRawData: payment.qrRawData, qrImage }
        },
        {
          auth: true,
          body: qrPaymentSchemas.create,
          response: qrPaymentSchemas.created,
          detail: { summary: 'สร้าง QR สำหรับยอดเงินหนึ่งรายการ' },
        },
      )
      .get(
        '/:id',
        async ({ params, branch }) => toResponse(await this.refreshQrPayment.execute(params.id, (await branch()).id)),
        {
          auth: true,
          params: idParams,
          response: qrPaymentSchemas.payment,
          detail: { summary: 'สถานะของ QR (ถ้ายังรออยู่ จะถามธนาคารให้ ไม่ถี่กว่าทุก 3 วินาที)' },
        },
      )
      .post(
        '/:id/cancel',
        async ({ params, branch }) => toResponse(await this.cancelQrPayment.execute(params.id, (await branch()).id)),
        {
          auth: true,
          params: idParams,
          response: qrPaymentSchemas.payment,
          detail: { summary: 'เลิกรอการชำระ (ทำไม่ได้ถ้าลูกค้าจ่ายแล้ว)' },
        },
      )
      .post(
        '/scb/confirmation',
        async ({ body }) => {
          const { transactionId } = await this.confirmScbCallback.execute(body)
          // The exact acknowledgement SCB expects; anything else makes it resend.
          return { resCode: '00', resDesc: 'success', transactionId }
        },
        {
          body: qrPaymentSchemas.scbConfirmation,
          response: qrPaymentSchemas.scbAcknowledgement,
          detail: {
            summary: 'ที่รับแจ้งการชำระจาก SCB (ไม่ต้องล็อกอิน) ใช้เป็นสัญญาณให้ตรวจกับ SCB เท่านั้น',
          },
        },
      )
  }
}
