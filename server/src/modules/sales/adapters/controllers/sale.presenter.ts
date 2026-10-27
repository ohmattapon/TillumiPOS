import type { SaleEntity } from '../../../../domains/sale.domain'
import type { SaleResponse } from './schemas/sale.schema'

/** Cost and the id of whoever voided the sale are internal: they are not part of the public receipt. */
export function toSaleResponse(sale: SaleEntity): SaleResponse {
  const { voidedById: _internal, shiftId: _shift, pointsRule: _rule, items, payments, ...header } = sale.toSnapshot()
  return {
    ...header,
    // A sale stored before points existed has none of them.
    pointsEarned: header.pointsEarned ?? 0,
    pointsRedeemed: header.pointsRedeemed ?? 0,
    pointsDiscountSatang: header.pointsDiscountSatang ?? 0,
    pointsBalanceAfter: header.pointsBalanceAfter ?? null,
    member: sale.member,
    promotion: sale.promotion,
    items: items.map(({ unitCostSatang: _cost, options, ...item }) => ({
      ...item,
      options: options.map(({ costSatang: _optionCost, ...option }) => option),
    })),
    payments,
  }
}
