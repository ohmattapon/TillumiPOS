import type { ISaleHeader } from '../../applications/ports/sale.repository'
import type { SaleEntity } from '../../../../domains/sale.domain'
import type { SaleHeaderResponse, SaleResponse } from './schemas/sale.schema'

/** Same as toSaleResponse, without the lines and the payments: the list answers headers only. */
export function toSaleHeaderResponse(sale: ISaleHeader): SaleHeaderResponse {
  // The response schema widens with Task 2's OpenAPI change, when the migration actually allows storing
  // a bundle promotion; no such bill can exist before that, but the snapshot type already carries the union.
  return { ...sale, promotion: sale.promotion as SaleHeaderResponse['promotion'] }
}

/** Cost and the id of whoever voided the sale are internal: they are not part of the public receipt. */
export function toSaleResponse(sale: SaleEntity): SaleResponse {
  const { voidedById: _internal, shiftId: _shift, items, payments, ...header } = sale.toSnapshot()
  return {
    ...header,
    member: sale.member,
    // The schema widens with Task 2's OpenAPI change, when the migration actually allows storing a bundle;
    // no such bill can exist before that, but the snapshot type already carries the wider union.
    promotion: sale.promotion as SaleResponse['promotion'],
    items: items.map(({ unitCostSatang: _cost, options, ...item }) => ({
      ...item,
      options: options.map(({ costSatang: _optionCost, ...option }) => option),
    })),
    payments,
  }
}
