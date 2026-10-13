import type { SaleEntity } from '../../../../domains/sale.domain'

export function toSaleV2Response(sale: SaleEntity) {
  const { voidedById: _internal, items, payments, ...header } = sale.toSnapshot()
  if (sale.shiftId === null) throw new Error('A v2 sale must have a shift id')
  return {
    ...header,
    shiftId: sale.shiftId,
    items: items.map(({ unitCostSatang: _cost, ...item }) => item),
    payments,
  }
}
