import { inject, injectable } from 'tsyringe'
import { DiningTableEntity } from '../../../../domains/dining-table.domain'
import { tableRepositoryToken } from '../ports/table.repository'
import type { ITableRepository } from '../ports/table.repository'
import { createTableSchema } from '../schemas/table-schemas'

/** Command. A table the owner has not placed yet goes to the top left corner, to be dragged where it belongs. */
@injectable()
export class CreateTableUseCase {
  constructor(@inject(tableRepositoryToken) private readonly tables: ITableRepository) {}

  async execute(input: unknown, branchId: number) {
    const dto = createTableSchema.parse(input)

    return this.tables.create(
      new DiningTableEntity({
        id: 0,
        branchId,
        name: dto.name,
        zone: dto.zone ?? null,
        seats: dto.seats ?? 4,
        x: dto.x ?? 20,
        y: dto.y ?? 20,
        width: dto.width ?? 120,
        height: dto.height ?? 80,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      }),
    )
  }
}
