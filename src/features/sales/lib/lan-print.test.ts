import { describe, expect, test } from 'bun:test'
import { canPrintOverLan, lanPrintBody } from './lan-print'

describe('canPrintOverLan', () => {
  test('offers LAN printing only when switched on with an address', () => {
    expect(canPrintOverLan({ receiptPrinterEnabled: true, receiptPrinterIp: '192.168.1.50' })).toBe(true)
  })

  test.each([
    ['switched off', { receiptPrinterEnabled: false, receiptPrinterIp: '192.168.1.50' }],
    ['no address', { receiptPrinterEnabled: true, receiptPrinterIp: null }],
    ['off and no address', { receiptPrinterEnabled: false, receiptPrinterIp: null }],
  ])('hides the button when %s', (_label, settings) => {
    expect(canPrintOverLan(settings)).toBe(false)
  })
})

describe('lanPrintBody', () => {
  test('maps the bitmap and always asks for cut and drawer', () => {
    const bits = new Array(384 * 8).fill(true) as boolean[]

    expect(lanPrintBody(42, { widthDots: 384, heightDots: 8, bits })).toEqual({
      saleId: 42,
      widthDots: 384,
      heightDots: 8,
      bits,
      cut: true,
      kickDrawer: true,
    })
  })

  test('refuses a bitmap the printer widths do not cover', () => {
    expect(() => lanPrintBody(42, { widthDots: 512, heightDots: 8, bits: [] })).toThrow()
  })
})
