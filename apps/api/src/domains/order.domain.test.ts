import { describe, expect, test } from 'bun:test'
import { makeOrder } from '../__tests__/factories'
import { DomainError } from './errors/domain-error'
import { MAX_LINE_QUANTITY, MAX_ORDER_LINES, OrderEntity, type OrderItem } from './order.domain'

const tea = { productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2500 }
const cake = { productId: 2, productName: 'เค้ก', sku: 'CAKE', unitPriceSatang: 5700 }
const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({ ...tea, lineId: 0, options: [], quantity: 1, ...overrides })

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
  return undefined
}

describe('OrderEntity.open', () => {
  const base = { branchId: 1, label: null, tableId: null, openedById: 3, openedByName: 'สมชาย', items: [] }

  test('keeps a valid order as given', () => {
    expect(OrderEntity.open({ ...base, label: 'โต๊ะ 4', items: [item({ quantity: 2 })] })).toEqual({
      ...base,
      label: 'โต๊ะ 4',
      items: [item({ quantity: 2 })],
    })
  })

  test('a blank label means none, and surrounding spaces are dropped', () => {
    expect(OrderEntity.open({ ...base, label: '   ' }).label).toBeNull()
    expect(OrderEntity.open({ ...base, label: ' โต๊ะ 4 ' }).label).toBe('โต๊ะ 4')
  })

  test('merges repeated products into the first line, keeping its price', () => {
    const opened = OrderEntity.open({
      ...base,
      items: [item({ quantity: 1 }), item({ productId: 2, productName: 'เค้ก', unitPriceSatang: 5700 }), item({ quantity: 2, unitPriceSatang: 9999 })],
    })

    expect(opened.items.map((line) => [line.productId, line.quantity, line.unitPriceSatang])).toEqual([
      [1, 3, 2500],
      [2, 1, 5700],
    ])
  })

  test.each([0, -1, 1.5, MAX_LINE_QUANTITY + 1])('rejects a quantity of %p', (quantity) => {
    expect(codeOf(() => OrderEntity.open({ ...base, items: [item({ quantity })] }))).toBe('INVALID_ORDER')
  })

  test('rejects a label over 100 characters and more lines than allowed', () => {
    expect(codeOf(() => OrderEntity.open({ ...base, label: 'x'.repeat(101) }))).toBe('INVALID_ORDER')

    const many = Array.from({ length: MAX_ORDER_LINES + 1 }, (_, index) => item({ productId: index + 1 }))
    expect(codeOf(() => OrderEntity.open({ ...base, items: many }))).toBe('INVALID_ORDER')
  })
})

