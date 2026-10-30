import { describe, expect, test } from 'bun:test'
import { eventIsTrusted, isTrustedSender } from './ipc'

const SHOP = 'http://127.0.0.1:3000'

describe('isTrustedSender', () => {
  test('the main frame on the shop origin is trusted, at any path', () => {
    expect(isTrustedSender(SHOP, 'http://127.0.0.1:3000/', true)).toBe(true)
    expect(isTrustedSender(SHOP, 'http://127.0.0.1:3000/sales?x=1#top', true)).toBe(true)
  })

  test('a child frame is never trusted, even on the shop origin', () => {
    expect(isTrustedSender(SHOP, 'http://127.0.0.1:3000/', false)).toBe(false)
  })

  test('another origin is not trusted, even as the main frame', () => {
    expect(isTrustedSender(SHOP, 'https://example.com/', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'http://127.0.0.1:3001/', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'http://localhost:3000/', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'http://127.0.0.1.evil.com:3000/', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'http://127.0.0.1:3000@evil.com/', true)).toBe(false)
  })

  test('the waiting page and other schemes are not trusted', () => {
    expect(isTrustedSender(SHOP, 'file:///C:/app/wait-page.html', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'data:text/html,x', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'blob:http://127.0.0.1:3000/x', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'about:blank', true)).toBe(false)
  })

  test('a malformed or empty URL is not trusted', () => {
    expect(isTrustedSender(SHOP, '', true)).toBe(false)
    expect(isTrustedSender(SHOP, 'not a url', true)).toBe(false)
  })

  test('a malformed shop origin trusts nothing', () => {
    expect(isTrustedSender('', 'http://127.0.0.1:3000/', true)).toBe(false)
    expect(isTrustedSender('nonsense', 'http://127.0.0.1:3000/', true)).toBe(false)
  })
})

describe('eventIsTrusted', () => {
  const frame = (url: string, parent: unknown = null) => ({ url, parent })

  test('trusts the top frame of the shop', () => {
    expect(eventIsTrusted(SHOP, { senderFrame: frame('http://127.0.0.1:3000/') })).toBe(true)
  })

  test('refuses a frame that has a parent', () => {
    const top = frame('http://127.0.0.1:3000/')
    expect(eventIsTrusted(SHOP, { senderFrame: frame('http://127.0.0.1:3000/x', top) })).toBe(false)
  })

  test('refuses a destroyed frame (no senderFrame)', () => {
    expect(eventIsTrusted(SHOP, { senderFrame: null })).toBe(false)
  })

  test('refuses the top frame of another origin', () => {
    expect(eventIsTrusted(SHOP, { senderFrame: frame('https://example.com/') })).toBe(false)
  })
})
