import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeQrPayment } from '../../../../__tests__/factories'
import { mockQrPaymentRepository, mockQuoteClaims } from '../../../../__tests__/mocks'
import { FindOrderQrHoldUseCase } from './find-order-qr-hold.usecase'

let payments: ReturnType<typeof mockQrPaymentRepository>
let quotes: ReturnType<typeof mockQuoteClaims>
let useCase: FindOrderQrHoldUseCase

beforeEach(() => {
  payments = mockQrPaymentRepository()
  quotes = mockQuoteClaims()
  useCase = new FindOrderQrHoldUseCase(payments, quotes)
})

describe('FindOrderQrHoldUseCase', () => {
  test('gives the QR that holds the price of the order, with its amount and expiry', async () => {
    quotes.findHeldByOrder.mockResolvedValue('QRABC')
    payments.findByReference.mockResolvedValue(makeQrPayment({ id: 9, branchId: 1, reference: 'QRABC', amountSatang: 4500, status: 'pending' }))

    expect(await useCase.execute(3, 1)).toMatchObject({ id: 9, status: 'pending', amountSatang: 4500 })
    expect(quotes.findHeldByOrder).toHaveBeenCalledWith(3, 1)
  })

  test('is null when no QR holds the order, and looks no further', async () => {
    quotes.findHeldByOrder.mockResolvedValue(null)

    expect(await useCase.execute(3, 1)).toBeNull()
    expect(payments.findByReference).not.toHaveBeenCalled()
  })

  test('is null for a cancelled QR: it holds nothing the till should show', async () => {
    quotes.findHeldByOrder.mockResolvedValue('QRABC')
    payments.findByReference.mockResolvedValue(makeQrPayment({ branchId: 1, reference: 'QRABC', status: 'cancelled' }))

    expect(await useCase.execute(3, 1)).toBeNull()
  })

  test('is null for a QR of another branch', async () => {
    quotes.findHeldByOrder.mockResolvedValue('QRABC')
    payments.findByReference.mockResolvedValue(makeQrPayment({ branchId: 2, reference: 'QRABC' }))

    expect(await useCase.execute(3, 1)).toBeNull()
  })
})
