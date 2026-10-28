import { afterEach, expect, test } from 'bun:test'
import { hasKeyboard } from './focus'

const native = (globalThis as { window?: unknown }).window
afterEach(() => { (globalThis as { window?: unknown }).window = native })

const withPointer = (fine: boolean) => {
  const asked: string[] = []
  ;(globalThis as { window?: unknown }).window = { matchMedia: (query: string) => (asked.push(query), { matches: fine }) }
  return asked
}

test('a device with a mouse or keyboard has one', () => {
  const asked = withPointer(true)

  expect(hasKeyboard()).toBe(true)
  expect(asked).toEqual(['(pointer: fine)'])
})

test('a touch screen does not', () => {
  withPointer(false)

  expect(hasKeyboard()).toBe(false)
})
