import { describe, expect, test } from 'bun:test'
import { CONTENTION_PLAN, claimTill, contentionTills, movementsAfter, roundKey, secondsUntilRound, splitSlots, tallyMovements, tallyStock } from './contention'
import { REGISTERS } from './mix'

describe('the contention register plan', () => {
  test('fits in the seeded registers, one register per till', () => {
    expect(contentionTills()).toBeLessThanOrEqual(REGISTERS)
  })

  test('gives every part its own registers', () => {
    const slots = Array.from({ length: contentionTills() }, (_, index) => ({ username: `u${index}`, registerId: 100 + index, shiftId: 200 + index }))
    const split = splitSlots(slots)
    const registers = Object.values(split).flat().map((slot) => slot.registerId)
    expect(new Set(registers).size).toBe(registers.length)
    expect(split.hot).toHaveLength(CONTENTION_PLAN.hot)
    expect(split.sameKey).toHaveLength(1)
    expect(split.voidRace).toHaveLength(1)
    expect(split.closeQr).toHaveLength(1)
  })

  test('refuses a slot list of the wrong size', () => {
    expect(() => splitSlots([])).toThrow(`needs ${contentionTills()}`)
  })
})

describe('claimTill', () => {
  test('the first iterations of the scenario go one to each till', () => {
    expect([0, 1, 2, 3].map((iteration) => claimTill(iteration, 0, 4))).toEqual([0, 1, 2, 3])
  })

  test('refuses a claim that is not the first iteration of the virtual user', () => {
    expect(() => claimTill(5, 1, 4)).toThrow('first iteration')
  })

  test('refuses a claim past the tills, so two users never share a register', () => {
    expect(() => claimTill(4, 0, 4)).toThrow('only 4 tills')
  })
})

describe('roundKey', () => {
  test('is the same for every virtual user of a round, and differs between rounds and parts', () => {
    expect(roundKey('same-key', 3)).toBe(roundKey('same-key', 3))
    expect(new Set([roundKey('same-key', 0), roundKey('same-key', 1), roundKey('void', 0)]).size).toBe(3)
  })
})

describe('secondsUntilRound', () => {
  test('waits until the start of the round', () => {
    expect(secondsUntilRound(10_000, 2, 2_000, 12_500)).toBe(1.5)
  })

  test('never waits a negative time when the round has begun', () => {
    expect(secondsUntilRound(10_000, 0, 2_000, 11_000)).toBe(0)
  })
})

describe('tallyStock', () => {
  test('balances when what was sold and what is left make the starting stock', () => {
    expect(tallyStock({ starting: 7, remaining: 0, sold: 7 })).toEqual({ oversold: 0, balanced: true })
  })

  test('counts every piece sold beyond the starting stock as oversold', () => {
    expect(tallyStock({ starting: 7, remaining: -2, sold: 9 })).toEqual({ oversold: 2, balanced: true })
  })

  test('counts negative stock as oversold even when the totals add up', () => {
    expect(tallyStock({ starting: 3, remaining: -1, sold: 4 }).oversold).toBe(1)
  })

  test('is not balanced when pieces vanished or appeared', () => {
    expect(tallyStock({ starting: 7, remaining: 1, sold: 5 }).balanced).toBe(false)
  })
})

describe('tallyMovements', () => {
  const sale = (reference: string, quantity = -1) => ({ id: 0, type: 'sale', reference, quantity })
  const voided = (reference: string, quantity = 1) => ({ id: 0, type: 'void', reference, quantity })

  test('adds up the pieces sold and returned and the bills behind them', () => {
    const tally = tallyMovements([{ id: 0, type: 'receive', reference: null, quantity: 50 }, sale('R1', -2), sale('R2'), voided('R1', 2)])
    expect(tally).toEqual({ soldPieces: 3, returnedPieces: 2, saleBills: 2, voidBills: 1, repeatedSales: 0, repeatedVoids: 0 })
  })

  test('counts a bill that took stock twice, or gave it back twice', () => {
    const tally = tallyMovements([sale('R1'), sale('R1'), voided('R1'), voided('R1'), voided('R1')])
    expect(tally.repeatedSales).toBe(1)
    expect(tally.repeatedVoids).toBe(2)
  })
})

describe('movementsAfter', () => {
  const page = (...ids: number[]) => ids.map((id) => ({ id, type: 'sale', reference: `R${id}`, quantity: -1 }))

  test('keeps only the movements made after the baseline', () => {
    expect(movementsAfter(page(9, 8, 5, 2), 5, 500)!.map((movement) => movement.id)).toEqual([9, 8])
  })

  test('refuses a full page whose oldest movement is still new, because older new ones may be cut off', () => {
    expect(movementsAfter(page(9, 8), 5, 2)).toBeNull()
  })

  test('accepts a full page that reaches back past the baseline', () => {
    expect(movementsAfter(page(9, 4), 5, 2)!.map((movement) => movement.id)).toEqual([9])
  })
})
