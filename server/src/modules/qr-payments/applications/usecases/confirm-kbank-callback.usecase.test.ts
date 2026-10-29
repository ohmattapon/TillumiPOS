import { describe, expect, mock, test } from 'bun:test'
import { makeQrPayment } from '../../../../__tests__/factories'
import { mockClock, mockQrPaymentRepository } from '../../../../__tests__/mocks'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import type { QrPaymentRefresher } from '../services/qr-payment-refresher'
import { CALLBACK_MIN_CHECK_INTERVAL_MS, ConfirmKbankCallbackUseCase } from './confirm-kbank-callback.usecase'

const now = new Date('2026-10-29T03:00:00Z')

const setup = () => {
  const payments = mockQrPaymentRepository()
  const refresher = { refresh: mock(async (payment: unknown) => payment) }
  const unitOfWork = { run: async (fn: () => Promise<unknown>) => fn() } as IUnitOfWork
  const usecase = new ConfirmKbankCallbackUseCase(
    payments,
    refresher as unknown as QrPaymentRefresher,
    unitOfWork,
    mockClock(now),
  )
  return { payments, refresher, usecase }
}

describe('ConfirmKbankCallbackUseCase', () => {
  test('unknown reference is acknowledged without asking the bank', async () => {
    const { payments, refresher, usecase } = setup()
    payments.findByReferenceForUpdate.mockResolvedValue(null)

    const answer = await usecase.execute({ partnerTxnUid: 'QRUNKNOWNREF001', statusCode: '00' })

    expect(answer).toEqual({ partnerTxnUid: 'QRUNKNOWNREF001' })
    expect(refresher.refresh).not.toHaveBeenCalled()
  })

  test('known reference triggers a forced inquiry, never trusting the body', async () => {
    const { payments, refresher, usecase } = setup()
    const payment = makeQrPayment({ reference: 'QRID1' })
    payments.findByReferenceForUpdate.mockResolvedValue(payment)

    const answer = await usecase.execute({ partnerTxnUid: 'QRID1', txnStatus: 'PAID', txnAmount: '999.00' })

    expect(answer).toEqual({ partnerTxnUid: 'QRID1' })
    expect(refresher.refresh).toHaveBeenCalledWith(payment, { force: true })
  })

  test('a callback right after a check is acknowledged without asking the bank again', async () => {
    const { payments, refresher, usecase } = setup()
    const checked = makeQrPayment({ reference: 'QRID1', lastCheckedAt: new Date(now.getTime() - CALLBACK_MIN_CHECK_INTERVAL_MS + 1) })
    payments.findByReferenceForUpdate.mockResolvedValue(checked)

    expect(await usecase.execute({ partnerTxnUid: 'QRID1' })).toEqual({ partnerTxnUid: 'QRID1' })
    expect(refresher.refresh).not.toHaveBeenCalled()
  })

  test('body without a reference is acknowledged with an empty echo', async () => {
    const { refresher, usecase } = setup()

    const answer = await usecase.execute({ statusCode: '00' })

    expect(answer).toEqual({ partnerTxnUid: '' })
    expect(refresher.refresh).not.toHaveBeenCalled()
  })
})

describe('ConfirmKbankCallbackUseCase input bound', () => {
  test('a reference longer than any we issue is rejected before touching the database', async () => {
    const { payments, usecase } = setup()

    await expect(usecase.execute({ partnerTxnUid: 'A'.repeat(65) })).rejects.toThrow()
    expect(payments.findByReferenceForUpdate).not.toHaveBeenCalled()
  })
})
