import { describe, expect, test } from 'bun:test'
import { buildPromptPayPayload } from '@pos/api/promptpay-qr'
import { resolveStaticQr } from './static-qr'

const settings = (overrides: Record<string, unknown> = {}) => ({
  promptpayMode: 'static' as const,
  promptpayTarget: '0812345678',
  ...overrides,
})

describe('resolveStaticQr', () => {
  test('static mode with a target builds the same payload the server embeds', () => {
    expect(resolveStaticQr(settings(), 10_000)).toEqual({
      kind: 'ready',
      payload: buildPromptPayPayload('0812345678', 10_000),
    })
  })

  test('static mode without a target asks the shop to configure it', () => {
    expect(resolveStaticQr(settings({ promptpayTarget: null }), 10_000)).toEqual({ kind: 'missing-target' })
    expect(resolveStaticQr(settings({ promptpayTarget: '' }), 10_000)).toEqual({ kind: 'missing-target' })
  })

  test('a malformed target is a configuration warning, never a crash', () => {
    expect(resolveStaticQr(settings({ promptpayTarget: 'not-a-number' }), 10_000)).toEqual({ kind: 'missing-target' })
  })

  test('bank mode leaves the bank flow untouched', () => {
    expect(resolveStaticQr({ promptpayMode: 'bank', promptpayTarget: null }, 10_000)).toEqual({ kind: 'off' })
    expect(resolveStaticQr(undefined, 10_000)).toEqual({ kind: 'off' })
  })
})
