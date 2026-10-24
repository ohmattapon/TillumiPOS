import { beforeEach, describe, expect, test } from 'bun:test'
import { clearCart, useCartStore } from './cart.store'

const cart = () => useCartStore.getState()

beforeEach(() => clearCart())

describe('cart store', () => {
  test('starts empty', () => {
    expect(cart().lines).toEqual([])
    expect(cart().discount).toBe('')
  })

  test('adding a product puts it in the cart once, then raises its quantity', () => {
    cart().add(7)
    cart().add(7)
    cart().add(9)

    expect(cart().lines).toEqual([
      { key: '7:', productId: 7, optionIds: [], quantity: 2 },
      { key: '9:', productId: 9, optionIds: [], quantity: 1 },
    ])
  })

  test('lines keep the order products were first added in', () => {
    cart().add(9)
    cart().add(7)
    cart().add(9)

    expect(cart().lines.map((line) => line.productId)).toEqual([9, 7])
  })

  test('setQuantity changes only that line', () => {
    cart().add(7)
    cart().add(9)

    cart().setQuantity('9:', 5)

    expect(cart().lines).toEqual([
      { key: '7:', productId: 7, optionIds: [], quantity: 1 },
      { key: '9:', productId: 9, optionIds: [], quantity: 5 },
    ])
  })

  test.each([0, -1])('a quantity of %p removes the line', (quantity) => {
    cart().add(7)
    cart().add(9)

    cart().setQuantity('7:', quantity)

    expect(cart().lines).toEqual([{ key: '9:', productId: 9, optionIds: [], quantity: 1 }])
  })

  test('changing the quantity of a product that is not in the cart does nothing', () => {
    cart().add(7)

    cart().setQuantity('99:', 3)

    expect(cart().lines).toEqual([{ key: '7:', productId: 7, optionIds: [], quantity: 1 }])
  })

  test('clear empties the lines and the discount', () => {
    cart().add(7)
    cart().setDiscount('5')

    clearCart()

    expect(cart().lines).toEqual([])
    expect(cart().discount).toBe('')
  })

  describe('working on an open order', () => {
    test('starts with no order, so the cart is the one-step cart', () => {
      expect(cart().orderId).toBeNull()
    })

    test('choosing an order empties the local cart, so the two are never mixed', () => {
      cart().add(7)
      cart().setDiscount('5')

      cart().workOnOrder(42)

      expect(cart()).toMatchObject({ orderId: 42, lines: [], discount: '' })
    })

    test('clearing leaves the order (it stays open on the server) and empties the cart', () => {
      cart().workOnOrder(42)
      cart().setDiscount('5')

      clearCart()

      expect(cart()).toMatchObject({ orderId: null, lines: [], discount: '' })
    })
  })

  test('updates produce new arrays, so subscribers re-render', () => {
    cart().add(7)
    const before = cart().lines

    cart().add(7)

    expect(cart().lines).not.toBe(before)
    expect(before).toEqual([{ key: '7:', productId: 7, optionIds: [], quantity: 1 }])
  })
})

describe('cart store with options', () => {
  test('the same product with other options is another line; the same options join, whatever the order', () => {
    cart().add(7, [20])
    cart().add(7, [10, 20])
    cart().add(7, [20, 10])
    cart().add(7)

    expect(cart().lines.map((line) => [line.key, line.quantity])).toEqual([
      ['7:20', 1],
      ['7:10-20', 2],
      ['7:', 1],
    ])
  })

  test('quantity is set by the line key, and 0 removes only that line', () => {
    cart().add(7, [20])
    cart().add(7)

    cart().setQuantity('7:20', 3)
    expect(cart().lines.map((line) => line.quantity)).toEqual([3, 1])

    cart().setQuantity('7:', 0)
    expect(cart().lines.map((line) => line.key)).toEqual(['7:20'])
  })
})

describe('cart store with packs', () => {
  test('a pack is a line of its own, next to the pieces of the same product', () => {
    cart().add(7, [], 5)
    cart().add(7)
    cart().add(7, [], 5)

    expect(cart().lines.map((line) => [line.key, line.quantity])).toEqual([
      ['7::p5', 2],
      ['7:', 1],
    ])
  })

  test('the key names the pack, so its quantity is set alone', () => {
    cart().add(7, [], 5)
    cart().add(7)

    cart().setQuantity('7::p5', 3)

    expect(cart().lines.map((line) => line.quantity)).toEqual([3, 1])
  })
})

 describe('cart membership', () => {
  test('selects only an identity and clears it for the next customer', () => {
    cart().setMember(12)
    expect(cart().memberId).toBe(12)
    clearCart()
    expect(cart().memberId).toBeNull()
  })
  test('switching to a saved order drops local membership', () => {
    cart().setMember(12)
    cart().workOnOrder(42)
    expect(cart().memberId).toBeNull()
  })
  test('membership can be removed without emptying items', () => {
    cart().add(7)
    cart().setMember(12)
    cart().setMember(null)
    expect(cart().lines).toHaveLength(1)
    expect(cart().memberId).toBeNull()
  })
  test('a declined promotion is forgotten when the cart is cleared or an order is chosen', () => {
    cart().setPromotionDeclined(true)
    expect(cart().promotionDeclined).toBe(true)

    cart().clear()
    expect(cart().promotionDeclined).toBe(false)

    cart().setPromotionDeclined(true)
    cart().workOnOrder(5)
    expect(cart().promotionDeclined).toBe(false)
  })
})
