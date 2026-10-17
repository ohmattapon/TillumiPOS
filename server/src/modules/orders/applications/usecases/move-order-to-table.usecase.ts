import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { tableRepositoryToken } from '../../../tables/applications/ports/table.repository'
import type { ITableRepository } from '../../../tables/applications/ports/table.repository'
import { TOKENS } from '../../../tokens'
import { orderRepositoryToken } from '../ports/order.repository'
import type { IOrderRepository } from '../ports/order.repository'
import { moveOrderSchema } from '../schemas/order-schemas'
import { inBranch } from '../services/order-access'
import { findUsableTable } from '../services/order-table'

/** Command: puts an open order on another table, or on none. */
@injectable()
export class MoveOrderToTableUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(tableRepositoryToken) private readonly tables: ITableRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const { tableId } = moveOrderSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(id), branchId)
      if (tableId !== null) await findUsableTable(this.tables, tableId, branchId)
      return this.orders.save(order.moveToTable(tableId))
    })
  }
}
