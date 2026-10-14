import type { SaleEntity } from '../../../../domains/sale.domain'
import type { SaleResponse } from './schemas/sale.schema'

/** Cost and the id of whoever voided the sale are internal: they are not part of the public receipt. */
export function toSaleResponse(sale: SaleEntity): SaleResponse {
  const { voidedById: _internal, shiftId: _shift, items, payments, ...header } = sale.toSnapshot()
  return {
    ...header,
    items: items.map(({ unitCostSatang: _cost, options, ...item }) => ({
      ...item,
      options: options.map(({ costSatang: _optionCost, ...option }) => option),
    })),
    payments,
  }
}
