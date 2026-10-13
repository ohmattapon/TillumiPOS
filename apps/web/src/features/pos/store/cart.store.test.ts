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
      { productId: 7, quantity: 2 },
      { productId: 9, quantity: 1 },
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

    cart().setQuantity(9, 5)

    expect(cart().lines).toEqual([
      { productId: 7, quantity: 1 },
      { productId: 9, quantity: 5 },
    ])
  })

  test.each([0, -1])('a quantity of %p removes the line', (quantity) => {
    cart().add(7)
    cart().add(9)

    cart().setQuantity(7, quantity)

    expect(cart().lines).toEqual([{ productId: 9, quantity: 1 }])
  })

  test('changing the quantity of a product that is not in the cart does nothing', () => {
    cart().add(7)

    cart().setQuantity(99, 3)

    expect(cart().lines).toEqual([{ productId: 7, quantity: 1 }])
  })

  test('clear empties the lines and the discount', () => {
    cart().add(7)
    cart().setDiscount('5')

    clearCart()

    expect(cart().lines).toEqual([])
    expect(cart().discount).toBe('')
  })

  test('updates produce new arrays, so subscribers re-render', () => {
    cart().add(7)
    const before = cart().lines

    cart().add(7)

    expect(cart().lines).not.toBe(before)
    expect(before).toEqual([{ productId: 7, quantity: 1 }])
  })
})
