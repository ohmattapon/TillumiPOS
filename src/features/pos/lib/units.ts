import { packUnitPriceSatang } from '@pos/api/packs'
import type { Product } from '@pos/api/types'

/** One way to put a product in the cart: single pieces or a whole pack. */
export interface UnitChoice {
  /** Undefined for single pieces. */
  packId: number | undefined
  /** Pieces this choice moves out of stock. */
  size: number
  unitPriceSatang: number
  /** The stock on hand cannot fill one of these, so the till must not sell it. */
  shortOfStock: boolean
}

/**
 * The units a product is sold in, single pieces first and then each active pack from the smallest up,
 * so the cashier reads one list from a piece to a carton. A pack without its own price costs the size
 * times the piece price, the rule the server uses (`packUnitPriceSatang`).
 */
export function unitChoices(product: Product): UnitChoice[] {
  const pieces: UnitChoice = {
    packId: undefined,
    size: 1,
    unitPriceSatang: product.priceSatang,
    shortOfStock: product.trackStock && product.stockQty < 1,
  }
  const packs = product.packs
    .filter((pack) => pack.isActive)
    .sort((left, right) => left.size - right.size || left.id - right.id)
    .map<UnitChoice>((pack) => ({
      packId: pack.id,
      size: pack.size,
      unitPriceSatang: packUnitPriceSatang(product.priceSatang, pack),
      shortOfStock: product.trackStock && product.stockQty < pack.size,
    }))
  return [pieces, ...packs]
}
