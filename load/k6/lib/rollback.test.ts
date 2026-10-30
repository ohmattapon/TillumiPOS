import { describe, expect, test } from 'bun:test'
import { openAllOrRollBack } from './rollback'

describe('openAllOrRollBack', () => {
  test('returns everything opened when nothing fails', () => {
    expect(openAllOrRollBack(3, (index) => index * 10, () => {})).toEqual([0, 10, 20])
  })

  test('closes what was opened before a failure and rethrows it', () => {
    const closed: number[] = []
    const open = (index: number) => {
      if (index === 2) throw new Error('no register')
      return index
    }
    expect(() => openAllOrRollBack(4, open, (item) => closed.push(item))).toThrow('no register')
    expect(closed).toEqual([0, 1])
  })

  test('keeps closing when one close fails', () => {
    const closed: number[] = []
    const open = (index: number) => {
      if (index === 3) throw new Error('boom')
      return index
    }
    const close = (item: number) => {
      if (item === 0) throw new Error('close failed')
      closed.push(item)
    }
    expect(() => openAllOrRollBack(5, open, close)).toThrow('boom')
    expect(closed).toEqual([1, 2])
  })
})
