import type { SaleEntity } from '../../../../domains/sale.domain'

export function toSaleV2Response(sale: SaleEntity) {
  const { voidedById: _internal, pointsRule: _rule, items, payments, ...header } = sale.toSnapshot()
  if (sale.shiftId === null) throw new Error('A v2 sale must have a shift id')
  return {
    ...header,
    // A sale stored before points existed has none of them.
    pointsEarned: header.pointsEarned ?? 0,
    pointsRedeemed: header.pointsRedeemed ?? 0,
    pointsDiscountSatang: header.pointsDiscountSatang ?? 0,
    pointsBalanceAfter: header.pointsBalanceAfter ?? null,
    shiftId: sale.shiftId,
    items: items.map(({ unitCostSatang: _cost, options, ...item }) => ({
      ...item,
      options: options.map(({ costSatang: _optionCost, ...option }) => option),
    })),
    payments,
  }
}
