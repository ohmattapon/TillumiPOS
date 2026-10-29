import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { TOKENS } from '../../../tokens'
import { saleCheckoutToken } from '../ports/sale-checkout.port'
import type { ISaleCheckout } from '../ports/sale-checkout.port'
import { completeSaleSchema } from '../schemas/sale-schemas'
import { restoreSaleSnapshot } from '../sale-snapshot'

/** Command: records a sale, deducts stock and issues the receipt number, all or nothing. */
@injectable()
export class CompleteSaleUseCase {
  constructor(
    @inject(saleCheckoutToken) private readonly checkout: ISaleCheckout,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
  ) {}

  async execute(
    input: unknown,
    cashier: { id: number; displayName: string },
    branch: { id: number; code: string },
    idempotencyKey?: string,
  ) {
    const dto = completeSaleSchema.parse(input)

    return this.unitOfWork.run(() => {
      const checkout = () => this.checkout.checkout(this.checkoutRequest(dto, cashier, branch))

      if (idempotencyKey === undefined) return checkout()

      return this.idempotency.execute(
        { actorId: cashier.id, branchId: branch.id, action: 'sales.checkout', key: idempotencyKey },
        dto,
        checkout,
        (sale) => sale.toSnapshot(),
        async (snapshot) => restoreSaleSnapshot(snapshot),
      )
    })
  }

  private checkoutRequest(
    dto: ReturnType<typeof completeSaleSchema.parse>,
    cashier: { id: number; displayName: string },
    branch: { id: number; code: string },
  ): Parameters<ISaleCheckout['checkout']>[0] {
    return {
      lines: dto.items.map(({ productId, quantity, options, packId }) => ({ productId, quantity, optionIds: options, packId })),
      memberId: dto.memberId ?? null,
      quoteId: dto.quoteId ?? null,
      discountSatang: dto.discountSatang ?? 0,
      payments: dto.payments,
      cashier,
      branch,
    }
  }
}
