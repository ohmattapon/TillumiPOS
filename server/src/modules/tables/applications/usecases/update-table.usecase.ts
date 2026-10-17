import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { tableOccupancyToken } from '../ports/table-occupancy.port'
import type { ITableOccupancy } from '../ports/table-occupancy.port'
import { tableRepositoryToken } from '../ports/table.repository'
import type { ITableRepository } from '../ports/table.repository'
import { updateTableSchema } from '../schemas/table-schemas'

/** Command. A table with open orders cannot be closed. */
@injectable()
export class UpdateTableUseCase {
  constructor(
    @inject(tableRepositoryToken) private readonly tables: ITableRepository,
    @inject(tableOccupancyToken) private readonly occupancy: ITableOccupancy,
  ) {}

  async execute(id: number, input: unknown, branchId: number) {
    const changes = updateTableSchema.parse(input)

    const existing = await this.tables.findById(id)
    // Another branch's table is not even acknowledged.
    if (!existing || existing.branchId !== branchId) throw new DomainNotFoundError('ไม่พบโต๊ะ', 'TABLE_NOT_FOUND')

    if (changes.isActive === false && existing.isActive && (await this.occupancy.openOrderCount(id)) > 0)
      throw new DomainConflictError(`โต๊ะ "${existing.name}" ยังมีออเดอร์ค้าง ปิดใช้งานไม่ได้`, 'TABLE_HAS_OPEN_ORDERS', {
        name: existing.name,
      })

    return this.tables.update(existing.with(changes))
  }
}
