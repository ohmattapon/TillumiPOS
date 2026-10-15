import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeQrPayment } from '../../../../__tests__/factories'
import {
  mockClock,
  mockQrPaymentGateway,
  mockQrPaymentRepository,
  mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { QrPaymentClaims } from '../services/qr-payment-claims'
import { MIN_CHECK_INTERVAL_MS, QrPaymentRefresher } from '../services/qr-payment-refresher'
import { CancelQrPaymentUseCase } from './cancel-qr-payment.usecase'
import { ConfirmScbCallbackUseCase } from './confirm-scb-callback.usecase'
import { CreateQrPaymentUseCase, QR_VALID_FOR_MS } from './create-qr-payment.usecase'
import { GetQrPaymentUseCase } from './get-qr-payment.usecase'

const now = new Date('2026-10-13T06:01:00Z')
const found = { transactionId: 'TX-1', amountSatang: 5000, paidAt: new Date('2026-10-13T06:00:30Z'), payerName: null }

let repo: ReturnType<typeof mockQrPaymentRepository>
let gateway: ReturnType<typeof mockQrPaymentGateway>
let refresher: QrPaymentRefresher

beforeEach(() => {
  repo = mockQrPaymentRepository()
  gateway = mockQrPaymentGateway()
  refresher = new QrPaymentRefresher(gateway, repo, mockClock(now))
})

describe('CreateQrPaymentUseCase', () => {
  const actor = { userId: 7, branch: { id: 1, code: 'MAIN' } }
  let useCase: CreateQrPaymentUseCase

  beforeEach(() => {
    gateway.createQr.mockResolvedValue({ qrRawData: 'RAW', qrImage: 'IMG' })
    repo.create.mockImplementation(async (payment) => makeQrPayment({ ...payment, id: 3 }))
    useCase = new CreateQrPaymentUseCase(gateway, repo, mockClock(now))
  })

  test('asks the bank for the amount, then keeps the QR for a limited time', async () => {
    const { payment, qrImage } = await useCase.execute({ amountSatang: 5000 }, actor)

    expect(gateway.createQr).toHaveBeenCalledWith({
      reference: expect.stringMatching(/^QR[A-Z0-9]{14}$/),
      amountSatang: 5000,
      branchCode: 'MAIN',
    })
    expect(repo.create.mock.calls[0]![0]).toMatchObject({
      branchId: 1,
      amountSatang: 5000,
      qrRawData: 'RAW',
      createdById: 7,
      expiresAt: new Date(now.getTime() + QR_VALID_FOR_MS),
    })
    expect(payment.id).toBe(3)
    expect(qrImage).toBe('IMG')
  })

  test('makes a different reference every time', async () => {
    await useCase.execute({ amountSatang: 5000 }, actor)
    await useCase.execute({ amountSatang: 5000 }, actor)

    const [first, second] = gateway.createQr.mock.calls.map(([request]) => request.reference)
    expect(first).not.toBe(second)
  })

  test('refuses when QR payment is not set up, before calling the bank', async () => {
    gateway.isEnabled.mockReturnValue(false)

    await expect(useCase.execute({ amountSatang: 5000 }, actor)).rejects.toMatchObject({ code: 'QR_NOT_CONFIGURED' })
    expect(gateway.createQr).not.toHaveBeenCalled()
  })

  test.each([0, -1, 1.5, 3_000_000_000])('refuses an amount of %p', async (amountSatang) => {
    await expect(useCase.execute({ amountSatang }, actor)).rejects.toBeInstanceOf(ZodError)
    expect(gateway.createQr).not.toHaveBeenCalled()
  })

  test('stores nothing when the bank refuses', async () => {
    const failure = new DomainExternalServiceError('down', 'QR_GATEWAY_ERROR')
    gateway.createQr.mockRejectedValue(failure)

    await expect(useCase.execute({ amountSatang: 5000 }, actor)).rejects.toBe(failure)
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('QrPaymentRefresher', () => {
  test('records a payment the bank has, and stamps the check', async () => {
    gateway.findPayment.mockResolvedValue(found)

    const refreshed = await refresher.refresh(makeQrPayment())

    expect(refreshed).toMatchObject({ status: 'paid', bankTransactionId: 'TX-1', lastCheckedAt: now })
    expect(gateway.findPayment).toHaveBeenCalledWith({
      reference: 'QR0123456789ABCD',
      amountSatang: 5000,
      since: new Date('2026-10-13T06:00:00Z'),
    })
  })

  test('stays pending, with the check stamped, when the bank has nothing yet', async () => {
    gateway.findPayment.mockResolvedValue(null)

    expect(await refresher.refresh(makeQrPayment())).toMatchObject({ status: 'pending', lastCheckedAt: now })
  })

  test('does not ask again inside the interval, unless forced', async () => {
    gateway.findPayment.mockResolvedValue(null)
    const recent = makeQrPayment({ lastCheckedAt: new Date(now.getTime() - MIN_CHECK_INTERVAL_MS + 1) })

    await refresher.refresh(recent)
    expect(gateway.findPayment).not.toHaveBeenCalled()

    await refresher.refresh(recent, { force: true })
    expect(gateway.findPayment).toHaveBeenCalledTimes(1)
  })

  test('never asks about a payment that is already paid', async () => {
    const paid = makeQrPayment().markPaid(found)

    expect(await refresher.refresh(paid)).toBe(paid)
    expect(gateway.findPayment).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
  })

  test('a bank that cannot be reached leaves the payment pending instead of failing', async () => {
    gateway.findPayment.mockRejectedValue(new DomainExternalServiceError('down', 'QR_GATEWAY_ERROR'))

    expect(await refresher.refresh(makeQrPayment())).toMatchObject({ status: 'pending', lastCheckedAt: now })
  })

  test('an unexpected error is not hidden', async () => {
    const bug = new Error('boom')
    gateway.findPayment.mockRejectedValue(bug)

    await expect(refresher.refresh(makeQrPayment())).rejects.toBe(bug)
  })
})

describe('GetQrPaymentUseCase', () => {
  test('refreshes a payment of the branch', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment({ branchId: 1 }))
    gateway.findPayment.mockResolvedValue(found)

    const payment = await new GetQrPaymentUseCase(repo, refresher, mockUnitOfWork()).execute(1, 1)

    expect(payment.status).toBe('paid')
  })

  test("another branch's payment and an unknown one are both not found", async () => {
    const useCase = new GetQrPaymentUseCase(repo, refresher, mockUnitOfWork())
    repo.findByIdForUpdate.mockResolvedValueOnce(makeQrPayment({ branchId: 2 })).mockResolvedValueOnce(null)

    await expect(useCase.execute(1, 1)).rejects.toMatchObject({ code: 'QR_PAYMENT_NOT_FOUND' })
    await expect(useCase.execute(9, 1)).rejects.toMatchObject({ code: 'QR_PAYMENT_NOT_FOUND' })
    expect(gateway.findPayment).not.toHaveBeenCalled()
  })
})

describe('CancelQrPaymentUseCase', () => {
  test('cancels a payment the bank has nothing for', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment())
    gateway.findPayment.mockResolvedValue(null)

    const cancelled = await new CancelQrPaymentUseCase(repo, refresher, mockUnitOfWork()).execute(1, 1)

    expect(cancelled.status).toBe('cancelled')
  })

  test('asks the bank first even inside the throttle, and refuses if the money is there', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment({ lastCheckedAt: new Date(now.getTime() - 1) }))
    gateway.findPayment.mockResolvedValue(found)

    await expect(new CancelQrPaymentUseCase(repo, refresher, mockUnitOfWork()).execute(1, 1)).rejects.toMatchObject({
      code: 'QR_ALREADY_PAID',
    })
    expect(gateway.findPayment).toHaveBeenCalled()
  })
})

