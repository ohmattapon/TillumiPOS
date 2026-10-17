import { beforeEach, describe, expect, test } from 'bun:test'
import { makeBranch, makeProduct, makeSale } from '../../../../__tests__/factories'
import {
  mockBranchRepository, mockCheckoutPolicy, mockLineOptionsResolver, mockMemberRepository,
  mockProductRepository, mockQrPaymentClaims, mockSaleRepository, mockShiftLedger,
  mockShopSettingsRepository, mockStockLedger, mockQuoteClaims,
} from '../../../../__tests__/mocks'
import { MemberEntity } from '../../../../domains/member.domain'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { SaleCheckout } from './sale-checkout'

const identity = (isActive = true) => new MemberEntity({
  id: 8, name: 'ลูกค้าประจำ', phone: '0812345678', isActive, createdAt: new Date(), updatedAt: new Date(),
})

describe('SaleCheckout membership', () => {
  let members: ReturnType<typeof mockMemberRepository>
  let products: ReturnType<typeof mockProductRepository>
  let sales: ReturnType<typeof mockSaleRepository>
  let ledger: ReturnType<typeof mockStockLedger>
  let qr: ReturnType<typeof mockQrPaymentClaims>
  let checkout: SaleCheckout
  const request = {
    lines: [{ productId: 1, quantity: 1, options: [] }], discountSatang: 0,
    payments: [{ method: 'cash' as const, amountSatang: 1000 }],
    cashier: { id: 1, displayName: 'แคชเชียร์' }, branch: { id: 1, code: 'MAIN' },
  }

  beforeEach(() => {
    members = mockMemberRepository()
    products = mockProductRepository()
    sales = mockSaleRepository()
    ledger = mockStockLedger()
    qr = mockQrPaymentClaims()
    const settings = mockShopSettingsRepository()
    const branches = mockBranchRepository()
    settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
    branches.findById.mockResolvedValue(makeBranch())
    products.findManyForUpdate.mockResolvedValue([makeProduct()])
    members.findByIdForUpdate.mockResolvedValue(identity())
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261015-00001')
    sales.create.mockImplementation(async (sale, receiptNo) => makeSale({ ...sale, id: 1, receiptNo }))
    checkout = new SaleCheckout(sales, products, ledger, settings, qr, mockCheckoutPolicy(), mockShiftLedger(), mockLineOptionsResolver(), members, mockQuoteClaims())
  })

  test('locks member before stock and persists only receipt identity', async () => {
    const steps: string[] = []
    members.findByIdForUpdate.mockImplementation(async () => { steps.push('member'); return identity() })
    products.findManyForUpdate.mockImplementation(async () => { steps.push('products'); return [makeProduct()] })
    const sale = await checkout.checkout({ ...request, memberId: 8 })
    expect(steps).toEqual(['member', 'products'])
    expect(members.findByIdForUpdate).toHaveBeenCalledWith(8)
    expect(members.findById).not.toHaveBeenCalled()
    expect(sale.member).toEqual({ id: 8, code: 'M000008', name: 'ลูกค้าประจำ' })
    expect(sales.create.mock.calls[0]![0].member).toEqual(sale.member)
    expect(sale.totalSatang).toBe(1000)
  })

  test('supports omitted and explicit null member without a member lookup', async () => {
    expect((await checkout.checkout(request)).member).toBeNull()
    expect((await checkout.checkout({ ...request, memberId: null })).member).toBeNull()
    expect(members.findByIdForUpdate).not.toHaveBeenCalled()
  })

  test('rejects missing and inactive members before product locks or any write', async () => {
    members.findByIdForUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(identity(false))
    await expect(checkout.checkout({ ...request, memberId: 8 })).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
    await expect(checkout.checkout({ ...request, memberId: 8 })).rejects.toMatchObject({ code: 'MEMBER_INACTIVE' })
    expect(products.findManyForUpdate).not.toHaveBeenCalled()
    expect(sales.nextReceiptNo).not.toHaveBeenCalled()
    expect(sales.create).not.toHaveBeenCalled()
    expect(ledger.record).not.toHaveBeenCalled()
    expect(qr.consume).not.toHaveBeenCalled()
  })
})
