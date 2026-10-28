import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readSelections, selectedRegisterId, useRegisterSelectionStore } from './register-selection'

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

describe('remembering the choice in the browser', () => {
  const stored = new Map<string, string>()
  const native = (globalThis as { localStorage?: unknown }).localStorage

  beforeEach(() => {
    stored.clear()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    }
    useRegisterSelectionStore.setState({ selections: {} })
  })
  afterEach(() => { (globalThis as { localStorage?: unknown }).localStorage = native })

  test('a user\'s choice is kept in the store and in local storage', () => {
    useRegisterSelectionStore.getState().select(4, 9)

    expect(useRegisterSelectionStore.getState().selections).toEqual({ '4': 9 })
    expect(JSON.parse(stored.get('pos.register-selection')!)).toEqual({ '4': 9 })
  })

  test('a stored choice that is not readable starts empty', () => {
    stored.set('pos.register-selection', '{not json')
    expect(readSelections()).toEqual({})

    stored.set('pos.register-selection', '[1, 2]')
    expect(readSelections()).toEqual({})
  })

  test('clear forgets every choice in the store and in local storage', () => {
    useRegisterSelectionStore.getState().select(4, 9)

    useRegisterSelectionStore.getState().clear()

    expect(useRegisterSelectionStore.getState().selections).toEqual({})
    expect(stored.has('pos.register-selection')).toBe(false)
  })

  test('a hand over survives a storage that refuses to write', () => {
    ;(globalThis as unknown as { localStorage: { setItem(): void } }).localStorage.setItem = () => { throw new Error('quota') }

    useRegisterSelectionStore.getState().handOver(7, 3)

    expect(useRegisterSelectionStore.getState().selections).toEqual({ '7': 3 })
  })

  test('clearing forgets every choice, also in local storage', () => {
    useRegisterSelectionStore.getState().select(4, 9)

    useRegisterSelectionStore.getState().clear()

    expect(useRegisterSelectionStore.getState().selections).toEqual({})
    expect(stored.has('pos.register-selection')).toBe(false)
  })
})
