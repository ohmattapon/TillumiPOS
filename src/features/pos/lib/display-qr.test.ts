import { describe, expect, test } from 'bun:test'
import { pickDisplayQr } from './display-qr'

const bank = { id: 7, image: 'iVBORw0KGgo=', expiresAt: new Date('2026-10-14T10:35:00.000Z') }

describe('pickDisplayQr', () => {
  test('a bank QR goes to the screen as the picture the bank gave, with its expiry', () => {
    expect(pickDisplayQr({ bank, staticQr: { kind: 'off' } })).toEqual({
      key: 'bank:7',
      qr: { image: 'iVBORw0KGgo=', expiresAt: '2026-10-14T10:35:00.000Z' },
    })
  })

  test('a static PromptPay QR goes as its payload, for the screen to draw', () => {
    expect(pickDisplayQr({ bank: null, staticQr: { kind: 'ready', payload: '000201...6304ABCD' } })).toEqual({
      key: 'static:000201...6304ABCD',
      qr: { payload: '000201...6304ABCD' },
    })
  })

  test('a new amount is a new QR: the key changes with the payload, so the screen is told again', () => {
    const first = pickDisplayQr({ bank: null, staticQr: { kind: 'ready', payload: 'A' } })
    const second = pickDisplayQr({ bank: null, staticQr: { kind: 'ready', payload: 'B' } })
    expect(first?.key).not.toBe(second?.key)
  })

  test('nothing to scan means nothing is sent: no QR, or a static mode with no usable target', () => {
    expect(pickDisplayQr({ bank: null, staticQr: { kind: 'off' } })).toBeNull()
    expect(pickDisplayQr({ bank: null, staticQr: { kind: 'missing-target' } })).toBeNull()
  })
})
