import type { Actor } from '../../../../domains/authorization'
import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import { VoidSaleUseCase } from './void-sale.usecase'
import { restoreSaleSnapshot } from '../sale-snapshot'

/** Command: idempotently voids a v2 sale. Cash is returned by a separate explicit command. */
@injectable()
export class VoidSaleV2UseCase {
  constructor(
    @inject(VoidSaleUseCase) private readonly voidSale: VoidSaleUseCase,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Idempotency) private readonly idempotency: CommandIdempotency,
  ) { }

  execute(id: number, input: unknown, actor: Actor & { id: number; displayName: string }, branchId: number, key: string) {
    return this.unitOfWork.run(() => this.idempotency.execute(
      { actorId: actor.id, branchId, action: 'sales.void', key },
      { saleId: id, input },
      () => this.voidSale.execute(id, input, actor, branchId),
      (sale) => sale.toSnapshot(),
      async (snapshot) => restoreSaleSnapshot(snapshot),
    ))
  }
}
