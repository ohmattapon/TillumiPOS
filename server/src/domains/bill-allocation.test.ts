import { expect, test } from 'bun:test'
import { allocateBillToLines } from './bill-allocation'

test('shares add up to the bill exactly', () => {
  const shares = allocateBillToLines({ totalSatang: 10000, vatSatang: 654 }, [3333, 3333, 3334])
  expect(shares.reduce((s, x) => s + x.totalSatang, 0)).toBe(10000)
  expect(shares.reduce((s, x) => s + x.vatSatang, 0)).toBe(654)
})
test('a discount is spread by line value', () => {
  expect(allocateBillToLines({ totalSatang: 900, vatSatang: 0 }, [600, 400]))
    .toEqual([{ totalSatang: 540, vatSatang: 0 }, { totalSatang: 360, vatSatang: 0 }])
})
test('leftover satang go to the largest remainders, lower index on a tie', () => {
  expect(allocateBillToLines({ totalSatang: 100, vatSatang: 0 }, [1, 1, 1]).map((x) => x.totalSatang)).toEqual([34, 33, 33])
})
test('exclusive VAT above the subtotal still sums to the bill', () => {
  const shares = allocateBillToLines({ totalSatang: 10700, vatSatang: 700 }, [5000, 5000])
  expect(shares).toEqual([{ totalSatang: 5350, vatSatang: 350 }, { totalSatang: 5350, vatSatang: 350 }])
})
test('a zero subtotal gives every line zero', () => {
  expect(allocateBillToLines({ totalSatang: 0, vatSatang: 0 }, [0, 0])).toEqual([{ totalSatang: 0, vatSatang: 0 }, { totalSatang: 0, vatSatang: 0 }])
})
test('one line takes the whole bill', () => {
  expect(allocateBillToLines({ totalSatang: 123, vatSatang: 8 }, [500])).toEqual([{ totalSatang: 123, vatSatang: 8 }])
})
