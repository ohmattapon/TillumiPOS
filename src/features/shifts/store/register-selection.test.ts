import { describe, expect, test } from 'bun:test'
import { selectedRegisterId } from './register-selection'

describe('register selection scope', () => {
  test('returns only the register selected for the current user and branch', () => {
    const selections = { '1:2': 8, '1:3': 9, '4:2': 10 }

    expect(selectedRegisterId(selections, 1, 2)).toBe(8)
    expect(selectedRegisterId(selections, 1, 3)).toBe(9)
    expect(selectedRegisterId(selections, 4, 2)).toBe(10)
    expect(selectedRegisterId(selections, 4, 3)).toBeUndefined()
  })

  test('does not use a selection before both user and branch are known', () => {
    expect(selectedRegisterId({ '1:2': 8 }, undefined, 2)).toBeUndefined()
    expect(selectedRegisterId({ '1:2': 8 }, 1, undefined)).toBeUndefined()
  })
})