describe('OrderEntity', () => {
  test('adds up what has been ordered', () => {
    const order = makeOrder({ items: [item({ quantity: 2 }), item({ ...cake, quantity: 1 })] })

    expect(order.subtotalSatang).toBe(2 * 2500 + 5700)
    expect(order.itemCount).toBe(3)
  })

  test('an order with nothing on it has a zero total', () => {
    expect(makeOrder({ items: [] }).subtotalSatang).toBe(0)
  })

  describe('addItem', () => {
    test('puts a new product on the order', () => {
      const order = makeOrder({ items: [] }).addItem(tea, 2)

      expect(order.items).toEqual([item({ quantity: 2 })])
    })

    test('a product already there gains the quantity and keeps the price it was quoted at', () => {
      const order = makeOrder({ items: [item({ quantity: 1 })] }).addItem({ ...tea, unitPriceSatang: 3000 }, 2)

      expect(order.items).toEqual([item({ quantity: 3, unitPriceSatang: 2500 })])
    })

    test('refuses a quantity that would pass the limit', () => {
      const order = makeOrder({ items: [item({ quantity: MAX_LINE_QUANTITY })] })

      expect(codeOf(() => order.addItem(tea, 1))).toBe('INVALID_ORDER')
    })

    test('refuses a quantity that is not a whole number of at least 1', () => {
      expect(codeOf(() => makeOrder().addItem(tea, 0))).toBe('INVALID_ORDER')
      expect(codeOf(() => makeOrder().addItem(tea, 1.5))).toBe('INVALID_ORDER')
    })
  })

  describe('setQuantity and removeItem', () => {
    const order = makeOrder({ items: [item({ quantity: 2 }), item({ ...cake, quantity: 1 })] })

    test('sets the quantity of one line only', () => {
      expect(order.setQuantity(1, 5).items.map((line) => line.quantity)).toEqual([5, 1])
    })

    test('removes a line', () => {
      expect(order.removeItem(1).items.map((line) => line.productId)).toEqual([2])
    })

    test('a product that is not on the order is not found', () => {
      expect(codeOf(() => order.setQuantity(99, 1))).toBe('ORDER_ITEM_NOT_FOUND')
      expect(codeOf(() => order.removeItem(99))).toBe('ORDER_ITEM_NOT_FOUND')
    })

    test('setting a quantity of zero is refused: removing is its own action', () => {
      expect(codeOf(() => order.setQuantity(1, 0))).toBe('INVALID_ORDER')
    })
  })

  test('rename sets, trims and clears the label', () => {
    const order = makeOrder({ label: 'โต๊ะ 1' })

    expect(order.rename(' โต๊ะ 2 ').label).toBe('โต๊ะ 2')
    expect(order.rename('  ').label).toBeNull()
    expect(codeOf(() => order.rename('x'.repeat(101)))).toBe('INVALID_ORDER')
  })

  describe('closing', () => {
    test('cancel records the reason and closes the order', () => {
      const cancelled = makeOrder().cancel('ลูกค้าไม่รอ', 9)

      expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'ลูกค้าไม่รอ', cancelledById: 9 })
    })

    test('cancel needs a reason of at most 500 characters', () => {
      expect(codeOf(() => makeOrder().cancel('', 9))).toBe('INVALID_ORDER')
      expect(codeOf(() => makeOrder().cancel('x'.repeat(501), 9))).toBe('INVALID_ORDER')
    })

    test('markPaid closes the order and points it at its sale', () => {
      expect(makeOrder().markPaid(77)).toMatchObject({ status: 'paid', saleId: 77 })
    })

    test('an empty order cannot be paid', () => {
      expect(codeOf(() => makeOrder({ items: [] }).markPaid(77))).toBe('ORDER_EMPTY')
    })

    test.each([
      ['paid', () => makeOrder().markPaid(1)],
      ['cancelled', () => makeOrder().cancel('x', 9)],
    ])('a %s order cannot be changed any more', (_status, closed) => {
      const order = closed()

      expect(codeOf(() => order.addItem(tea, 1))).toBe('ORDER_NOT_OPEN')
      expect(codeOf(() => order.setQuantity(1, 2))).toBe('ORDER_NOT_OPEN')
      expect(codeOf(() => order.removeItem(1))).toBe('ORDER_NOT_OPEN')
      expect(codeOf(() => order.rename('x'))).toBe('ORDER_NOT_OPEN')
      expect(codeOf(() => order.cancel('x', 9))).toBe('ORDER_NOT_OPEN')
      expect(codeOf(() => order.markPaid(2))).toBe('ORDER_NOT_OPEN')
    })
  })

  test('changes return a new entity and leave the original untouched', () => {
    const original = makeOrder({ items: [item({ quantity: 1 })] })

    const changed = original.addItem(tea, 4)

    expect(original.items[0]!.quantity).toBe(1)
    expect(changed.items[0]!.quantity).toBe(5)
  })

  test('a paid order must have a sale', () => {
    expect(() => makeOrder({ status: 'paid', saleId: null })).toThrow(DomainError)
  })
})

const pearls = { groupId: 2, groupName: 'ท็อปปิง', optionId: 20, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }
const jelly = { groupId: 2, groupName: 'ท็อปปิง', optionId: 21, name: 'วุ้น', priceSatang: 500, costSatang: 200 }

