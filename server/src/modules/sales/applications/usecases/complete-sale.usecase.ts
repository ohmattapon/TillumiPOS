import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { saleCheckoutToken } from '../ports/sale-checkout.port'
import type { ISaleCheckout } from '../ports/sale-checkout.port'
import { completeSaleSchema } from '../schemas/sale-schemas'

/** Command: records a sale, deducts stock and issues the receipt number, all or nothing. */
@injectable()
export class CompleteSaleUseCase {
  constructor(
    @inject(saleCheckoutToken) private readonly checkout: ISaleCheckout,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(input: unknown, cashier: { id: number; displayName: string }, branch: { id: number; code: string }) {
    const dto = completeSaleSchema.parse(input)

    return this.unitOfWork.run(() =>
      this.checkout.checkout({
        lines: dto.items.map(({ productId, quantity, options }) => ({ productId, quantity, optionIds: options })),
        memberId: dto.memberId ?? null,
        quoteId: dto.quoteId ?? null,
        discountSatang: dto.discountSatang ?? 0,
        payments: dto.payments,
        cashier,
        branch,
      }),
    )
  }
}
