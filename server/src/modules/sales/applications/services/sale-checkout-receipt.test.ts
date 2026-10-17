import { beforeEach, describe, expect, test } from 'bun:test'
import { makeBranch, makeProduct, makeSale } from '../../../../__tests__/factories'
import {
  mockBranchRepository, mockCheckoutPolicy, mockLineOptionsResolver, mockMemberRepository,
  mockProductRepository, mockQrPaymentClaims, mockQuoteClaims, mockSaleRepository, mockShiftLedger,
  mockShopSettingsRepository, mockStockLedger,
} from '../../../../__tests__/mocks'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { SaleCheckout } from './sale-checkout'

// The branch is MAIN and has its own address; the receipt must still take the shop's details.
describe('SaleCheckout receipt header', () => {
  const request = {
    lines: [{ productId: 1, quantity: 1, options: [] }], discountSatang: 0,
    payments: [{ method: 'cash' as const, amountSatang: 1000 }],
    cashier: { id: 1, displayName: 'แคชเชียร์' }, branch: { id: 1, code: 'MAIN' },
  }
  let checkout: SaleCheckout

  beforeEach(() => {
    const settings = mockShopSettingsRepository()
    settings.get.mockResolvedValue(new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, address: '1 ถนนร้าน', phone: '020000000' }))
    const branches = mockBranchRepository()
    branches.findById.mockResolvedValue(makeBranch({ name: 'สาขาหลัก', address: 'ที่อยู่สาขา', phone: '021111111' }))
    const products = mockProductRepository()
    products.findManyForUpdate.mockResolvedValue([makeProduct()])
    const sales = mockSaleRepository()
    sales.nextReceiptNo.mockResolvedValue('MAIN-20261015-00001')
    sales.create.mockImplementation(async (sale, receiptNo) => makeSale({ ...sale, id: 1, receiptNo }))
    checkout = new SaleCheckout(
      sales, products, mockStockLedger(), settings, mockQrPaymentClaims(), mockCheckoutPolicy(), mockShiftLedger(),
      mockLineOptionsResolver(), mockMemberRepository(), mockQuoteClaims(),
    )
  })

  test("a new bill takes the shop's address and phone, not the branch's", async () => {
    const sale = await checkout.checkout(request)

    expect(sale).toMatchObject({ shopAddress: '1 ถนนร้าน', shopPhone: '020000000' })
  })

  test('a new bill stores no branch name, so its receipt has no branch line', async () => {
    expect((await checkout.checkout(request)).branchName).toBeNull()
  })
})
