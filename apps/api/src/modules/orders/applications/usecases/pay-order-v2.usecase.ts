import { inject, injectable } from 'tsyringe'
import { z } from 'zod'
import { TOKENS } from '../../../tokens'
import { saleCheckoutToken } from '../../../sales/applications/ports/sale-checkout.port'
import type { ISaleCheckout } from '../../../sales/applications/ports/sale-checkout.port'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { payOrderSchema } from '../schemas/order-schemas'
import { inBranch, type OrderActor } from '../services/order-access'
import { restoreSaleSnapshot } from '../../../sales/applications/sale-snapshot'

const payOrderV2Schema = payOrderSchema.extend({ shiftId: z.number().int().positive() })

/** Command. Locks the shift before the order to share the checkout/close lock order. */
@injectable()
export class PayOrderV2UseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(saleCheckoutToken) private readonly checkout: ISaleCheckout,
    @inject(TOKENS.ShiftLedger) private readonly shiftLedger: IShiftLedger,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
  ) {}

  async execute(id: number, input: unknown, actor: OrderActor, idempotencyKey: string) {
    const dto = payOrderV2Schema.parse(input)
    return this.unitOfWork.run(() => this.idempotency.execute(
      { actorId: actor.user.id, branchId: actor.branch.id, action: 'orders.pay', key: idempotencyKey },
      { orderId: id, ...dto },
      async () => {
      await this.shiftLedger.assertOpenForCheckout(dto.shiftId, actor.branch.id)
      const order = inBranch(await this.orders.findByIdForUpdate(id), actor.branch.id)
      order.assertPayable()
      const sale = await this.checkout.checkout({
        lines: order.items.map(({ productId, quantity, unitPriceSatang, options }) => ({
          productId,
          quantity,
          unitPriceSatang,
          options,
        })),
        discountSatang: dto.discountSatang ?? 0,
        payments: dto.payments,
        cashier: actor.user,
        branch: actor.branch,
        shiftId: dto.shiftId,
      })
      await this.orders.save(order.markPaid(sale.id))
      return sale
      },
      (sale) => sale.toSnapshot(),
      async (snapshot) => restoreSaleSnapshot(snapshot),
    ))
  }
}
