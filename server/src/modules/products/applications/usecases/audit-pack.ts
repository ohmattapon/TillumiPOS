import type { ProductPack } from '../../../../domains/product-pack'

/** The pack fields worth keeping in audit history. */
export const auditPack = ({ barcode, size, priceSatang, isActive }: ProductPack) => ({ barcode, size, priceSatang, isActive })
