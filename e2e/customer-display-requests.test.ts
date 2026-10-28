import { describe, expect, test } from 'bun:test'
import { createCustomerDisplayRequestGuard } from './customer-display-requests'

describe('customer display request diagnostics', () => {
  test('allows the public session, stream and slide requests', () => {
    const guard = createCustomerDisplayRequestGuard()
    for (const path of ['sessions', 'stream'])
      guard.record(`http://localhost:5290/api/v1/customer-display/${path}?token=fixture-display-token`)
    guard.record('http://localhost:5290/api/v1/display-slides')
    expect(() => guard.assertPublicOnly()).not.toThrow()
  })

  test('reports the unexpected endpoint without credentials, query or fragment', () => {
    const guard = createCustomerDisplayRequestGuard()
    guard.record('https://fixture-user:fixture-password@localhost/api/v1/users?token=fixture-display-token&password=fixture-password#fixture-fragment')
    expect(() => guard.assertPublicOnly()).toThrow('The customer screen called the API: /api/v1/users')
    try {
      guard.assertPublicOnly()
    } catch (error) {
      expect(String(error)).not.toContain('fixture-')
      expect(String(error)).not.toContain('localhost')
      expect(String(error)).not.toContain('?')
    }
  })

  test('does not accept private paths that share a public endpoint prefix', () => {
    const guard = createCustomerDisplayRequestGuard()
    guard.record('http://localhost/api/v1/display-slides/private?token=fixture-display-token')
    expect(() => guard.assertPublicOnly()).toThrow('/api/v1/display-slides/private')
  })

  test('ignores ordinary page and asset requests', () => {
    const guard = createCustomerDisplayRequestGuard()
    guard.record('http://localhost/customer?token=fixture-display-token')
    guard.record('http://localhost/media/products/1/fixture.png')
    expect(() => guard.assertPublicOnly()).not.toThrow()
  })

  test('malformed input fails without echoing the supplied value', () => {
    const guard = createCustomerDisplayRequestGuard()
    expect(() => guard.record('fixture-private-invalid-url')).not.toThrow()
    expect(() => guard.assertPublicOnly()).toThrow('The customer screen called the API: [invalid URL]')
  })
})
