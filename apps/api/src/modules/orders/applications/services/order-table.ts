import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { ITableRepository } from '../../../tables/applications/ports/table.repository'

/** A table of this branch that is open for use. Another branch's table is not even acknowledged. */
export async function findUsableTable(tables: ITableRepository, tableId: number, branchId: number) {
  const table = await tables.findById(tableId)
  if (!table || table.branchId !== branchId) throw new DomainNotFoundError('ไม่พบโต๊ะ', 'TABLE_NOT_FOUND')
  if (!table.isActive)
    throw new DomainConflictError(`โต๊ะ "${table.name}" ปิดใช้งานแล้ว`, 'TABLE_INACTIVE', { name: table.name })
  return table
}
