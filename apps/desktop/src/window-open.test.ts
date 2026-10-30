import { describe, expect, test } from 'bun:test'
import { windowOpenDecision } from './window-open'

const IP_SHOP = 'http://127.0.0.1:3000'
const NAME_SHOP = 'http://localhost:3000'

// [url, shop origin, expected decision]
const table: [string, string, 'allow-popup' | 'external' | 'deny'][] = [
  // the customer display: the same origin as the shop
  ['http://127.0.0.1:3000/customer', IP_SHOP, 'allow-popup'],
  ['HTTP://127.0.0.1:3000/customer?x=1#y', IP_SHOP, 'allow-popup'],
  ['http://localhost:3000/customer', NAME_SHOP, 'allow-popup'],
  // another origin never becomes an app window; a normal web page goes to the system browser
  ['https://example.com/', IP_SHOP, 'external'],
  ['http://example.com/', IP_SHOP, 'external'],
  ['http://127.0.0.1:3001/customer', IP_SHOP, 'external'],
  ['https://127.0.0.1:3000/customer', IP_SHOP, 'external'],
  ['http://localhost:3000/customer', IP_SHOP, 'external'],
  // judged after parsing: a lookalike host is another origin
  ['http://127.0.0.1.evil.com:3000/customer', IP_SHOP, 'external'],
  ['http://localhost.evil.com:3000/', NAME_SHOP, 'external'],
  // credentials are a spoofing pattern, dropped even when the real host is the shop
  ['http://127.0.0.1:3000@evil.com/', IP_SHOP, 'deny'],
  ['http://evil.com@127.0.0.1:3000/customer', IP_SHOP, 'deny'],
  ['http://user:pass@127.0.0.1:3000/customer', IP_SHOP, 'deny'],
  // schemes that are not web pages
  ['javascript:alert(1)', IP_SHOP, 'deny'],
  ['data:text/html,x', IP_SHOP, 'deny'],
  ['file:///c:/x', IP_SHOP, 'deny'],
  ['blob:http://127.0.0.1:3000/x', IP_SHOP, 'deny'],
  ['about:blank', IP_SHOP, 'deny'],
  ['mailto:a@b.c', IP_SHOP, 'deny'],
  ['', IP_SHOP, 'deny'],
  ['/customer', IP_SHOP, 'deny'],
]

describe('windowOpenDecision', () => {
  for (const [url, shop, expected] of table) {
    test(`${JSON.stringify(url)} against ${shop} is ${expected}`, () => {
      expect(windowOpenDecision(shop, url)).toBe(expected)
    })
  }

  test('a malformed shop origin opens no window', () => {
    expect(windowOpenDecision('', 'http://127.0.0.1:3000/customer')).toBe('external')
    expect(windowOpenDecision('nonsense', 'http://127.0.0.1:3000/customer')).toBe('external')
  })
})
