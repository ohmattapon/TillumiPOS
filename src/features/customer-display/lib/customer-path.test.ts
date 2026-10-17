import { describe, expect, test } from 'bun:test'
import { isCustomerScreenPath } from './customer-path'

describe('isCustomerScreenPath', () => {
  test('the customer screen is /customer, whatever the letter case or a trailing slash', () => {
    expect(isCustomerScreenPath('/customer')).toBe(true)
    expect(isCustomerScreenPath('/Customer')).toBe(true)
    expect(isCustomerScreenPath('/CUSTOMER')).toBe(true)
    expect(isCustomerScreenPath('/customer/')).toBe(true)
  })

  test('other paths, including ones that only start with the same letters, are the staff app', () => {
    expect(isCustomerScreenPath('/')).toBe(false)
    expect(isCustomerScreenPath('/customers')).toBe(false)
    expect(isCustomerScreenPath('/customer/extra')).toBe(false)
    expect(isCustomerScreenPath('/members')).toBe(false)
  })
})
