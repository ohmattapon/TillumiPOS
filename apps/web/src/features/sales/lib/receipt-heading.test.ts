import { describe, expect, test } from 'bun:test'
import { receiptHeading } from './receipt-heading'

const shop = { shopName: 'ร้านใหม่', taxId: '0105500000000', address: 'ที่อยู่ร้าน', phone: '020000000' }
const branch = { name: 'สาขาสีลม', address: 'ที่อยู่สาขา', phone: null }
const old = { shopName: null, shopTaxId: null, branchName: null, shopAddress: null, shopPhone: null, vatMode: 'inclusive' as const }
const kept = {
  shopName: 'ร้านเดิม',
  shopTaxId: '0100000000001',
  branchName: 'สาขาเดิม',
  shopAddress: 'ที่อยู่เดิม',
  shopPhone: '029999999',
  vatMode: 'inclusive' as const,
}

describe('receiptHeading', () => {
  test('a sale prints the details it was made under, whatever the shop and branch say today', () => {
    expect(receiptHeading(kept, shop, branch)).toEqual({
      shopName: 'ร้านเดิม',
      branchName: 'สาขาเดิม',
      address: 'ที่อยู่เดิม',
      phone: '029999999',
      taxId: '0100000000001',
      isTaxInvoice: true,
    })
  })

  test('details that were empty at the time stay empty: today’s are not filled in', () => {
    const heading = receiptHeading({ ...kept, shopTaxId: null, shopAddress: null, shopPhone: null }, shop, branch)

    expect(heading).toMatchObject({ address: null, phone: null, taxId: null, isTaxInvoice: false })
  })

  test('a sale from before the details were kept uses today’s shop, with the branch’s address and the shop’s phone', () => {
    expect(receiptHeading(old, shop, branch)).toEqual({
      shopName: 'ร้านใหม่',
      branchName: 'สาขาสีลม',
      address: 'ที่อยู่สาขา',
      phone: '020000000',
      taxId: '0105500000000',
      isTaxInvoice: true,
    })
  })

  test('an old sale whose branch is not known still prints the shop', () => {
    expect(receiptHeading(old, shop, undefined)).toMatchObject({ branchName: null, address: 'ที่อยู่ร้าน', phone: '020000000' })
  })

  test('a branch named like the shop is not printed twice', () => {
    expect(receiptHeading({ ...kept, branchName: 'ร้านเดิม' }, shop, branch).branchName).toBeNull()
  })

  test.each([
    ['inclusive', true],
    ['exclusive', true],
    ['none', false],
  ] as const)('with a tax ID, a sale priced with VAT "%s" is a tax invoice: %p', (vatMode, expected) => {
    expect(receiptHeading({ ...kept, vatMode }, shop, branch).isTaxInvoice).toBe(expected)
  })

  test('without a tax ID a sale is a plain receipt even when VAT was charged', () => {
    expect(receiptHeading({ ...kept, shopTaxId: null }, shop, branch).isTaxInvoice).toBe(false)
  })
})
