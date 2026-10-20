import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { TOKENS } from '../../../tokens'
import { saleCheckoutToken } from '../ports/sale-checkout.port'
import type { ISaleCheckout } from '../ports/sale-checkout.port'
import { completeSaleV2Schema } from '../schemas/sale-schemas'
import { restoreSaleSnapshot } from '../sale-snapshot'

/**
 * Command: records a sale inside a shift, deducts stock and issues the receipt number, all or nothing.
 * The idempotency key makes a retried request answer with the first sale instead of charging twice.
 */
@injectable()
export class CompleteSaleV2UseCase {
  constructor(
    @inject(saleCheckoutToken) private readonly checkout: ISaleCheckout,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
  ) {}

  async execute(input: unknown, cashier: { id: number; displayName: string }, branch: { id: number; code: string }, idempotencyKey: string) {
    const dto = completeSaleV2Schema.parse(input)
    return this.unitOfWork.run(() => this.idempotency.execute(
      { actorId: cashier.id, branchId: branch.id, action: 'sales.checkout', key: idempotencyKey },
      dto,
      () => this.checkout.checkout({
        lines: dto.items.map(({ productId, quantity, options }) => ({ productId, quantity, optionIds: options })),
        memberId: dto.memberId ?? null,
        quoteId: dto.quoteId ?? null,
        discountSatang: dto.discountSatang ?? 0,
        payments: dto.payments,
        cashier,
        branch,
        shiftId: dto.shiftId,
      }),
      (sale) => sale.toSnapshot(),
      async (snapshot) => restoreSaleSnapshot(snapshot),
    ))
  }
}
