import type { SaleEntity } from '../../../../domains/sale.domain'
import type { SaleV2Response } from './schemas/sale.schema'

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
    // The response schema widens with Task 2's OpenAPI change, when the migration actually allows storing
    // a bundle promotion; no such bill can exist before that, but the snapshot type already carries the union.
    promotion: header.promotion as SaleV2Response['promotion'],
    items: items.map(({ unitCostSatang: _cost, options, ...item }) => ({
      ...item,
      options: options.map(({ costSatang: _optionCost, ...option }) => option),
    })),
    payments,
  }
}
