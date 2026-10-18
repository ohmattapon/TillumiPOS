import { describe, expect, test } from 'bun:test'
import { currencyNameIn, timeZoneOptions } from './shop-options'

describe('timeZoneOptions', () => {
  test('lists the zones the browser knows', () => {
    expect(timeZoneOptions('Asia/Bangkok', ['UTC', 'Asia/Bangkok'])).toEqual(['UTC', 'Asia/Bangkok'])
  })

  test('keeps the shop zone first when the browser does not list it, so the select never shows blank', () => {
    expect(timeZoneOptions('Mars/Base', ['UTC', 'Asia/Bangkok'])).toEqual(['Mars/Base', 'UTC', 'Asia/Bangkok'])
  })

  test('asks the browser when no list is given', () => {
    expect(timeZoneOptions('Asia/Bangkok')).toContain('Asia/Bangkok')
  })
})

describe('currencyNameIn', () => {
  test('names a currency in the shop language', () => {
    expect(currencyNameIn('en')('THB')).toBe('Thai Baht')
    expect(currencyNameIn('th')('THB')).not.toBe('Thai Baht')
  })

  test('falls back to the code when the browser has no name for it', () => {
    expect(currencyNameIn('en')('ZZZ')).toBe('ZZZ')
  })
})
