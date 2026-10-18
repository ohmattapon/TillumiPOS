import { afterEach, expect, test } from 'bun:test'
import { openCustomerDisplay } from './open-display'

const native = (globalThis as { window?: unknown }).window
afterEach(() => { (globalThis as { window?: unknown }).window = native })

test('opens the customer page in a window with a fixed name, so an open one is reused', () => {
  const calls: unknown[][] = []
  ;(globalThis as { window?: unknown }).window = { open: (...args: unknown[]) => calls.push(args) }

  openCustomerDisplay()

  expect(calls).toEqual([['/customer', 'easypos-customer', 'popup=yes,width=1280,height=720']])
})
