import { injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { UserEntity } from '../../../../domains/user.domain'
import type { IUserRepository } from '../../applications/ports/user.repository'

// passwordHash and pinHash are kept beside the row, like the drizzle twin
// keeps them out of the shared columns: only the credential reads see them,
// and hasPin is derived on read and never written.
interface UserRow {
  id: number
  username: string
  displayName: string
  role: UserEntity['role']
  roleId: number | null
  branchId: number
  isActive: boolean
  passwordHash: string
  pinHash: string | null
}

const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

const entityOf = (row: UserRow) =>
  new UserEntity({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    roleId: row.roleId,
    branchId: row.branchId,
    isActive: row.isActive,
    hasPin: row.pinHash !== null,
  })

/**
 * No-database user store: one Map, ids assigned from 1 in creation order.
 * The seeder — not this repo — decides that the owner `admin` gets id 1.
 */
@injectable()
export class MemoryUserRepository implements IUserRepository {
  private readonly rows = new Map<number, UserRow>()
  private nextId = 1

  async lockOwnerChangesForUpdate(): Promise<void> {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real advisory lock instead.
  }

  async findAll() {
    return [...this.rows.values()].sort((a, b) => a.id - b.id).map(entityOf)
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? entityOf(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async findActiveById(id: number) {
    const row = this.rows.get(id)
    return row && row.isActive ? entityOf(row) : null
  }

  async findCredentialsByUsername(username: string) {
    // Usernames are stored normalized, and callers normalize before asking,
    // so an exact match mirrors the drizzle twin.
    const row = [...this.rows.values()].find((candidate) => candidate.username === username)
    return row ? { user: entityOf(row), passwordHash: row.passwordHash } : null
  }

  async findPinHash(userId: number) {
    const row = this.rows.get(userId)
    return row && row.isActive ? (row.pinHash ?? null) : null
  }

  async setPinHash(userId: number, pinHash: string | null) {
    const row = this.rows.get(userId)
    if (!row) throw new DomainNotFoundError('ไม่พบผู้ใช้')
    this.rows.set(userId, { ...row, pinHash })
  }

  async findSwitchable() {
    return [...this.rows.values()]
      .filter((row) => row.isActive && row.pinHash !== null)
      .sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : a.id - b.id))
      .map((row) => ({ id: row.id, displayName: row.displayName }))
  }

  async findPasswordHashById(userId: number) {
    return this.rows.get(userId)?.passwordHash ?? null
  }

  async create(entity: UserEntity, passwordHash: string) {
    if (entity.roleId === null) throw new DomainError('ต้องระบุบทบาท', 'INVALID_USER')
    if ([...this.rows.values()].some((row) => row.username === entity.username)) throw duplicate()
    // Role and branch existence is a database foreign key in the drizzle twin;
    // memory has no cross-module reads, so only the seeder's valid data reaches here.
    const row: UserRow = {
      id: this.nextId++,
      username: entity.username,
      displayName: entity.displayName,
      role: entity.role,
      roleId: entity.roleId,
      branchId: entity.branchId,
      isActive: entity.isActive,
      passwordHash,
      pinHash: null,
    }
    this.rows.set(row.id, row)
    return entityOf(row)
  }

  async update(entity: UserEntity, passwordHash?: string) {
    if (entity.roleId === null) throw new DomainError('ต้องระบุบทบาท', 'INVALID_USER')
    const stored = this.rows.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบผู้ใช้')
    // The username is not updatable, so the stored one wins, like the drizzle twin's SET clause.
    const row: UserRow = {
      ...stored,
      displayName: entity.displayName,
      role: entity.role,
      roleId: entity.roleId,
      branchId: entity.branchId,
      isActive: entity.isActive,
      passwordHash: passwordHash ?? stored.passwordHash,
    }
    this.rows.set(row.id, row)
    return entityOf(row)
  }

  async countActiveOwners() {
    return [...this.rows.values()].filter((row) => row.role === 'owner' && row.isActive).length
  }

  async countActiveInBranch(branchId: number) {
    return [...this.rows.values()].filter((row) => row.branchId === branchId && row.isActive).length
  }
}
