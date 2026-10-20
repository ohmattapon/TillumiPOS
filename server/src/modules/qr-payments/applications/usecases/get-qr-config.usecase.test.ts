import { describe, expect, test } from 'bun:test'
import { mockQrPaymentGateway } from '../../../../__tests__/mocks'
import { GetQrConfigUseCase } from './get-qr-config.usecase'

describe('GetQrConfigUseCase', () => {
  test.each([true, false])('answers whether the gateway is configured (%p)', (enabled) => {
    const gateway = mockQrPaymentGateway()
    gateway.isEnabled.mockReturnValue(enabled)
    expect(new GetQrConfigUseCase(gateway).execute()).toEqual({ enabled })
  })
})