describe('OrderEntity lines with options', () => {
  test('the same product with different options is a different line, the same options one line', () => {
    const order = makeOrder({ items: [] })
      .addItem({ ...tea, unitPriceSatang: 3500 }, 1, [pearls])
      .addItem(tea, 1)
      .addItem({ ...tea, unitPriceSatang: 3500 }, 2, [pearls])

    expect(order.items.map((line) => [line.options.map((option) => option.name), line.quantity])).toEqual([
      [['ไข่มุก'], 3],
      [[], 1],
    ])
  })

  test('a line keeps the price quoted with its options', () => {
    const order = makeOrder({ items: [item({ lineId: 5, unitPriceSatang: 3500, options: [pearls], quantity: 1 })] }).addItem(
      { ...tea, unitPriceSatang: 9999 },
      1,
      [pearls],
    )

    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({ lineId: 5, unitPriceSatang: 3500, quantity: 2 })
  })

  test('sums the lines as quoted, options included', () => {
    const order = makeOrder({
      items: [item({ lineId: 1, unitPriceSatang: 3500, options: [pearls], quantity: 2 }), item({ lineId: 2, quantity: 1 })],
    })

    expect(order.subtotalSatang).toBe(2 * 3500 + 2500)
    expect(order.itemCount).toBe(3)
  })

  test('a line is changed and removed by its id, leaving the other lines of the product', () => {
    const order = makeOrder({
      items: [item({ lineId: 1, options: [pearls], unitPriceSatang: 3500 }), item({ lineId: 2, options: [jelly], unitPriceSatang: 3000 })],
    })

    const changed = order.setLineQuantity(2, 4)
    const removed = order.removeLine(1)

    expect(changed.items.map((line) => [line.lineId, line.quantity])).toEqual([
      [1, 1],
      [2, 4],
    ])
    expect(removed.items.map((line) => line.lineId)).toEqual([2])
  })

  test('an unknown line id is not found', () => {
    const order = makeOrder({ items: [item({ lineId: 1 })] })

    expect(codeOf(() => order.setLineQuantity(9, 2))).toBe('ORDER_ITEM_NOT_FOUND')
    expect(codeOf(() => order.removeLine(9))).toBe('ORDER_ITEM_NOT_FOUND')
  })

  test('the product-id methods work on the line without options only', () => {
    const order = makeOrder({ items: [item({ lineId: 1, options: [pearls], unitPriceSatang: 3500 })] })

    expect(codeOf(() => order.setQuantity(1, 2))).toBe('ORDER_ITEM_NOT_FOUND')
    expect(codeOf(() => order.removeItem(1))).toBe('ORDER_ITEM_NOT_FOUND')

    const withPlain = order.addItem(tea, 1)
    expect(withPlain.setQuantity(1, 5).items.map((line) => [line.options.length, line.quantity])).toEqual([
      [1, 1],
      [0, 5],
    ])
    expect(withPlain.removeItem(1).items.map((line) => line.options.length)).toEqual([1])
  })

  test('opening an order merges lines by product and options', () => {
    const opened = OrderEntity.open({
      branchId: 1,
      label: null,
      tableId: null,
      openedById: 3,
      openedByName: 'สมชาย',
      items: [item({ options: [pearls] }), item({ options: [jelly] }), item({ options: [pearls], quantity: 2 })],
    })

    expect(opened.items.map((line) => [line.options[0]!.name, line.quantity])).toEqual([
      ['ไข่มุก', 3],
      ['วุ้น', 1],
    ])
  })
})

describe('OrderEntity on a table', () => {
  test('moves to another table, or to none, only while open', () => {
    const order = makeOrder({ tableId: 3 })

    expect(order.moveToTable(5).tableId).toBe(5)
    expect(order.moveToTable(null).tableId).toBeNull()
    expect(codeOf(() => makeOrder({ status: 'cancelled', cancelReason: 'x' }).moveToTable(5))).toBe('ORDER_NOT_OPEN')
  })
})

describe('OrderEntity merge', () => {
  const into = () => makeOrder({ id: 1, items: [item({ lineId: 1, quantity: 2, unitPriceSatang: 2500 })] })
  const from = () =>
    makeOrder({
      id: 2,
      items: [
        item({ lineId: 7, quantity: 1, unitPriceSatang: 9999 }),
        item({ lineId: 8, ...cake, quantity: 1 }),
      ],
    })

  test('takes the lines of the other order, adding the same product and keeping the quoted price', () => {
    const merged = into().absorb(from())

    expect(merged.items.map((line) => [line.productId, line.quantity, line.unitPriceSatang])).toEqual([
      [1, 3, 2500],
      [2, 1, 5700],
    ])
    expect(merged.subtotalSatang).toBe(3 * 2500 + 5700)
  })

  test('the source is closed as merged, with its lines moved away', () => {
    const closed = from().markMerged(1)

    expect(closed).toMatchObject({ status: 'merged', mergedIntoId: 1, items: [] })
    expect(codeOf(() => closed.addItem(tea, 1))).toBe('ORDER_NOT_OPEN')
    expect(codeOf(() => closed.cancel('x', 1))).toBe('ORDER_NOT_OPEN')
    expect(codeOf(() => closed.markPaid(9))).toBe('ORDER_NOT_OPEN')
  })

  test('an order cannot be merged into itself, and a closed order cannot take part', () => {
    expect(codeOf(() => into().absorb(into()))).toBe('ORDER_MERGE_SAME')
    expect(codeOf(() => into().absorb(makeOrder({ id: 2, status: 'cancelled', cancelReason: 'x' })))).toBe(
      'ORDER_NOT_OPEN',
    )
    expect(codeOf(() => makeOrder({ id: 1, status: 'paid', saleId: 5 }).absorb(from()))).toBe('ORDER_NOT_OPEN')
  })

  test('a merged order must say what it was merged into', () => {
    expect(codeOf(() => makeOrder({ status: 'merged', mergedIntoId: null }))).toBe('INVALID_ORDER')
  })
})

