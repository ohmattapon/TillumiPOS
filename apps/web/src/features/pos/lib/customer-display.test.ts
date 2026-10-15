import { describe, expect, test } from 'bun:test'
import type { PricedCart, PricedLine } from './cart'
import { toDisplayState, type CustomerDisplayInput } from './customer-display'

const line = (overrides: Partial<PricedLine> = {}): PricedLine => ({
  lineKey: '1:3',
  lineId: null,
  productId: 1,
  name: 'กาแฟเย็น',
  unitPriceSatang: 3500,
  quantity: 2,
  lineTotalSatang: 7000,
  options: [{ name: 'หวานน้อย', priceSatang: 0 }],
  optionIds: [3],
  exceedsStock: false,
  stockQty: 50,
  unavailable: false,
  sentQuantity: 0,
  note: null,
  ...overrides,
})

const cart = (lines: PricedLine[] = [line()], overrides: Partial<PricedCart> = {}): PricedCart => ({
  lines,
  itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
  subtotalSatang: lines.reduce((sum, item) => sum + item.lineTotalSatang, 0),
  discountSatang: 0,
  isDiscountValid: true,
  vatSatang: 458,
  totalSatang: lines.reduce((sum, item) => sum + item.lineTotalSatang, 0),
  canPay: lines.length > 0,
  ...overrides,
})

const input = (overrides: Partial<CustomerDisplayInput> = {}): CustomerDisplayInput => ({
  cart: cart(),
  vatMode: 'inclusive',
  isPaying: false,
  qr: null,
  paidSale: null,
  ...overrides,
})

const QR = { image: 'iVBORw0KGgo=', expiresAt: '2026-10-14T10:35:00.000Z' }

describe('toDisplayState', () => {
  test('an empty till with nothing just sold is idle', () => {
    expect(toDisplayState(input({ cart: cart([]) }))).toEqual({ kind: 'idle' })
  })

  test('a cart is shown as a sale with the figures the receipt will carry', () => {
    expect(toDisplayState(input({ cart: cart([line()], { discountSatang: 500, totalSatang: 6500 }) }))).toEqual({
      kind: 'selling',
      lines: [{ name: 'กาแฟเย็น', options: ['หวานน้อย'], quantity: 2, lineTotalSatang: 7000 }],
      subtotalSatang: 7000,
      discountSatang: 500,
      vatSatang: 458,
      vatMode: 'inclusive',
      totalSatang: 6500,
    })
  })

  test('carries only what a customer may see: no ids, stock or unit prices', () => {
    const state = toDisplayState(input())
    if (state.kind !== 'selling') throw new Error('expected a sale')
    expect(Object.keys(state.lines[0]!).sort()).toEqual(['lineTotalSatang', 'name', 'options', 'quantity'])
  })

  test('with the payment dialog open it is paying, with the QR the customer can scan', () => {
    expect(toDisplayState(input({ isPaying: true, qr: QR }))).toMatchObject({ kind: 'paying', totalSatang: 7000, qr: QR })
    expect(toDisplayState(input({ isPaying: true }))).toMatchObject({ kind: 'paying', qr: null })
  })

  test('just after a sale, with an empty cart, it says paid with the change', () => {
    const state = toDisplayState(input({ cart: cart([]), paidSale: { totalSatang: 7000, changeSatang: 3000 } }))
    expect(state).toEqual({ kind: 'paid', totalSatang: 7000, changeSatang: 3000 })
  })

  test('a new sale started while "paid" is still showing wins over it', () => {
    const state = toDisplayState(input({ paidSale: { totalSatang: 7000, changeSatang: 0 } }))
    expect(state.kind).toBe('selling')
  })

  test('an open payment dialog over an emptied cart is not "paying"', () => {
    expect(toDisplayState(input({ cart: cart([]), isPaying: true, qr: QR }))).toEqual({ kind: 'idle' })
    expect(toDisplayState(input({ cart: cart([]), isPaying: true, paidSale: { totalSatang: 100, changeSatang: 0 } })).kind).toBe('paid')
  })

  test('a free sale shows a zero total and no QR', () => {
    const free = cart([line({ lineTotalSatang: 0, unitPriceSatang: 0 })], { totalSatang: 0, vatSatang: 0 })
    expect(toDisplayState(input({ cart: free, isPaying: true }))).toMatchObject({ kind: 'paying', totalSatang: 0, qr: null })
    expect(toDisplayState(input({ cart: free }))).toMatchObject({ kind: 'selling', totalSatang: 0 })
  })

  test('passes the shop VAT mode so the screen can label the tax', () => {
    expect(toDisplayState(input({ vatMode: 'exclusive' }))).toMatchObject({ vatMode: 'exclusive' })
    expect(toDisplayState(input({ vatMode: 'none' }))).toMatchObject({ vatMode: 'none' })
  })
})
