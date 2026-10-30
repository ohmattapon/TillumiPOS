import { describe, expect, test } from 'bun:test'
import { isShopUrl, navigationDecision, parseShopOrigin } from './shop-origin'

const IP_SHOP = 'http://127.0.0.1:3000'
const NAME_SHOP = 'http://localhost:3000'

// [url, shop origin, expected decision]
const table: [string, string, 'allow' | 'external' | 'deny'][] = [
  ['http://127.0.0.1:3000/', IP_SHOP, 'allow'],
  ['http://127.0.0.1:3000', IP_SHOP, 'allow'],
  ['http://127.0.0.1:3000/sales?x=1#top', IP_SHOP, 'allow'],
  ['http://localhost:3000/x', NAME_SHOP, 'allow'],
  ['HTTP://LOCALHOST:3000', NAME_SHOP, 'allow'],
  ['http://LocalHost:3000/Path', NAME_SHOP, 'allow'],
  // the two loopback spellings are different origins, so one never stands for the other
  ['http://localhost:3000/', IP_SHOP, 'external'],
  ['http://127.0.0.1:3000/', NAME_SHOP, 'external'],
  // the host is judged after parsing, so a lookalike prefix gives nothing away
  ['http://127.0.0.1.evil.com:3000/', IP_SHOP, 'external'],
  ['http://127.0.0.1:3000@evil.com/', IP_SHOP, 'external'],
  ['http://localhost.evil.com:3000/', NAME_SHOP, 'external'],
  ['http://localhost:3000@evil.com/', NAME_SHOP, 'external'],
  // userinfo in front of the real host does not change which host is contacted
  ['http://evil.com@127.0.0.1:3000/', IP_SHOP, 'allow'],
  ['http://127.0.0.1:3001/', IP_SHOP, 'external'],
  ['http://127.0.0.1/', IP_SHOP, 'external'],
  ['https://127.0.0.1:3000/', IP_SHOP, 'external'],
  ['https://example.com/', IP_SHOP, 'external'],
  ['http://example.com/', IP_SHOP, 'external'],
  ['javascript:alert(1)', IP_SHOP, 'deny'],
  ['JavaScript:alert(1)', IP_SHOP, 'deny'],
  ['data:text/html,x', IP_SHOP, 'deny'],
  ['file:///c:/x', IP_SHOP, 'deny'],
  // a blob URL carries the origin of its creator, but it must still not count as the shop
  ['blob:http://127.0.0.1:3000/x', IP_SHOP, 'deny'],
  ['about:blank', IP_SHOP, 'deny'],
  ['mailto:a@b.c', IP_SHOP, 'deny'],
  ['ftp://127.0.0.1:3000/', IP_SHOP, 'deny'],
  ['', IP_SHOP, 'deny'],
  ['   ', IP_SHOP, 'deny'],
  ['not a url', IP_SHOP, 'deny'],
  ['//127.0.0.1:3000/', IP_SHOP, 'deny'],
  ['/relative/path', IP_SHOP, 'deny'],
  ['http://', IP_SHOP, 'deny'],
]

describe('navigationDecision', () => {
  for (const [url, shop, expected] of table) {
    test(`${JSON.stringify(url)} against ${shop} is ${expected}`, () => {
      expect(navigationDecision(shop, url)).toBe(expected)
    })
  }

  test('a malformed shop origin lets nothing in', () => {
    expect(navigationDecision('', 'http://127.0.0.1:3000/')).toBe('external')
    expect(navigationDecision('nonsense', 'http://127.0.0.1:3000/')).toBe('external')
    expect(navigationDecision('nonsense', 'javascript:alert(1)')).toBe('deny')
  })
})

describe('isShopUrl', () => {
  for (const [url, shop, expected] of table) {
    test(`${JSON.stringify(url)} against ${shop}`, () => {
      expect(isShopUrl(shop, url)).toBe(expected === 'allow')
    })
  }

  test('a malformed shop origin matches nothing', () => {
    expect(isShopUrl('', 'http://127.0.0.1:3000/')).toBe(false)
    expect(isShopUrl('nonsense', 'nonsense')).toBe(false)
  })
})

describe('parseShopOrigin', () => {
  test('defaults to the loopback address on port 3000 when nothing is set', () => {
    expect(parseShopOrigin(undefined)).toBe('http://127.0.0.1:3000')
  })

  test('accepts the two loopback forms and returns the normalized origin', () => {
    expect(parseShopOrigin('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(parseShopOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    expect(parseShopOrigin('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(parseShopOrigin('HTTP://LOCALHOST:3000')).toBe('http://localhost:3000')
  })

  const rejected = [
    'https://127.0.0.1:3000',
    'https://localhost:3000',
    'http://example.com:3000',
    'http://127.0.0.2:3000',
    'http://0.0.0.0:3000',
    'http://[::1]:3000',
    'http://127.0.0.1.evil.com:3000',
    'http://127.0.0.1:3000@evil.com',
    'http://evil.com@127.0.0.1:3000',
    'http://user:pass@127.0.0.1:3000',
    'http://127.0.0.1:3000/sales',
    'http://127.0.0.1:3000/?a=1',
    'http://127.0.0.1:3000?',
    'http://127.0.0.1:3000/#x',
    'http://127.0.0.1',
    'http://localhost',
    'http://127.0.0.1:80',
    'http://127.0.0.1:0',
    'http://127.0.0.1:99999',
    '127.0.0.1:3000',
    'javascript:alert(1)',
    'file:///c:/x',
    '',
    '   ',
    'not a url',
  ]
  for (const raw of rejected) {
    test(`rejects ${JSON.stringify(raw)}`, () => {
      expect(() => parseShopOrigin(raw)).toThrow()
    })
  }
})
