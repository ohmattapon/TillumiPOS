import { and, count, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { conflict, notFound } from '../../shared/errors'
import type { CreateUser, UpdateUser, User } from './model'
import { users } from './schema'

// Never select passwordHash unless verifying a login.
const publicColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  isActive: users.isActive,
}

export abstract class UsersService {
  static list(): Promise<User[]> {
    return db.select(publicColumns).from(users).orderBy(users.id)
  }

  static async findActiveById(id: number): Promise<User | undefined> {
    const [user] = await db
      .select(publicColumns)
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)))
    return user
  }

  /** Returns the user's public profile when the credentials are valid. */
  static async verifyCredentials(username: string, password: string): Promise<User | undefined> {
    const [row] = await db
      .select({ ...publicColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
    if (!row?.isActive) return undefined
    if (!(await Bun.password.verify(password, row.passwordHash))) return undefined

    const { passwordHash: _, ...user } = row
    return user
  }

  static async create(input: CreateUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        username: input.username.toLowerCase(),
        passwordHash: await Bun.password.hash(input.password),
        displayName: input.displayName,
        role: input.role,
      })
      .returning(publicColumns)
    return user!
  }

  static async update(id: number, input: UpdateUser): Promise<User> {
    const { password, ...fields } = input

    return db.transaction(async (tx) => {
      const [current] = await tx.select(publicColumns).from(users).where(eq(users.id, id)).for('update')
      if (!current) throw notFound('ไม่พบผู้ใช้')

      const losesOwner =
        current.role === 'owner' &&
        current.isActive &&
        (fields.isActive === false || (fields.role !== undefined && fields.role !== 'owner'))
      if (losesOwner) {
        const [owners] = await tx
          .select({ total: count() })
          .from(users)
          .where(and(eq(users.role, 'owner'), eq(users.isActive, true)))
        if (owners!.total <= 1) throw conflict('ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน', 'LAST_OWNER')
      }

      const [user] = await tx
        .update(users)
        .set({ ...fields, ...(password && { passwordHash: await Bun.password.hash(password) }) })
        .where(eq(users.id, id))
        .returning(publicColumns)
      return user!
    })
  }
}
