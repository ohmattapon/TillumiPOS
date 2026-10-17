import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { assertValidPack, MAX_PACKS_PER_PRODUCT, type ProductPack } from './product-pack'

export interface ProductEntityProps {
  /** 0 until the product has been stored. */
  id: number
  sku: string
  barcode: string | null
  name: string
  categoryId: number | null
  /** Selling price in satang, VAT included. */
  priceSatang: number
  costSatang: number
  trackStock: boolean
  /** Changes only through the inventory module. */
  stockQty: number
  isActive: boolean
  /** Object key in media storage; changes only through the image use cases. */
  imageKey: string | null
  /** Boxes or cases sold under their own barcode; absent means none. */
  packs?: ProductPack[]
}

export type ProductChanges = Partial<
  Pick<
    ProductEntityProps,
    'sku' | 'barcode' | 'name' | 'categoryId' | 'priceSatang' | 'costSatang' | 'trackStock' | 'isActive' | 'packs'
  >
>

const invalid = (message: string) => new DomainError(message, 'INVALID_PRODUCT')
const isLength = (value: string, min: number, max: number) => value.length >= min && value.length <= max
const isMoney = (value: number) => Number.isInteger(value) && value >= 0

export class ProductEntity {
  public readonly id: number
  public readonly sku: string
  public readonly barcode: string | null
  public readonly name: string
  public readonly categoryId: number | null
  public readonly priceSatang: number
  public readonly costSatang: number
  public readonly trackStock: boolean
  public readonly stockQty: number
  public readonly isActive: boolean
  public readonly imageKey: string | null
  public readonly packs: readonly ProductPack[]

  constructor(props: ProductEntityProps) {
    if (!isLength(props.sku, 1, 64)) throw invalid('รหัสสินค้าต้องยาว 1 ถึง 64 ตัวอักษร')
    if (props.barcode !== null && !isLength(props.barcode, 1, 64)) throw invalid('บาร์โค้ดต้องยาว 1 ถึง 64 ตัวอักษร')
    if (!isLength(props.name, 1, 200)) throw invalid('ชื่อสินค้าต้องยาว 1 ถึง 200 ตัวอักษร')
    if (!isMoney(props.priceSatang) || !isMoney(props.costSatang))
      throw invalid('ราคาและต้นทุนต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ')
    if (!Number.isInteger(props.stockQty)) throw invalid('จำนวนสต็อกต้องเป็นจำนวนเต็ม')

    const packs = props.packs ?? []
    if (packs.length > MAX_PACKS_PER_PRODUCT) throw invalid(`สินค้าหนึ่งรายการมีแพ็กได้ไม่เกิน ${MAX_PACKS_PER_PRODUCT} แบบ`)
    const taken = new Set<string>(props.barcode === null ? [] : [props.barcode])
    const storedIds = new Set<number>()
    for (const pack of packs) {
      assertValidPack(pack)
      // 0 marks a pack not stored yet; a stored id twice would make the repository write one row twice.
      if (pack.id !== 0) {
        if (storedIds.has(pack.id)) throw invalid('มีแพ็คเดียวกันซ้ำในรายการ')
        storedIds.add(pack.id)
      }
      if (taken.has(pack.barcode))
        throw new DomainConflictError(`บาร์โค้ด ${pack.barcode} ถูกใช้แล้ว`, 'BARCODE_TAKEN', { barcode: pack.barcode })
      taken.add(pack.barcode)
    }

    this.id = props.id
    this.sku = props.sku
    this.barcode = props.barcode
    this.name = props.name
    this.categoryId = props.categoryId
    this.priceSatang = props.priceSatang
    this.costSatang = props.costSatang
    this.trackStock = props.trackStock
    this.stockQty = props.stockQty
    this.isActive = props.isActive
    this.imageKey = props.imageKey
    this.packs = packs.map((pack) => ({ ...pack }))
  }

  /**
   * A copy with the given fields changed. `undefined` keeps the current value;
   * `null` is a real value for barcode and categoryId (it clears them).
   */
  with(changes: ProductChanges): ProductEntity {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    return new ProductEntity({ ...this.toSnapshot(), ...defined, id: this.id, stockQty: this.stockQty, imageKey: this.imageKey })
  }

  /** Throws when this product is no longer for sale, whatever the stock. */
  assertActive(): void {
    if (!this.isActive) throw new DomainConflictError(`สินค้า "${this.name}" ปิดการขายแล้ว`, 'PRODUCT_INACTIVE', { name: this.name })
  }

  /** Throws when this product cannot be sold in the given quantity right now. */
  assertSellable(quantity: number): void {
    this.assertActive()
    if (this.trackStock && this.stockQty < quantity)
      throw new DomainConflictError(`สินค้า "${this.name}" เหลือ ${this.stockQty} ชิ้น ไม่พอขาย`, 'INSUFFICIENT_STOCK', {
        name: this.name,
        available: this.stockQty,
      })
  }

  findPack(packId: number): ProductPack | undefined {
    return this.packs.find((pack) => pack.id === packId)
  }

  /** The pack to sell, or an error when it is missing or switched off (or the product is). */
  packForSale(packId: number): ProductPack {
    this.assertActive()
    const pack = this.findPack(packId)
    if (!pack) throw new DomainError('ไม่พบแพ็กสินค้านี้', 'PACK_NOT_FOUND', { packId })
    if (!pack.isActive)
      throw new DomainConflictError(`แพ็ก ${pack.barcode} ปิดการขายแล้ว`, 'PACK_INACTIVE', { barcode: pack.barcode })
    return pack
  }

  toSnapshot(): ProductEntityProps {
    return {
      id: this.id,
      sku: this.sku,
      barcode: this.barcode,
      name: this.name,
      categoryId: this.categoryId,
      priceSatang: this.priceSatang,
      costSatang: this.costSatang,
      trackStock: this.trackStock,
      stockQty: this.stockQty,
      isActive: this.isActive,
      imageKey: this.imageKey,
      packs: this.packs.map((pack) => ({ ...pack })),
    }
  }
}
