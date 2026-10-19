import { injectable } from 'tsyringe'
import { BranchEntity, type BranchEntityProps } from '../../../../domains/branch.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IBranchRepository } from '../../applications/ports/branch.repository'

const codeTaken = () => new DomainConflictError('รหัสสาขานี้มีอยู่แล้ว', 'BRANCH_CODE_TAKEN')

/**
 * No-database branch store: one Map, ids assigned from 1 in creation order.
 * The seeder — not this repo — decides that MAIN gets id 1.
 */
@injectable()
export class MemoryBranchRepository implements IBranchRepository {
  private readonly rows = new Map<number, BranchEntityProps>()
  private nextId = 1

  async findAll() {
    return [...this.rows.values()]
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
      .map((row) => new BranchEntity(row))
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new BranchEntity(row) : null
  }

  async findMain() {
    const row = [...this.rows.values()].find((candidate) => candidate.code === 'MAIN')
    return row ? new BranchEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async create(entity: BranchEntity) {
    if ([...this.rows.values()].some((row) => row.code === entity.code)) throw codeTaken()
    const stored: BranchEntityProps = { ...entity.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new BranchEntity(stored)
  }

  async update(entity: BranchEntity) {
    const stored = this.rows.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
    // The code is the receipt prefix and never changes, like the drizzle twin's SET clause.
    const next: BranchEntityProps = { ...entity.toSnapshot(), id: stored.id, code: stored.code }
    this.rows.set(next.id, next)
    return new BranchEntity(next)
  }

  async countActive() {
    return [...this.rows.values()].filter((row) => row.isActive).length
  }
}
