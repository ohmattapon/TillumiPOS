import type { Branch, Sale, ShopSettings } from '@pos/api/types'

export interface ReceiptHeading {
  shopName: string
  /** Null when there is no branch name to print, or it only repeats the shop name. */
  branchName: string | null
  address: string | null
  phone: string | null
  taxId: string | null
  /** An abbreviated tax invoice needs the seller's tax ID and VAT on the sale; anything else is a plain receipt. */
  isTaxInvoice: boolean
}

type SaleHeading = Pick<Sale, 'shopName' | 'shopTaxId' | 'branchName' | 'shopAddress' | 'shopPhone' | 'vatMode'>
type ShopHeading = Pick<ShopSettings, 'shopName' | 'taxId' | 'address' | 'phone'>
type BranchHeading = Pick<Branch, 'name' | 'address' | 'phone'>

/**
 * What heads a receipt. A sale carries the details it was made under, so they are printed as they
 * were; a sale recorded before those were kept falls back to today's shop and branch.
 */
export function receiptHeading(sale: SaleHeading, shop: ShopHeading, branch: BranchHeading | undefined): ReceiptHeading {
  const kept = sale.shopName !== null
  const shopName = sale.shopName ?? shop.shopName
  const branchName = kept ? sale.branchName : (branch?.name ?? null)
  const taxId = kept ? sale.shopTaxId : shop.taxId

  return {
    shopName,
    branchName: branchName === shopName ? null : branchName,
    address: kept ? sale.shopAddress : (branch?.address ?? shop.address),
    phone: kept ? sale.shopPhone : (branch?.phone ?? shop.phone),
    taxId,
    isTaxInvoice: taxId !== null && sale.vatMode !== 'none',
  }
}
