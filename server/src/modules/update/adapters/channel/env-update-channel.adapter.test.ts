import { describe, expect, test } from 'bun:test'
import { EnvUpdateChannel } from './env-update-channel.adapter'

describe('EnvUpdateChannel', () => {
  test('is on only when NATIVE_UPDATES is exactly 1', () => {
    expect(new EnvUpdateChannel(() => '1').isEnabled()).toBe(true)
    for (const value of [undefined, '', '0', 'true', ' 1'])
      expect(new EnvUpdateChannel(() => value).isEnabled()).toBe(false)
  })

  test('reads the value every time it is asked', () => {
    let value: string | undefined
    const channel = new EnvUpdateChannel(() => value)
    expect(channel.isEnabled()).toBe(false)
    value = '1'
    expect(channel.isEnabled()).toBe(true)
  })
})
