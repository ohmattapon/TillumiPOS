import { describe, expect, test } from 'bun:test'
import { deviceAddress } from './device-address'

const local = 'http://localhost:3000'

describe('deviceAddress', () => {
  test('an address typed with a bare IP keeps the page port', () => {
    expect(deviceAddress('192.168.1.20', local)).toEqual({ kind: 'ok', url: 'http://192.168.1.20:3000' })
  })

  test('a typed port wins and a scheme or trailing slash is ignored', () => {
    expect(deviceAddress(' http://192.168.1.20:8080/ ', local)).toEqual({ kind: 'ok', url: 'http://192.168.1.20:8080' })
  })

  test('a host name such as a .local name works', () => {
    expect(deviceAddress('shop-pc.local', local)).toEqual({ kind: 'ok', url: 'http://shop-pc.local:3000' })
  })

  test('opened as localhost with nothing typed, the owner must type the IP', () => {
    expect(deviceAddress('', local)).toEqual({ kind: 'needs-ip' })
    expect(deviceAddress('  ', 'http://127.0.0.1:3000')).toEqual({ kind: 'needs-ip' })
  })

  test('opened through a real address, that address is what other devices use', () => {
    expect(deviceAddress('', 'http://192.168.1.20:3000')).toEqual({ kind: 'ok', url: 'http://192.168.1.20:3000' })
    expect(deviceAddress('', 'https://pos.my.shop')).toEqual({ kind: 'ok', url: 'https://pos.my.shop' })
  })

  test('a page without a port in its origin gives an address without one', () => {
    expect(deviceAddress('192.168.1.20', 'http://localhost')).toEqual({ kind: 'ok', url: 'http://192.168.1.20' })
  })

  test('localhost, bad IPs, bad ports and stray text are refused', () => {
    for (const typed of ['localhost', '127.0.0.1', '[::1]', '192.168.1.300:3000', '192.168.1.20:0', '192.168.1.20:99999', '192.168.1.20:80a', 'a:b:c', 'bad host', '-x.local'])
      expect(deviceAddress(typed, local), typed).toEqual({ kind: 'invalid' })
  })
})
