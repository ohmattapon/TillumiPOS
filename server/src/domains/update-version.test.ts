import { describe, expect, test } from 'bun:test'
import { APP_VERSION, compareVersions, isUpdateVersion } from './update-version'

describe('isUpdateVersion', () => {
  test('accepts strict numeric triples only', () => {
    expect(isUpdateVersion('1.0.0')).toBe(true)
    expect(isUpdateVersion('10.20.300')).toBe(true)
    expect(isUpdateVersion(APP_VERSION)).toBe(true)
  })

  test('rejects anything else', () => {
    for (const bad of ['', '1.0', '1.0.0.0', 'v1.0.0', '1.0.0-beta', ' 1.0.0', '1.0.0 ', 'a.b.c', '1..0', null, undefined, 42]) {
      expect(isUpdateVersion(bad)).toBe(false)
    }
  })
})

describe('compareVersions', () => {
  test('equal versions compare as 0', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions(APP_VERSION, APP_VERSION)).toBe(0)
  })

  test('compares each segment in order', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
  })

  test('compares numerically, not as text', () => {
    // As text '1.10.0' < '1.9.0'; numerically it is newer.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })

  test('rejects non-triples with INVALID_VERSION', () => {
    for (const bad of ['1.0', 'v1.0.0', '1.0.0-beta', '']) {
      try {
        compareVersions(bad, '1.0.0')
        expect.unreachable()
      } catch (error) {
        expect(error).toMatchObject({ code: 'INVALID_VERSION' })
      }
    }
  })
})