describe('OrderEntity split', () => {
  const actor = { id: 9, displayName: 'สมหญิง' }
  const order = () =>
    makeOrder({
      id: 4,
      tableId: 3,
      label: 'โต๊ะ 3',
      items: [item({ lineId: 1, quantity: 3, unitPriceSatang: 2500 }), item({ lineId: 2, ...cake, quantity: 1 })],
    })

  test('moves part of a line to a new order on the same table, and the totals still add up', () => {
    const { remaining, created } = order().splitOff([{ lineId: 1, quantity: 2 }], actor, null)

    expect(remaining.items.map((line) => [line.lineId, line.quantity])).toEqual([
      [1, 1],
      [2, 1],
    ])
    expect(created).toMatchObject({ branchId: 1, tableId: 3, label: 'โต๊ะ 3', openedById: 9, openedByName: 'สมหญิง' })
    expect(created.items.map((line) => [line.lineId, line.productId, line.quantity, line.unitPriceSatang])).toEqual([
      [0, 1, 2, 2500],
    ])
    const createdTotal = created.items.reduce((total, line) => total + line.unitPriceSatang * line.quantity, 0)
    expect(remaining.subtotalSatang + createdTotal).toBe(order().subtotalSatang)
  })

  test('moving a whole line takes it off the original', () => {
    const { remaining, created } = order().splitOff([{ lineId: 2, quantity: 1 }], actor, 'แยก')

    expect(remaining.items.map((line) => line.lineId)).toEqual([1])
    expect(created.label).toBe('แยก')
  })

  test('refuses to take everything, to take nothing, or to take more than there is', () => {
    expect(
      codeOf(() =>
        order().splitOff(
          [
            { lineId: 1, quantity: 3 },
            { lineId: 2, quantity: 1 },
          ],
          actor,
          null,
        ),
      ),
    ).toBe('ORDER_SPLIT_EMPTY')
    expect(codeOf(() => order().splitOff([], actor, null))).toBe('ORDER_SPLIT_EMPTY')
    expect(codeOf(() => order().splitOff([{ lineId: 1, quantity: 4 }], actor, null))).toBe('ORDER_SPLIT_QUANTITY')
    expect(codeOf(() => order().splitOff([{ lineId: 1, quantity: 0 }], actor, null))).toBe('INVALID_ORDER')
  })

  test('an unknown or repeated line is refused, and a closed order cannot be split', () => {
    expect(codeOf(() => order().splitOff([{ lineId: 99, quantity: 1 }], actor, null))).toBe('ORDER_ITEM_NOT_FOUND')
    expect(
      codeOf(() =>
        order().splitOff(
          [
            { lineId: 1, quantity: 1 },
            { lineId: 1, quantity: 1 },
          ],
          actor,
          null,
        ),
      ),
    ).toBe('INVALID_ORDER')
    expect(
      codeOf(() =>
        makeOrder({ status: 'cancelled', cancelReason: 'x' }).splitOff([{ lineId: 1, quantity: 1 }], actor, null),
      ),
    ).toBe('ORDER_NOT_OPEN')
  })
})


describe('order membership', () => {
  test('inherits one member on merge and rejects different members', () => {
    const anonymous = makeOrder({ id: 1 })
    const member = makeOrder({ id: 2, memberId: 7 })
    expect(anonymous.absorb(member).memberId).toBe(7)
    expect(member.absorb(anonymous).memberId).toBe(7)
    expect(member.absorb(makeOrder({ id: 3, memberId: 7 })).memberId).toBe(7)
    expect(codeOf(() => member.absorb(makeOrder({ id: 3, memberId: 8 })))).toBe('ORDER_MEMBER_CONFLICT')
  })
  test('split retains membership on both orders', () => {
    const split = makeOrder({ memberId: 7 }).splitOff([{lineId: 1,quantity: 1}], {id: 1,displayName: 'A'}, null)
    expect(split.remaining.memberId).toBe(7)
    expect(split.created.memberId).toBe(7)
  })
  test('membership can be cleared only while open', () => {
    expect(makeOrder({ memberId: 7 }).setMember(null).memberId).toBeNull()
    expect(codeOf(() => makeOrder({status: 'paid', saleId: 1}).setMember(7))).toBe('ORDER_NOT_OPEN')
  })
})
