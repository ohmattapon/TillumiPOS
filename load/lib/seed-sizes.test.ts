import { expect, test } from 'bun:test'
import { parseSeedSizes } from './seed-sizes'

test('no LOAD_SEED_ value keeps every default', () => {
  expect(parseSeedSizes({ PATH: 'x' })).toEqual({})
})

test('names map to the seed option they size', () => {
  expect(parseSeedSizes({ LOAD_SEED_PAST_SALES: '5000', LOAD_SEED_MEMBERS: '300' })).toEqual({ pastSales: 5000, members: 300 })
})

test('an unknown name is refused, so a typo cannot silently run the default size', () => {
  expect(() => parseSeedSizes({ LOAD_SEED_PAST_SALE: '5' })).toThrow('LOAD_SEED_PAST_SALE')
})

test('a value that is not a whole number is refused', () => {
  for (const bad of ['', 'abc', '-1', '1.5', '1e3']) expect(() => parseSeedSizes({ LOAD_SEED_MEMBERS: bad }), bad).toThrow('LOAD_SEED_MEMBERS must')
})

test('fewer than 10 registers or 10 cashiers is refused: the selling scenarios need a till and a user each', () => {
  expect(() => parseSeedSizes({ LOAD_SEED_REGISTERS: '9' })).toThrow('at least 10 registers')
  expect(() => parseSeedSizes({ LOAD_SEED_CASHIERS: '9' })).toThrow('at least 10 cashiers')
  expect(parseSeedSizes({ LOAD_SEED_REGISTERS: '10', LOAD_SEED_CASHIERS: '10' })).toEqual({ registers: 10, cashiers: 10 })
})