describe('ConfirmScbCallbackUseCase', () => {
  let useCase: ConfirmScbCallbackUseCase

  beforeEach(() => {
    useCase = new ConfirmScbCallbackUseCase(repo, refresher, mockUnitOfWork())
  })

  test('uses the reference only to know what to check, and checks with the bank regardless of the throttle', async () => {
    repo.findByReferenceForUpdate.mockResolvedValue(makeQrPayment({ lastCheckedAt: new Date(now.getTime() - 1) }))
    gateway.findPayment.mockResolvedValue(null)

    const answer = await useCase.execute({
      billPaymentRef1: 'QR0123456789ABCD',
      transactionId: 'FORGED',
      amount: '0.01',
    })

    expect(answer).toEqual({ transactionId: 'FORGED' })
    expect(gateway.findPayment).toHaveBeenCalledTimes(1)
    // The claim in the body changed nothing: the saved payment is still pending.
    expect(repo.save.mock.calls[0]![0].status).toBe('pending')
  })

  test('an unknown reference, or none at all, is acknowledged without checking anything', async () => {
    repo.findByReferenceForUpdate.mockResolvedValue(null)

    expect(await useCase.execute({ billPaymentRef1: 'NOPE' })).toEqual({ transactionId: '' })
    expect(await useCase.execute({})).toEqual({ transactionId: '' })
    expect(gateway.findPayment).not.toHaveBeenCalled()
  })
})

describe('QrPaymentClaims', () => {
  const claims = () => new QrPaymentClaims(gateway, repo)

  test('is required exactly when the bank gateway is set up', () => {
    gateway.isEnabled.mockReturnValue(true)
    expect(claims().isRequired()).toBe(true)

    gateway.isEnabled.mockReturnValue(false)
    expect(claims().isRequired()).toBe(false)
  })

  test('accepts a paid, unused payment of this branch and amount', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment().markPaid(found))

    await expect(claims().assertClaimable(1, { branchId: 1, amountSatang: 5000 })).resolves.toBeUndefined()
  })

  test.each([
    ['one that is not paid', () => makeQrPayment(), 'QR_NOT_PAID'],
    ['one that is already used', () => makeQrPayment().markPaid(found).consume(9), 'QR_ALREADY_USED'],
    ['one of another branch', () => makeQrPayment({ branchId: 2 }).markPaid(found), 'QR_PAYMENT_NOT_FOUND'],
  ])('refuses %s', async (_label, payment, code) => {
    repo.findByIdForUpdate.mockResolvedValue(payment())

    await expect(claims().assertClaimable(1, { branchId: 1, amountSatang: 5000 })).rejects.toMatchObject({ code })
  })

  test('an unknown payment is not found', async () => {
    repo.findByIdForUpdate.mockResolvedValue(null)

    await expect(claims().assertClaimable(1, { branchId: 1, amountSatang: 5000 })).rejects.toMatchObject({
      code: 'QR_PAYMENT_NOT_FOUND',
    })
  })

  test('consume stores the sale on the payment', async () => {
    repo.findByIdForUpdate.mockResolvedValue(makeQrPayment().markPaid(found))

    await claims().consume(1, 88)

    expect(repo.save.mock.calls[0]![0].saleId).toBe(88)
  })

  test('tells the reference 1 the bank was given, and not found for an unknown payment', async () => {
    repo.findByIdForUpdate.mockResolvedValueOnce(makeQrPayment({ reference: 'QRABC' }))
    expect(await claims().reference(1)).toBe('QRABC')

    repo.findByIdForUpdate.mockResolvedValueOnce(null)
    await expect(claims().reference(9)).rejects.toMatchObject({ code: 'QR_PAYMENT_NOT_FOUND' })
  })
})
