import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

/** A fixed quantity of one product (a box or case) with its own barcode. */
export interface ProductPack {
  /** 0 until the pack has been stored. */
  id: number
  barcode: string
  /** How many units of the product one pack holds. */
  size: number
  /** Selling price of the whole pack in satang; null means size x the product price. */
  priceSatang: number | null
  isActive: boolean
}

export const MAX_PACK_SIZE = 9999
export const MAX_PACKS_PER_PRODUCT = 10

const invalid = (message: string) => new DomainError(message, 'INVALID_PRODUCT')

export function assertValidPack(pack: ProductPack): void {
  if (pack.barcode.length < 1 || pack.barcode.length > 64) throw invalid('บาร์โค้ดแพ็กต้องยาว 1 ถึง 64 ตัวอักษร')
  if (!Number.isInteger(pack.size) || pack.size < 2 || pack.size > MAX_PACK_SIZE)
    throw invalid(`จำนวนต่อแพ็กต้องเป็นจำนวนเต็ม 2 ถึง ${MAX_PACK_SIZE}`)
  if (pack.priceSatang !== null && (!Number.isInteger(pack.priceSatang) || pack.priceSatang < 0 || pack.priceSatang > MAX_AMOUNT_SATANG))
    throw invalid('ราคาแพ็กต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบและไม่เกินกำหนด')
}

export function packUnitPriceSatang(productPriceSatang: number, pack: Pick<ProductPack, 'size' | 'priceSatang'>): number {
  return pack.priceSatang ?? pack.size * productPriceSatang
}

export function packUnitCostSatang(productCostSatang: number, size: number): number {
  return size * productCostSatang
}
