import { and, count, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { UserEntity } from '../../../../domains/user.domain'
import { users } from '../../../../infrastructure/database/schema/users'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IUserRepository } from '../../applications/ports/user.repository'

// passwordHash is deliberately absent: it is selected only by findCredentialsByUsername.
const columns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  isActive: users.isActive,
}

const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

@injectable()
export class DrizzleUserRepository implements IUserRepository {
  async findAll() {
    const rows = await currentExecutor().select(columns).from(users).orderBy(users.id)
    return rows.map((row) => new UserEntity(row))
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(users).where(eq(users.id, id))
    return row ? new UserEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select(columns).from(users).where(eq(users.id, id)).for('update')
    return row ? new UserEntity(row) : null
  }

  async findActiveById(id: number) {
    const [row] = await currentExecutor()
      .select(columns)
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)))
    return row ? new UserEntity(row) : null
  }

  async findCredentialsByUsername(username: string) {
    const [row] = await currentExecutor()
      .select({ ...columns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.username, username))
    if (!row) return null

    const { passwordHash, ...props } = row
    return { user: new UserEntity(props), passwordHash }
  }

  async create(entity: UserEntity, passwordHash: string) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor()
        .insert(users)
        .values({ ...values, passwordHash })
        .returning(columns)
      return new UserEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async update(entity: UserEntity, passwordHash?: string) {
    // The username is not updatable, so it is left out of the SET clause.
    const { id, username: _fixed, ...values } = entity.toSnapshot()
    const [row] = await currentExecutor()
      .update(users)
      .set({ ...values, ...(passwordHash && { passwordHash }) })
      .where(eq(users.id, id))
      .returning(columns)
    if (!row) throw new DomainNotFoundError('ไม่พบผู้ใช้')
    return new UserEntity(row)
  }

  async countActiveOwners() {
    const [row] = await currentExecutor()
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.role, 'owner'), eq(users.isActive, true)))
    return row!.total
  }
}
