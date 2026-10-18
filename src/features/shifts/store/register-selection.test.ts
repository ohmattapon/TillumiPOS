import { describe, expect, test } from 'bun:test'
import { selectedRegisterId, useRegisterSelectionStore } from './register-selection'

describe('register selection scope', () => {
  test('returns only the register remembered for the current user', () => {
    const selections = { '1': 8, '4': 10 }

    expect(selectedRegisterId(selections, 1)).toBe(8)
    expect(selectedRegisterId(selections, 4)).toBe(10)
    expect(selectedRegisterId(selections, 7)).toBeUndefined()
  })

  test('does not use a selection before the user is known', () => {
    expect(selectedRegisterId({ '1': 8 }, undefined)).toBeUndefined()
  })
})

describe('hand over', () => {
  test('writes the till register for the new user, overwriting an older choice', () => {
    useRegisterSelectionStore.setState({ selections: { '7': 1 } })
    useRegisterSelectionStore.getState().handOver(7, 3)
    expect(useRegisterSelectionStore.getState().selections).toEqual({ '7': 3 })
  })

  test('changes nothing when the till has no register yet', () => {
    useRegisterSelectionStore.setState({ selections: { '7': 1 } })
    useRegisterSelectionStore.getState().handOver(7, undefined)
    expect(useRegisterSelectionStore.getState().selections).toEqual({ '7': 1 })
  })
})
